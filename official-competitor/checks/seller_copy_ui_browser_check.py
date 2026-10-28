from pathlib import Path
from playwright.sync_api import sync_playwright
b=Path(__file__).resolve().parents[1]/'browser-extension'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox'])
 page=browser.new_page()
 page.route('**/*',lambda r:r.fulfill(content_type='text/html',body='''<meta charset="utf-8"><h1>商品复制</h1><input type="search"><article><a href="https://www.ozon.ru/product/lamp-123/">所有特征</a><button type="button" onclick="window.copied=true;history.pushState({},'', '?draft_id=777')">添加</button></article>'''))
 page.goto('https://seller.ozon.ru/app/products/copy')
 page.add_script_tag(content=(b/'seller-copy-ui.js').read_text())
 call=lambda a:page.evaluate('(c)=>sellerCopyUi(c)',a)
 assert call({'action':'inspect'})['status']=='clean_copy_search'
 assert call({'action':'search','sku':'123'})['status']=='search_entered'
 assert page.locator('input').input_value()=='123'
 assert call({'action':'copy','sku':'999'})['status']=='exact_sku_card_not_loaded'
 assert call({'action':'copy','sku':'123'})['status']=='copy_clicked'
 page.set_content('<button type="button" onclick="window.deleted=true;document.body.innerHTML=\'<div role=status>草稿已删除</div>\'">删除草稿</button>')
 assert call({'action':'delete-owned','draft_id':'888'})['status']=='cleanup_identity_not_visible'
 assert call({'action':'delete-owned','draft_id':'777'})['status']=='owned_delete_clicked'
 assert call({'action':'verify-deletion'})['status']=='deletion_confirmed'
 page.set_content('<h1>商品复制</h1><div>您已开始创建商品</div><button>删除草稿</button>')
 assert call({'action':'search','sku':'123'})['status']=='existing_state_do_not_touch'
 browser.close();print('PASS normal UI exact SKU match, no mismatched copy/delete, explicit deletion acknowledgment, pre-existing draft state untouched')
