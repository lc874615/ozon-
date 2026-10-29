from pathlib import Path
from playwright.sync_api import sync_playwright
import re
b=Path(__file__).resolve().parents[1]/'browser-extension'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':430,'height':920})
 html=re.sub(r'<script src="[^"]+"></script>','',(b/'popup.html').read_text())
 page.set_content(html)
 page.evaluate('''window.demo={version:'0.4.7',queued:50,collected:17,dailyGoal:{target:1},buyerBatchStats:{saved:5,properties:88,with_images:4,with_price_text:5},autoQueue:{status:'completed',index:5,urls:['a','b','c','d','e'],counts:{pass:0,exclude:0,review:5},reason:'collection_only_complete'}};
 window.chrome={runtime:{sendMessage:async m=>m.action==='get-filters'?{status:'filters_loaded',settings:{min_sold28:6,amount_metric:'unit_price'}}:window.demo},storage:{onChanged:{addListener:f=>window.notify=f}}};''')
 page.add_script_tag(content=(b/'progress-view.js').read_text());page.add_script_tag(content=(b/'popup.js').read_text())
 page.wait_for_function("document.getElementById('progress-title').textContent==='本批采集完成'")
 assert page.locator('#progress-numbers').inner_text()=='已处理 5 / 5 件（100%）'
 assert '待核验 5 件' in page.locator('#progress-counts').inner_text()
 assert page.locator('#batch-progress').evaluate('(e)=>e.value')==5
 page.evaluate("window.demo.autoQueue={status:'running',phase:'read',index:2,urls:['a','b','c','d','e'],counts:{pass:1,exclude:0,review:1}};window.notify({autoQueue:{}},'local')")
 page.wait_for_function("document.getElementById('progress-title').textContent==='采集中'")
 assert '2 / 5' in page.locator('#progress-numbers').inner_text()
 assert '第 3 件' in page.locator('#progress-stage').inner_text()
 page.evaluate("window.demo.autoQueue.status='paused';window.demo.autoQueue.reason='verification_required'")
 page.wait_for_function("document.getElementById('progress-title').textContent==='已暂停'")
 assert '手动完成' in page.locator('#progress-stage').inner_text()
 page.evaluate("window.demo.autoQueue={status:'paused',reason:'candidate_pool_exhausted_target_unmet',target_pass:5,index:10,urls:Array(10).fill('a'),counts:{pass:2,exclude:4,review:4}};window.notify({autoQueue:{}},'local')")
 page.wait_for_function("document.getElementById('progress-numbers').textContent.includes('还差 3 件')")
 assert page.locator('#batch-progress').evaluate('(e)=>e.max')==5
 assert page.locator('#batch-progress').evaluate('(e)=>e.value')==2
 assert '目标尚未补齐' in page.locator('#progress-stage').inner_text()
 browser.close();print('PASS Chinese progress bar/counts, no false pass count, storage-driven updates, one-second polling and pause explanation')
