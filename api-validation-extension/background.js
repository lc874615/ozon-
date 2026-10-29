importScripts('selection-filters.js','packaging-reader.js','api-batch-collector.js');
let busy=false;
async function saveJob(id,update){const {apiJob:j}=await chrome.storage.local.get('apiJob');if(j?.id===id)await chrome.storage.local.set({apiJob:{...j,...update}});}
async function runValidation(id,seeds,filters,company,concurrency){
 try{
  const buyerTabs=await chrome.tabs.query({url:['https://www.ozon.ru/*','https://ozon.ru/*']});const sellerTabs=await chrome.tabs.query({url:['https://seller.ozon.ru/*','https://seller.ozonru.cn/*']});
  const buyer=buyerTabs.find(t=>t.status==='complete'),seller=sellerTabs.find(t=>t.status==='complete');
  if(!buyer||!seller)throw new Error('请在同一浏览器打开正常可访问的Ozon买家页和已登录的卖家页，再启动验证');
  let operations=0;const reads=[];
  async function call(stage,tab,files,func,args){
   const start=Date.now();await saveJob(id,{stage,operations,updated_at:new Date().toISOString()});
   await chrome.scripting.executeScript({target:{tabId:tab},files});
   const result=(await chrome.scripting.executeScript({target:{tabId:tab},func,args}))[0]?.result||{status:'empty_result'};
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
