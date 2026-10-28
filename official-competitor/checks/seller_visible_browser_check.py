from pathlib import Path
from playwright.sync_api import sync_playwright
b=Path(__file__).resolve().parents[1]/'browser-extension'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox'])
 page=browser.new_page()
 page.route('**/*',lambda r:r.fulfill(content_type='text/html',body='<meta charset="utf-8"><table><tr><th>SKU</th><th>近28天销量</th><th>上架日期</th><th>品牌</th></tr><tr><td>123</td><td>1 234</td><td>2026-10-02</td><td>Other</td></tr></table>'))
 page.goto('https://seller.ozon.ru/app/analytics/what-to-sell')
 d=page.evaluate((b/'seller-visible-reader.js').read_text());assert d['rows'][0]['properties'][0]['value']=='1234';assert len(d['rows'][0]['properties'])==3
 page.set_content('<table><tr><th>SKU</th><th>订购件数</th><th>Дата создания</th></tr><tr><td>123</td><td>900</td><td>2026-10-02</td></tr></table>')
 assert page.evaluate((b/'seller-visible-reader.js').read_text())['rows'][0]['properties']==[]
 page.set_content('<button aria-pressed="true">28 дней</button><table><tr><th>SKU</th><th>Продано, шт</th></tr><tr><td>123</td><td>8</td></tr></table>')
 assert page.evaluate((b/'seller-visible-reader.js').read_text())['rows'][0]['properties'][0]['value']=='8'
 page.locator('button').evaluate("e=>e.textContent='7 дней'")
 assert page.evaluate((b/'seller-visible-reader.js').read_text())['rows'][0]['properties']==[]
 browser.close();print('PASS normal analytics table with exact SKU, explicit 28-day counts, no order-count/7-day/date-creation substitution')
