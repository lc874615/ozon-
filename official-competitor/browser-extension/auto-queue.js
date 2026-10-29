// User-started buyer screening followed by scoped seller copy/read/discard; no publication.
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
 if(m.require_complete_collection&&typeof ensureAutomaticSellerEntry==='function')await ensureAutomaticSellerEntry();
 const filters=parseFilterSettings(m.filters||captureFilters);
 await chrome.storage.local.set({captureFilters:filters});
 const limit=Number(m.limit||5);if(!Number.isInteger(limit)||limit<1||limit>100)return {status:'error',message:'单批请输入1至100件'};
 // Explicit restart builds a new list; already saved SKUs are skipped.
 const candidates=[...new Map(collectionQueue.filter(u=>buyerSku(u)&&!snapshots[buyerSku(u)]).map(u=>[buyerSku(u),u])).values()];
 const targetMode=m.require_complete_collection===true;
 const urls=targetMode?candidates:candidates.slice(0,limit);
 if(old?.target_pass&&old.status==='paused'&&['candidate_pool_exhausted_target_unmet','user_paused','browser_restarted_click_start_to_resume','extension_updated_click_start_to_resume'].includes(old.reason)&&JSON.stringify(old.filters)===JSON.stringify(filters)){
  const known=new Set(old.urls.map(buyerSku));const added=candidates.filter(u=>!known.has(buyerSku(u)));
  if(!added.length&&old.index>=old.urls.length)return {status:'need_more_candidates',remaining:Math.max(0,old.target_pass-(old.counts?.pass||0))};
  old.urls.push(...added);old.status='running';old.reason=null;if(old.phase==='read')old.navigated_at=Date.now();await chrome.storage.local.set({autoQueue:old});await chrome.alarms.create(AUTO_ALARM,{periodInMinutes:0.5});scheduleAutoTick(0);return {status:'target_resumed',remaining:Math.max(0,old.target_pass-(old.counts?.pass||0)),added:added.length};
 }
 if(!urls.length)return {status:'queue_complete_or_empty'};
 await chrome.storage.local.set({autoQueue:{status:'running',filters,...(targetMode?{target_pass:limit}:{}),counts:{pass:0,exclude:0,review:0},urls,index:0,phase:'navigate',tabId:null,started_at:new Date().toISOString(),reason:null}});
 await chrome.alarms.create(AUTO_ALARM,{periodInMinutes:0.5});await autoQueueTick();
 return {status:'started',planned:urls.length};
}
async function autoQueueTick(){
 if(autoBusy)return;autoBusy=true;
 try{
  const {autoQueue:s,snapshots={}}=await chrome.storage.local.get(['autoQueue','snapshots']);if(s?.status!=='running')return;
  if(s.index>=s.urls.length){s.status=s.target_pass&&(s.counts?.pass||0)<s.target_pass?'paused':'completed';s.finished_at=new Date().toISOString();s.reason=s.status==='paused'?'candidate_pool_exhausted_target_unmet':'collection_only_complete';await chrome.storage.local.set({autoQueue:s});await chrome.alarms.clear(AUTO_ALARM);return;}
  const expected=buyerSku(s.urls[s.index]);if(!expected)return await pauseAuto('invalid_queue_url');
  if(s.phase==='navigate'&&snapshots[expected]){s.index++;s.skipped_existing=(s.skipped_existing||0)+1;await chrome.storage.local.set({autoQueue:s});scheduleAutoTick(0);return;}
  if(s.phase==='navigate'){
   const wait=(s.next_navigation_at||0)-Date.now();if(wait>0){scheduleAutoTick(wait);return;}
   let tab;if(s.tabId===null)tab=await chrome.tabs.create({url:s.urls[s.index],active:false});else tab=await chrome.tabs.update(s.tabId,{url:s.urls[s.index]});
   s.tabId=tab.id;s.phase='read';s.navigated_at=Date.now();s.prepare_attempts=0;s.refresh_attempts=0;s.next_navigation_at=s.navigated_at+20000;
   const current=await chrome.storage.local.get('autoQueue');
   if(current.autoQueue?.status!=='running'||current.autoQueue.started_at!==s.started_at)return;
   await chrome.storage.local.set({autoQueue:s});scheduleAutoTick(2000);return;
  }
  const tab=await chrome.tabs.get(s.tabId);
  if(tab.status!=='complete'){if(Date.now()-s.navigated_at>30000){if(await refreshIncompleteBuyerOnce(s,'page_load_timeout'))return;await skipAutoCandidate(s,expected,'page_load_timeout');}else scheduleAutoTick(2000);return;}
  const result=s.pending_buyer||(await chrome.scripting.executeScript({target:{tabId:s.tabId},files:['price-reader.js','delivery-reference.js','collector.js']}))[0]?.result;
  if(result?.status==='blocked_verification')return await pauseAuto('verification_required');
  if(result?.product_id!==expected||!result?.title){if(Date.now()-s.navigated_at<8000){scheduleAutoTick(2000);return;}if(await refreshIncompleteBuyerOnce(s,'wrong_or_empty_product_page'))return;return await skipAutoCandidate(s,expected,'wrong_or_empty_product_page');}
  if(!Array.isArray(result.properties))return await pauseAuto('invalid_collector_result');
  const attributeCount=result.attribute_property_count??result.properties.length;
  const initial=evaluateCaptureFilters(result,s.filters);
  const independentlyExcluded=initial.checks.some(c=>['unit_price','international_brand_exclusion'].includes(c.field)&&c.state==='exclude');
  if(!independentlyExcluded&&(!attributeCount||result.diagnostics?.full_characteristics_loaded===false)&&(s.prepare_attempts||0)<2){
   const prepared=(await chrome.scripting.executeScript({target:{tabId:s.tabId},files:['prepare-characteristics.js']}))[0]?.result;
   if(prepared?.status==='blocked_verification')return await pauseAuto('verification_required');
   if(prepared?.status!=='prepared'){if(await refreshIncompleteBuyerOnce(s,'cannot_prepare_characteristics'))return;return await skipAutoCandidate(s,expected,'cannot_prepare_characteristics');}
   const current=await chrome.storage.local.get('autoQueue');
   if(current.autoQueue?.status!=='running'||current.autoQueue.started_at!==s.started_at)return;
   s.prepare_attempts=(s.prepare_attempts||0)+1;s.last_preparation=prepared.action;
   await chrome.storage.local.set({autoQueue:s});scheduleAutoTick(2500);return;
  }
  if(!independentlyExcluded&&!attributeCount&&!s.pending_buyer&&await refreshIncompleteBuyerOnce(s,'attributes_not_loaded'))return;
  if(!independentlyExcluded&&!s.pending_buyer){
   const market=await syncNativeMarketForSku(expected);
   if(market.pause_required||market.status==='blocked_until_user_handles')return await pauseAuto('seller_market_access_limited');
   await syncSellerVisible(expected);
   const context=await chrome.storage.local.get(['sellerEvidence','listingDateEvidence']);
   const preliminary=evaluateCaptureFilters(withListingEvidence(withSellerEvidence(result,context.sellerEvidence||{}),context.listingDateEvidence||{}),s.filters);
   result.preliminary_selection=preliminary;
   if(preliminary.decision==='pass'){
    result.seller_stage_required=true;s.pending_buyer=result;await chrome.storage.local.set({autoQueue:s});
   }else result.seller_stage_skipped=preliminary.decision==='exclude'?'preliminary_filter_excluded':'preliminary_filter_needs_evidence';
  }else if(!s.pending_buyer)result.seller_stage_skipped='known_price_or_international_brand_exclusion';
  if(s.pending_buyer){
   const sellerFlow=await ensureSellerCopyForSku(expected);
   if(sellerFlow.status==='waiting'){scheduleAutoTick(2000);return;}
   if(sellerFlow.status==='paused')return await pauseAuto('seller_verification_or_task_paused');
   result.seller_collection_outcome=sellerFlow;
  }
  result.collection_timing={page_elapsed_ms:Date.now()-s.navigated_at,preparation_attempts:s.prepare_attempts||0,captured_at:new Date().toISOString()};
  result.collection_status=attributeCount?'attributes_read':'partial';
  if(!attributeCount)result.collection_issue='attributes_missing_after_bounded_preparation';
  // Re-read state after asynchronous browser operations: pause must win over late results.
  const latest=await chrome.storage.local.get(['autoQueue','snapshots','listingDateEvidence','sellerEvidence']);
  if(latest.autoQueue?.status!=='running'||latest.autoQueue.started_at!==s.started_at)return;
  result.seller_properties=(latest.sellerEvidence||{})[expected]||[];
  result.selection_review=evaluateCaptureFilters(withListingEvidence(withSellerEvidence(result,latest.sellerEvidence||{}),latest.listingDateEvidence||{}),s.filters);
  if(result.collection_status==='partial'){if(result.selection_review.decision!=='exclude')result.selection_review.decision='review';result.selection_review.checks.push({field:'loaded_attributes',state:'review',evidence:null});}
  result.selection_review=applyCollectionCompleteness(result.selection_review,result,result.seller_properties);
  delete s.pending_buyer;
  s.counts=s.counts||{pass:0,exclude:0,review:0};s.counts[result.selection_review.decision]++;
  const saved=latest.snapshots||{};saved[expected]=result;s.index++;s.phase='navigate';
  if(s.target_pass&&(s.counts?.pass||0)>=s.target_pass){s.status='completed';s.finished_at=new Date().toISOString();s.reason='collection_target_reached';await chrome.alarms.clear(AUTO_ALARM);}else if(s.index===s.urls.length){s.status=s.target_pass?'paused':'completed';s.finished_at=new Date().toISOString();s.reason=s.target_pass?'candidate_pool_exhausted_target_unmet':'collection_only_complete';await chrome.alarms.clear(AUTO_ALARM);}
  await chrome.storage.local.set({snapshots:saved,autoQueue:s});if(s.status==='running')scheduleAutoTick(Math.max(1500,(s.next_navigation_at||0)-Date.now()));
 }catch(e){await pauseAuto('browser_or_access_error: '+String(e.message||e).slice(0,180));}
 finally{autoBusy=false;}
}
chrome.alarms.onAlarm.addListener(a=>{if(a.name===AUTO_ALARM)return autoQueueTick();});
chrome.runtime.onStartup.addListener(()=>pauseAuto('browser_restarted_click_start_to_resume'));
chrome.runtime.onInstalled.addListener(()=>pauseAuto('extension_updated_click_start_to_resume'));

chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status!=='complete')return;chrome.storage.local.get('autoQueue').then(({autoQueue:s})=>{if(s?.status==='running'&&s.phase==='read'&&s.tabId===id)scheduleAutoTick(1500);});});

async function skipAutoCandidate(s,sku,reason){
 const latest=await chrome.storage.local.get(['autoQueue','snapshots']);
 if(latest.autoQueue?.status!=='running'||latest.autoQueue.started_at!==s.started_at)return;
 const saved=latest.snapshots||{};const decision=reason==='page_load_timeout'?'exclude':'review';
 saved[sku]={product_id:sku,source_url:s.urls[s.index],captured_at:new Date().toISOString(),title:'',properties:[],images:[],collection_status:'partial',collection_issue:reason,selection_review:{decision,checks:[{field:'page_state',state:decision,evidence:reason}]}};
 s.skipped_errors=(s.skipped_errors||0)+1;s.counts[decision]=(s.counts[decision]||0)+1;
 s.errors=[...(s.errors||[]),{sku,reason,at:new Date().toISOString()}].slice(-100);
 s.index++;s.phase='navigate';delete s.pending_buyer;
 await chrome.storage.local.set({snapshots:saved,autoQueue:s});scheduleAutoTick(0);
 return {status:'candidate_skipped',reason};
}

async function refreshIncompleteBuyerOnce(s,reason){
 if(s.pending_buyer||(s.refresh_attempts||0)>=1||typeof chrome.tabs.reload!=='function')return false;
 const guard=(await chrome.scripting.executeScript({target:{tabId:s.tabId},func:()=>({blocked:/验证码|captcha|проверка безопасности|доступ ограничен|access denied|访问受限|访问被拒绝/i.test((document.body?.innerText||'').slice(0,12000)),login:!!document.querySelector('input[type=password]')})}))[0]?.result;
 if(guard?.blocked===true||guard?.login===true){await pauseAuto(guard.login?'login_access_required':'verification_required');return true;}
 const {autoQueue:latest}=await chrome.storage.local.get('autoQueue');if(latest?.status!=='running'||latest.started_at!==s.started_at)return true;
 s.refresh_attempts=1;s.last_refresh={reason,at:new Date().toISOString()};s.navigated_at=Date.now();s.prepare_attempts=0;
 await chrome.storage.local.set({autoQueue:s});await chrome.tabs.reload(s.tabId);scheduleAutoTick(2000);return true;
}
