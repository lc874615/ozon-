// Normal authenticated read-only searches observed in the supplied plugin.
// Never calls create-bundle, copies a product, extracts cookies or sends data to a vendor.
async function readReadonlyVariantPackaging(sku,configuredCompanyId,verifiedVariantId=null){
 if(!['seller.ozon.ru','seller.ozonru.cn'].includes(location.hostname)||!/^\d+$/.test(String(sku)))return {status:'invalid_context'};
 let company=String(configuredCompanyId||'');
 if(!company){const explicit=document.querySelector('header [data-company-id],[role="banner"] [data-company-id]');company=explicit?.getAttribute('data-company-id')||'';}
 if(!/^\d+$/.test(company)){company=(document.querySelector('header,[role="banner"]')?.innerText||'').match(/\bShop\s*#?\s*(\d+)\b/i)?.[1]||'';}
 if(!/^\d+$/.test(company))return {status:'company_id_not_identified'};
 const diagnostics=[];const variant=x=>/^\d+$/.test(String(x?.variant_id??x?.variantId??''))?String(x.variant_id??x.variantId):null;
 const records=data=>{const out=[];const visit=(x,depth)=>{if(!x||typeof x!=='object'||depth>5||out.length>250)return;if(!Array.isArray(x))out.push(x);for(const v of Object.values(x).slice(0,100))if(v&&typeof v==='object')visit(v,depth+1);};visit(data,0);return out;};
 const exact=r=>['sku','sku_id','skuId','ozon_sku','product_id','productId'].some(k=>r[k]!==undefined&&String(r[k])===String(sku));
 const request=async(path,body)=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const response=await fetch(path,{method:'POST',credentials:'include',signal:controller.signal,headers:{'Content-Type':'application/json','x-o3-company-id':company,'x-o3-language':'RU'},body:JSON.stringify(body)});
   diagnostics.push({path,http_status:response.status,content_type:(response.headers.get('content-type')||'').split(';')[0]});
   if(!response.ok)return {status:[401,403,429].includes(response.status)?'access_or_rate_limit':'http_error',http_status:response.status};
   const text=await response.text();if(text.length>4000000)return {status:'response_too_large'};const data=JSON.parse(text);
   diagnostics.push({path,top_level_fields:Object.keys(data).slice(0,25),item_fields:(Array.isArray(data.items)?data.items:[]).slice(0,2).map(r=>Object.keys(r).slice(0,25)),variant_fields:(Array.isArray(data.variants)?data.variants:[]).slice(0,2).map(r=>Object.keys(r).slice(0,25))});
   return {status:'read',data};
  }catch(e){return {status:e.name==='AbortError'?'timeout':'read_failed'};}finally{clearTimeout(timer);}
 };
 let hint=/^\d+$/.test(String(verifiedVariantId||''))?String(verifiedVariantId):null;let hintSource=hint?'exact_sku_analytics_variant_id':null;
 // Read the model once. A direct SKU match or the analytics variant ID avoids the base lookup.
 const model=await request('/api/v1/search-variant-model',{name:String(sku),limit:'50'});
 if(model.status!=='read')return {...model,diagnostics};
 const items=Array.isArray(model.data.items)?model.data.items:[];
 let rows=items.filter(r=>Array.isArray(r.attributes)&&(exact(r)||hint&&variant(r)===hint));
 if(!rows.length&&!hint){
  const base=await request('/api/v1/search',{company_id:company,need_total:true,filter:{children_nodes:{children_nodes:[{input_leaf:{sku:{values:[String(sku)]}}}],operator:'AND'}},pagination:{limit:'50'},is_copy_allowed:false});
  if(base.status==='access_or_rate_limit')return {...base,diagnostics};
  if(base.status==='read'){const ids=[...new Set(records(base.data).filter(exact).map(variant).filter(Boolean))];if(ids.length===1){hint=ids[0];hintSource='readonly_exact_sku_search_variant_id';rows=items.filter(r=>Array.isArray(r.attributes)&&variant(r)===hint);}}
 }
 const distinct=[...new Map(rows.map(r=>[JSON.stringify({variant:variant(r),attributes:r.attributes}),r])).values()];
 if(distinct.length!==1)return {status:distinct.length?'ambiguous_packaging_identity':'packaging_identity_not_verified',requested_sku:String(sku),verified_variant_id:hint,diagnostics};
 const row=distinct[0],mapping={'9454':['包装长度，毫米','mm'],'9455':['包装宽度，毫米','mm'],'9456':['包装高度，毫米','mm'],'4497':['含包装重量，克','g']};
 const properties=row.attributes.filter(a=>mapping[String(a.key)]&&['string','number'].includes(typeof a.value)).map(a=>({name:mapping[String(a.key)][0],value:String(a.value),unit:mapping[String(a.key)][1],original_attribute_id:String(a.key),source:'authenticated_readonly_variant_model',source_sku:String(sku),mapping_basis:'observed_vendor_attribute_mapping',captured_at:new Date().toISOString()}));
 return {status:'readonly_packaging_read',requested_sku:String(sku),identity_verified:true,identity_basis:exact(row)?'response_exact_sku':hintSource,verified_variant_id:variant(row),properties,additional_attributes:row.attributes.filter(a=>!mapping[String(a.key)]&&['string','number'].includes(typeof a.value)).map(a=>({attribute_id:String(a.key),label:typeof a.name==='string'?a.name:typeof a.title==='string'?a.title:null,value:String(a.value).slice(0,2000)})).slice(0,200),diagnostics,no_copy_created:true};
}
