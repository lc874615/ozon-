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
  const characteristics = document.querySelector('[data-widget="webCharacteristics"]');
  const properties = [], seen = new Set();
  const add = (name,value,source) => {
    name=clean(name); value=clean(value);
    const k=name+'\n'+value;
    if (name && value && !seen.has(k)) {seen.add(k);properties.push({name,value,source});}
  };
  // Read semantic key/value pairs, not arbitrary neighboring price/card text.
  const root=characteristics || document;
  for (const dt of root.querySelectorAll('dt')) {
    const dd=dt.nextElementSibling;
    if(dd?.tagName==='DD')add(dt.innerText,dd.innerText,'dom:dt-dd');
  }
  for (const row of root.querySelectorAll('tr')) {
    const cells=row.querySelectorAll('th,td');
    if(cells.length===2)add(cells[0].innerText,cells[1].innerText,'dom:table');
  }
  const stateWidgets=[];
  // Restrict state to product widgets. Never serialize the global window,
  // cookies, localStorage, checkout or account state.
  for (const el of document.querySelectorAll('[id^="state-webCharacteristics"], [id^="state-webProductHeading"], [id^="state-webPrice"], [id^="state-webGallery"]')) {
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
  stateWidgets.filter(w=>w.id.startsWith('state-webCharacteristics')).forEach(w=>visit(w.data));
  const gallery=document.querySelector('[data-widget="webGallery"]');
  const images=[...new Set([...(gallery?.querySelectorAll('img') || [])].map(i=>i.currentSrc||i.src).filter(u=>/^https:\/\//.test(u)))];
  const priceText=clean(document.querySelector('[data-widget="webPrice"]')?.innerText);
  const id=location.pathname.match(/\/product\/(?:[^/]*-)?(\d+)(?:\/|$)/)?.[1] || null;
  return {schema_version:1, source:'ozon_buyer_browser_extension', source_url:location.origin+location.pathname,
    product_id:id, captured_at:new Date().toISOString(), title:clean(document.querySelector('h1')?.innerText),
    status:properties.length?'attributes_observed':'attributes_missing', properties, images,
    price_widget_text:priceText, price_type_verified:false,
    characteristics_text:clean(characteristics?.innerText).slice(0,30000),
    widget_states:stateWidgets, packaging_data_verified:false};
}
collectOzonSnapshot();
