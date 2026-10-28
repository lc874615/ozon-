async function showVerificationAttention(tabId,source,reason){
 const attention={tab_id:tabId,source,reason,created_at:new Date().toISOString()};await chrome.storage.local.set({verificationAttention:attention});
 try{await chrome.action.setBadgeText({text:'待处理'});await chrome.action.setBadgeBackgroundColor({color:'#D97706'});}catch{}
 try{await chrome.notifications.create('ozon-needs-attention',{type:'basic',iconUrl:'attention.png',title:'Ozon采集需要你处理',message:'遇到验证或访问限制，任务已暂停。请在对应浏览器页面处理，完成后回插件继续。',priority:2,requireInteraction:true});}catch{}
 if(Number.isInteger(tabId)){
  try{const tab=await chrome.tabs.update(tabId,{active:true});if(tab.windowId&&chrome.windows?.update)await chrome.windows.update(tab.windowId,{focused:true});}catch{}
  try{await chrome.scripting.executeScript({target:{tabId},func:()=>{if(document.getElementById('ozon-operator-attention'))return;const box=document.createElement('div');box.id='ozon-operator-attention';box.style.cssText='position:fixed;right:16px;top:16px;z-index:2147483647;max-width:320px;padding:14px;background:#fff3cd;color:#422;border:2px solid #d97706;border-radius:8px;font:14px sans-serif;box-shadow:0 4px 20px #777';box.textContent='采集已暂停：请手动处理验证或访问限制。完成后在插件点击继续。';const close=document.createElement('button');close.textContent='知道了，关闭提示';close.onclick=()=>box.remove();box.append(document.createElement('br'),close);document.documentElement.append(box);}});}catch{}
 }
}
chrome.notifications?.onClicked?.addListener(async id=>{if(id!=='ozon-needs-attention')return;const {verificationAttention:a}=await chrome.storage.local.get('verificationAttention');if(a?.tab_id)try{await chrome.tabs.update(a.tab_id,{active:true});}catch{}});
