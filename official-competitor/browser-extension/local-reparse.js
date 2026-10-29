async function reparseSavedPriceObservations(){
 const store=chrome.storage.local;
 const {snapshots={},captureFilters={},sellerEvidence={},listingDateEvidence={},autoQueue=null,sellerCopyJob=null}=await store.get(['snapshots','captureFilters','sellerEvidence','listingDateEvidence','autoQueue','sellerCopyJob']);
 if(autoQueue?.status==='running'||sellerCopyJob?.status==='running')throw new Error('请先暂停正在运行的采集；此操作只重识别已保存数据');
 const undo={},updated={...snapshots};let recovered=0,unknown=0;
 for(const [sku,old]of Object.entries(snapshots)){
  if(old.price_observation?.reference_price)continue;
  const price=readOzonBankPriceText(old.price_widget_text);
  if(!price.reference_price){unknown++;continue;}
  undo[sku]={prior_price_observation:old.price_observation||null,prior_properties:old.properties||[],prior_selection_review:old.selection_review||null};
  const p=price.reference_price,property={name:'参考售价估计（人民币）',value:p.value,source:p.source,is_estimate:true,currency:'CNY',calculation:'observed_conditional_bank_price × 1.10'};
  const properties=[...(old.properties||[])];if(!properties.some(x=>x.name===property.name&&x.value===property.value&&x.source===property.source))properties.push(property);
  const data={...old,properties,price_observation:price};
  data.selection_review=evaluateCaptureFilters(withListingEvidence(withSellerEvidence(data,sellerEvidence),listingDateEvidence),captureFilters);
  if(old.collection_status==='partial'&&data.selection_review.decision!=='exclude'){data.selection_review.decision='review';data.selection_review.checks.push({field:'loaded_attributes',state:'review',evidence:null});}
  updated[sku]=data;recovered++;
 }
 if(recovered)await store.set({localPriceReparseUndo:{at:new Date().toISOString(),records:undo},snapshots:updated});
 return {status:'local_prices_reparsed',records:Object.keys(snapshots).length,price_recovered:recovered,price_unresolved:unknown,network_requests:0,note:'只重识别已保存价格文本；未补造销量、日期、包装参数，也未重新访问商品'};
}
