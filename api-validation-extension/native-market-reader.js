// Reimplements the observed vendor's normal authenticated seller analytics read.
// No vendor service, cookie extraction, subscription changes, or access bypass.
async function readNativeSellerMarket(sku,configuredCompanyId){
 if(!['seller.ozon.ru','seller.ozonru.cn'].includes(location.hostname)||!/^\d+$/.test(String(sku)))return {status:'invalid_context'};
 const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
 let companyId=String(configuredCompanyId||'');
 if(!companyId){const explicit=document.querySelector('header [data-company-id],[role="banner"] [data-company-id]');const n=explicit?.getAttribute('data-company-id');if(/^\d+$/.test(n||''))companyId=n;}
 if(!companyId){const banner=document.querySelector('header,[role="banner"]');const text=clean((banner||document.body)?.innerText).slice(0,5000);companyId=text.match(/\bShop\s*#?\s*(\d+)\b/i)?.[1]||'';}
 if(!/^\d+$/.test(companyId))return {status:'company_id_not_identified'};
 const path='/api/site/seller-analytics/what_to_sell/data/v3';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(path,{method:'POST',credentials:'include',signal:controller.signal,headers:{'Content-Type':'application/json','x-o3-company-id':companyId,'x-o3-language':'zh-Hans'},body:JSON.stringify({limit:'50',offset:'0',filter:{stock:'any_stock',period:'monthly',categories:[],sku:String(sku)},sort:{key:'sum_gmv_desc'}})});
  if(!response.ok)return {status:[401,403,429].includes(response.status)?'access_or_rate_limit':'http_error',http_status:response.status,retry_after_seconds:/^\d+$/.test(response.headers.get('Retry-After')||'')?Number(response.headers.get('Retry-After')):null};
  const text=await response.text();if(text.length>4000000)return {status:'response_too_large'};
  const data=JSON.parse(text),matches=(Array.isArray(data.items)?data.items:[]).filter(i=>String(i.sku)===String(sku));
  if(matches.length!==1)return {status:matches.length?'ambiguous_exact_sku':'sku_not_found',exact_matches:matches.length,diagnostics:{query_mode:'exact_sku',requested_sku:String(sku),returned_items:Array.isArray(data.items)?data.items.length:0,top_level_fields:Object.keys(data).slice(0,25),row_fields:(Array.isArray(data.items)?data.items:[]).slice(0,2).map(r=>Object.keys(r).slice(0,30)),other_sku_rows:(Array.isArray(data.items)?data.items:[]).filter(r=>String(r.sku)!==String(sku)).length}};
  const row=matches[0],properties=[],at=new Date().toISOString();
  const add=(name,value,field,extra={})=>properties.push({name,value:String(value),original_field:field,source:'authenticated_seller_what_to_sell_same_vendor_method',captured_at:at,query_period:'monthly',...extra});
  if(row.soldCount!==null&&row.soldCount!==undefined&&/^\d+$/.test(String(row.soldCount)))add('近28天销量',row.soldCount,'soldCount',{period_days:28,period_basis:'official_what_to_sell_28_day_documentation',metric_mapping:'same_vendor_soldCount'});
  if(typeof row.nullableCreateDate==='string'){
   const date=new Date(row.nullableCreateDate);if(Number.isFinite(date.getTime())&&date.getTime()<=Date.now()+86400000)add('listing date',date.toISOString().slice(0,10),'nullableCreateDate',{raw_date:row.nullableCreateDate,date_semantics:'vendor_displayed_listing_date_reference_not_independently_first_sale_verified'});
  }
  if(typeof row.brand==='string'&&row.brand.trim())add('品牌',row.brand,'brand');
  if(typeof row.salesSchema==='string'&&row.salesSchema.trim())add('履约方式',row.salesSchema,'salesSchema');
  return {status:'exact_sku_read',sku:String(sku),variant_id:/^\d+$/.test(String(row.variantId??row.variant_id??''))?String(row.variantId??row.variant_id):null,properties,source_fields_present:{soldCount:row.soldCount!==null&&row.soldCount!==undefined,nullableCreateDate:row.nullableCreateDate!==null&&row.nullableCreateDate!==undefined},observed_at:at};
 }catch(e){return {status:e.name==='AbortError'?'timeout':'read_failed',reason:String(e.message||e).slice(0,120)};}
 finally{clearTimeout(timer);}
}
