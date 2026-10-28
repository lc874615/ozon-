// seller_content_v1
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id || message?.type!=='OZON_READ_VARIANT_V1')return;
  if(!/^\d+$/.test(String(message.sku)) || !/^\d+$/.test(String(message.companyId))){respond({status:'invalid_query_context'});return;}
  readSellerVariant(String(message.sku),String(message.companyId)).then(respond,()=>respond({status:'seller_content_request_failed'}));
  return true;
});
