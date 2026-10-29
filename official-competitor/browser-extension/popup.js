for(const action of ['read-market-sku','save-market-company','resume-market-read','arm-seller-copy','start-seller-copy','start-seller-copy-batch','pause-seller-copy','resume-seller-copy','sync-seller','bind-seller-form','export-diagnostics','capture-listing-dates','save-filters','auto-start','auto-pause','capture-form','capture-buyer','read-links','save-queue','next','save-target','export','status'])document.getElementById(action).onclick=async()=>{
 const button=document.getElementById(action);button.disabled=true;
 try{const result=await chrome.runtime.sendMessage({action,company_id:document.getElementById('market-company').value,filters:{after_date:document.getElementById('after-date').value,amount_metric:document.getElementById('amount-metric').value,amount_min:document.getElementById('amount-min').value,amount_max:document.getElementById('amount-max').value,min_sold28:document.getElementById('min-sold28').value},limit:document.getElementById('limit').value,sku_hint:document.getElementById('sku-hint').value,target:document.getElementById('target').value,links:document.getElementById('links').value});document.getElementById('result').textContent=JSON.stringify(result,null,2);showActionResult(action,result);await refreshProgress();}
 catch(e){document.getElementById('notice').textContent='操作未完成：'+String(e.message||e);}
 finally{button.disabled=false;}
};
(async()=>{try{const r=await chrome.runtime.sendMessage({action:'get-filters'});if(r.status!=='filters_loaded')return;const f=r.settings;for(const [id,k] of [['after-date','after_date'],['amount-metric','amount_metric'],['amount-min','amount_min'],['amount-max','amount_max'],['min-sold28','min_sold28']])document.getElementById(id).value=f[k]??'';}catch(e){document.getElementById('result').textContent='筛选设置读取失败：'+e.message;}})();

function showActionResult(action,r){
 const names={exact_sku_read:'已按精确SKU读取分析字段，具体值见诊断',analysis_access_paused:'分析访问受限，已暂停并通知你处理',company_id_not_identified:'无法识别当前Shop编号，请填写后重试',sku_not_found:'分析服务没有返回该SKU',access_or_rate_limit:'分析访问受限，已通知你处理',market_company_saved:'店铺编号已保存',market_read_resumed:'已继续正常分析数据读取',buyer_already_collected:'这个SKU的买家数据已采过，已跳过',seller_already_collected:'这个SKU的卖家参数已采过，已跳过重复复制',seller_copy_armed:'卖家复制流程已启用，请先测试1件',seller_copy_started:'单件搜索/复制/读取/退出且不保存流程已启动',seller_copy_batch_started:'本批卖家流程已启动；退出未确认将记录并跳过',seller_copy_paused:'卖家任务已暂停，请查看顶部进度与诊断',seller_copy_resumed:'卖家流程已继续',seller_pages_checked:'卖家页面同步完成，字段覆盖情况见采集诊断',seller_tabs_not_open:'未找到已打开的卖家后台，请在同一浏览器打开正常分析页',started:'已启动本批采集',already_running:'当前批次正在采集',paused:'已暂停采集',target_saved:'今日目标已保存',filters_saved:'筛选条件已保存',queue_saved:`队列已保存，共 ${r.total||0} 件`,queue_complete_or_empty:'没有待采商品：请先读取搜索页链接，或队列中的商品已经采过',diagnostics_exported:'采集诊断已导出',historical_data_exported:'筛选通过商品已导出',dates_read:`已读取 ${r.matched_rows||0} 行日期`,date_column_not_available:'当前页面没有可识别的SKU和上架日期列',attributes_observed:`当前商品参数已读取，共 ${r.properties||0} 项`,attributes_missing:'尚未读到商品参数，请查看采集诊断',blocked_verification:'页面需要手动验证，采集已停止',exported_loaded_fields:'当前页参数已导出'};
 document.getElementById('notice').textContent=action==='status'?'进度已更新，见顶部进度条':r.status==='error'?'操作未完成：'+r.message:names[r.status]||'操作已返回结果，必要时可展开技术详情查看';
}
let progressRefreshing=false;
async function refreshProgress(){
 if(progressRefreshing)return;progressRefreshing=true;
 try{const data=await chrome.runtime.sendMessage({action:'status'});if(data.status==='error')throw new Error(data.message);renderProgress(data);}
 catch(e){document.getElementById('progress-updated').textContent='进度暂时无法刷新，请重新打开插件';}
 finally{progressRefreshing=false;}
}
refreshProgress();setInterval(refreshProgress,1000);
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&['autoQueue','snapshots','collectionQueue','dailyGoal'].some(k=>changes[k]))refreshProgress();});

(async()=>{try{const {lastSourceSku=''}=await chrome.storage.local.get('lastSourceSku');if(!document.getElementById('sku-hint').value)document.getElementById('sku-hint').value=lastSourceSku;}catch{}})();
document.getElementById('sku-hint').addEventListener('change',()=>{const value=document.getElementById('sku-hint').value.trim();if(/^\d+$/.test(value))chrome.storage.local.set({lastSourceSku:value});});
