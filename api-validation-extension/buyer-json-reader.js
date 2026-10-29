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
  if(widgets.some(([key])=>/^webOutOfStock(?:[-_]|$)/.test(key)))return {status:'product_out_of_stock',requested_sku:String(sku),source:'explicit_webOutOfStock_widget'};
  const get=prefix=>widgets.find(([key])=>key.startsWith(prefix))?.[1];const gallery=get('webGallery'),heading=get('webProductHeading'),price=get('webPrice');
  const identity=[gallery?.sku,heading?.sku].filter(x=>x!==null&&x!==undefined).map(String);
  if(!identity.length||identity.some(x=>x!==String(sku)))return {status:'product_identity_not_verified',widget_names:widgets.map(([k])=>k)};
  const images=(gallery?.images||[]).map(x=>x?.src).filter(x=>typeof x==='string'&&/^https:\/\//.test(x));
  let card=typeof price?.cardPrice==='string'?price.cardPrice:null;let reference=null;
  const priceReference=(widget)=>{
   const candidates=typeof widget?.cardPrice==='string'?[{text:widget.cardPrice,factor:1.10,kind:'cardPrice'}]:[{text:widget?.price,factor:1,kind:'price'}];
   for(const c of candidates){if(typeof c.text!=='string')continue;const m=c.text.replace(/\s+/g,'').match(/^(\d+(?:[.,]\d{1,2})?)(¥|￥|CNY)$/i);if(!m)continue;
    const cents=Math.round(Number(m[1].replace(',','.'))*100);return {value:(Math.round(cents*c.factor)/100).toFixed(2),currency:'CNY',observed_price:(cents/100).toFixed(2),price_field:c.kind,multiplier:c.factor,source:c.kind==='cardPrice'?'explicit_product_json_cardPrice_times_1_10':'explicit_current_price_no_markup',is_estimate:c.factor!==1};
   }return null;
  };
  reference=priceReference(price);

  const timeFragments=[],deliveryDiagnostics={widgets:[],temporal_fields:[],visited_nodes:0,truncated:false};
  const visit=(x,depth,path)=>{
   deliveryDiagnostics.visited_nodes++;if(depth>16||deliveryDiagnostics.visited_nodes>3000){deliveryDiagnostics.truncated=true;return;}
   if(typeof x==='string'){
    if(x.length<100000&&/^\s*[{[]/.test(x)){try{visit(JSON.parse(x),depth+1,path+'.json');}catch{}}
    const value=x.replace(/<[^>]{0,1000}>/g,' ').replace(/&(?:nbsp|thinsp);|&#160;/gi,' ').replace(/\s+/g,' ');
    if(/^orderInfo/i.test(path)&&!/(?:достав|delivery|shipping|promise|eta)/i.test(path+' '+value))return;
    const patterns=[/(?:доставим|доставка|через|от)\s*\d+\s*(?:(?:[-–—]|до)\s*\d+\s*)?дн(?:ей|я|ь)/gi,/(?:доставим|доставка)\s+(?:завтра|сегодня)/gi,/\d{1,2}\s*(?:[-–—]\s*\d{1,2}\s*)?(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+20\d{2})?/gi];
    for(const pattern of patterns)for(const m of value.matchAll(pattern)){timeFragments.push(m[0]);if(deliveryDiagnostics.temporal_fields.length<80)deliveryDiagnostics.temporal_fields.push({path,time_fragment:m[0]});}
    // Schema-only diagnostics do not include address, contact or arbitrary string values.
    if(/date|time|delivery|promise|eta|when/i.test(path)&&/^20\d{2}-\d{2}-\d{2}(?:T[0-9:.+Z-]+)?$/.test(value)&&deliveryDiagnostics.temporal_fields.length<80)deliveryDiagnostics.temporal_fields.push({path,iso_date:value});
   }else if(x&&typeof x==='object')for(const [key,value]of Object.entries(x).slice(0,200))visit(value,depth+1,path+'.'+key);
  };
  for(const [key,value]of widgets)if(/delivery|shipping|addtocart|orderbutton|oneclick|orderinfo/i.test(key)){
   deliveryDiagnostics.widgets.push({name:key,fields:Object.keys(value).slice(0,40)});visit(value,0,key);
  }
  let delivery=typeof deliveryReference==='function'?deliveryReference([...new Set(timeFragments)]):{minimum_days:null};delivery.diagnostics=deliveryDiagnostics;
  const schema=(value,depth=0)=>{
   if(value===null)return {type:'null'};if(depth>3)return {type:typeof value};
   if(Array.isArray(value))return {type:'array',length:value.length,first:value.length?schema(value[0],depth+1):null};
   if(typeof value==='object')return {type:'object',fields:Object.fromEntries(Object.entries(value).slice(0,25).map(([k,v])=>[k,schema(v,depth+1)]))};
   if(typeof value==='string'&&value.startsWith('/api/'))return {type:'string',api_path:value.split('?')[0]};
   return {type:typeof value};
  };
  deliveryDiagnostics.async_descriptors=widgets.filter(([k])=>/delivery|addtocart/i.test(k)).map(([name,v])=>({name,async_action:schema(v.asyncAction),web_data:schema(v.webData),first_button:schema(v.firstButton)}));
  if(delivery.minimum_days===null){
   const endpoint='/api/composer-api.bx/_action/v2/pdpGetButtonTexts';
   const actions=widgets.filter(([k])=>/^webAddToCart/.test(k)).map(([,v])=>v.asyncAction).filter(Boolean);
   let candidate=null;
   deliveryDiagnostics.button_text_checks=[];
   for(const action of actions){
    const check={link_type:typeof action.link,param_keys:action.params&&typeof action.params==='object'?Object.keys(action.params).filter(k=>['enableProductViewedExtended','inCartPosition','pageType','toCartPosition'].includes(k)):[],reason:null};
    deliveryDiagnostics.button_text_checks.push(check);
    try{
     if(typeof action.link!=='string'){check.reason='link_missing';continue;}
     const u=new URL(action.link,location.origin);
     check.same_origin=u.origin===location.origin;
     check.path_form=u.pathname===endpoint?'full_confirmed_endpoint':u.pathname==='/pdpGetButtonTexts'?'bare_button_action':u.pathname==='/v2/pdpGetButtonTexts'?'versioned_button_action':u.pathname==='/_action/v2/pdpGetButtonTexts'?'action_relative_endpoint':'other';
     check.query_fields=['product_id','at','sh'].filter(k=>u.searchParams.has(k));
     check.product_id_matches=u.searchParams.get('product_id')===String(sku);
     if(!check.same_origin){check.reason='origin_mismatch';continue;}
     if(u.pathname==='/pdpGetButtonTexts'){u.pathname=endpoint;check.address_normalized=true;}
     if(u.pathname!==endpoint){check.reason='endpoint_format_unrecognized';continue;}
     if(!check.product_id_matches){check.reason='product_id_missing_or_mismatch';continue;}
     check.dynamic_query_supplied=!!(u.searchParams.get('at')&&u.searchParams.get('sh')); // Preserve supplied values; never synthesize or reuse tokens.
     const params=action.params,keys=['enableProductViewedExtended','inCartPosition','pageType','toCartPosition'];
     check.param_types=Object.fromEntries(keys.map(k=>[k,typeof params?.[k]]));
     if(!params||keys.some(k=>typeof params[k]!=='string')||params.pageType!=='pdp'){check.reason='payload_missing_or_invalid';continue;}
     check.reason='validated';candidate={url:u.href,params:Object.fromEntries(keys.map(k=>[k,params[k]]))};break;
    }catch{check.reason='invalid_action_url';}
   }
   deliveryDiagnostics.button_text_action=candidate?'validated_current_sku':'missing_or_unverified';
   if(candidate){
    const response=await fetch(candidate.url,{method:'POST',credentials:'include',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({params:candidate.params})});
    deliveryDiagnostics.button_text_http_status=response.status;
    if([401,403,429].includes(response.status))return {status:'access_or_rate_limit',http_status:response.status};
    if(response.ok){
     const raw=await response.text();if(raw.length>1000000)return {status:'response_too_large'};const payload=JSON.parse(raw);
     if(payload.incidentId||payload.challengeURL||payload.blockURL)return {status:'blocked_verification'};
     // Read only the confirmed button text fields; never export tokens or the response body.
     const scan=(node,depth=0)=>{if(!node||typeof node!=='object'||depth>6)return;
      const button=node.firstButton;
      if(button){const value=button.toCartText?.text;if(typeof value==='string'&&/достав/i.test(value))visit(value,0,'pdpGetButtonTexts.delivery');}
      for(const child of Object.values(node).slice(0,50))if(child&&typeof child==='object')scan(child,depth+1);
     };scan(payload);
     delivery=typeof deliveryReference==='function'?deliveryReference([...new Set(timeFragments)]):{minimum_days:null};delivery.diagnostics=deliveryDiagnostics;
    }
   }
  }
  const attributes=[];
  const visitAttributes=(node,depth=0)=>{if(!node||typeof node!=='object'||depth>6)return;const label=node.title||node.name;const raw=node.values??node.value;
   if(typeof label==='string'&&raw!==undefined){const value=typeof raw==='string'||typeof raw==='number'?String(raw):Array.isArray(raw)?raw.map(v=>typeof v==='string'||typeof v==='number'?String(v):v?.text||v?.title||'').filter(Boolean).join('; '):'';if(value)attributes.push({name:label.slice(0,160),value:value.slice(0,2000),source:'product_json_characteristics'});}
   for(const child of Object.values(node).slice(0,100))if(child&&typeof child==='object')visitAttributes(child,depth+1);
  };
  for(const [name,value]of widgets)if(/^web(?:Short)?Characteristics/.test(name))visitAttributes(value);
  if(delivery.minimum_days===null||attributes.length===0||!reference){
   // This is the additional read-only product-layout request observed in the supplied plugin.
   // Do not execute unknown asyncAction descriptors: they can represent state-changing actions.
   const supplementalPath='/api/entrypoint-api.bx/page/json/v2?'+new URLSearchParams({url:'/product/'+sku+'/?layout_container=pdpPage2column&layout_page_index=2'});
   try{
    const extraResponse=await fetch(supplementalPath,{credentials:'include',signal:controller.signal});deliveryDiagnostics.supplemental_http_status=extraResponse.status;
    if([401,403,429].includes(extraResponse.status))return {status:'access_or_rate_limit',http_status:extraResponse.status};
    if(extraResponse.ok){
     const extraText=await extraResponse.text();if(extraText.length>4000000)return {status:'response_too_large'};const extraData=JSON.parse(extraText);
     if(extraData.incidentId||extraData.challengeURL||extraData.blockURL)return {status:'blocked_verification'};
     const extraWidgets=Object.entries(extraData.widgetStates||{}).flatMap(([key,raw])=>{try{return [[key,typeof raw==='string'?JSON.parse(raw):raw]];}catch{return [];}});
     for(const [key,value]of extraWidgets){
      if(/^web(?:Gallery|ProductHeading)/.test(key)&&value?.sku!==undefined&&String(value.sku)!==String(sku))return {status:'product_identity_not_verified'};
      if(/delivery|shipping|addtocart|orderbutton|oneclick|orderinfo/i.test(key)){
       deliveryDiagnostics.widgets.push({name:key,source:'supplemental_layout',fields:Object.keys(value||{}).slice(0,40)});visit(value,0,key);deliveryDiagnostics.async_descriptors.push({name:key,source:'supplemental_layout',async_action:schema(value?.asyncAction),web_data:schema(value?.webData),first_button:schema(value?.firstButton)});
      }
     }
     widgets.push(...extraWidgets);delivery=typeof deliveryReference==='function'?deliveryReference([...new Set(timeFragments)]):{minimum_days:null};delivery.diagnostics=deliveryDiagnostics;
    }
   }catch(e){deliveryDiagnostics.supplemental_error=e.name==='AbortError'?'timeout':'response_error';}
  }
  attributes.length=0;
  for(const [name,value]of widgets)if(/^web(?:Short)?Characteristics/.test(name))visitAttributes(value);
  if(!reference){for(const [,v]of widgets.filter(([k])=>k.startsWith('webPrice')).reverse()){const found=priceReference(v);if(found){reference=found;card=typeof v.cardPrice==='string'?v.cardPrice:null;break;}}}
  return {status:'buyer_json_read',sku:String(sku),identity_verified:true,title:heading?.title||null,images,attributes,reference_price:reference,observed_card_price:card,price_diagnostics:widgets.filter(([k])=>k.startsWith('webPrice')).map(([name,v])=>({name,fields:Object.keys(v||{}).slice(0,40),card_price_type:typeof v?.cardPrice,current_price_type:typeof v?.price})),delivery,widget_names:widgets.map(([key])=>key),source:'normal_buyer_json_api',page_navigation:false};
 }catch(e){return {status:e.name==='AbortError'?'timeout':'read_failed'};}finally{clearTimeout(timer);}
}
