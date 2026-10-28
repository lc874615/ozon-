from pathlib import Path
from playwright.sync_api import sync_playwright
import json
b=Path(__file__).resolve().parents[1]/'browser-extension'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox'])
 page=browser.new_page();requests=[];mode={'value':'ok'}
 def handle(route):
  req=route.request
  if '/api/site/seller-analytics/' in req.url:
   requests.append({'body':json.loads(req.post_data),'company':req.headers.get('x-o3-company-id')})
   if mode['value']=='denied':return route.fulfill(status=403,content_type='application/json',body='{}')
   rows=[{'sku':'999','soldCount':9999,'nullableCreateDate':'2026-01-01'}]
   if mode['value']!='wrong':rows.append({'sku':'123','soldCount':0,'nullableCreateDate':'2026-10-01T12:00:00Z','brand':'Other'})
   return route.fulfill(content_type='application/json',body=json.dumps({'items':rows}))
  route.fulfill(content_type='text/html',body='<header>Shop 1234</header>')
 page.route('**/*',handle);page.goto('https://seller.ozon.ru/app/products/copy/list');page.add_script_tag(content=(b/'native-market-reader.js').read_text())
 call=lambda:page.evaluate("()=>readNativeSellerMarket('123','')")
 r=call();assert r['status']=='exact_sku_read';assert r['properties'][0]['value']=='0';assert r['properties'][1]['value']=='2026-10-01'
 assert requests[0]['body']['filter']=={'stock':'any_stock','period':'monthly','categories':[],'sku':'123'};assert requests[0]['company']=='1234'
 mode['value']='wrong';assert call()['status']=='sku_not_found'
 mode['value']='denied';assert call()['status']=='access_or_rate_limit';assert len(requests)==3
 browser.close();print('PASS same observed normal service/request fields, exact SKU only, soldCount zero retained, nullableCreateDate preserved, 403 reported without internal retry')
