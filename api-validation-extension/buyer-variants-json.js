// Product option discovery, using the normal buyer JSON modal. Does not purchase or create products.
async function readBuyerVariantsJson(sku){
 if(!['ozon.ru','www.ozon.ru'].includes(location.hostname)||!/^\d+$/.test(String(sku)))return {status:'invalid_context'};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const path='/api/entrypoint-api.bx/page/json/v2?'+new URLSearchParams({url:'/modal/aspectsNew?product_id='+sku});
  const r=await fetch(path,{credentials:'include',signal:controller.signal});if(!r.ok){
   const type=(r.headers.get('content-type')||'').split(';')[0];let finalOrigin=null,finalRoute='unknown';try{const u=new URL(r.url,location.origin);finalOrigin=u.origin;finalRoute=u.pathname.startsWith('/api/')?'api':/captcha|challenge|blocked/i.test(u.pathname)?'verification':'other';}catch{}
   return {status:[401,403,429].includes(r.status)?'access_or_rate_limit':'http_error',http_status:r.status,response_metadata:{content_type:type,redirected:r.redirected,final_origin:finalOrigin,final_route:finalRoute,retry_after_present:r.headers.has('retry-after'),execution_world:'ISOLATED',credentials_mode:'include',request_kind:'normal_aspects_modal_get',automatic_retry:false}};
  }
  const text=await r.text();if(text.length>4000000)return {status:'response_too_large'};let data=JSON.parse(text);
  if(data.incidentId||data.challengeURL||data.blockURL)return {status:'blocked_verification'};
  const discoveryDiagnostics={modal_widget_names:Object.keys(data.widgetStates||{}).slice(0,60),fallback_requested:false};
  if(!Object.keys(data.widgetStates||{}).some(k=>/^webAspects(?:Modal)?[-_]/.test(k))){
   discoveryDiagnostics.fallback_requested=true;
   const extra=await fetch('/api/entrypoint-api.bx/page/json/v2?'+new URLSearchParams({url:'/product/'+sku+'/'}),{credentials:'include',signal:controller.signal});
   discoveryDiagnostics.fallback_http_status=extra.status;
   if([401,403,429].includes(extra.status))return {status:'access_or_rate_limit',http_status:extra.status};
   if(extra.ok){const raw=await extra.text();if(raw.length>4000000)return {status:'response_too_large'};const page=JSON.parse(raw);if(page.incidentId||page.challengeURL||page.blockURL)return {status:'blocked_verification'};
    const entries=Object.entries(page.widgetStates||{}).flatMap(([k,v])=>{try{return [[k,typeof v==='string'?JSON.parse(v):v]];}catch{return [];}});
    const identity=entries.filter(([k,v])=>/^web(?:Gallery|ProductHeading)/.test(k)&&v?.sku!==undefined).map(([,v])=>String(v.sku));
    discoveryDiagnostics.product_identity_verified=identity.length>0&&identity.every(v=>v===String(sku));
    if(discoveryDiagnostics.product_identity_verified)data=page;
    discoveryDiagnostics.product_widget_names=entries.map(([k])=>k).slice(0,60);
   }
  }
  const variants=new Map([[String(sku),{sku:String(sku)}]]),widgetNames=[];let partial=false;
  for(const [key,raw]of Object.entries(data.widgetStates||{})){
   if(!/^webAspects(?:Modal)?[-_]/.test(key))continue;widgetNames.push(key);
   let state;try{state=typeof raw==='string'?JSON.parse(raw):raw;}catch{partial=true;continue;}
   if(state.hasNext||state.hasMore||state.nextPage||state.nextPageUrl)partial=true;
   if(!Array.isArray(state.aspects)){partial=true;continue;}
   for(const aspect of state.aspects)for(const v of aspect.variants||[]){
    const id=String(v.sku??'');if(!/^\d+$/.test(id)){partial=true;continue;}
    variants.set(id,{sku:id,title:typeof v.data?.title==='string'?v.data.title:null});
   }
  }
  return {status:widgetNames.length&&!partial?'variant_list_read':'variant_coverage_unconfirmed',seed_sku:String(sku),variants:[...variants.values()],coverage:'all_SKUs_advertised_in_received_aspects_response_not_market_wide_proof',pagination_detected:partial,widget_names:widgetNames,diagnostics:discoveryDiagnostics};
 }catch(e){return {status:e.name==='AbortError'?'timeout':'read_failed'};}finally{clearTimeout(timer);}
}
