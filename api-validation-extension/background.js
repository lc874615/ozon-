importScripts('selection-filters.js','packaging-reader.js','api-batch-collector.js');
let busy=false,control='run';
async function controlGate(id){
 if(control==='stop')throw new Error('USER_TERMINATED');
 if(control==='pause'){await saveJob(id,{status:'paused',stage:'用户暂停，进度保留'});while(control==='pause')await new Promise(r=>setTimeout(r,250));if(control==='stop')throw new Error('USER_TERMINATED');await saveJob(id,{status:'running',stage:'继续采集'});}
}

function describeTab(t){
 let host=null,route='other',sku=null;try{const u=new URL(t.url);host=u.hostname;sku=u.pathname.match(/-(\d+)\/?$/)?.[1]||u.pathname.match(/^\/product\/(\d+)\/?$/)?.[1]||null;route=u.pathname.startsWith('/product/')?'product':u.pathname.startsWith('/search')?'search':u.pathname.startsWith('/app/')?'seller_app':'other';}catch{}
 return {id:t.id,active:!!t.active,status:t.status,host,route,product_sku:sku};
}
function chooseTab(tabs,seeds=[]){const ready=tabs.filter(t=>t.status==='complete');return ready.find(t=>t.active&&seeds.includes(describeTab(t).product_sku))||ready.find(t=>seeds.includes(describeTab(t).product_sku))||ready.find(t=>t.active)||ready.sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0))[0];}
function inspectPageEnvironment(){
 const text=(document.body?.innerText||'').slice(0,12000),ua=navigator.userAgent;
 return {origin:location.origin,ready_state:document.readyState,visibility:document.visibilityState,secure_context:isSecureContext,online:navigator.onLine,cookies_enabled:navigator.cookieEnabled,fetch_available:typeof fetch==='function',chromium_major:ua.match(/(?:Chrome|Chromium)\/(\d+)/)?.[1]||null,language:navigator.language,challenge_text_detected:/подтвердите.{0,30}(?:человек|робот)|доступ ограничен|验证码|access denied|verify you are human/i.test(text),execution_world:'ISOLATED',credentials_mode:'include',custom_request_headers:false,cookie_values_read:false,network_requests:0};
}
async function requestEnvironment(seeds=[]){
 const buyerTabs=await chrome.tabs.query({url:['https://www.ozon.ru/*','https://ozon.ru/*']}),sellerTabs=await chrome.tabs.query({url:['https://seller.ozon.ru/*','https://seller.ozonru.cn/*']});
 const buyer=chooseTab(buyerTabs,seeds),seller=chooseTab(sellerTabs);
 const report={captured_at:new Date().toISOString(),network_requests:0,selection_policy:'active_matching_seed_then_matching_seed_then_active_then_recent_complete',buyer_candidates:buyerTabs.map(describeTab),seller_candidates:sellerTabs.map(describeTab),selected_buyer:buyer?describeTab(buyer):null,selected_seller:seller?describeTab(seller):null};
 for(const [name,tab]of [['buyer',buyer],['seller',seller]])if(tab){try{report[name]=(await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:inspectPageEnvironment}))[0]?.result||{status:'empty_environment'};}catch{report[name]={status:'environment_injection_failed'};}}
 return {buyer,seller,report};
}
async function saveJob(id,update){const {apiJob:j}=await chrome.storage.local.get('apiJob');if(j?.id===id)await chrome.storage.local.set({apiJob:{...j,...update}});}
async function runValidation(id,seeds,filters,company,concurrency){
 try{
  const {buyer,seller,report}=await requestEnvironment(seeds);await saveJob(id,{request_environment:report});
  if(!buyer||!seller)throw new Error('请在同一浏览器打开正常可访问的Ozon买家页和已登录的卖家页，再启动验证');
  let operations=0;const reads=[];
  async function call(stage,tab,files,func,args){
   await controlGate(id);const start=Date.now();await saveJob(id,{stage,operations,updated_at:new Date().toISOString()});
   await chrome.scripting.executeScript({target:{tabId:tab},world:'ISOLATED',files});
   const result=(await chrome.scripting.executeScript({target:{tabId:tab},world:'ISOLATED',func,args}))[0]?.result||{status:'empty_result'};
   operations++;reads.push({stage,sku:String(args[0]),elapsed_ms:Date.now()-start,result});await saveJob(id,{operations,reads:reads.slice(-200),updated_at:new Date().toISOString()});return result;
  }
  const ports={
   variants:sku=>call('读取全部变体',buyer.id,['buyer-variants-json.js'],sku=>readBuyerVariantsJson(sku),[sku]),
   buyer:sku=>call('读取价格/送达/图片',buyer.id,['delivery-reference.js','buyer-json-reader.js'],sku=>readBuyerProductJson(sku),[sku]),
   market:sku=>call('读取销量/日期/履约',seller.id,['native-market-reader.js'],(sku,company)=>readNativeSellerMarket(sku,company),[sku,company]),
   packaging:async(sku,hint)=>{
    const key='temporaryCreationLedger',stored=(await chrome.storage.local.get(key))[key]||{},previous=stored[sku];
    if(previous)return previous.result||{status:'temporary_creation_result_unknown',creation_may_have_occurred:true};
    let companyId=company;
    if(!companyId){const info=await chrome.scripting.executeScript({target:{tabId:seller.id},func:()=>{const h=document.querySelector('header,[role="banner"]');return (h?.innerText||'').match(/\bShop\s*#?\s*(\d+)\b/i)?.[1]||'';}});companyId=info[0]?.result;}
    if(!/^\d+$/.test(String(companyId||''))||!/^\d+$/.test(String(hint||'')))return {status:'creation_precondition_failed',missing_fields:[...(!/^\d+$/.test(String(companyId||''))?['company_id']:[]),...(!/^\d+$/.test(String(hint||''))?['variant_id']:[])]};
    stored[sku]={status:'intent_recorded',started_at:new Date().toISOString()};await chrome.storage.local.set({[key]:stored});
    const result=await call('临时复制取包装（不清理）',seller.id,['temporary-package-reader.js'],(sku,company,hint)=>readTemporaryPackaging(sku,company,hint),[sku,companyId,hint]);
    const latest=(await chrome.storage.local.get(key))[key]||{};latest[sku]={...stored[sku],result};await chrome.storage.local.set({[key]:latest});return result;
   }
  };
  const {apiJob:current}=await chrome.storage.local.get('apiJob');
  const target=current.target_count||1,allResults=[],history=new Set((await chrome.storage.local.get('collectionSkuHistory')).collectionSkuHistory||[]),seenCursors=new Set();let cursor=null,passed=0,stopped=null,discovered=0;
  while(passed<target){
   await controlGate(id);
   if(current.source_mode!=='manual'){
    if(cursor&&seenCursors.has(cursor)){stopped='search_pagination_repeated';break;}if(cursor)seenCursors.add(cursor);
    const found=await call('自动搜索候选SKU',buyer.id,['search-candidates.js'],(mode,value,limit,cursor)=>discoverSearchCandidates(mode,value,limit,cursor),[current.source_mode,current.source_value,200,cursor]);
    await saveJob(id,{candidate_discovery:found});
    if(!['search_candidates_read','search_candidates_empty'].includes(found.status)){stopped=found.status;break;}
    seeds=found.skus||[];cursor=found.next_cursor;
   }
   const result=await collectApiBatch(seeds,ports,{filters,concurrency:1,history,target:target-passed,onResult:async item=>{
    history.add(item.sku);allResults.push(item);if(item.status==='api_data_complete')passed++;
    await chrome.storage.local.set({collectionSkuHistory:[...history]});
    await saveJob(id,{qualified_count:passed,result:{results:allResults,processed:allResults.length,discovered,paused:false},target_count:target});
   }});
   discovered+=result.discovered;
   await saveJob(id,{pending_skus:result.unprocessed,search_cursor:cursor});
   if(result.paused){stopped=result.pause_reason;break;}
   if(passed>=target)break;
   if(current.source_mode==='manual'||!cursor){stopped='candidate_pool_exhausted';break;}
  }
  if(control==='stop')throw new Error('USER_TERMINATED');
  const result={results:allResults,discovered,processed:allResults.length,paused:!!stopped,pause_reason:stopped,target,qualified_count:passed,shortfall:Math.max(0,target-passed)};
  await saveJob(id,{status:stopped?'paused':'completed',stage:stopped?'未达到目标，进度已保存':'达到合格目标',result,reads,operations,qualified_count:passed,finished_at:new Date().toISOString()});
 }catch(e){await saveJob(id,{status:e.message==='USER_TERMINATED'?'terminated':'error',message:String(e.message||e).slice(0,300),finished_at:new Date().toISOString()});}finally{busy=false;}
}
chrome.runtime.onMessage.addListener((m,s,respond)=>{(async()=>{
 if(['pause','resume','terminate'].includes(m.action)){
  if(!busy)return {status:'error',message:'当前没有可控制的运行任务；已中断任务不会自动重放'};
  if(m.action==='pause'){control='pause';const j=(await chrome.storage.local.get('apiJob')).apiJob;await saveJob(j.id,{status:'pausing',stage:'等待当前请求完成后暂停'});}
  if(m.action==='resume'){control='run';}
  if(m.action==='terminate'){control='stop';const j=(await chrome.storage.local.get('apiJob')).apiJob;await saveJob(j.id,{status:'terminating',stage:'等待当前请求完成后终止'});}
  return {status:'control_requested'};
 }
 if(m.action==='environment'){
  if(busy)throw new Error('请等待当前验证暂停或结束后检查环境');
  const seeds=String(m.skus||'').split(/[\s,，;；]+/).filter(x=>/^\d+$/.test(x));const {report}=await requestEnvironment(seeds);
  await chrome.storage.local.set({apiEnvironment:report});await chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify({version:chrome.runtime.getManifest().version,request_environment:report},null,2)),filename:'ozon-request-environment.json',saveAs:true});return {status:'environment_exported'};
 }
 if(m.action==='status'||m.action==='status_summary'){
  let j=(await chrome.storage.local.get('apiJob')).apiJob;
  if(j&&!busy&&['running','pausing','terminating'].includes(j.status)){j={...j,status:'interrupted',message:'任务执行进程已结束；进度和账本保留，不能恢复旧任务，可启动新任务'};await chrome.storage.local.set({apiJob:j});}
  if(m.action==='status_summary'){const counts={};for(const item of j?.result?.results||[])counts[item.status]=(counts[item.status]||0)+1;return {...Object.fromEntries(Object.entries(j||{status:'idle'}).filter(([k])=>!['reads','result','request_environment','candidate_discovery','pending_skus'].includes(k))),result:j?.result?{processed:j.result.processed,discovered:j.result.discovered,pause_reason:j.result.pause_reason}:null,summary_counts:counts,runtime_can_control:busy};}
  return {...(j||{status:'idle'}),runtime_can_control:busy};
 }
 if(m.action==='export'){
  const {apiJob}=await chrome.storage.local.get('apiJob');if(!apiJob)throw new Error('尚无诊断');
  const compactJob={...apiJob,reads:(apiJob.reads||[]).map(r=>({...r,result:Object.fromEntries(Object.entries(r.result||{}).filter(([k])=>['status','http_status','diagnostics','price_diagnostics','temporary_bundle_id','identity_verified','cleanup_performed','missing_fields','response_metadata'].includes(k)))}))};
  const report={version:chrome.runtime.getManifest().version,exported_at:new Date().toISOString(),mode:'API_ONLY_LOCAL_VALIDATION',credentials_exported:false,product_creation:true,creation_scope:"temporary_copy_only",cleanup_performed:false,job:compactJob};
  await chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(report,null,2)),filename:'ozon-api-validation.json',saveAs:true});return {status:'exported'};
 }
 if(m.action==='start'){
  if(busy)throw new Error('已有API验证运行，请等待当前测试结束');
  const seeds=[...new Set(String(m.skus||'').split(/[\s,，;；]+/).filter(Boolean))];if((!m.source_mode||m.source_mode==='manual')&&(!seeds.length||seeds.length>5||seeds.some(s=>!/^\d+$/.test(s))))throw new Error('请输入1至5个纯数字SKU，每行一个');
  const filters=parseFilterSettings(m.filters||{}),concurrency=Number(m.concurrency||1);if(concurrency!==1)throw new Error('临时复制测试仅允许并发1');
  const company=String(m.company||'').trim();if(company&&!/^\d+$/.test(company))throw new Error('Shop编号应为纯数字，不是API Key');
  if(m.source_mode&&!['manual','keyword','category'].includes(m.source_mode))throw new Error('候选来源无效');if(m.source_mode&&m.source_mode!=='manual'&&!String(m.source_value||'').trim())throw new Error('请输入关键词或类目地址');
  const targetCount=Number(m.target_count||1);if(!Number.isInteger(targetCount)||targetCount<1||targetCount>100)throw new Error('测试版合格目标须为1–100');
  const id=crypto.randomUUID();busy=true;control='run';await chrome.storage.local.set({apiJob:{id,target_count:targetCount,qualified_count:0,source_mode:m.source_mode||'manual',source_value:String(m.source_value||'').trim(),candidate_limit:Math.max(1,Math.min(5,Number(m.candidate_limit)||5)),status:'running',started_at:new Date().toISOString(),seeds,filters,concurrency,stage:'准备账号读取',operations:0,reads:[]}});
  runValidation(id,seeds,filters,company,concurrency);return {status:'started'};
 }
 throw new Error('Unsupported action');
})().then(respond,e=>respond({status:'error',message:String(e.message||e)}));return true;});
async function markInterrupted(){busy=false;const {apiJob}=await chrome.storage.local.get('apiJob');if(apiJob?.status==='running')await chrome.storage.local.set({apiJob:{...apiJob,status:'interrupted',message:'浏览器或扩展重启，保留部分诊断；不会自动重放请求'}});}
chrome.runtime.onStartup.addListener(markInterrupted);chrome.runtime.onInstalled.addListener(markInterrupted);
