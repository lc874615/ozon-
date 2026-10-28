// Local user-clicked export only: no website requests, cookies, or automatic actions.
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  (async()=>{
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
      const {snapshots={}}=await chrome.storage.local.get('snapshots');
      const data={schema_version:2,source:'historical_local_browser_observations',observations:Object.values(snapshots)};
      await chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(data,null,2)),filename:'ozon-historical-observations.json',saveAs:true});
      return {status:'historical_data_exported'};
    }
    if(message.action==='status')return {mode:'user_clicked_current_form_export',version:chrome.runtime.getManifest().version,
      automatic_website_requests:false,cookie_access:false,automatic_form_changes:false};
    return {status:'disabled',reason:'批量采集和账号接口操作未启用。'};
  })().then(respond,e=>respond({status:'error',message:String(e.message||e).slice(0,300)}));
  return true;
});
