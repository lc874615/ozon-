importScripts('selection-filters.js','packaging-reader.js','api-batch-collector.js');
let busy=false;
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
   const start=Date.now();await saveJob(id,{stage,operations,updated_at:new Date().toISOString()});
   await chrome.scripting.executeScript({target:{tabId:tab},world:'ISOLATED',files});
   const result=(await chrome.scripting.executeScript({target:{tabId:tab},world:'ISOLATED',func,args}))[0]?.result||{status:'empty_result'};
   operations++;reads.push({stage,sku:String(args[0]),elapsed_ms:Date.now()-start,result});await saveJob(id,{operations,reads:reads.slice(-200),updated_at:new Date().toISOString()});return result;
  }
  const ports={
   variants:sku=>call('读取全部变体',buyer.id,['buyer-variants-json.js'],sku=>readBuyerVariantsJson(sku),[sku]),
   buyer:sku=>call('读取价格/送达/图片',buyer.id,['delivery-reference.js','buyer-json-reader.js'],sku=>readBuyerProductJson(sku),[sku]),
   market:sku=>call('读取销量/日期/履约',seller.id,['native-market-reader.js'],(sku,company)=>readNativeSellerMarket(sku,company),[sku,company]),
   packaging:(sku,hint)=>call('只读包装属性',seller.id,['variant-package-reader.js'],(sku,company,hint)=>readReadonlyVariantPackaging(sku,company,hint),[sku,company,hint])
  };
  const result=await collectApiBatch(seeds,ports,{filters,concurrency});
  await saveJob(id,{status:result.paused?'paused':'completed',stage:'验证结束',result,reads,operations,finished_at:new Date().toISOString()});
 }catch(e){await saveJob(id,{status:'error',message:String(e.message||e).slice(0,300),finished_at:new Date().toISOString()});}finally{busy=false;}
}
chrome.runtime.onMessage.addListener((m,s,respond)=>{(async()=>{
 if(m.action==='environment'){
  if(busy)throw new Error('请等待当前验证暂停或结束后检查环境');
  const seeds=String(m.skus||'').split(/[\s,，;；]+/).filter(x=>/^\d+$/.test(x));const {report}=await requestEnvironment(seeds);
  await chrome.storage.local.set({apiEnvironment:report});await chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify({version:chrome.runtime.getManifest().version,request_environment:report},null,2)),filename:'ozon-request-environment.json',saveAs:true});return {status:'environment_exported'};
 }
 if(m.action==='status')return (await chrome.storage.local.get('apiJob')).apiJob||{status:'idle'};
 if(m.action==='export'){
  const {apiJob}=await chrome.storage.local.get('apiJob');if(!apiJob)throw new Error('尚无诊断');
  const report={version:chrome.runtime.getManifest().version,exported_at:new Date().toISOString(),mode:'API_ONLY_LOCAL_VALIDATION',credentials_exported:false,product_creation:false,job:apiJob};
  await chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(report,null,2)),filename:'ozon-api-validation.json',saveAs:true});return {status:'exported'};
 }
 if(m.action==='start'){
  if(busy)throw new Error('已有API验证运行，请等待当前测试结束');
  const seeds=[...new Set(String(m.skus||'').split(/[\s,，;；]+/).filter(Boolean))];if(!seeds.length||seeds.length>5||seeds.some(s=>!/^\d+$/.test(s)))throw new Error('请输入1至5个纯数字SKU，每行一个');
  const filters=parseFilterSettings(m.filters||{}),concurrency=Number(m.concurrency||1);if(![1,2].includes(concurrency))throw new Error('验证并发仅限1或2');
  const company=String(m.company||'').trim();if(company&&!/^\d+$/.test(company))throw new Error('Shop编号应为纯数字，不是API Key');
  const id=crypto.randomUUID();busy=true;await chrome.storage.local.set({apiJob:{id,status:'running',started_at:new Date().toISOString(),seeds,filters,concurrency,stage:'准备账号读取',operations:0,reads:[]}});
  runValidation(id,seeds,filters,company,concurrency);return {status:'started'};
 }
 throw new Error('Unsupported action');
})().then(respond,e=>respond({status:'error',message:String(e.message||e)}));return true;});
async function markInterrupted(){busy=false;const {apiJob}=await chrome.storage.local.get('apiJob');if(apiJob?.status==='running')await chrome.storage.local.set({apiJob:{...apiJob,status:'interrupted',message:'浏览器或扩展重启，保留部分诊断；不会自动重放请求'}});}
chrome.runtime.onStartup.addListener(markInterrupted);chrome.runtime.onInstalled.addListener(markInterrupted);
