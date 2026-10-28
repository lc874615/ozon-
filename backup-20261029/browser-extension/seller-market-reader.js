// seller_market_reader_v1
let sellerAnalyticsDeniedV1=false;
async function readSellerMarketSignals(sku,companyId) {
  if(!['seller.ozon.ru','seller.ozonru.cn'].includes(location.hostname)||!/^\d+$/.test(sku)||!/^\d+$/.test(companyId))return {status:'invalid_context'};
  if(sellerAnalyticsDeniedV1)return {status:'access_denied_previously_no_retry'};
  const path='/api/site/seller-analytics/what_to_sell/data/v3';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try {
    const r=await fetch(path,{method:'POST',credentials:'include',signal:controller.signal,
      headers:{'Content-Type':'application/json','x-o3-company-id':companyId,'x-o3-language':'RU'},
      body:JSON.stringify({limit:'50',offset:'0',filter:{stock:'any_stock',period:'monthly',categories:[],sku},sort:{key:'sum_gmv_desc'}})});
    if(r.status===403)sellerAnalyticsDeniedV1=true;
    if(!r.ok)return {status:'http_error',http_status:r.status,request_path:path};
    const raw=await r.text();if(raw.length>4000000)return {status:'response_too_large'};
    const d=JSON.parse(raw),items=Array.isArray(d.items)?d.items:[];
    return {status:'observed',request_path:path,requested_sku:sku,query_period:'monthly',
      sales_period_verified_rolling_30_days:false,observed_at:new Date().toISOString(),
      response_keys:Object.keys(d).slice(0,30),item_count:items.length,
      items:items.slice(0,50).map(i=>({sku:i.sku==null?null:String(i.sku),brand:typeof i.brand==='string'?i.brand.slice(0,160):null,
        salesSchema:typeof i.salesSchema==='string'?i.salesSchema.slice(0,80):null,
        soldCount:(typeof i.soldCount==='number'||typeof i.soldCount==='string')?i.soldCount:null,
        item_keys:Object.keys(i).slice(0,60)}))};
  }catch(e){return {status:e.name==='AbortError'?'timeout':'request_failed'};}
  finally{clearTimeout(timer);}
}
