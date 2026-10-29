function validBuyerSearchUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&['ozon.ru','www.ozon.ru'].includes(u.hostname)&&/^\/(?:search|category)(?:\/|$)/.test(u.pathname)?u.href:null;}catch{return null;}}
async function captureBuyerSearchSource(){
 if(typeof chrome.tabs.query!=='function')return null;
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const url=validBuyerSearchUrl(tab?.url);if(!url)return null;
 const source={tab_id:tab.id,url,captured_at:new Date().toISOString()};await chrome.storage.local.set({buyerSearchSource:source});return source;
}
async function refillBuyerCandidates(s){
 const persist=async(extra={})=>{const {autoQueue:live}=await chrome.storage.local.get('autoQueue');if(live?.status!=='running'||live.started_at!==s.started_at)return false;await chrome.storage.local.set({autoQueue:s,...extra});return true;};
 let source=s.source_search;if(!source){const d=await chrome.storage.local.get('buyerSearchSource');source=d.buyerSearchSource;}
 if(!source?.url||!validBuyerSearchUrl(source.url))return await pauseAuto('source_search_not_configured');
 let tab;try{tab=await chrome.tabs.get(source.tab_id);}catch{}
 if(!tab){
  tab=await chrome.tabs.create({url:source.url,active:false});source={...source,tab_id:tab.id};s.source_search=source;s.refill={scrolls:0,load_started:Date.now()};if(!await persist())return;scheduleAutoTick(2000);return;
 }
 s.source_search=source;s.refill=s.refill||{scrolls:0,load_started:Date.now()};
 if(tab.status!=='complete'){if(Date.now()-s.refill.load_started>30000)return await pauseAuto('source_search_load_timeout');scheduleAutoTick(2000);return;}
 await chrome.scripting.executeScript({target:{tabId:source.tab_id},files:['search-source-ui.js']});
 const page=(await chrome.scripting.executeScript({target:{tabId:source.tab_id},func:()=>inspectBuyerSearch('read')}))[0]?.result;
 if(page?.status==='blocked_verification'||page?.status==='seller_login_required'){await showVerificationAttention(source.tab_id,'buyer_source',page.status);return await pauseAuto('source_verification_required');}
 if(page?.status!=='search_page_read')return await pauseAuto('source_search_page_changed');
 const {snapshots={},collectionHistory={},collectionQueue=[]}=await chrome.storage.local.get(['snapshots','collectionHistory','collectionQueue']);
 const known=new Set(s.urls.map(buyerSku));const fresh=[...new Map((page.links||[]).filter(u=>buyerSku(u)&&!snapshots[buyerSku(u)]&&!collectionHistory[buyerSku(u)]&&!known.has(buyerSku(u))).map(u=>[buyerSku(u),u])).values()];
 if(fresh.length){s.urls.push(...fresh);s.refill=null;s.source_batches=(s.source_batches||0)+1;if(!await persist({collectionQueue:[...new Set([...collectionQueue,...fresh])]}))return;scheduleAutoTick(0);return {status:'candidates_added',count:fresh.length};}
 if(s.refill.scrolls<2){await chrome.scripting.executeScript({target:{tabId:source.tab_id},func:()=>inspectBuyerSearch('scroll')});s.refill.scrolls++;if(!await persist())return;scheduleAutoTick(2500);return;}
 const seen=s.source_visited_pages||[];
 if(page.next_url&&validBuyerSearchUrl(page.next_url)&&!seen.includes(page.next_url)&&seen.length<100){s.source_visited_pages=[...seen,page.url];s.refill={scrolls:0,load_started:Date.now()};if(!await persist())return;await chrome.tabs.update(source.tab_id,{url:page.next_url});scheduleAutoTick(2500);return;}
 return await pauseAuto('source_candidates_exhausted');
}
