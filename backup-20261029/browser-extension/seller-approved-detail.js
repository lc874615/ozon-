// approved_variant_probe_v1: user authorized one potentially draft-creating request.
const sellerBaseQueryV1 = readSellerVariant;
let approvedProbeBusyV1=false;
readSellerVariant = async function(sku,companyId) {
  const base=await sellerBaseQueryV1(sku,companyId);
  if(sku!=='1991579954')return base;
  const variant='2569085301';
  const exact=(base.items||[]).some(i=>String(i.variant_id)===variant && (i.sku_ids||[]).includes(sku));
  if(!exact)return {...base,approved_detail:{status:'exact_variant_not_confirmed'}};
  if(approvedProbeBusyV1)return {...base,approved_detail:{status:'probe_already_in_progress'}};
  approvedProbeBusyV1=true;
  const key='approvedVariantProbeV1_'+companyId+'_'+variant;
  const saved=await chrome.storage.local.get(key);
  if(saved[key]){approvedProbeBusyV1=false;return {...base,approved_detail:saved[key]};}
  const pending={status:'started_no_automatic_retry',requested_sku:sku,variant_id:variant,started_at:new Date().toISOString(),possible_draft_creation:true};
  await chrome.storage.local.set({[key]:pending});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  let detail;
  try {
    const path='/api/site/seller-prototype/create-bundle-by-variant-id';
    const r=await fetch(path,{method:'POST',credentials:'include',signal:controller.signal,
      headers:{'Content-Type':'application/json','x-o3-company-id':companyId,'x-o3-language':'RU'},
      body:JSON.stringify({company_id:companyId,variant_id:variant,source:'SOURCE_UI_COPY_MERGED'})});
    detail={...pending,status:'http_error_no_retry',http_status:r.status,request_path:path};
    if(r.ok){
      const raw=await r.text();
      if(raw.length>4000000)detail.status='response_too_large_no_retry';
      else {
        const d=JSON.parse(raw),item=d.item||{};
        const fields={};
        for(const k of ['depth','width','height','weight']) {
          const v=item[k];if((typeof v==='number'&&Number.isFinite(v)) || (typeof v==='string'&&/^\d+(?:[.,]\d+)?$/.test(v)))fields[k]=v;
        }
        const identifiers={};
        for(const k of ['id','bundle_id','prototype_id','draft_id','variant_id'])if(typeof d[k]==='string'||typeof d[k]==='number')identifiers[k]=String(d[k]).slice(0,100);
        detail={...detail,status:'detail_response_observed',response_keys:Object.keys(d).slice(0,30),item_keys:Object.keys(item).slice(0,60),fields,response_identifiers:identifiers,
          units_basis:'vendor_display_assumes_mm_g_not_independently_verified',verified_for_costing:false,draft_creation_confirmed:false};
      }
    }
  }catch(e){detail={...pending,status:e.name==='AbortError'?'timeout_no_retry':'request_failed_no_retry'};}
  finally{clearTimeout(timer);}
  await chrome.storage.local.set({[key]:detail});
  approvedProbeBusyV1=false;
  return {...base,approved_detail:detail};
};
