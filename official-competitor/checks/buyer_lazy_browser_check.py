from pathlib import Path
from playwright.sync_api import sync_playwright
b=Path(__file__).resolve().parents[1]/'browser-extension'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox'])
 page=browser.new_page()
 html='''<meta charset="utf-8"><h1>Lamp</h1><button type="button" onclick="document.getElementById('section-characteristics').innerHTML='<dl><div><dt>Материал</dt><span></span><dd>Алюминий</dd></div></dl>'">Все характеристики</button><div id="section-characteristics"></div>'''
 page.route('**/*',lambda r:r.fulfill(content_type='text/html',body=html))
 page.goto('https://www.ozon.ru/product/test-123/')
 assert page.evaluate('(code)=>eval(code)',(b/'collector.js').read_text())['status']=='attributes_missing'
 prep=page.evaluate((b/'prepare-characteristics.js').read_text());assert prep['action']=='opened_native_characteristics'
 data=page.evaluate('(code)=>eval(code)',(b/'collector.js').read_text());assert data['properties'][0]['value']=='Алюминий'
 page.set_content('<h1>验证码</h1><button type="button" onclick="window.clicked=true">Все характеристики</button>')
 assert page.evaluate((b/'prepare-characteristics.js').read_text())['status']=='blocked_verification'
 assert page.evaluate('window.clicked') is None
 page.set_content('<h1>Product</h1><a href="https://example.org">Все характеристики</a>')
 assert page.evaluate((b/'prepare-characteristics.js').read_text())['action']=='bounded_scroll_for_lazy_loading'
 browser.close();print('PASS native parameter expansion, nested dt/dd read, captcha stops, external links never clicked')
