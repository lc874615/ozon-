// Only buyer URLs from the user-supplied queue. No retry loop or seller writes.
const AUTO_ALARM='ozon-buyer-queue';
let autoBusy=false,autoTimer=null;
// Best-effort short scheduling; persisted queue + alarms remain the wake-up fallback.
function scheduleAutoTick(ms=1500){if(autoTimer!==null)clearTimeout(autoTimer);autoTimer=setTimeout(()=>{autoTimer=null;autoQueueTick();},Math.max(0,ms));}

const buyerSku=raw=>{try{const u=new URL(raw);if(u.protocol!=='https:'||!['ozon.ru','www.ozon.ru'].includes(u.hostname))return null;return u.pathname.match(/^\/product\/(?:[^/]*-)?(\d+)\/?$/)?.[1]||null;}catch{return null;}};
async function pauseAuto(reason){if(autoTimer!==null){clearTimeout(autoTimer);autoTimer=null;}const {autoQueue:s}=await chrome.storage.local.get('autoQueue');if(s){s.status='paused';s.reason=reason;await chrome.storage.local.set({autoQueue:s});}await chrome.alarms.clear(AUTO_ALARM);if(!reason.startsWith('seller_')&&/verification|access|denied|403|429/i.test(reason))await showVerificationAttention(s?.tabId,'buyer',reason);return {status:'paused',reason};}
async function autoQueueAction(m){
 if(m.action==='auto-pause')return pauseAuto('user_paused');
 if(m.action!=='auto-start')return {status:'disabled'};
 if(autoBusy)return {status:'busy'};
 const {autoQueue:old,collectionQueue=[],snapshots={},captureFilters={}}=await chrome.storage.local.get(['autoQueue','collectionQueue','snapshots','captureFilters']);
 if(old?.status==='running')return {status:'already_running'};
 const filters=parseFilterSettings(m.filters||captureFilters);
 await chrome.storage.local.set({captureFilters:filters});
 const limit=Number(m.limit||5);if(!Number.isInteger(limit)||limit<1||limit>100)return {status:'error',message:'单批请输入1至100件'};
 // Explicit restart builds a new list; already saved SKUs are skipped.
 const urls=[...new Map(collectionQueue.filter(u=>buyerSku(u)&&!snapshots[buyerSku(u)]).map(u=>[buyerSku(u),u])).values()].slice(0,limit);
 if(!urls.length)return {status:'queue_complete_or_empty'};
 await chrome.storage.local.set({autoQueue:{status:'running',filters,counts:{pass:0,exclude:0,review:0},urls,index:0,phase:'navigate',tabId:null,started_at:new Date().toISOString(),reason:null}});
 await chrome.alarms.create(AUTO_ALARM,{periodInMinutes:0.5});await autoQueueTick();
 return {status:'started',planned:urls.length};
}
async function autoQueueTick(){
 if(autoBusy)return;autoBusy=true;
 try{
  const {autoQueue:s,snapshots={}}=await chrome.storage.local.get(['autoQueue','snapshots']);if(s?.status!=='running')return;
  if(s.index>=s.urls.length){s.status='completed';s.finished_at=new Date().toISOString();s.reason='collection_only_complete';await chrome.storage.local.set({autoQueue:s});await chrome.alarms.clear(AUTO_ALARM);return;}
  const expected=buyerSku(s.urls[s.index]);if(!expected)return await pauseAuto('invalid_queue_url');
  if(s.phase==='navigate'&&snapshots[expected]){s.index++;s.skipped_existing=(s.skipped_existing||0)+1;await chrome.storage.local.set({autoQueue:s});scheduleAutoTick(0);return;}
  if(s.phase==='navigate'){
   const wait=(s.next_navigation_at||0)-Date.now();if(wait>0){scheduleAutoTick(wait);return;}
   let tab;if(s.tabId===null)tab=await chrome.tabs.create({url:s.urls[s.index],active:false});else tab=await chrome.tabs.update(s.tabId,{url:s.urls[s.index]});
   s.tabId=tab.id;s.phase='read';s.navigated_at=Date.now();s.prepare_attempts=0;s.next_navigation_at=s.navigated_at+20000;
   const current=await chrome.storage.local.get('autoQueue');
   if(current.autoQueue?.status!=='running'||current.autoQueue.started_at!==s.started_at)return;
   await chrome.storage.local.set({autoQueue:s});scheduleAutoTick(2000);return;
  }
  const tab=await chrome.tabs.get(s.tabId);
  if(tab.status!=='complete'){if(Date.now()-s.navigated_at>90000)await pauseAuto('page_load_timeout');else scheduleAutoTick(2000);return;}
  const result=(await chrome.scripting.executeScript({target:{tabId:s.tabId},files:['price-reader.js','delivery-reference.js','collector.js']}))[0]?.result;
  if(result?.status==='blocked_verification')return await pauseAuto('verification_required');
  if(result?.product_id!==expected||!result?.title)return await pauseAuto('wrong_or_empty_product_page');
  if(!Array.isArray(result.properties))return await pauseAuto('invalid_collector_result');
  const attributeCount=result.attribute_property_count??result.properties.length;
  const initial=evaluateCaptureFilters(result,s.filters);
  const independentlyExcluded=initial.checks.some(c=>['unit_price','international_brand_exclusion'].includes(c.field)&&c.state==='exclude');
  if(!independentlyExcluded&&(!attributeCount||result.diagnostics?.full_characteristics_loaded===false)&&(s.prepare_attempts||0)<2){
   const prepared=(await chrome.scripting.executeScript({target:{tabId:s.tabId},files:['prepare-characteristics.js']}))[0]?.result;
   if(prepared?.status==='blocked_verification')return await pauseAuto('verification_required');
   if(prepared?.status!=='prepared')return await pauseAuto('cannot_prepare_characteristics');
   const current=await chrome.storage.local.get('autoQueue');
   if(current.autoQueue?.status!=='running'||current.autoQueue.started_at!==s.started_at)return;
   s.prepare_attempts=(s.prepare_attempts||0)+1;s.last_preparation=prepared.action;
   await chrome.storage.local.set({autoQueue:s});scheduleAutoTick(2500);return;
  }
  if(!independentlyExcluded){
   const market=await syncNativeMarketForSku(expected);
   if(market.pause_required||market.status==='blocked_until_user_handles')return await pauseAuto('seller_market_access_limited');
   await syncSellerVisible(expected);
   const context=await chrome.storage.local.get(['sellerEvidence','listingDateEvidence']);
   const preliminary=evaluateCaptureFilters(withListingEvidence(withSellerEvidence(result,context.sellerEvidence||{}),context.listingDateEvidence||{}),s.filters);
   result.preliminary_selection=preliminary;
   if(preliminary.decision==='pass'){
    const sellerFlow=await ensureSellerCopyForSku(expected);
    if(sellerFlow.status==='waiting'){scheduleAutoTick(2000);return;}
    if(sellerFlow.status==='paused')return await pauseAuto('seller_verification_or_task_paused');
   }else result.seller_stage_skipped=preliminary.decision==='exclude'?'preliminary_filter_excluded':'preliminary_filter_needs_evidence';
  }else result.seller_stage_skipped='known_price_or_international_brand_exclusion';
  result.collection_timing={page_elapsed_ms:Date.now()-s.navigated_at,preparation_attempts:s.prepare_attempts||0,captured_at:new Date().toISOString()};
  result.collection_status=attributeCount?'attributes_read':'partial';
  if(!attributeCount)result.collection_issue='attributes_missing_after_bounded_preparation';
  // Re-read state after asynchronous browser operations: pause must win over late results.
  const latest=await chrome.storage.local.get(['autoQueue','snapshots','listingDateEvidence','sellerEvidence']);
  if(latest.autoQueue?.status!=='running'||latest.autoQueue.started_at!==s.started_at)return;
  result.seller_properties=(latest.sellerEvidence||{})[expected]||[];
  result.selection_review=evaluateCaptureFilters(withListingEvidence(withSellerEvidence(result,latest.sellerEvidence||{}),latest.listingDateEvidence||{}),s.filters);
  if(result.collection_status==='partial'){if(result.selection_review.decision!=='exclude')result.selection_review.decision='review';result.selection_review.checks.push({field:'loaded_attributes',state:'review',evidence:null});}
  s.counts=s.counts||{pass:0,exclude:0,review:0};s.counts[result.selection_review.decision]++;
  const saved=latest.snapshots||{};saved[expected]=result;s.index++;s.phase='navigate';
  if(s.index===s.urls.length){s.status='completed';s.finished_at=new Date().toISOString();s.reason='collection_only_complete';await chrome.alarms.clear(AUTO_ALARM);}
  await chrome.storage.local.set({snapshots:saved,autoQueue:s});if(s.status==='running')scheduleAutoTick(Math.max(1500,(s.next_navigation_at||0)-Date.now()));
 }catch(e){await pauseAuto('browser_or_access_error: '+String(e.message||e).slice(0,180));}
 finally{autoBusy=false;}
}
chrome.alarms.onAlarm.addListener(a=>{if(a.name===AUTO_ALARM)return autoQueueTick();});
chrome.runtime.onStartup.addListener(()=>pauseAuto('browser_restarted_click_start_to_resume'));
chrome.runtime.onInstalled.addListener(()=>pauseAuto('extension_updated_click_start_to_resume'));

chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status!=='complete')return;chrome.storage.local.get('autoQueue').then(({autoQueue:s})=>{if(s?.status==='running'&&s.phase==='read'&&s.tabId===id)scheduleAutoTick(1500);});});
