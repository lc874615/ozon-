// seller_readonly_runtime_v1
(() => {
let boot='starting',bootError='';
chrome.runtime.onMessage.addListener((m,s,respond)=>{
  if(s.id===chrome.runtime.id&&m?.type==='OZON_SELLER_PING_V1')respond({ready:boot==='ready',version:chrome.runtime.getManifest().version,boot,error:bootError,mode:'read_only_with_cached_detail'});
});
// seller_market_reader_v1
let sellerAnalyticsDeniedV1=false;
async function readSellerMarketSignals(sku,companyId) {
  if(!['seller.ozon.ru','seller.ozonru.cn'].includes(location.hostname)||!/^\d+$/.test(sku)||!/^\d+$/.test(companyId))return {status:'invalid_context'};
  if(sellerAnalyticsDeniedV1)return {status:'access_denied_previously_no_retry'};
  const path='/api/site/seller-analytics/what_to_sell/data/v3';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try {
    const r=await fetch(path,{method:'POST',credentials:'include',signal:controller.signal,
      headers:{'Content-Type':'application/json','x-o3-company-id':companyId,'x-o3-language':'RU'},
      body:JSON.stringify({limit:'50',offset:'0',filter:{stock:'any_stock',period:'monthly',categories:[],sku},sort:{key:'sum_gmv_desc'}})});
    if(r.status===403)sellerAnalyticsDeniedV1=true;
    if(!r.ok)return {status:'http_error',http_status:r.status,request_path:path};
    const raw=await r.text();if(raw.length>4000000)return {status:'response_too_large'};
    const d=JSON.parse(raw),items=Array.isArray(d.items)?d.items:[];
    return {status:'observed',request_path:path,requested_sku:sku,query_period:'monthly',
      sales_period_verified_rolling_30_days:false,observed_at:new Date().toISOString(),
      response_keys:Object.keys(d).slice(0,30),item_count:items.length,
      items:items.slice(0,50).map(i=>({sku:i.sku==null?null:String(i.sku),brand:typeof i.brand==='string'?i.brand.slice(0,160):null,
        salesSchema:typeof i.salesSchema==='string'?i.salesSchema.slice(0,80):null,
        soldCount:(typeof i.soldCount==='number'||typeof i.soldCount==='string')?i.soldCount:null,
        item_keys:Object.keys(i).slice(0,60)}))};
  }catch(e){return {status:e.name==='AbortError'?'timeout':'request_failed'};}
  finally{clearTimeout(timer);}
}

try {
async function readSellerVariant(sku,companyId) {
  if(!['seller.ozon.ru','seller.ozonru.cn'].includes(location.hostname))return {status:'wrong_seller_origin'};
  if(!/^\d+$/.test(sku)||!/^\d+$/.test(companyId))return {status:'invalid_query_context'};
  let path='/api/v1/search-variant-model';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try {
    let response=await fetch(path,{method:'POST',credentials:'include',signal:controller.signal,
      headers:{'Content-Type':'application/json','x-o3-company-id':companyId,'x-o3-language':'RU'},
      body:JSON.stringify({name:sku,limit:'50'})});
    let fallback_used=false;
    if(response.status===404){
      path='/api/v1/search';fallback_used=true;
      response=await fetch(path,{method:'POST',credentials:'include',signal:controller.signal,
        headers:{'Content-Type':'application/json','x-o3-company-id':companyId,'x-o3-language':'RU'},
        body:JSON.stringify({company_id:companyId,need_total:true,filter:{children_nodes:{children_nodes:[{input_leaf:{sku:{values:[sku]}}}],operator:'AND'}},pagination:{limit:'50'},is_copy_allowed:false})});
    }
    if(!response.ok)return {status:'http_error',http_status:response.status,request_path:path,requested_sku:sku};
    const raw=await response.text();if(raw.length>4000000)return {status:'response_too_large'};
    const data=JSON.parse(raw);
    const items=Array.isArray(data.items)?data.items:(Array.isArray(data.variants)?data.variants:[]);
    const allow=new Set(['9454','9455','9456','4497']);
    return {status:items.length?'variant_response_observed':'no_items',requested_sku:sku,request_path:path,
      fallback_used,observed_at:new Date().toISOString(),response_keys:Object.keys(data).slice(0,20),item_count:items.length,
      items:items.slice(0,50).map(item=>({
        variant_id:item.variant_id??null,
        brand_name:typeof item.brand_name==='string'?item.brand_name.slice(0,160):null,
        brand_id:item.brand_id??null,
        item_keys:Object.keys(item).slice(0,40),
        sku_ids:[item.sku,item.sku_id,...(Array.isArray(item.skus)?item.skus:[])].map(v=>typeof v==='object'?v?.sku??v?.sku_id:v).filter(v=>/^\d+$/.test(String(v))).map(String),
        attributes:(Array.isArray(item.attributes)?item.attributes:[]).filter(a=>allow.has(String(a.key))).map(a=>({key:String(a.key),value:String(a.value).slice(0,60)})),
        units_basis:'plugin_code_mapping_mm_and_g_not_officially_verified',verified_for_costing:false
      }))};
  } catch(e){return {status:e.name==='AbortError'?'timeout':'request_failed',requested_sku:sku};}
  finally{clearTimeout(timer);}
}
chrome.runtime.onMessage.addListener((m,s,respond)=>{
  if(s.id!==chrome.runtime.id||m?.type!=='OZON_READ_VARIANT_V1')return;
  if(!/^\d+$/.test(String(m.sku))||!/^\d+$/.test(String(m.companyId))){respond({status:'invalid_query_context'});return;}
  (async()=>{
    const result=await readSellerVariant(String(m.sku),String(m.companyId));
    if(String(m.sku)==='1991579954'){
      const exact=(result.items||[]).some(i=>String(i.variant_id)==='2569085301'&&(i.sku_ids||[]).includes(String(m.sku)));
      if(exact){
        const key='approvedVariantProbeV1_'+String(m.companyId)+'_2569085301';
        const saved=await chrome.storage.local.get(key);
        if(saved[key])result.approved_detail={...saved[key],reused_from_local_cache:true};
      }
    }
    result.market_signals=await readSellerMarketSignals(String(m.sku),String(m.companyId));
    result.detail_creation_disabled=true;
    return result;
  })().then(respond,()=>respond({status:'seller_content_request_failed',detail_creation_disabled:true}));
  return true;
});
boot='ready';
}catch(e){boot='startup_error';bootError=String(e.name||'Error')+': '+String(e.message||'').slice(0,160);}
})();
