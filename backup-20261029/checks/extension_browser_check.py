from pathlib import Path
from playwright.sync_api import sync_playwright
import tempfile,json
extension=str(Path(__file__).resolve().parents[1]/'browser-extension')
with sync_playwright() as p:
 context=p.chromium.launch_persistent_context(tempfile.mkdtemp(dir='/workspace/work'),executable_path=p.chromium.executable_path,headless=True,ignore_default_args=['--disable-extensions'],args=['--no-sandbox','--enable-unsafe-extension-debugging','--disable-features=DisableLoadExtensionCommandLineSwitch','--disable-extensions-except='+extension,'--load-extension='+extension])
 worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=15000)
 print('worker',worker.url)
 extension_id=worker.url.split('/')[2]
 html='<html><body><h1>真实扩展测试</h1><section data-widget="webCharacteristics"><dl><dt>Вес с упаковкой, г</dt><dd>8500</dd><dt>Высота упаковки, мм</dt><dd>350</dd></dl></section></body></html>'
 context.route('https://www.ozon.ru/**',lambda r:r.fulfill(status=200,content_type='text/html; charset=utf-8',body=html))
 product=context.new_page();product.goto('https://www.ozon.ru/product/test-123456789/')
 popup=context.new_page();popup.goto('chrome-extension://'+extension_id+'/popup.html')
 result=popup.evaluate('''async id => {const r=await chrome.scripting.executeScript({target:{tabId:id},files:['collector.js']});return r[0].result;}''',worker.evaluate('''async()=>{const ts=await chrome.tabs.query({url:'https://www.ozon.ru/*'});return ts[0].id;}'''))
 assert result['status']=='attributes_observed',result
 assert len(result['properties'])==2
 print('PASS: unpacked extension installed, service worker active, actual chrome.scripting returned product characteristics.')
 context.unroute('https://www.ozon.ru/**')
 mode={'blocked':True}
 def fixture(route):
  body='<html><body>Доступ ограничен</body></html>' if '222222222' in route.request.url and mode['blocked'] else html
  route.fulfill(status=200,content_type='text/html; charset=utf-8',body=body)
 context.route('https://www.ozon.ru/**',fixture)
 urls=['https://www.ozon.ru/product/test-111111111/','https://www.ozon.ru/product/test-222222222/']
 for url in urls:
  fixture_page=context.new_page();fixture_page.goto(url)
 result=popup.evaluate('async urls=>await chrome.runtime.sendMessage({action:"queue",urls})',urls)
 assert result['status']=='started',result
 import time
 def wait_state(expected):
  start=time.monotonic()
  while time.monotonic()-start<25:
   state=popup.evaluate('async()=>await chrome.storage.local.get(["queueIndex","batchStatus","pausedTabId","snapshots"])')
   if state.get('batchStatus')==expected:return state
   page_status=state.get('batchStatus','')
   if page_status.startswith('error:'):raise AssertionError(state)
   popup.wait_for_timeout(150)
  raise AssertionError(state)
 state=wait_state('blocked_verification')
 assert state['queueIndex']==1 and state['pausedTabId']
 paused=state['pausedTabId']
 assert len(state['snapshots'])==1
 mode['blocked']=False
 # Simulate successful manual verification in the same paused browser tab.
 worker.evaluate('async id=>await chrome.tabs.reload(id)',paused)
 popup.wait_for_timeout(500)
 popup.evaluate('async()=>await chrome.runtime.sendMessage({action:"resume"})')
 state=wait_state('completed')
 assert state['queueIndex']==2 and len(state['snapshots'])==2,state
 assert all(v.get('package_probe',{}).get('network_monitor',{}).get('monitor_installed') is True for v in state['snapshots'].values()),state
 print('PASS: installed extension injects MAIN-world response monitor at document start and includes diagnostics in saved snapshots.')
 print('PASS: batch captures page 1, pauses on challenge at page 2, resumes same tab after manual-success simulation, stores exactly 2 snapshots.')
 context.close()
