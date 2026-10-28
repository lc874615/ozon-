import argparse, hashlib, subprocess
import json, os, re
from pathlib import Path
from datetime import datetime
from decimal import Decimal as D
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
original = (ROOT / "sku_review.py").read_text(encoding="utf-8-sig")
marker = "# Local calculation checks before any network collection."
if original.count(marker) != 1:
    raise SystemExit("Unexpected original version. No collection started.")
exec(compile(original.split(marker)[0], "original_calculator", "exec"))

parser = argparse.ArgumentParser()
parser.add_argument("--batch", type=int, default=20)
args = parser.parse_args()
if not 1 <= args.batch <= 50:
    raise SystemExit("Batch size must be 1-50.")

test = estimate("188", 0,
    {"weight":7000, "length":57, "width":50, "height":35},
    D("12.0677"), D(".10"))
assert test["provisional_target_cny"] == "737.32"
assert estimate("188", None,
    {"weight":7000, "length":57, "width":50, "height":35},
    D("12.0677")) is None
print("Calculation checks passed. Production quotes require explicit verified commission.")

files = list((ROOT / "exports").rglob("combined-candidates.json"))
if not files:
    raise SystemExit("Candidate file not found.")
source = max(files, key=lambda p: p.stat().st_mtime)
data = json.loads(source.read_text(encoding="utf-8-sig"))
unique = {}
for item in data.get("items", []):
    identity = str(item.get("source_item_id", ""))
    if identity.isdigit():
        unique.setdefault(identity, item)
items = list(unique.values())
items.sort(key=lambda x: (
    str(x["source_item_id"]) != BASELINE,
    "image" not in x.get("search_origins", [])
))
fingerprint = hashlib.sha256(source.read_bytes()).hexdigest()
today = datetime.now().strftime("%Y-%m-%d")
folder = ROOT / "sku-reviews" / ("batch-v3-" + fingerprint[:12])
folder.mkdir(parents=True, exist_ok=True)
output = folder / "sku-cost-review.json"

state = {
    "version": 3, "source_file": str(source),
    "candidate_sha256": fingerprint, "review_date": today,
    "completed_offer_ids": [], "rows": [], "pending_offers": []
}
if output.exists():
    state = json.loads(output.read_text(encoding="utf-8-sig"))
else:
    previous = []
    for path in (ROOT / "sku-reviews").rglob("sku-cost-review.json"):
        if path == output:
            continue
        try:
            report = json.loads(path.read_text(encoding="utf-8-sig"))
            old_hash = report.get("candidate_sha256")
            if old_hash:
                if old_hash != fingerprint:
                    continue
            elif report.get("source_file") != str(source):
                continue
            ids = {str(r["offer_id"]) for r in
                   report.get("rows", []) + report.get("pending_offers", [])}
            if ids and ids <= set(unique):
                previous.append((path.stat().st_mtime, report, ids))
        except (ValueError, KeyError, OSError):
            continue
    if previous:
        _, old, ids = max(previous, key=lambda v: v[0])
        state["rows"] = old.get("rows", [])
        state["pending_offers"] = old.get("pending_offers", [])
        state["completed_offer_ids"] = sorted(ids)
        print("Resuming saved offers:", len(ids))

# Preserve successful observations while requeuing transient failures.
retry_ids = {
    str(r.get("offer_id")) for r in state.get("pending_offers", [])
    if r.get("retry_required") or r.get("reason") in {
        "details_unavailable_or_platform_verification", "login_or_verification",
        "details_unavailable_or_verification", "PatternError",
        "waiting_for_manual_verification", "sku_data_unavailable_requires_review"
    } or str(r.get("reason", "")).endswith("Error")
}
state["completed_offer_ids"] = sorted(
    set(map(str, state.get("completed_offer_ids", []))) - retry_ids
)
# Old failed attempts can have partial rows; the retry replaces them as a unit.
state["rows"] = [r for r in state.get("rows", [])
                 if str(r.get("offer_id")) not in retry_ids]
row_map = {}
for row in state["rows"]:
    row_map[(str(row.get("offer_id")),
             str(row.get("sku_id") or row.get("specification")))] = row
state["rows"] = list(row_map.values())

fx_file = ROOT / "cbr-daily.xml"
def read_fx():
    tree = ET.parse(fx_file).getroot()
    date = tree.attrib["Date"]
    age = (datetime.now().date() -
           datetime.strptime(date, "%d.%m.%Y").date()).days
    if not 0 <= age <= 3:
        raise ValueError("Exchange-rate date requires review: " + date)
    entry = next(v for v in tree if v.findtext("CharCode") == "CNY")
    value = D(entry.findtext("Value").replace(",", ".")) / D(entry.findtext("Nominal"))
    if value <= 0:
        raise ValueError("Invalid exchange rate")
    return value, date

fx, fx_date = None, None
try:
    fx, fx_date = read_fx()
