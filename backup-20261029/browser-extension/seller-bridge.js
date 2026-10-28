async function captureSellerReference(sku) {
  let stage = 'query_tabs';
  try {
    const tabs = await chrome.tabs.query({
      url:['https://seller.ozon.ru/*','https://seller.ozonru.cn/*']
    });
    if (!tabs.length) return {status:'seller_tab_required'};
    let tab=null;
    const checks=[];
    for(const candidate of tabs){
      try{const ping=await chrome.tabs.sendMessage(candidate.id,{type:'OZON_SELLER_PING_V1'},{frameId:0});
        if(ping?.ready && ping.version===chrome.runtime.getManifest().version){tab=candidate;break;}
        checks.push({ready:false,version:ping?.version||null});
      }catch(_){checks.push({ready:false});}
    }
    if(!tab)return {status:'seller_content_not_ready',seller_tab_count:tabs.length,extension_version:chrome.runtime.getManifest().version,checks};
    const origin = new URL(tab.url).origin;

    stage = 'company_cookie';
    if (!chrome.cookies?.get) return {
      status:'seller_bridge_failed',stage,
      error_code:'cookies_api_unavailable'
    };
    const cookie = await chrome.cookies.get({
      url:origin+'/',name:'sc_company_id'
    });
    if (!cookie?.value)
      return {status:'seller_company_context_missing'};

    stage = 'seller_content_message';
    const result = await chrome.tabs.sendMessage(
      tab.id,
      {
        type:'OZON_READ_VARIANT_V1',
        sku:String(sku),companyId:cookie.value
      },
      {frameId:0}
    );
    return result || {status:'seller_query_no_result'};
  } catch(e) {
    const message = String(e?.message || '');
    return {
      status:'seller_bridge_failed',stage,
      error_code:/Receiving end|establish connection/i.test(message)
        ? 'seller_page_refresh_or_host_permission_required'
        : 'browser_message_failed',
      browser_message:message
        .replace(/https?:\/\/[^\s]+/g,'[site]').slice(0,300)
    };
  }
}