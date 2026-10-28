// official_sources_mode_v1: no website access, interception, cookies, or store calls.
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  (async()=>{
    if(message.action==='export'){
      const {snapshots={}}=await chrome.storage.local.get('snapshots');
      const data={schema_version:2,source:'historical_local_browser_observations',
        export_mode:'official_sources_only_no_live_collection',extension_version:chrome.runtime.getManifest().version,
        warning:'Historical observations may include earlier experimental internal API results; export does not make them official API data.',
        observations:Object.values(snapshots)};
      await chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(data,null,2)),filename:'ozon-historical-observations.json',saveAs:true});
      return {status:'exported_without_live_website_access'};
    }
    if(message.action==='status'){
      const {snapshots={}}=await chrome.storage.local.get('snapshots');
      return {mode:'official_sources_only',version:chrome.runtime.getManifest().version,historical_records:Object.keys(snapshots).length,
        automated_website_access:false,cookie_access:false,store_mutations:false};
    }
    return {status:'disabled',reason:'Use Ozon official UI exports or documented Seller API. Website collection and internal endpoint calls are disabled.'};
  })().then(respond,()=>respond({status:'local_export_error'}));
  return true;
});
