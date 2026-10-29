from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'browser-extension'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox']);page=b.new_page();page.route('**/*',lambda r:r.fulfill(content_type='text/html',body='<meta charset=utf-8><h1>商品复制</h1>'))
 page.goto('https://seller.ozonru.cn/app/products/copy');page.add_script_tag(content=(root/'seller-copy-ui.js').read_text());call=lambda x:page.evaluate('(x)=>sellerCopyUi(x)',x)
 target='https://seller.ozonru.cn/app/products/copy/list'
 page.set_content('''<a id=return href="/app/products/copy/list">返回</a><dialog><button id=discard>退出不保存</button><button onclick="window.saved=true">保存</button></dialog>''')
 page.evaluate("() => {document.getElementById('return').onclick=e=>{e.preventDefault();document.querySelector('dialog').showModal()};document.getElementById('discard').onclick=()=>{history.pushState({},'', '/app/products/copy/list');document.body.innerHTML='<h1>商品复制</h1><input type=search>'}}")
 r=call({'action':'return-to-search','form_read_confirmed':True,'copy_url':target});assert r['status']=='return_link_clicked',r
 assert call({'action':'verify-discard','copy_url':target})['status']=='discard_not_confirmed'
 assert call({'action':'discard-unsaved','back_clicked':True})['status']=='discard_clicked'
 assert call({'action':'verify-discard','copy_url':target})['status']=='discard_return_confirmed'
 assert page.evaluate('window.saved') is None
 page.set_content('<h1>商品复制</h1><input type=search><div>已选择：1</div><button>继续</button>')
 assert call({'action':'verify-discard','copy_url':target})['status']=='discard_not_confirmed'
 page.set_content('<h1>商品复制</h1><input type=search placeholder=SKU><dialog open><button id=close>知道了</button></dialog>')
 page.evaluate("() => {document.getElementById('close').onclick=()=>document.querySelector('dialog').close()}")
 assert call({'action':'verify-discard','copy_url':target})['status']=='discard_not_confirmed'
 assert call({'action':'dismiss-return-dialog','return_requested':True})['status']=='return_dialog_closed'
 assert call({'action':'verify-discard','copy_url':target})['status']=='discard_return_confirmed'
 page.set_content('<h1>商品复制</h1><input type=search placeholder=SKU><dialog open><button onclick="window.saved=true">保存</button><button onclick="window.deleted=true">删除草稿</button></dialog>')
 assert call({'action':'dismiss-return-dialog','return_requested':True})['status']=='return_dialog_close_not_identified'
 assert page.evaluate('window.saved') is None
 assert page.evaluate('window.deleted') is None
 b.close();print('PASS return URL link triggers discard modal, exact Exit without saving confirmed; selected-product state never counted as clean return; Save untouched')
