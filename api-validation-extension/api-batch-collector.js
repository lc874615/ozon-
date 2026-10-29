// API-only coordinator. Each port is a normal authorized read, never a DOM/copy fallback.
async function collectApiBatch(seedSkus,ports,{filters={},concurrency=2,history=new Set(),target=Infinity,onResult=null}={}){
 const seeds=[...new Set(seedSkus.map(String))];if(seeds.some(x=>!/^\d+$/.test(x)))throw new Error('Invalid SKU');
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>2)throw new Error('Verification concurrency must be 1 or 2');
 const all=new Set(),coverageUnknown=new Set(),variantsBySeed={},results=[],blocked={value:false,reason:null};
 const limited=r=>['access_or_rate_limit','blocked_verification'].includes(r?.status);
 for(const seed of seeds){
  if(history.has(seed))continue;
  const list=await ports.variants(seed);
  if(limited(list)){blocked.value=true;blocked.reason=list.status;break;}
  if(list.status!=='variant_list_read'){if(list.status==='variant_coverage_unconfirmed'){coverageUnknown.add(seed);if(!history.has(seed))all.add(seed);variantsBySeed[seed]=[seed];}else results.push({sku:seed,status:'variant_discovery_failed',reason:list.status});continue;}
  variantsBySeed[seed]=list.variants.map(v=>v.sku);
  for(const v of list.variants)if(!history.has(v.sku))all.add(v.sku);
 }
 const queue=[...all];let index=0,qualified=0;
 async function one(sku){
  const buyer=await ports.buyer(sku);if(limited(buyer)){blocked.value=true;blocked.reason=buyer.status;return {sku,status:'paused',reason:buyer.status};}
  if(buyer.status!=='buyer_json_read'||buyer.sku!==sku)return {sku,status:'essential_data_missing',field:'buyer_identity'};
  const properties=[];if(buyer.reference_price)properties.push({name:'参考售价估计（人民币）',value:buyer.reference_price.value});
  if(buyer.delivery?.minimum_days!==null&&buyer.delivery?.minimum_days!==undefined)properties.push({name:'参考最短送达天数',value:String(buyer.delivery.minimum_days)});
  const data={product_id:sku,title:buyer.title,images:buyer.images,properties};let review=evaluateCaptureFilters(data,filters);
  if(review.decision==='exclude')return {sku,status:'exclude',review,requests_stage:'buyer'};
  if(blocked.value)return {sku,status:'not_completed_after_batch_pause'};
  const market=await ports.market(sku);if(limited(market)){blocked.value=true;blocked.reason=market.status;return {sku,status:'paused',reason:market.status};}
  if(market.status==='sku_not_found')return {sku,status:'exclude',reason:'official_analytics_no_record',market};
  if(market.status==='exact_sku_read'&&String(market.sku)===sku)data.properties.push(...(market.properties||[]));
  review=evaluateCaptureFilters(data,filters);if(review.decision==='exclude')return {sku,status:'exclude',review,requests_stage:'market'};
  const missing=mandatorySelectionGaps(review);if(missing.length)return {sku,status:'essential_data_missing',missing,buyer,market,review};
  if(blocked.value)return {sku,status:'not_completed_after_batch_pause'};
  const pack=await ports.packaging(sku,market.variant_id);if(limited(pack)){blocked.value=true;blocked.reason=pack.status;return {sku,status:'paused',reason:pack.status};}
  if(pack.creation_may_have_occurred){blocked.value=true;blocked.reason='temporary_creation_requires_review';return {sku,status:'paused',packaging:pack};}
  if(pack.status==='http_error')return {sku,status:'packaging_endpoint_error',http_status:pack.http_status,packaging:pack};
  if(!pack.identity_verified||String(pack.requested_sku)!==sku)return {sku,status:'packaging_identity_not_verified',packaging:pack};
  buyer.specification_reference={sku,attributes:buyer.attributes||[],package_quantity:(buyer.attributes||[]).filter(a=>/^(?:Количество в упаковке, шт|Количество предметов в комплекте|包装数量|每套数量)$/i.test(a.name)).map(a=>({label:a.name,value:a.value})),quantity_verified:false,cost_comparison_requires_exact_sku_and_quantity:true};
  const packaging=extractPackaging({fields:(pack.properties||[]).map(p=>({label:p.name,value:p.value}))});
  return {sku,status:packaging.complete?'api_data_complete':'packaging_incomplete',buyer,market,packaging,review,note:'not_formally_passed_until_all_business_checks_and_tasks_resolved'};
 }
 await Promise.all(Array.from({length:concurrency},async()=>{while(!blocked.value&&index<queue.length&&qualified<target){const sku=queue[index++];try{const result=await one(sku);if(coverageUnknown.has(sku)){result.variant_coverage='unconfirmed';if(result.status==='api_data_complete')result.status='review_variant_coverage';}results.push(result);if(result.status==='api_data_complete')qualified++;if(onResult)await onResult(result);if(result.status==='essential_data_missing'){blocked.value=true;blocked.reason='essential_data_missing';}}catch{blocked.value=true;blocked.reason='api_transport_error';results.push({sku,status:'api_transport_error'});}}}));
 return {mode:'api_only_verification',variants_by_seed:variantsBySeed,discovered:queue.length,processed:results.filter(r=>r.status!=='variant_discovery_failed').length,discovery_failures:results.filter(r=>r.status==='variant_discovery_failed').length,coverage_unconfirmed_seeds:[...coverageUnknown],paused:blocked.value,pause_reason:blocked.reason,unprocessed:queue.slice(index),results};
}
