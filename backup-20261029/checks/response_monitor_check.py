from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parents[1]
monitor=(root/'browser-extension/response-monitor.js').read_text()
probe=(root/'browser-extension/package-probe.js').read_text()
payload={'sku':'123456789','grossWeight':8500,'weightUnit':'g','packageDimensions':{'length':600,'width':500,'height':350,'dimensionUnit':'mm'},'sharing':{'width':999},'foreign':{'sku':'999','grossWeight':9000,'weightUnit':'g'},'privateData':'DO_NOT_EXPORT','authToken':{'packageWeight':12345},'shippingInfo':{'weightText':'SECRET_VALUE'}}
html='''<!doctype html><meta charset="utf-8"><body><script>
fetch('/api/composer-api.bx/page/json/v2?url=/product/test-123456789/').then(r=>r.json()).then(d=>{
 window.fetchResult=d;
 const xhr=new XMLHttpRequest();xhr.open('GET','/api/composer-api.bx/widget/json/v2');xhr.onload=()=>{window.xhrDone=true};xhr.send();
});
</script></body>'''
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox'])
 context=browser.new_context();context.add_init_script(script=monitor)
 def serve(route):
  if '/api/' in route.request.url:route.fulfill(status=200,content_type='application/json',body=json.dumps(payload))
  else:route.fulfill(status=200,content_type='text/html; charset=utf-8',body=html)
 context.route('**/*',serve);page=context.new_page();page.goto('https://www.ozon.ru/product/test-123456789/')
 page.wait_for_function('window.xhrDone===true')
 page.wait_for_function("JSON.parse(document.getElementById('ozonBuyerPackageNetworkCache').textContent).responses_parsed===2")
 cache=page.evaluate("JSON.parse(document.getElementById('ozonBuyerPackageNetworkCache').textContent)")
 assert cache['requests_observed']==2 and cache['responses_parsed']==2,cache
 assert len(cache['candidates'])==8,cache
 assert all(c['value']!=9000 and c['value']!=999 for c in cache['candidates'])
 assert 'DO_NOT_EXPORT' not in json.dumps(cache)
 assert 'SECRET_VALUE' not in json.dumps(cache)
 assert 'authToken' not in json.dumps(cache)
 assert len(cache['diagnostics'])==2
 assert all(d['request_path'].startswith('/api/') for d in cache['diagnostics'])
 assert any(f['path'].endswith('/weightText') for d in cache['diagnostics'] for f in d['related_fields'])
 assert all('value' not in f for d in cache['diagnostics'] for f in d['related_fields'])
 assert page.evaluate('window.fetchResult.privateData')=='DO_NOT_EXPORT'
 # The probe can re-read known product responses; disable replay for this test
 # so we can assert that document-start observation itself works.
 page.evaluate("performance.clearResourceTimings()")
 expression='async()=>{'+probe.rsplit('probeOzonPackageData();',1)[0]+'return await probeOzonPackageData();}'
 result=page.evaluate(expression);assert len(result['candidates'])==8,result
 assert result['network_monitor']['monitor_installed'] is True
 browser.close()
print('PASS document-start fetch/XHR capture, package fields, units, foreign-SKU/layout exclusion, no raw private payload export, original page response preserved.')
