const phaseNames={navigate:'准备打开下一件商品',read:'等待页面加载或读取参数'};
const reasonNames={verification_required:'遇到验证，请在采集标签中手动完成后重新启动',user_paused:'你已暂停采集',page_load_timeout:'商品页面加载超时',wrong_or_empty_product_page:'商品页为空或商品编号不一致',attributes_not_loaded_expand_manually:'旧版本未读到属性，请更新后重新启动',cannot_prepare_characteristics:'未能加载商品参数区域',collection_only_complete:'本批采集完成，已停止；不执行后续步骤',browser_restarted_click_start_to_resume:'浏览器重启，点击开始继续',extension_updated_click_start_to_resume:'插件已更新，点击开始继续'};
function progressModel(data){
 const s=data.autoQueue,states={running:'采集中',paused:'已暂停',completed:'本批采集完成'};
 const total=Array.isArray(s?.urls)?s.urls.length:0,done=Math.max(0,Math.min(Number(s?.index)||0,total));
 return {title:s?(states[s.status]||'尚未启动'):'尚未启动',done,total,percent:total?Math.floor(done/total*100):0,
  pass:s?.counts?.pass||0,exclude:s?.counts?.exclude||0,review:s?.counts?.review||0,
  stage:s?.status==='running'?phaseNames[s.phase]||'正在处理':reasonNames[s?.reason]||(s?.reason?'运行异常，请导出诊断查看详情':'先读取搜索页链接，再开始采集'),
  current:s?.status==='running'&&done<total?`正在处理第 ${done+1} 件，共 ${total} 件`:'',
  queued:data.queued||0,collected:data.collected||0,
  goal:data.dailyGoal?.target?`今日上架目标：${data.dailyGoal.target} 件（仅记录；本次只采集）`:'本次只采集，不执行上架',
  version:data.version||'',sellerSync:data.sellerSync||null,stats:data.buyerBatchStats||null};
}
function renderProgress(data){
 const sj=data.sellerCopyJob,sb=data.sellerCopyBatch;
 const copyView=document.getElementById('seller-copy-progress');if(copyView)copyView.textContent=sj?`卖家流程：${{running:'运行中',paused:'已暂停',completed:'完成且删除已确认',skipped:'已跳过'}[sj.status]||sj.status}；SKU ${sj.sku}；${sb?`本批已处理 ${sb.index}/${sb.skus.length}；`:''}${sj.cleanup_required?'注意：此件草稿可能仍保留；':''}步骤 ${{init:'检查复制页',search:'输入SKU搜索',copy:'核对并复制',copy_in_flight:'等待复制结果',read:'读取包装参数',delete:'准备清理本次草稿',delete_in_flight:'等待删除结果',verify:'确认删除结果',cleanup_needs_ui_adapter:'清理入口未识别',copy_uncertain:'复制结果待核实'}[sj.phase]||'待排查'}${sj.reason?'；原因见诊断':''}`:'卖家复制流程尚未启动';
 const m=progressModel(data);document.getElementById('progress-title').textContent=m.title;
 const bar=document.getElementById('batch-progress');bar.max=m.total||1;bar.value=m.done;
 document.getElementById('progress-numbers').textContent=`已处理 ${m.done} / ${m.total} 件（${m.percent}%）`;
 document.getElementById('progress-counts').textContent=`筛选通过 ${m.pass} 件 · 排除 ${m.exclude} 件 · 待核验 ${m.review} 件`;
 document.getElementById('progress-stage').textContent=[m.current,m.stage].filter(Boolean).join('；');
 document.getElementById('progress-history').textContent=`队列 ${m.queued} 件 · 历史保存 ${m.collected} 件`;
 document.getElementById('progress-goal').textContent=m.goal;
 const seller=m.sellerSync;document.getElementById('progress-seller').textContent=seller?`卖家端：已检查 ${seller.tabs_found||0} 个后台标签；分析行与包装字段覆盖请查看诊断。`:'卖家端：尚未同步；请在同一浏览器打开分析页，包装参数页需确认来源SKU';
 const stats=m.stats;
 document.getElementById('progress-data').textContent=stats?`本批买家端：已保存 ${stats.saved} 件，参数共 ${stats.properties} 项；有图片 ${stats.with_images} 件，有价格展示文本 ${stats.with_price_text} 件。图片和价格展示不等于筛选已通过。`:'';
 document.getElementById('progress-updated').textContent='本地进度更新：'+new Date().toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai'})+'（弹窗打开时每秒刷新）';
}
