from pathlib import Path
from playwright.sync_api import sync_playwright
b=Path(__file__).resolve().parents[1]/'browser-extension'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox'])
 page=browser.new_page()
 page.route('**/*',lambda r:r.fulfill(content_type='text/html',body='''<meta charset="utf-8"><h1>商品复制</h1><input type="search"><article><a href="https://www.ozon.ru/product/lamp-123/">所有特征</a><button type="button" onclick="window.copied=true">添加</button></article>'''))
 page.goto('https://seller.ozon.ru/app/products/copy')
 page.add_script_tag(content=(b/'seller-copy-ui.js').read_text())
 call=lambda a:page.evaluate('(c)=>sellerCopyUi(c)',a)
 assert call({'action':'inspect'})['status']=='clean_copy_search'
 assert call({'action':'search','sku':'123'})['status']=='search_entered'
 assert call({'action':'copy','sku':'999'})['status']=='exact_sku_card_not_loaded'
 assert call({'action':'copy','sku':'123'})['status']=='copy_clicked'
 page.set_content('''<button type="button" onclick="document.querySelector('dialog').showModal()">返回</button><dialog><button type="button" onclick="document.body.innerHTML='<h1>商品复制</h1><input type=search>'">退出且不保存</button><button onclick="window.saved=true">保存</button></dialog>''')
 assert call({'action':'back-from-parameters','form_read_confirmed':True,'copy_url':page.url})['status']=='back_clicked'
 assert call({'action':'discard-unsaved','back_clicked':True})['status']=='discard_clicked'
 assert call({'action':'verify-discard','copy_url':page.url})['status']=='discard_return_confirmed'
 assert page.evaluate('window.saved') is None
 assert call({'action':'delete-owned','draft_id':'777'})['status']=='unsupported_action'
 page.set_content('<h1>商品复制</h1><div>您已开始创建商品</div><button>删除草稿</button>')
 assert call({'action':'search','sku':'123'})['status']=='existing_state_do_not_touch'
 browser.close();print('PASS exact SKU card, normal Back -> explicit Exit without saving -> search-page return, Save and Delete never clicked')
