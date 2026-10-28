async function captureSellerReference(sku) {
  let stage='query_tabs';
  try {
    const tabs=await chrome.tabs.query({url:['https://seller.ozon.ru/*','https://seller.ozonru.cn/*']});
    if(!tabs.length)return {status:'seller_tab_required'};
    const tab=tabs.find(t=>t.active)||tabs.find(t=>t.status==='complete')||tabs[0];
    const origin=new URL(tab.url).origin;
    stage='company_cookie';
    if(!chrome.cookies?.get)return {status:'seller_bridge_failed',stage,error_code:'cookies_api_unavailable'};
    const cookie=await chrome.cookies.get({url:origin+'/',name:'sc_company_id'});
    if(!cookie?.value)return {status:'seller_company_context_missing'};
    stage='seller_content_message';
    return await chrome.tabs.sendMessage(tab.id,{type:'OZON_READ_VARIANT_V1',sku:String(sku),companyId:cookie.value},{frameId:0})||{status:'seller_query_no_result'};
  }catch(e){
    const message=String(e?.message||'');
    return {status:'seller_bridge_failed',stage,error_code:/Receiving end|establish connection/i.test(message)?'seller_page_refresh_or_host_permission_required':'browser_message_failed',browser_message:message.replace(/https?:\/\/[^\s]+/g,'[site]').slice(0,300)};
  }
}
