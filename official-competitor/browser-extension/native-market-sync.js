async function syncNativeMarketForSku(sku){
 const store=chrome.storage.local;
 await store.set({nativeMarketLast:{status:'reader_started',requested_sku:String(sku),checked_at:new Date().toISOString(),reader_phase:'select_seller_tab'}});
 try{return await nativeMarketAttempt(sku);}
 catch(e){const {nativeMarketLast:prior}=await store.get('nativeMarketLast');const result={status:'reader_execution_failed',requested_sku:String(sku),at_phase:prior?.reader_phase||'unknown',message:String(e.message||e).slice(0,300),checked_at:new Date().toISOString()};if(/cannot access|permission|denied|权限/i.test(result.message)){result.pause_required=true;await showVerificationAttention(prior?.tab_id,'seller_market',result.message);}
 await store.set({nativeMarketLast:result});return result;}
}
async function nativeMarketAttempt(sku){
 const store=chrome.storage.local;
 const {nativeMarketCache={},nativeMarketBlocked=null,marketCompanyId=''}=await store.get(['nativeMarketCache','nativeMarketBlocked','marketCompanyId']);
 if(nativeMarketBlocked){const result={status:'blocked_until_user_handles',...nativeMarketBlocked,requested_sku:sku,checked_at:new Date().toISOString()};await store.set({nativeMarketLast:result});return result;}
 const cached=nativeMarketCache[sku];if(cached&&Date.now()-cached.at<(cached.ttl||3600000))return {...cached.result,cache_used:true};
 const tabs=await chrome.tabs.query({url:['https://seller.ozon.ru/*','https://seller.ozonru.cn/*']});
 const tab=tabs.find(t=>/\/app\/analytics\//.test(new URL(t.url).pathname))||tabs[0];
 if(!tab?.id){const r={status:'seller_tabs_not_open',sku};await store.set({nativeMarketLast:r});return r;}
 await store.set({nativeMarketLast:{status:'reader_started',requested_sku:sku,reader_phase:'inject_seller_reader',tab_id:tab.id,checked_at:new Date().toISOString()}});
 await chrome.scripting.executeScript({target:{tabId:tab.id},files:['native-market-reader.js']});
 await store.set({nativeMarketLast:{status:'reader_started',requested_sku:sku,reader_phase:'execute_authenticated_read',tab_id:tab.id,checked_at:new Date().toISOString()}});
 const result=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:(id,company)=>readNativeSellerMarket(id,company),args:[sku,marketCompanyId]}))[0]?.result||{status:'empty_reader_result'};
 const latest={...result,requested_sku:sku,checked_at:new Date().toISOString()};
 if(result.status==='access_or_rate_limit'){
  const blocked={http_status:result.http_status,retry_not_before:Date.now()+Math.max(0,result.retry_after_seconds||0)*1000,tab_id:tab.id};await store.set({nativeMarketBlocked:blocked,nativeMarketLast:latest});await showVerificationAttention(tab.id,'seller_market','analytics_access_or_rate_limit');return {...latest,pause_required:true};
 }
 if(result.status==='exact_sku_read'){
  const {sellerEvidence={}}=await store.get('sellerEvidence');const previous=sellerEvidence[sku]||[];
  sellerEvidence[sku]=[...previous.filter(x=>x.source!=='authenticated_seller_what_to_sell_same_vendor_method'),...result.properties];
  nativeMarketCache[sku]={at:Date.now(),result};await store.set({sellerEvidence,nativeMarketCache});
 }else{nativeMarketCache[sku]={at:Date.now(),result,ttl:['sku_not_found','company_id_not_identified','ambiguous_exact_sku'].includes(result.status)?3600000:60000};await store.set({nativeMarketCache});}
 await store.set({nativeMarketLast:latest});return latest;
}
