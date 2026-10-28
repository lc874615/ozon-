// seller_readonly_runtime_v1
(() => {
let boot='starting',bootError='';
chrome.runtime.onMessage.addListener((m,s,respond)=>{
  if(s.id===chrome.runtime.id&&m?.type==='OZON_SELLER_PING_V1')respond({ready:boot==='ready',version:chrome.runtime.getManifest().version,boot,error:bootError,mode:'read_only_with_cached_detail'});
});
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
    result.detail_creation_disabled=true;
    return result;
  })().then(respond,()=>respond({status:'seller_content_request_failed',detail_creation_disabled:true}));
  return true;
});
boot='ready';
}catch(e){boot='startup_error';bootError=String(e.name||'Error')+': '+String(e.message||'').slice(0,160);}
})();
