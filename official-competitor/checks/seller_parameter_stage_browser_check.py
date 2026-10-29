from pathlib import Path
from playwright.sync_api import sync_playwright
b=Path(__file__).resolve().parents[1]/'browser-extension'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox'])
 page=browser.new_page();page.route('**/*',lambda r:r.fulfill(content_type='text/html',body='<meta charset="utf-8"><h1>商品复制</h1><input type="search" value="123"><button type="button" id="next">下一步</button>'))
 page.goto('https://seller.ozon.ru/app/products/copy/list');page.add_script_tag(content=(b/'seller-copy-ui.js').read_text())
 call=lambda a:page.evaluate('(c)=>sellerCopyUi(c)',a)
 assert call({'action':'back-from-parameters','form_read_confirmed':True})['status']=='still_on_copy_search_do_not_navigate'
 page.locator('#next').evaluate('''e=>e.onclick=()=>{document.body.innerHTML='<h1>商品复制</h1><label>包装长度，毫米<input type=number value=650></label><label>包装宽度，毫米<input type=number value=650></label><label>包装高度，毫米<input type=number value=100></label><label>含包装重量，克<input type=number value=2500></label>'}''')
 call=lambda a:page.evaluate('(c)=>sellerCopyUi(c)',a)
 page.locator('#next').evaluate("e=>e.textContent='继续'")
 assert call({'action':'open-parameter-step','copy_clicked':True,'sku':'123'})['status']=='selected_count_not_single'
 page.evaluate("document.body.insertAdjacentHTML('beforeend','<div id=selected>已选择：2</div>')")
 assert call({'action':'open-parameter-step','copy_clicked':True,'sku':'123'})['status']=='selected_count_not_single'
 page.locator('#selected').evaluate("e=>e.textContent='已选择：1'")
 assert call({'action':'open-parameter-step','copy_clicked':False,'sku':'123'})['status']=='not_owned_selection_step'
 assert call({'action':'open-parameter-step','copy_clicked':True,'sku':'999'})['status']=='selected_source_sku_not_visible'
 assert call({'action':'open-parameter-step','copy_clicked':True,'sku':'123'})['status']=='parameter_step_clicked'
 assert call({'action':'inspect'})['status']=='parameter_form_already_open'
 assert call({'action':'search','sku':'999'})['status']=='existing_state_do_not_touch'
 assert page.locator('input').first.input_value()=='650'
 browser.close();print('PASS only owned exact-SKU selection advances to parameters; parameter page is never mistaken for search or overwritten')
