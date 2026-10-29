async function collectOzonSnapshot() {
  if (!/(^|\.)ozon\.ru$/.test(location.hostname) || !location.pathname.startsWith('/product/')) {
    return {status:'wrong_page', source_url:location.href};
  }
  if (/\/(reviews|questions)(\/|$)/.test(location.pathname)) return {status:'wrong_page',source_url:location.href};
  const clean = v => (v || '').replace(/\s+/g,' ').trim();
  const text = clean(document.body?.innerText);
  if (/доступ ограничен|подтвердите.{0,30}(человек|робот)|проверка безопасности|captcha|验证码|完成验证/i.test(text.slice(0,12000))) {
    return {status:'blocked_verification', source_url:location.href, captured_at:new Date().toISOString()};
  }
  const waitForQuietDOM=()=>new Promise(resolve=>{let quiet;const finish=()=>{clearTimeout(quiet);clearTimeout(cap);observer.disconnect();resolve();};const observer=new MutationObserver(()=>{clearTimeout(quiet);quiet=setTimeout(finish,700);});const cap=setTimeout(finish,3000);observer.observe(document.body,{childList:true,subtree:true,characterData:true});quiet=setTimeout(finish,700);});
  await waitForQuietDOM();
  if(/доступ ограничен|проверка безопасности|captcha|验证码|完成验证/i.test(clean(document.body?.innerText).slice(0,12000)))return {status:'blocked_verification'};
  const characteristics = document.querySelector('[data-widget="webCharacteristics"],#section-characteristics');
  const properties = [], seen = new Set();
  const add = (name,value,source,extra={}) => {
    name=clean(name); value=clean(value);
    const k=name+'\n'+value;
    if (name && value && !seen.has(k)) {seen.add(k);properties.push({name,value,source,...extra});}
  };
  // Read semantic key/value pairs, not arbitrary neighboring price/card text.
  const shortCharacteristics=document.querySelector('[data-widget="webShortCharacteristics"]');
  const root=characteristics || shortCharacteristics || document;
  for (const dt of root.querySelectorAll('dt')) {
    const dd=dt.nextElementSibling;
    const ddValue=dd?.tagName==='DD'?dd:dt.parentElement?.querySelector('dd');
    if(ddValue)add(dt.innerText,ddValue.innerText,'dom:dt-dd');
  }
  for (const row of root.querySelectorAll('tr')) {
    const cells=row.querySelectorAll('th,td');
    if(cells.length===2)add(cells[0].innerText,cells[1].innerText,'dom:table');
  }
  // Short characteristics often use explicit label/value spans instead of dt/dd.
  if(shortCharacteristics)for(const row of shortCharacteristics.querySelectorAll('li,[role="row"]')){
    const cells=[...row.children].filter(el=>clean(el.innerText));
    if(cells.length===2)add(cells[0].innerText,cells[1].innerText,'dom:short-characteristics-labelled-row');
  }
  if(typeof readShortCharacteristicPairs==='function')for(const p of readShortCharacteristicPairs(shortCharacteristics))add(p.name,p.value,p.source);
  const stateWidgets=[];
  // Restrict state to product widgets. Never serialize the global window,
  // cookies, localStorage, checkout or account state.
  for (const el of document.querySelectorAll('[id^="state-webShortCharacteristics"], [id^="state-webCharacteristics"], [id^="state-webProductHeading"], [id^="state-webPrice"], [id^="state-webGallery"]')) {
    const raw=el.getAttribute('data-state') || el.textContent;
    try {stateWidgets.push({id:el.id,data:JSON.parse(raw)});} catch (_) {}
  }
  function visit(node) {
    if (!node || typeof node!=='object')return;
    if(Array.isArray(node)){node.forEach(visit);return;}
    const title=node.title || node.name;
    const vals=node.values || node.value;
    if(typeof title==='string' && vals) {
      const value=Array.isArray(vals)?vals.map(v=>typeof v==='string'?v:(v.text||v.title||v.value||'')).join('; '):(typeof vals==='string'?vals:'');
      if(value)add(title,value,'widget:characteristics');
    }
    Object.values(node).forEach(visit);
  }
  stateWidgets.filter(w=>/^state-web(?:Short)?Characteristics/.test(w.id)).forEach(w=>visit(w.data));
  const attributePropertyCount=properties.length;
  const gallery=document.querySelector('[data-widget="webGallery"]');
  const images=[...new Set([...(gallery?.querySelectorAll('img') || [])].map(i=>i.currentSrc||i.src).filter(u=>/^https:\/\//.test(u)))];
  const delivery=typeof readBuyerDelivery==='function'?readBuyerDelivery(document):{texts:[],minimum_days:null,evidence:[],widget_names:[],note:'delivery_reader_not_loaded'};
  if(delivery.minimum_days!==null)add('参考最短送达天数',String(delivery.minimum_days),'buyer_delivery_reference');
  const priceText=clean(document.querySelector('[data-widget="webPrice"]')?.innerText);
  let priceObservation=typeof readOzonPriceWidget==='function'?readOzonPriceWidget(document.querySelector('[data-widget="webPrice"]')):null;
  if((!priceObservation||['price_widget_missing','bank_price_label_not_found'].includes(priceObservation.status))&&typeof readOzonBankPriceText==='function')priceObservation=readOzonBankPriceText(priceText);
  if(priceObservation?.reference_price){const r=priceObservation.reference_price;add('参考售价估计（人民币）',r.value,r.source,{is_estimate:true,currency:'CNY',calculation:'observed_conditional_bank_price × 1.10'});}
  const id=location.pathname.match(/\/product\/(?:[^/]*-)?(\d+)(?:\/|$)/)?.[1] || null;
  return {schema_version:1, source:'ozon_buyer_browser_extension', source_url:location.origin+location.pathname,
    product_id:id, captured_at:new Date().toISOString(), title:clean(document.querySelector('h1')?.innerText),
    status:attributePropertyCount?'attributes_observed':'attributes_missing',attribute_property_count:attributePropertyCount,properties,images,
    price_widget_text:priceText,price_observation:priceObservation,price_type_verified:false,
    characteristics_text:clean(characteristics?.innerText).slice(0,30000),
    delivery_observation:delivery,
    diagnostics:{available_widget_names:[...new Set([...document.querySelectorAll('[data-widget]')].map(el=>el.getAttribute('data-widget')).filter(Boolean))].slice(0,120),ready_state:document.readyState,characteristics_found:!!characteristics,full_characteristics_loaded:!!characteristics&&characteristics.querySelectorAll('dt,tr').length>0,short_characteristics_text:clean(shortCharacteristics?.innerText).slice(0,5000),short_characteristics_html:shortCharacteristics?.innerHTML.slice(0,12000)||null,definition_terms:root.querySelectorAll('dt').length,definition_values:root.querySelectorAll('dd').length,price_widget_html:document.querySelector('[data-widget="webPrice"]')?.innerHTML.slice(0,12000)||null,product_widget_names:[...new Set([...document.querySelectorAll('[data-widget]')].map(el=>el.getAttribute('data-widget')).filter(n=>/Characteristics|ProductHeading|Price|Gallery|Delivery|Shipping|Seller|Logistic|Available|Location/i.test(n)))].slice(0,60)},
    widget_states:stateWidgets, packaging_data_verified:false};
}
collectOzonSnapshot();
