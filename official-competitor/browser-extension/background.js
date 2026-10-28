// User-started buyer queue; no seller API calls or listing actions.
importScripts('selection-filters.js','seller-sync.js','auto-queue.js');
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  (async()=>{
    const store=chrome.storage.local;
    if(message.action==='sync-seller')return syncSellerVisible();
    if(message.action==='bind-seller-form')return bindSellerForm(message.sku_hint);
    if(message.action.startsWith('auto-'))return await autoQueueAction(message);
    const validLink=raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&['ozon.ru','www.ozon.ru'].includes(u.hostname)&&/^\/product\/(?:[^/]*-)?\d+\/?$/.test(u.pathname)?u.origin+u.pathname:null;}catch{return null;}};
    const run=async file=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw new Error('请先打开商品或搜索页面');return (await chrome.scripting.executeScript({target:{tabId:tab.id},files:file==='collector.js'?['delivery-reference.js','collector.js']:[file]}))[0]?.result;};
    if(message.action==='export-diagnostics'){
      const {snapshots={},autoQueue=null,sellerSync=null,sellerEvidence={}}=await store.get(['snapshots','autoQueue','sellerSync','sellerEvidence']);
      const data={version:chrome.runtime.getManifest().version,autoQueue,sellerSync,sellerEvidence,observations:Object.values(snapshots).map(d=>({product_id:d.product_id,status:d.status,title:d.title,collection_status:d.collection_status,collection_issue:d.collection_issue,captured_at:d.captured_at,collection_timing:d.collection_timing,diagnostics:d.diagnostics,seller_properties:d.seller_properties,delivery_observation:d.delivery_observation,source_url:d.source_url,images_count:(d.images||[]).length,price_widget_text:d.price_widget_text,properties:d.properties,selection_review:d.selection_review}))};
      await chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(data,null,2)),filename:'ozon-collection-diagnostics.json',saveAs:true});return {status:'diagnostics_exported'};
    }
    if(message.action==='capture-listing-dates'){
      const result=await run('listing-date-reader.js');
      const {listingDateEvidence={}}=await store.get('listingDateEvidence');
      for(const e of result.evidence||[]){const old=listingDateEvidence[e.sku]||[];if(!old.some(x=>x.value===e.value&&x.source_page===e.source_page))old.push(e);listingDateEvidence[e.sku]=old;}
      await store.set({listingDateEvidence});return {status:result.evidence?.length?'dates_read':'date_column_not_available',matched_rows:result.evidence?.length||0,diagnostics:result.diagnostics,scope:result.scope};
    }
    if(message.action==='save-filters'){const settings=parseFilterSettings(message.filters);await store.set({captureFilters:settings});return {status:'filters_saved',settings};}
    if(message.action==='get-filters'){const {captureFilters={}}=await store.get('captureFilters');return {status:'filters_loaded',settings:parseFilterSettings(captureFilters)};}
    if(message.action==='save-target'){
      const n=Number(message.target);if(!Number.isInteger(n)||n<1||n>1000)throw new Error('目标请输入1至1000');
      await store.set({dailyGoal:{target:n,date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),published_verified:0}});
      return {status:'target_saved',target:n,note:'仅记录目标，尚未启动自动上架或发布'};
    }
    if(message.action==='capture-buyer'){
      const data=await run('collector.js');if(!data?.product_id||data.status==='blocked_verification')return data||{status:'empty'};
      const {snapshots={},captureFilters={},listingDateEvidence={},sellerEvidence={}}=await store.get(['snapshots','captureFilters','listingDateEvidence','sellerEvidence']);data.selection_review=evaluateCaptureFilters(withListingEvidence(withSellerEvidence(data,sellerEvidence),listingDateEvidence),captureFilters);snapshots[data.product_id]=data;
      await store.set({snapshots});return {status:data.status,sku:data.product_id,properties:data.properties.length,collected:Object.keys(snapshots).length,packaging_verified:false};
    }
    if(message.action==='read-links'||message.action==='save-queue'){
      const raw=message.action==='read-links'?await run('link-reader.js'):String(message.links||'').split(/\s+/);
      const clean=[...new Set(raw.map(validLink).filter(Boolean))];
      const {collectionQueue=[]}=await store.get('collectionQueue');const queue=[...new Set([...collectionQueue,...clean])].slice(0,1000);
      await store.set({collectionQueue:queue});return {status:'queue_saved',total:queue.length};
    }
    if(message.action==='next'){
      const {collectionQueue=[],snapshots={}}=await store.get(['collectionQueue','snapshots']);
      const next=collectionQueue.map(validLink).filter(Boolean).find(u=>!snapshots[u.match(/(?:-|\/)(\d+)\/?$/)[1]]);
      if(!next)return {status:'queue_complete_or_empty'};
      await chrome.tabs.create({url:next});return {status:'opened_next',note:'加载完成后点击采集当前商品；遇验证请手动处理'};
    }
    if(message.action==='capture-form'){
      const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
      if(!tab?.id)throw new Error('请在商品参数页点击扩展按钮');
      const output=await chrome.scripting.executeScript({target:{tabId:tab.id},files:['form-reader.js']});
      const data=output[0]?.result;
      if(!data)throw new Error('页面未返回数据');
      const hint=String(message.sku_hint||'').trim();
      if(hint&&!/^\d+$/.test(hint))throw new Error('SKU提示只接受数字');
      data.user_supplied_source_sku_hint=hint||null;
      data.extension_version=chrome.runtime.getManifest().version;
      const count=data.fields.length+data.read_only_attributes.length;
      if(!count)return {status:'no_loaded_fields',coverage:data.coverage};
      const filename='ozon-form-snapshot-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
      const body=JSON.stringify(data,null,2);
      if(new TextEncoder().encode(body).length>8*1024*1024)throw new Error('当前页数据超过8MB，请按分组分别导出');
      await chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(body),filename,saveAs:true});
      return {status:data.coverage.truncated?'exported_partial':'exported_loaded_fields',filename,fields:data.fields.length,read_only_parameters:data.read_only_attributes.length,
        truncated:data.coverage.truncated,omitted_sensitive_controls:data.coverage.omitted_sensitive_or_hidden_controls,
        warning:'只导出当前已加载字段；未点击、填表、保存或发布，页面自身自动保存不受此工具控制。'};
    }
    if(message.action==='export'){
      const {snapshots={},captureFilters={},listingDateEvidence={},sellerEvidence={}}=await chrome.storage.local.get(['snapshots','captureFilters','listingDateEvidence','sellerEvidence']);
      const evaluated=Object.values(snapshots).map(d=>{const selection_review=evaluateCaptureFilters(withListingEvidence(withSellerEvidence(d,sellerEvidence),listingDateEvidence),captureFilters);if(d.collection_status==='partial'){selection_review.decision='review';selection_review.checks.push({field:'loaded_attributes',state:'review',evidence:null});}return {...d,selection_review};});
      const observations=evaluated.filter(d=>d.selection_review.decision==='pass').map(d=>withSellerEvidence(d,sellerEvidence));
      const data={schema_version:4,source:'filtered_local_browser_observations',filter_settings:parseFilterSettings(captureFilters),summary:Object.fromEntries(['pass','exclude','review'].map(k=>[k,evaluated.filter(d=>d.selection_review.decision===k).length])),observations,
        audit:evaluated.filter(d=>d.selection_review.decision!=='pass').map(d=>({product_id:d.product_id,decision:d.selection_review.decision,checks:d.selection_review.checks}))};
      await chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(data,null,2)),filename:'ozon-filtered-observations.json',saveAs:true});
      return {status:'historical_data_exported'};
    }
    if(message.action==='status'){const {dailyGoal=null,collectionQueue=[],snapshots={},autoQueue=null,sellerSync=null}=await store.get(['dailyGoal','collectionQueue','snapshots','autoQueue','sellerSync']);const batchIds=(autoQueue?.urls||[]).map(u=>u.match(/(?:-|\/)(\d+)\/?$/)?.[1]);const records=batchIds.map(id=>snapshots[id]).filter(Boolean);const buyerBatchStats={saved:records.length,properties:records.reduce((n,d)=>n+(d.properties||[]).length,0),with_images:records.filter(d=>d.images?.length).length,with_price_text:records.filter(d=>d.price_widget_text).length};return {sellerSync,buyerBatchStats,autoQueue,dailyGoal,queued:collectionQueue.length,collected:Object.keys(snapshots).length,mode:'user_clicked_current_form_export',version:chrome.runtime.getManifest().version,
      automatic_website_requests:'only user-started buyer queue',cookie_access:false,automatic_form_changes:false};}
    return {status:'disabled',reason:'无人值守采集和账号接口操作未启用。'};
  })().then(respond,e=>respond({status:'error',message:String(e.message||e).slice(0,300)}));
  return true;
});
