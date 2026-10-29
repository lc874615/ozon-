from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'browser-extension'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox']);page=b.new_page()
 page.set_content('<div data-widget=webAddToCart><button onclick="window.bought=true">В корзину <span>Доставим завтра</span></button></div><div>15 дней до конца</div><p>Доставка: Москва, частный адрес</p>')
 page.add_script_tag(content=(root/'delivery-reference.js').read_text());read=lambda:page.evaluate("readBuyerDelivery(document,new Date('2026-10-29T12:00:00Z'))")
 r=read();assert r['minimum_days']==1,r;assert r['sources']==['explicit_delivery_promise'];assert 'Москва' not in str(r);assert page.evaluate('window.bought') is None
 for text,expected in [('Доставим сегодня',0),('Доставим через 7–10 дней',7),('Доставим 6 ноября',8),('Доставка от 7 до 9 дней',7)]:
  page.set_content('<button>'+text+'</button>');r=read();assert r['minimum_days']==expected,(text,r)
 page.set_content('<div>Осталось 7 дней акции</div><h1>Батарея работает 10 дней</h1>');assert read()['minimum_days'] is None
 page.set_content('<div><span>Доставка</span><span>6 ноября</span></div>');assert read()['minimum_days']==8
 b.close();print('PASS cart-button delivery today/tomorrow, 7-day range, calendar date, labelled date row; promotion/battery durations ignored; no clicks or destination-address capture')
