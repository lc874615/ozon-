"""Unpacked-extension integration using simulated seller responses, never a live store."""
from pathlib import Path
import json
import tempfile
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'browser-extension'
with sync_playwright() as p:
    context=p.chromium.launch_persistent_context(tempfile.mkdtemp(prefix='ozon-readonly-'),executable_path=p.chromium.executable_path,headless=True,ignore_default_args=['--disable-extensions'],args=['--no-sandbox',f'--disable-extensions-except={root}',f'--load-extension={root}'])
    calls=[]
    def serve(route):
        path=route.request.url
        calls.append(path)
        assert 'create-bundle' not in path, 'Write endpoint forbidden'
        if '/api/v1/search-variant-model' in path:route.fulfill(status=404,body='{}')
        elif '/api/v1/search' in path:route.fulfill(content_type='application/json',body=json.dumps({'variants':[{'sku':'1991579954','variant_id':'2569085301','brand_name':'без бренда'}]}))
        elif '/api/site/seller-analytics/' in path:route.fulfill(status=403,body='{}')
        else:route.fulfill(content_type='text/html',body='<html><body>simulated seller</body></html>')
    context.route('https://seller.ozon.ru/**',serve)
    context.add_cookies([{'name':'sc_company_id','value':'123','domain':'seller.ozon.ru','path':'/','secure':True}])
    seller=context.new_page();seller.goto('https://seller.ozon.ru/app/dashboard/main');seller.wait_for_timeout(500)
    worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
    result=worker.evaluate("async()=>await captureSellerReference('1991579954')")
    assert result['detail_creation_disabled'] is True,result
    assert result['market_signals']['http_status']==403,result
    assert result['items'][0]['brand_name']=='без бренда',result
    assert len(calls)==4,calls
    context.close()
print('PASS actual unpacked extension: ready-tab handshake, company context, exact SKU query, brand, analytics403, no create call (simulated backend).')
