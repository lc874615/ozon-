importScripts('seller-bridge.js');
let running=false;
const isProduct=u=>{try{const x=new URL(u);return x.protocol==='https:'&&['www.ozon.ru','ozon.ru'].includes(x.hostname)&&x.pathname.startsWith('/product/');}catch{return false;}};
async function capture(tabId) {
  const output=await chrome.scripting.executeScript({target:{tabId},files:['collector.js']});
  const result=output[0]?.result;
  if(result)result.extension_version=chrome.runtime.getManifest().version;
  if(result && ['attributes_observed','attributes_missing'].includes(result.status)) {
    try {
      const packageOutput=await chrome.scripting.executeScript({target:{tabId},files:['package-probe.js']});
      result.package_probe=packageOutput[0]?.result;
    }catch(e){result.package_probe={status:'probe_error',error:e.message};}
  }

  if(result && ['attributes_observed','attributes_missing'].includes(result.status)) {
    try{result.seller_reference=await captureSellerReference(String(result.product_id));}
    catch(_){result.seller_reference={status:'seller_bridge_failed'};}
  }
  if(!result)throw new Error('页面未返回采集结果');
  const {snapshots={}}=await chrome.storage.local.get('snapshots');
  if(result.status!=='blocked_verification'&&result.status!=='wrong_page') {
    snapshots[result.source_url]=result;await chrome.storage.local.set({snapshots});
  }
  return result;
}
async function loaded(tabId) {
  const tab=await chrome.tabs.get(tabId);if(tab.status==='complete')return;
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(listener);reject(new Error('页面加载超时'));},30000);
    function listener(id,change){if(id===tabId&&change.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);resolve();}}
    chrome.tabs.onUpdated.addListener(listener);
  });
}
async function batch() {
  if(running)return;running=true;
  try {
    let {queue=[],queueIndex=0}=await chrome.storage.local.get(['queue','queueIndex']);
    for(let i=queueIndex;i<queue.length;i++) {
      const saved=await chrome.storage.local.get(['pausedTabId','pausedUrl']);
      let tab, createdByBatch=false;
      if(saved.pausedTabId && saved.pausedUrl===queue[i]) {
        try {tab=await chrome.tabs.get(saved.pausedTabId);if(!isProduct(tab.url))tab=null;}catch(_){tab=null;}
      }
      if(!tab){const existing=await chrome.tabs.query({url:queue[i]});tab=existing[0];}
      if(!tab){tab=await chrome.tabs.create({url:queue[i],active:true});createdByBatch=true;}
      await chrome.storage.local.set({pausedTabId:tab.id,pausedUrl:queue[i]});
      await loaded(tab.id);await new Promise(r=>setTimeout(r,2000));
      let result=await capture(tab.id);
      if(result.status==='attributes_missing') {await new Promise(r=>setTimeout(r,2000));result=await capture(tab.id);}
      if(result.status!=='attributes_observed') {
        await chrome.storage.local.set({queueIndex:i,batchStatus:result.status,pausedTabId:tab.id,pausedUrl:queue[i]});return;
      }
      await chrome.storage.local.set({queueIndex:i+1,batchStatus:'running',pausedTabId:null,pausedUrl:null});
      if(createdByBatch)await chrome.tabs.remove(tab.id);
    }
    await chrome.storage.local.set({batchStatus:'completed'});
  } catch(e) {await chrome.storage.local.set({batchStatus:'error: '+e.message});}
  finally {running=false;}
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  (async()=>{
    if(message.action==='read-links') {
      const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
      if(!tab || !/^https:\/\/(www\.)?ozon\.ru\//.test(tab.url))throw new Error('请打开Ozon搜索或类目页');
      const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
        const out=new Set();
        for(const a of document.querySelectorAll('a[href]')){
          try {const u=new URL(a.href);if(['www.ozon.ru','ozon.ru'].includes(u.hostname)&&/^\/product\/[^/]*\d+\//.test(u.pathname)){const root=u.pathname.match(/^\/product\/[^/]+/)[0]+'/';out.add(u.origin+root);}}catch(_){}
          if(out.size>=60)break;
        }
        return [...out];
      }});
      return {urls:results[0]?.result||[]};
    }
    if(message.action==='capture') {
      const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
      if(!tab||!isProduct(tab.url))throw new Error('请先打开Ozon商品详情页');
      return await capture(tab.id);
    }
    if(message.action==='queue') {
      if(running)throw new Error('已有批次正在运行');
      const queue=[...new Set(message.urls)];if(!queue.length||queue.some(u=>!isProduct(u)))throw new Error('请填写有效的Ozon商品链接');
      await chrome.storage.local.set({queue,queueIndex:0,batchStatus:'ready'});batch();return {status:'started'};
    }
    if(message.action==='resume'){batch();return {status:'resuming'};}
    if(message.action==='export') {
      const {snapshots={}}=await chrome.storage.local.get('snapshots');
      const data=JSON.stringify({schema_version:1,source:'ozon_buyer_browser_extension',observations:Object.values(snapshots)},null,2);
      await chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(data),filename:'ozon-buyer-observations.json',saveAs:true});return {status:'exported'};
    }
    return await chrome.storage.local.get(['queueIndex','queue','batchStatus','snapshots']);
  })().then(respond,e=>respond({error:e.message}));return true;
});
