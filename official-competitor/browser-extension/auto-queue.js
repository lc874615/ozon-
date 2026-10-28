// Only buyer URLs from the user-supplied queue. No retry loop or seller writes.
const AUTO_ALARM='ozon-buyer-queue';
let autoBusy=false;
const buyerSku=raw=>{try{const u=new URL(raw);if(u.protocol!=='https:'||!['ozon.ru','www.ozon.ru'].includes(u.hostname))return null;return u.pathname.match(/^\/product\/(?:[^/]*-)?(\d+)\/?$/)?.[1]||null;}catch{return null;}};
async function pauseAuto(reason){const {autoQueue:s}=await chrome.storage.local.get('autoQueue');if(s){s.status='paused';s.reason=reason;await chrome.storage.local.set({autoQueue:s});}await chrome.alarms.clear(AUTO_ALARM);return {status:'paused',reason};}
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
  if(s.phase==='navigate'){
   let tab;if(s.tabId===null)tab=await chrome.tabs.create({url:s.urls[s.index],active:false});else tab=await chrome.tabs.update(s.tabId,{url:s.urls[s.index]});
   s.tabId=tab.id;s.phase='read';s.navigated_at=Date.now();
   const current=await chrome.storage.local.get('autoQueue');
   if(current.autoQueue?.status!=='running'||current.autoQueue.started_at!==s.started_at)return;
   await chrome.storage.local.set({autoQueue:s});return;
  }
  const tab=await chrome.tabs.get(s.tabId);
  if(tab.status!=='complete'){if(Date.now()-s.navigated_at>90000)await pauseAuto('page_load_timeout');return;}
  const result=(await chrome.scripting.executeScript({target:{tabId:s.tabId},files:['collector.js']}))[0]?.result;
  if(result?.status==='blocked_verification')return await pauseAuto('verification_required');
  if(result?.product_id!==expected||!result?.title)return await pauseAuto('wrong_or_empty_product_page');
  if(!Array.isArray(result.properties)||!result.properties.length)return await pauseAuto('attributes_not_loaded_expand_manually');
  // Re-read state after asynchronous browser operations: pause must win over late results.
  const latest=await chrome.storage.local.get(['autoQueue','snapshots','listingDateEvidence']);
  if(latest.autoQueue?.status!=='running'||latest.autoQueue.started_at!==s.started_at)return;
  result.selection_review=evaluateCaptureFilters(withListingEvidence(result,latest.listingDateEvidence||{}),s.filters);
  s.counts=s.counts||{pass:0,exclude:0,review:0};s.counts[result.selection_review.decision]++;
  const saved=latest.snapshots||{};saved[expected]=result;s.index++;s.phase='navigate';
  if(s.index===s.urls.length){s.status='completed';s.finished_at=new Date().toISOString();s.reason='collection_only_complete';await chrome.alarms.clear(AUTO_ALARM);}
  await chrome.storage.local.set({snapshots:saved,autoQueue:s});
 }catch(e){await pauseAuto('browser_or_access_error: '+String(e.message||e).slice(0,180));}
 finally{autoBusy=false;}
}
chrome.alarms.onAlarm.addListener(a=>{if(a.name===AUTO_ALARM)return autoQueueTick();});
chrome.runtime.onStartup.addListener(()=>pauseAuto('browser_restarted_click_start_to_resume'));
chrome.runtime.onInstalled.addListener(()=>pauseAuto('extension_updated_click_start_to_resume'));
