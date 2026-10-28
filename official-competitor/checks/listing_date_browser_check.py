from pathlib import Path
from playwright.sync_api import sync_playwright
script=(Path(__file__).resolve().parents[1]/'browser-extension/listing-date-reader.js').read_text()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox'])
 page=browser.new_page()
 page.route('**/*',lambda route:route.fulfill(content_type='text/html',body='<meta charset="utf-8"><table><tr><th>SKU</th><th>上架日期</th></tr><tr><td>123</td><td>02.01.2026</td></tr><tr><td>456</td><td>31.02.2026</td></tr></table>'))
 page.goto('https://seller.ozon.ru/app/analytics/what-to-sell')
 result=page.evaluate(script)
 assert len(result['evidence'])==1 and result['evidence'][0]['value']=='2026-01-02'
 page.set_content('<table><tr><th>SKU</th><th>首次评论日期</th></tr><tr><td>123</td><td>2026-01-02</td></tr></table>')
 assert not page.evaluate(script)['evidence']
 browser.close()
 print('PASS official table SKU/date pairing, invalid dates rejected, review-date not substituted')
