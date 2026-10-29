// Explicitly authorized temporary copy creation. Never publishes or updates price/stock.
async function readTemporaryPackaging(sku,company,variantId){
 if(!['seller.ozon.ru','seller.ozonru.cn'].includes(location.hostname)||![sku,company,variantId].every(v=>/^\d+$/.test(String(v||''))))return {status:'creation_precondition_failed'};
 const timerController=new AbortController(),timer=setTimeout(()=>timerController.abort(),15000);
 try{
  const r=await fetch('/api/site/seller-prototype/create-bundle-by-variant-id',{method:'POST',credentials:'include',redirect:'error',signal:timerController.signal,headers:{'Content-Type':'application/json','x-o3-company-id':String(company),'x-o3-language':'RU'},body:JSON.stringify({company_id:String(company),variant_id:String(variantId),source:'SOURCE_UI_COPY_MERGED'})});
  if(!r.ok)return {status:[401,403,429].includes(r.status)?'access_or_rate_limit':'temporary_creation_http_error',http_status:r.status,creation_may_have_occurred:true};
  const raw=await r.text();if(raw.length>4000000)return {status:'temporary_creation_result_unknown',creation_may_have_occurred:true};const data=JSON.parse(raw),item=data.item;
  const bundle=/^\d+$/.test(String(data.bundle_id||''))?String(data.bundle_id):null;
  if(!bundle||String(item?.copy_item_info?.sku)!==String(sku)||String(item?.origin_variant_id)!==String(variantId))return {status:'temporary_creation_identity_unverified',temporary_bundle_id:bundle,creation_may_have_occurred:true};
  const map={depth:['包装长度，毫米','mm'],width:['包装宽度，毫米','mm'],height:['包装高度，毫米','mm'],weight:['含包装重量，克','g']};
  return {status:'temporary_packaging_read',requested_sku:String(sku),identity_verified:true,temporary_bundle_id:bundle,cleanup_performed:false,cleanup_policy:'user_authorized_not_required',properties:Object.entries(map).filter(([k])=>Number.isFinite(Number(item[k]))&&Number(item[k])>0).map(([k,[name,unit]])=>({name,value:String(item[k]),unit,source:'temporary_copy_response_ui_units_verified'}))};
 }catch{return {status:'temporary_creation_result_unknown',creation_may_have_occurred:true};}finally{clearTimeout(timer);}
}
