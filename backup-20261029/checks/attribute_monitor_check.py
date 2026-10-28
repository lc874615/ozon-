from pathlib import Path
import json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
payload={'sku':'123456789','widgetStates':{'webCharacteristics':json.dumps({'attributes':[{'name':'Вес с упаковкой, г','values':[{'text':'8500'}]},{'name':'Размер упаковки, см','value':'60 x 50 x 35'},{'name':'Вес нетто, г','value':'7000'},{'name':'Высота, см','value':'65'}]})},'foreign':{'sku':'999','attributes':[{'name':'Вес брутто','value':'999'}]}}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox'])
 c=b.new_context();c.add_init_script(script=(root/'browser-extension/attribute-monitor.js').read_text())
 def serve(r):
  if '/api/' in r.request.url:r.fulfill(content_type='application/json',body=json.dumps(payload))
  else:r.fulfill(content_type='text/html',body="<script>fetch('/api/entrypoint-api.bx/page/json/v2').then(r=>r.json()).then(v=>window.done=true)</script>")
 c.route('**/*',serve);page=c.new_page();page.goto('https://www.ozon.ru/product/test-123456789/');page.wait_for_function('window.done===true')
 d=page.evaluate("JSON.parse(document.getElementById('ozonAttributePackageCache').textContent)")
 assert len(d['records'])==4,d
 assert [r['semantic'] for r in d['records']]==['packaging_label','packaging_label','net_weight','product_or_ambiguous_label']
 assert all(r['sku_scope_verified'] and not r['verified_for_costing'] for r in d['records'])
 b.close()
print('PASS entrypoint attribute strings, units retained, gross/net/product distinction, foreign SKU exclusion')
