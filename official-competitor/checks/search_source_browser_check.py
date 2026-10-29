from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'browser-extension'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox']);page=b.new_page();page.route('**/*',lambda r:r.fulfill(content_type='text/html',body='<meta charset=utf-8><h1>搜索</h1>'))
 page.goto('https://www.ozon.ru/search/?text=chair');page.add_script_tag(content=(root/'search-source-ui.js').read_text());page.set_content('''<a href="/product/chair-123/?x=tracking">商品</a><a href="/search/?text=chair&page=2">2</a><a href="/search/?text=other&page=2">无关搜索</a><button onclick="window.clicked=true">В корзину</button>''')
 r=page.evaluate('inspectBuyerSearch()');assert r['links']==['https://www.ozon.ru/product/chair-123/'];assert r['next_url']=='https://www.ozon.ru/search/?text=chair&page=2';assert page.evaluate('window.clicked') is None
 page.set_content('<p>验证码 captcha</p>');assert page.evaluate('inspectBuyerSearch()')['status']=='blocked_verification'
 b.close();print('PASS source search extracts product URLs and actual next page, rejects changed search terms, no purchase clicks, verification detected')