except Exception:
    pass
if fx_date != datetime.now().strftime("%d.%m.%Y"):
    temporary = fx_file.with_suffix(".download.xml")
    command = (
        "$ErrorActionPreference='Stop'; "
        "Invoke-WebRequest -Uri 'https://www.cbr.ru/scripts/XML_daily.asp' "
        "-UseBasicParsing -TimeoutSec 20 "
        "-OutFile $env:OZON_HELPER_FX_FILE"
    )
    environment = dict(os.environ, OZON_HELPER_FX_FILE=str(temporary))
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
            env=environment, capture_output=True, timeout=30
        )
        if result.returncode == 0:
            ET.parse(temporary)
            temporary.replace(fx_file)
            fx, fx_date = read_fx()
    except Exception as exc:
        print("FX refresh:", type(exc).__name__)
print("FX:", fx_date, str(fx) if fx else "PENDING")

def save():
    state["version"] = 3
    state["candidate_sha256"] = fingerprint
    state["commission_assumption_percent"] = None
    state["commission_verified"] = False
    state["candidate_count"] = len(items)
    state["inspected_offers"] = len(state["completed_offer_ids"])
    state["remaining_offers"] = len(set(unique) - set(state["completed_offer_ids"]))
    state["fx_source"] = "https://www.cbr.ru/scripts/XML_daily.asp"
    state["fx_date"] = fx_date
    state["rub_per_cny"] = str(fx) if fx else None
    state["note"] = "Provisional estimates only. No purchase or listing submitted."
    for row in state["rows"]:
        row["provisional_quote"] = estimate(
            row["sku_price_cny"], row.get("domestic_freight_cny"),
            row.get("packaging"), fx,
            D(str(row["commission_percent"])) / 100 if row.get("commission_verified") and row.get("commission_percent") is not None else None
        )
        pending = set(row.get("pending", []))
        if fx:
            pending.discard("exchange_rate")
        else:
            pending.add("exchange_rate")
        if not row.get("commission_verified"):
            pending.add("commission_verification")
        pending.add("supplier_one_unit_price_freight_material_image_verification")
        row["pending"] = sorted(pending)
    temporary = output.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(state, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8"
    )
    temporary.replace(output)

completed = set(state["completed_offer_ids"])
batch = [i for i in items if str(i["source_item_id"]) not in completed][:args.batch]
save()
print("Saved:", len(completed), "Next batch:", len(batch))

