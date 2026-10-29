async function showVerificationAttention(tabId,source,reason){
 const missing=reason==='essential_data_missing';const exit=reason==='exit_not_confirmed';const message=exit?'卖家页面尚未确认退出，后续采集已暂停。请在原标签页完成退出不保存，回到复制搜索页后继续。':missing?'销量、日期、价格或履约依据仍未读齐，补采后已暂停。请导出诊断，不会将缺失数据当成通过或排除。':'遇到验证或访问限制，任务已暂停。请在对应浏览器页面处理，完成后回插件继续。';
 const attention={tab_id:tabId,source,reason,created_at:new Date().toISOString()};await chrome.storage.local.set({verificationAttention:attention});
 try{await chrome.action.setBadgeText({text:'待处理'});await chrome.action.setBadgeBackgroundColor({color:'#D97706'});}catch{}
 try{await chrome.notifications.create('ozon-needs-attention',{type:'basic',iconUrl:'attention.png',title:'Ozon采集需要你处理',message,priority:2,requireInteraction:true});}catch{}
 if(Number.isInteger(tabId)){
  try{const tab=await chrome.tabs.update(tabId,{active:true});if(tab.windowId&&chrome.windows?.update)await chrome.windows.update(tab.windowId,{focused:true});}catch{}
  try{await chrome.scripting.executeScript({target:{tabId},args:[message],func:(message)=>{if(document.getElementById('ozon-operator-attention'))return;const box=document.createElement('div');box.id='ozon-operator-attention';box.style.cssText='position:fixed;right:16px;top:16px;z-index:2147483647;max-width:320px;padding:14px;background:#fff3cd;color:#422;border:2px solid #d97706;border-radius:8px;font:14px sans-serif;box-shadow:0 4px 20px #777';box.textContent=message;const close=document.createElement('button');close.textContent='知道了，关闭提示';close.onclick=()=>box.remove();box.append(document.createElement('br'),close);document.documentElement.append(box);}});}catch{}
 }
}
chrome.notifications?.onClicked?.addListener(async id=>{if(id!=='ozon-needs-attention')return;const {verificationAttention:a}=await chrome.storage.local.get('verificationAttention');if(a?.tab_id)try{await chrome.tabs.update(a.tab_id,{active:true});}catch{}});
