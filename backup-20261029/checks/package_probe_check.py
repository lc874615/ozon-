import json,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];script=(root/'browser-extension/package-probe.js').read_text()
fixture={'sku':'123456789','grossWeight':8500,'weightUnit':'g','packageDimensions':{'length':600,'width':500,'height':350,'dimensionUnit':'mm'},'other':{'sku':'999','grossWeight':300}}
html='<html><head><meta charset="utf-8"></head><body><script type="application/json">'+json.dumps(fixture)+'</script></body></html>'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox']);page=b.new_page();page.route('**/*',lambda r:r.fulfill(status=200,content_type='text/html; charset=utf-8',body=html));page.goto('https://www.ozon.ru/product/test-123456789/')
 expression='async()=>{'+script.rsplit('probeOzonPackageData();',1)[0]+'return await probeOzonPackageData();}'
 x=page.evaluate(expression)
 assert len(x['candidates'])==4,x
 assert all(c['sku_scope_verified'] for c in x['candidates']),x
 assert next(c for c in x['candidates'] if c['key']=='length')['unit']=='mm'
 assert next(c for c in x['candidates'] if c['key']=='grossWeight')['unit']=='g'
 assert all(not c['verified_for_costing'] for c in x['candidates'])
 page.set_content('<html><body>No packaging data</body></html>');x=page.evaluate(expression);assert x['status']=='no_package_fields_found'
 b.close()
print('PASS package probe: explicit package fields, correct units, inherited SKU scope, foreign-SKU exclusion, missing-data status. Synthetic fixture, not live Ozon proof.')
