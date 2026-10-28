import json, re, os, time, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime
from decimal import Decimal as D, ROUND_CEILING
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent
BASELINE = "983128414763"

def up(value, unit):
    return D(str(value)).quantize(D(unit), rounding=ROUND_CEILING)

def field(text, name, default=None):
    for m in re.finditer(r'"' + re.escape(name) + r'"\s*:', text):
        try:
            return json.JSONDecoder().raw_decode(
                text[m.end():].lstrip()
            )[0]
        except ValueError:
            pass
    return default

def estimate(price, domestic, pack, fx, commission_rate=None):
    # Explicit commission only. Unknown commission blocks numerical quotation.
    if domestic is None or not pack or not fx or commission_rate is None:
        return None
    import sys
    module_root = str(Path(__file__).resolve().parents[1])
    if module_root not in sys.path:
        sys.path.insert(0, module_root)
    from ozon_operator.target_pricing import target_quotes
    result = target_quotes(price, domestic, D(str(pack["weight"])) / 1000,
        [pack[k] for k in ("length", "width", "height")], fx, commission_rate)
    if not result["quotes"]:
        return None
    quote = result["quotes"][0]
    return {"channel":quote["channel"],"ogl_cny":quote["freight_cny"],
        "fixed_cost_cny":quote["fixed_cost_cny"],
        "provisional_target_cny":quote["price_plan"]["target_transaction_cny"],
        "provisional_listing_2P_cny":quote["price_plan"]["backend_listing_cny"],
        "commission_percent":str(D(str(commission_rate))*100),
        "status":"reference_only_requires_source_and_market_verification"}

# Local calculation checks before any network collection.
test_pack = {"weight":7000, "length":57, "width":50, "height":35}
test = estimate("188", 0, test_pack, D("12.0677"), D(".10"))
assert test["channel"] == "PremiumBig"
assert test["ogl_cny"] == "244.54"
assert test["provisional_target_cny"] == "737.32"
assert estimate("188", None, test_pack, D("12.0677")) is None
print("Local calculation checks passed.")

files = list((ROOT / "exports").glob("**/combined-candidates.json"))
if not files:
    raise SystemExit("Candidate file not found.")
source = max(files, key=lambda p: p.stat().st_mtime)
data = json.loads(source.read_text(encoding="utf-8-sig"))
items = data.get("items", [])
items.sort(key=lambda x: (
    x.get("source_item_id") != BASELINE,
    "image" not in x.get("search_origins", [])
))
batch = items[:10]

fx = None
fx_date = None
try:
    with urllib.request.urlopen(
        "https://www.cbr.ru/scripts/XML_daily.asp", timeout=20
    ) as response:
        tree = ET.fromstring(response.read())
    fx_date = tree.attrib.get("Date")
    for entry in tree:
        if entry.findtext("CharCode") == "CNY":
            fx = D(entry.findtext("Value").replace(",", ".")) / D(entry.findtext("Nominal"))
    print("CBR rate date:", fx_date, "RUB per CNY:", fx)
except Exception:
    print("FX unavailable. Numeric price estimates will remain pending.")

rows, failures = [], []
with sync_playwright() as p:
    context = p.chromium.launch_persistent_context(
        str(ROOT / "browser-profile-edge"),
        channel="msedge", headless=False, no_viewport=True
    )
    page = context.pages[0] if context.pages else context.new_page()
    try:
        for number, item in enumerate(batch, 1):
            identity = str(item.get("source_item_id", ""))
            if not identity.isdigit():
                failures.append({"offer_id":identity, "reason":"invalid_identity"})
                continue
            print("Reading", number, "/", len(batch), identity, flush=True)
            try:
                response = page.goto(
                    "https://detail.1688.com/offer/" + identity + ".html",
                    wait_until="domcontentloaded", timeout=30000
                )
                raw = response.text() if response else page.content()
                skus = field(raw, "skuInfoMap", {})
                packs = {
                    str(v["skuId"]): v
                    for v in field(raw, "pieceWeightScaleInfo", [])
                    if v.get("skuId")
                }
                if not skus:
                    failures.append({
                        "offer_id":identity,
                        "reason":"details_unavailable_or_platform_verification"
                    })
                    continue
                matched = 0
                for name, sku in skus.items():
                    if not all(k in name for k in ["棕色", "胡桃", "PU"]):
                        continue
                    if not re.search(r"(?<!\d)70(?:厘米|CM|cm|公分)", name):
                        continue
                    if any(k in name for k in ["牛皮", "真皮"]):
                        continue
                    price = sku.get("price")
                    if price is None or D(str(price)) <= 0:
                        continue
                    matched += 1
                    pack = packs.get(str(sku.get("skuId")))
                    domestic = 0 if identity == BASELINE else None
                    quote = estimate(price, domestic, pack, fx)
                    pending = ["target_product_commission_and_other_applicable_fees"]
                    if identity != BASELINE:
                        pending += ["visual_match", "domestic_freight_to_jiaxing"]
                    if not pack:
                        pending.append("packaging")
                    if fx is None:
                        pending.append("exchange_rate")
                    rows.append({
                        "offer_id":identity,
                        "sku_id":sku.get("skuId"),
                        "specification":name,
                        "sku_price_cny":price,
                        "packaging":pack,
                        "domestic_freight_cny":domestic,
                        "domestic_freight_source":
                            "user_confirmed_free_shipping"
                            if identity == BASELINE else "unverified",
                        "provisional_quote":quote,
                        "pending":pending,
                        "status":"estimate_only_not_listing_approved"
                    })
                if not matched:
                    failures.append({
                        "offer_id":identity,
                        "reason":"no_explicit_target_sku_found_requires_review"
                    })
            except Exception as exc:
                failures.append({
                    "offer_id":identity,
                    "reason":type(exc).__name__
                })
            page.wait_for_timeout(800)
    finally:
        context.close()

report = {
    "source_file":str(source),
    "candidate_count":len(items),
    "inspected_offers":len(batch),
    "remaining_offers":max(0, len(items)-len(batch)),
    "fx_source":"https://www.cbr.ru/scripts/XML_daily.asp",
    "fx_date":fx_date,
    "rub_per_cny":str(fx) if fx else None,
    "rows":rows,
    "pending_offers":failures,
    "note":"SKU prices are page observations. Packaging is supplier data. No purchase or listing submitted."
}
folder = ROOT / "sku-reviews" / datetime.now().strftime("%Y%m%d-%H%M%S")
folder.mkdir(parents=True)
(folder / "sku-cost-review.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
)
print("\nInspected offers:", len(batch), "of", len(items))
print("Explicit matching SKU rows:", len(rows))
print("Offers requiring review:", len(failures))
for row in rows:
    q = row["provisional_quote"]
    print(
        row["offer_id"], "SKU", row["sku_id"],
        "Purchase CNY:", row["sku_price_cny"],
        "Target CNY:", q["provisional_target_cny"] if q else "PENDING"
    )
print("Output:", folder)
os.startfile(str(folder))