if batch:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            str(ROOT / "browser-profile-edge"),
            channel="msedge", headless=False, no_viewport=True
        )
        page = context.pages[0] if context.pages else context.new_page()
        try:
            for number, item in enumerate(batch, 1):
                identity = str(item["source_item_id"])
                print("Reading", number, "/", len(batch), identity, flush=True)
                rows_before_offer = list(state["rows"])
                try:
                    response = page.goto(
                        "https://detail.1688.com/offer/" + identity + ".html",
                        wait_until="domcontentloaded", timeout=30000
                    )
                    page.wait_for_timeout(1200)
                    raw = response.text() if response else page.content()
                    skus = field(raw, "skuInfoMap", {})
                    # keep_browser_open_for_verification_v1
                    while not isinstance(skus, dict) or not skus:
                        page.wait_for_timeout(1800)
                        rendered = page.content()
                        skus = field(rendered, "skuInfoMap", {})
                        if isinstance(skus, dict) and skus:
                            raw = rendered
                            break
                        try:
                            visible = page.locator("body").inner_text(timeout=5000)
                        except Exception:
                            visible = ""
                        address = page.url.lower()
                        blocked = (
                            any(k in address for k in
                                ["captcha", "punish", "login", "signin"])
                            or any(token in visible.lower() for token in [
                                "drag the slider", "verify to ensure",
                                "slide to verify", "security verification",
                                "\u5b8c\u6210\u9a8c\u8bc1",
                                "\u62d6\u52a8\u6ed1\u5757",
                                "\u5411\u53f3\u6ed1\u52a8",
                                "\u8bbf\u95ee\u8fc7\u4e8e\u9891\u7e41",
                                "\u901a\u8fc7\u9a8c\u8bc1\u4ee5\u786e\u4fdd"
                            ])
                        )
                        state["pending_offers"] = [
                            r for r in state["pending_offers"]
                            if str(r.get("offer_id")) != identity
                        ]
                        if not blocked:
                            state["pending_offers"].append({
                                "offer_id": identity,
                                "reason": "sku_data_unavailable_requires_review",
                                "retry_required": True,
                                "page_url": page.url,
                                "page_text_excerpt": visible[:1200]
                            })
                            break

                        state["pending_offers"].append({
                            "offer_id": identity,
                            "reason": "waiting_for_manual_verification",
                            "retry_required": True
                        })
                        save()
                        print("\nVerification/login required. Browser stays OPEN.")
                        print("Complete it in THIS browser, then return here and press Enter.",
                              flush=True)

                        import threading
                        finished = threading.Event()
                        input_errors = []
                        def read_confirmation():
                            try:
                                input()
                            except Exception as exc:
                                input_errors.append(type(exc).__name__)
                            finally:
                                finished.set()
                        threading.Thread(
                            target=read_confirmation, daemon=True
                        ).start()
                        while not finished.is_set():
                            page.wait_for_timeout(200)
                        if input_errors:
                            raise RuntimeError("Console input unavailable")

                        response = page.goto(
                            "https://detail.1688.com/offer/" + identity + ".html",
                            wait_until="domcontentloaded", timeout=30000
                        )
                        raw = response.text() if response else page.content()
                        skus = field(raw, "skuInfoMap", {})

                    if not isinstance(skus, dict) or not skus:
                        save()
                        print("SKU data unavailable; queued for next run. Continuing.")
                        continue

                    state["pending_offers"] = [
                        r for r in state["pending_offers"]
                        if str(r.get("offer_id")) != identity
                    ]
                    state["rows"] = [
                        r for r in state["rows"]
                        if str(r.get("offer_id")) != identity
                    ]

                    packs = {
                        str(v["skuId"]): v
                        for v in (field(raw, "pieceWeightScaleInfo", []) or [])
                        if isinstance(v, dict) and v.get("skuId")
                    }
                    evidence = page.locator(
                        '[class*="freight"],[class*="logistic"],'
                        '[class*="delivery"],[class*="shipping"]'
                    ).evaluate_all("""els => [...new Set(els
                      .map(e => (e.innerText || '').trim())
                      .filter(t => t && t.length < 1000 &&
                        /运费|包邮|配送|送至|发货/.test(t)))].slice(0, 15)""")

                    matched = 0
                    for name, sku in skus.items():
                        if not all(k in name.upper() for k in ["棕色", "胡桃", "PU"]):
                            continue
                        if not re.search(r"(?<!\d)70(?:厘米|CM|公分)", name, re.I):
                            continue
                        if any(k in name for k in ["牛皮", "真皮"]):
                            continue
                        price = sku.get("price")
                        if price is None or D(str(price)) <= 0:
                            continue
                        matched += 1
                        pack = packs.get(str(sku.get("skuId")))
                        pending = ["target_product_commission_and_other_applicable_fees"]
                        if identity != BASELINE:
                            pending += ["visual_match", "domestic_freight_to_jiaxing"]
                        if not pack:
                            pending.append("packaging")
                        state["rows"].append({
                            "offer_id": identity, "sku_id": sku.get("skuId"),
                            "specification": name, "sku_price_cny": price,
                            "packaging": pack,
                            "domestic_freight_cny": 0 if identity == BASELINE else None,
                            "domestic_freight_source":
                                "user_confirmed_free_shipping"
                                if identity == BASELINE else "unverified",
                            "domestic_freight_page_evidence": evidence,
                            "freight_evidence_note":
                                "Page text is not a verified quote for this SKU and Jiaxing.",
                            "captured_at": datetime.now().isoformat(timespec="seconds"),
                            "pending": pending,
                            "status": "estimate_only_not_listing_approved"
                        })
                    if not matched:
                        state["pending_offers"].append({
                            "offer_id": identity,
                            "reason": "no_explicit_target_sku_found_requires_review"
                        })
                    completed.add(identity)
                    state["completed_offer_ids"] = sorted(completed)
                    save()
                except Exception as exc:
                    state["rows"] = rows_before_offer
                    completed.discard(identity)
                    state["completed_offer_ids"] = sorted(completed)
                    state["pending_offers"] = [
                        r for r in state["pending_offers"]
                        if str(r.get("offer_id")) != identity
                    ]
                    state["pending_offers"].append({
                        "offer_id": identity,
                        "reason": type(exc).__name__, "retry_required": True
                    })
                    save()
                    print("Stopped safely:", type(exc).__name__)
                    break
        finally:
            save()
            context.close()

known = [r for r in state["rows"]
         if r.get("domestic_freight_cny") is not None]
known.sort(key=lambda r: D(str(r["sku_price_cny"])) +
           D(str(r["domestic_freight_cny"])))
print("\nCompleted:", state["inspected_offers"], "/", len(items))
print("Remaining:", state["remaining_offers"])
print("Matching SKU rows:", len(state["rows"]))
print("Known domestic-cost rows (visual/packaging checks still apply):")
for row in known[:10]:
    quote = row.get("provisional_quote")
    print(row["offer_id"], "SKU", row["sku_id"],
          "Purchase:", row["sku_price_cny"],
          "Domestic:", row["domestic_freight_cny"],
          "Target:", quote["provisional_target_cny"] if quote else "PENDING")
print("Report:", output)
os.startfile(str(folder))
