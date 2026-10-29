// API-only coordinator. Each port is a normal authorized read, never a DOM/copy fallback.
async function collectApiBatch(seedSkus,ports,{filters={},concurrency=2,history=new Set()}={}){
 const seeds=[...new Set(seedSkus.map(String))];if(seeds.some(x=>!/^\d+$/.test(x)))throw new Error('Invalid SKU');
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>2)throw new Error('Verification concurrency must be 1 or 2');
 const all=new Set(),variantsBySeed={},results=[],blocked={value:false,reason:null};
 const limited=r=>['access_or_rate_limit','blocked_verification'].includes(r?.status);
 for(const seed of seeds){
  if(history.has(seed))continue;
  const list=await ports.variants(seed);
  if(limited(list)){blocked.value=true;blocked.reason=list.status;break;}
  if(list.status!=='variant_list_read'){results.push({sku:seed,status:'variant_coverage_unconfirmed'});continue;}
  variantsBySeed[seed]=list.variants.map(v=>v.sku);
  for(const v of list.variants)if(!history.has(v.sku))all.add(v.sku);
 }
 const queue=[...all];let index=0;
 async function one(sku){
  const buyer=await ports.buyer(sku);if(limited(buyer)){blocked.value=true;blocked.reason=buyer.status;return {sku,status:'paused',reason:buyer.status};}
  if(buyer.status!=='buyer_json_read'||buyer.sku!==sku)return {sku,status:'essential_data_missing',field:'buyer_identity'};
  const properties=[];if(buyer.reference_price)properties.push({name:'参考售价估计（人民币）',value:buyer.reference_price.value});
  if(buyer.delivery?.minimum_days!==null&&buyer.delivery?.minimum_days!==undefined)properties.push({name:'参考最短送达天数',value:String(buyer.delivery.minimum_days)});
  const data={product_id:sku,title:buyer.title,images:buyer.images,properties};let review=evaluateCaptureFilters(data,filters);
  if(review.decision==='exclude')return {sku,status:'exclude',review,requests_stage:'buyer'};
  if(blocked.value)return {sku,status:'not_completed_after_batch_pause'};
  const market=await ports.market(sku);if(limited(market)){blocked.value=true;blocked.reason=market.status;return {sku,status:'paused',reason:market.status};}
  if(market.status==='exact_sku_read'&&String(market.sku)===sku)data.properties.push(...(market.properties||[]));
  review=evaluateCaptureFilters(data,filters);if(review.decision==='exclude')return {sku,status:'exclude',review,requests_stage:'market'};
  const missing=mandatorySelectionGaps(review);if(missing.length)return {sku,status:'essential_data_missing',missing,buyer,market,review};
  if(blocked.value)return {sku,status:'not_completed_after_batch_pause'};
  const pack=await ports.packaging(sku,market.variant_id);if(limited(pack)){blocked.value=true;blocked.reason=pack.status;return {sku,status:'paused',reason:pack.status};}
  if(!pack.identity_verified||String(pack.requested_sku)!==sku)return {sku,status:'packaging_identity_not_verified'};
  const packaging=extractPackaging({fields:(pack.properties||[]).map(p=>({label:p.name,value:p.value}))});
  return {sku,status:packaging.complete?'api_data_complete':'packaging_incomplete',buyer,market,packaging,review,note:'not_formally_passed_until_all_business_checks_and_tasks_resolved'};
 }
 await Promise.all(Array.from({length:concurrency},async()=>{while(!blocked.value&&index<queue.length){const sku=queue[index++];try{const result=await one(sku);results.push(result);if(result.status==='essential_data_missing'){blocked.value=true;blocked.reason='essential_data_missing';}}catch{blocked.value=true;blocked.reason='api_transport_error';results.push({sku,status:'api_transport_error'});}}}));
 return {mode:'api_only_verification',variants_by_seed:variantsBySeed,discovered:queue.length,processed:results.length,paused:blocked.value,pause_reason:blocked.reason,unprocessed:queue.slice(index),results};
}
