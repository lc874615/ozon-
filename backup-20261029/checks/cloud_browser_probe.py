"""Read-only live cloud-browser access check using the configured HTTP proxy."""
import asyncio,json,os
from pathlib import Path
from datetime import datetime,timezone
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=Path('/workspace/work/cloud-browser-probe-trusted')
JOBS=[
 ('ozon-search','https://www.ozon.ru/search/?text=%D0%B1%D0%B0%D1%80%D0%BD%D1%8B%D0%B9%20%D1%81%D1%82%D1%83%D0%BB'),
 ('ozon-product','https://www.ozon.ru/product/barnyy-stul-1-sht-5029194924/'),
 ('1688-product','https://detail.1688.com/offer/983128414763.html')]
async def main():
 OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  proxy=os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY')
  options={'executable_path':p.chromium.executable_path,'headless':True,'args':['--no-sandbox']}
  if proxy:options['proxy']={'server':proxy}
  browser=await p.chromium.launch(**options)
  context=await browser.new_context(locale='ru-RU')
  import sys;sys.path.insert(0,str(ROOT))
  from ozon_operator.browser_transport import attach_trusted_transport
  await attach_trusted_transport(context)
  limit=asyncio.Semaphore(2)
  async def probe(name,url):
   async with limit:
    page=await context.new_page();row={'name':name,'requested_url':url,'checked_at':datetime.now(timezone.utc).isoformat(),'transport':'trusted_executor_TLS_bridge','online_mutations':False}
    try:
     resp=await page.goto(url,wait_until='domcontentloaded',timeout=35000)
     await page.wait_for_timeout(2500)
     row['http_status']=resp.status if resp else None
     if resp:
      transport_error=resp.headers.get('x-cloud-transport-error')
      if transport_error:
       row.update({'result':'transport_error','transport_error':transport_error,
                   'upstream_status':resp.headers.get('x-upstream-status'),
                   'http_status_is_transport_generated':True})
       return row
     row['final_url']=page.url;row['title']=await page.title()
     text=await page.locator('body').inner_text(timeout=7000)
     row['body_excerpt']=text[:600]
     raw=await page.content();(OUT/(name+'.html')).write_text(raw)
     await page.screenshot(path=str(OUT/(name+'.png')),full_page=False)
     row['property_pairs']=await page.locator('[data-widget="webCharacteristics"] dt').count()
     row['challenge_detected']=any(t in text.lower() for t in ['доступ ограничен','проверка безопасности','подтвердите, что вы','完成验证','请按住滑块','验证码','access denied'])
     if name=='ozon-product':
      script=(ROOT/'browser-extension/collector.js').read_text()
      source='async () => {'+script.rsplit('collectOzonSnapshot();',1)[0]+'return await collectOzonSnapshot();}'
      snapshot=await page.evaluate(source)
      (OUT/'ozon-product-snapshot.json').write_text(json.dumps(snapshot,ensure_ascii=False,indent=2))
      row['collector_status']=snapshot['status'];row['properties_count']=len(snapshot.get('properties',[]))
     if name=='1688-product':
      import sys;sys.path.insert(0,str(ROOT))
      from ozon_operator.collection import observe_html
      obs=observe_html(raw,page.url);row['collector_status']=obs['status'];row['sku_count']=len(obs['skus'])
     if page.url.startswith('chrome-error://') or 'ERR_FAILED' in text:
      row['result']='browser_navigation_failed'
     elif row['challenge_detected']:row['result']='blocked_verification'
     elif 'login' in page.url.lower() or 'signin' in page.url.lower():row['result']='login_required'
     elif row.get('collector_status')=='sku_observed':row['result']='sku_data_observed'
     elif row.get('properties_count',0)>0:row['result']='product_attributes_observed'
     else:row['result']='page_loaded_without_required_data'
    except Exception as e:
     row['result']='access_error';row['error_type']=type(e).__name__;row['error']=str(e)[:1100]
    finally:
     await page.close()
     (OUT/(name+'-result.json')).write_text(json.dumps(row,ensure_ascii=False,indent=2))
     print(json.dumps(row,ensure_ascii=False),flush=True)
    return row
  rows=await asyncio.gather(*(probe(*job) for job in JOBS))
  (OUT/'summary.json').write_text(json.dumps({'tests':rows,'no_store_changes':True},ensure_ascii=False,indent=2))
  await browser.close()
if __name__=='__main__':asyncio.run(main())
