from pathlib import Path
from playwright.sync_api import sync_playwright
b=Path(__file__).resolve().parents[1]/'browser-extension'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox'])
 page=browser.new_page();page.route('**/*',lambda r:r.fulfill(content_type='text/html',body='<h1>Product</h1>'));page.goto('https://www.ozon.ru/product/test-123/');page.add_script_tag(content=(b/'price-reader.js').read_text())
 def parse(html):return page.evaluate("raw=>{const d=new DOMParser().parseFromString(raw,'text/html');return readOzonPriceWidget(d.body)}",html)
 r=parse('<div><span>450,13 ¥</span><span>С банками</span></div><div><span>500,10 ¥</span><del><span>2 071,65 ¥</span></del><span>С другими банками</span></div><p>112,53 ¥ за 1 шт</p>')
 assert r['bank_price']=='450.13' and r['other_bank_price']=='500.10' and r['reference_price']['value']=='495.14'
 assert r['reference_price']['settlement_price_verified'] is False
 r=parse('<div><span>10 ¥</span><span>С банками</span></div><div><span>20 ¥</span><span>С банками</span></div>');assert r['status']=='ambiguous_bank_price' and r['reference_price'] is None
 assert parse('<span>10 ¥</span><del>100 ¥</del>')['reference_price'] is None
 t=page.evaluate("()=>readOzonBankPriceText('179,98 ¥ С банками 199,96 ¥ С другими банками')");assert t['reference_price']['value']=='197.98'
 assert page.evaluate("()=>readOzonBankPriceText('179,98 ₽ С банками')")['reference_price'] is None
 page.set_content('<h1>Product</h1><div data-widget="webPrice"><div><span>179,98 ¥</span><span>С банками</span></div></div>')
 result=page.evaluate('(code)=>eval(code)',(b/'collector.js').read_text())
 assert result['attribute_property_count']==0 and result['status']=='attributes_missing';assert result['price_observation']['reference_price']['value']=='197.98'
 browser.close();print('PASS labelled bank/other prices, strikeout and per-unit exclusion, ambiguity held, explicit estimate rounding, no RUB substitution, price does not count as product attributes')
