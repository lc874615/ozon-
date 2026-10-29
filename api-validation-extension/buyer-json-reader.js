// Normal same-origin product JSON request; no page navigation, DOM scraping, purchase or cookie extraction.
async function readBuyerProductJson(sku){
 if(!['ozon.ru','www.ozon.ru'].includes(location.hostname)||!/^\d+$/.test(String(sku)))return {status:'invalid_context'};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const path='/api/entrypoint-api.bx/page/json/v2?'+new URLSearchParams({url:'/product/'+sku+'/'});
  const r=await fetch(path,{credentials:'include',signal:controller.signal});
  if(!r.ok)return {status:[401,403,429].includes(r.status)?'access_or_rate_limit':'http_error',http_status:r.status};
  const text=await r.text();if(text.length>4000000)return {status:'response_too_large'};const data=JSON.parse(text);
  if(data.incidentId||data.challengeURL||data.blockURL)return {status:'blocked_verification'};
  if(!data.widgetStates||typeof data.widgetStates!=='object')return {status:'product_json_missing'};
  const widgets=Object.entries(data.widgetStates).flatMap(([key,raw])=>{try{const value=typeof raw==='string'?JSON.parse(raw):raw;return value&&typeof value==='object'?[[key,value]]:[];}catch{return [];}});
  const get=prefix=>widgets.find(([key])=>key.startsWith(prefix))?.[1];const gallery=get('webGallery'),heading=get('webProductHeading'),price=get('webPrice');
  const identity=[gallery?.sku,heading?.sku].filter(x=>x!==null&&x!==undefined).map(String);
  if(!identity.length||identity.some(x=>x!==String(sku)))return {status:'product_identity_not_verified',widget_names:widgets.map(([k])=>k)};
  const images=(gallery?.images||[]).map(x=>x?.src).filter(x=>typeof x==='string'&&/^https:\/\//.test(x));
  const card=typeof price?.cardPrice==='string'?price.cardPrice:null;let reference=null;
  if(card){const m=card.replace(/\s+/g,'').match(/^(\d+(?:[.,]\d{1,2})?)(¥|￥|CNY)$/i);if(m){const cents=Math.round(Number(m[1].replace(',','.'))*100);reference={value:(Math.round(cents*1.10)/100).toFixed(2),currency:'CNY',observed_bank_price:(cents/100).toFixed(2),source:'explicit_product_json_cardPrice_times_1_10',is_estimate:true};}}
  const timeFragments=[],deliveryDiagnostics={widgets:[],temporal_fields:[],visited_nodes:0,truncated:false};
  const visit=(x,depth,path)=>{
   deliveryDiagnostics.visited_nodes++;if(depth>16||deliveryDiagnostics.visited_nodes>3000){deliveryDiagnostics.truncated=true;return;}
   if(typeof x==='string'){
    if(x.length<100000&&/^\s*[{[]/.test(x)){try{visit(JSON.parse(x),depth+1,path+'.json');}catch{}}
    const value=x.replace(/<[^>]{0,1000}>/g,' ').replace(/&(?:nbsp|thinsp);|&#160;/gi,' ').replace(/\s+/g,' ');
    const patterns=[/(?:доставим|доставка|через|от)\s*\d+\s*(?:(?:[-–—]|до)\s*\d+\s*)?дн(?:ей|я|ь)/gi,/(?:доставим|доставка)\s+(?:завтра|сегодня)/gi,/\d{1,2}\s*(?:[-–—]\s*\d{1,2}\s*)?(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+20\d{2})?/gi];
    for(const pattern of patterns)for(const m of value.matchAll(pattern)){timeFragments.push(m[0]);if(deliveryDiagnostics.temporal_fields.length<80)deliveryDiagnostics.temporal_fields.push({path,time_fragment:m[0]});}
    // Schema-only diagnostics do not include address, contact or arbitrary string values.
    if(/date|time|delivery|promise|eta|when/i.test(path)&&/^20\d{2}-\d{2}-\d{2}(?:T[0-9:.+Z-]+)?$/.test(value)&&deliveryDiagnostics.temporal_fields.length<80)deliveryDiagnostics.temporal_fields.push({path,iso_date:value});
   }else if(x&&typeof x==='object')for(const [key,value]of Object.entries(x).slice(0,200))visit(value,depth+1,path+'.'+key);
  };
  for(const [key,value]of widgets)if(/delivery|shipping|addtocart|orderbutton|oneclick/i.test(key)){
   deliveryDiagnostics.widgets.push({name:key,fields:Object.keys(value).slice(0,40)});visit(value,0,key);
  }
  const delivery=typeof deliveryReference==='function'?deliveryReference([...new Set(timeFragments)]):{minimum_days:null};delivery.diagnostics=deliveryDiagnostics;
  const attributes=[];
  const visitAttributes=(node,depth=0)=>{if(!node||typeof node!=='object'||depth>6)return;const label=node.title||node.name;const raw=node.values??node.value;
   if(typeof label==='string'&&raw!==undefined){const value=typeof raw==='string'||typeof raw==='number'?String(raw):Array.isArray(raw)?raw.map(v=>typeof v==='string'||typeof v==='number'?String(v):v?.text||v?.title||'').filter(Boolean).join('; '):'';if(value)attributes.push({name:label.slice(0,160),value:value.slice(0,2000),source:'product_json_characteristics'});}
   for(const child of Object.values(node).slice(0,100))if(child&&typeof child==='object')visitAttributes(child,depth+1);
  };
  for(const [name,value]of widgets)if(/^web(?:Short)?Characteristics/.test(name))visitAttributes(value);
  return {status:'buyer_json_read',sku:String(sku),identity_verified:true,title:heading?.title||null,images,attributes,reference_price:reference,observed_card_price:card,delivery,widget_names:widgets.map(([key])=>key),source:'normal_buyer_json_api',page_navigation:false};
 }catch(e){return {status:e.name==='AbortError'?'timeout':'read_failed'};}finally{clearTimeout(timer);}
}
