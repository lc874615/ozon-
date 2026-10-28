async function probeOzonPackageData() {
  const product=location.pathname.match(/^\/product\/[^/]*?(\d+)(?:\/|$)/)?.[1];
  if(!product)return {status:'wrong_page',candidates:[]};
  const candidates=[],requests=[],seen=new Set();
  let visited=0;
  function walk(node,path,source,inheritedScope) {
    if(++visited>60000 || !node || typeof node!=='object')return;
    if(Array.isArray(node)){node.slice(0,1000).forEach((v,i)=>walk(v,path+'/'+i,source,inheritedScope));return;}
    const scopeId=node.sku || node.skuId || node.productId || node.product_id || inheritedScope;
    if(scopeId && /^\d+$/.test(String(scopeId)) && String(scopeId)!==product)return;
    for(const [key,value] of Object.entries(node)) {
      const full=path+'/'+key;
      if(/sharing|separator|grid|layout|spacer|banner|gallery|recommend|similar/i.test(full))continue;
      const numeric=(typeof value==='number' && Number.isFinite(value)) ||
        (typeof value==='string' && /^\d+(?:[.,]\d+)?\s*(?:kg|g|mm|cm|кг|г|мм|см)?$/i.test(value.trim()));
      if(numeric && /^(weight|grossWeight|packageWeight|weightGross|weightInPackage|length|width|height|depth|packageLength|packageWidth|packageHeight|packageDepth)(?:_?(?:kg|g|mm|cm))?$/i.test(key)) {
        const unit=/weight/i.test(key) ? (node.weightUnit||node.weight_unit||node.unit||null) : (node.dimensionUnit||node.dimension_unit||node.unit||null);
        const id=source+'|'+full+'|'+value;
        if(!seen.has(id)) {
          seen.add(id);
          candidates.push({source,path:full,key,value,unit,
            semantic:/packag|gross|брутто|упаков/i.test(full)?'packaging_candidate':'unclassified_dimension_or_weight',
            sku_scope_verified:String(scopeId||'')===product,
            verified_for_costing:false});
        }
      }
      if(value && typeof value==='object')walk(value,full,source,scopeId);
      else if(typeof value==='string' && /widgetStates/.test(path) && value.startsWith('{') && !/gallery|recommend|similar/i.test(key)) {
        try{walk(JSON.parse(value),full,source,scopeId);}catch(_){}
      }
    }
  }
  for(const el of document.querySelectorAll('[id^="state-"]')) {
    if(/gallery|price|recommend|similar|search|review|question|sharing|separator|grid|layout|spacer|banner/i.test(el.id))continue;
    const raw=el.getAttribute('data-state') || el.textContent;
    if(!raw || raw.length>4000000)continue;
    try {walk(JSON.parse(raw),el.id,'embedded_widget');}catch(_){}
  }
  for(const el of document.querySelectorAll('script[type="application/json"],script[type="application/ld+json"]')) {
    if(el.id==='ozonBuyerPackageNetworkCache' || (el.textContent||'').length>4000000)continue;
    try {walk(JSON.parse(el.textContent),el.id||el.type,'embedded_json');}catch(_){}
  }
  const urls=[...new Set(performance.getEntriesByType('resource').map(v=>v.name))].filter(value=>{
    try {
      const u=new URL(value);
      if(u.origin!==location.origin || !/^\/api\/composer-api\.bx\/page\/json(?:\/|$)/.test(u.pathname))return false;
      const page=u.searchParams.get('url') || '';
      return page.startsWith('/product/') && page.includes(product) && !/reviews|questions/.test(page);
    }catch(_){return false;}
  }).slice(0,3);
  for(const url of urls) {
    try {
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),10000);
      try {
        const response=await fetch(url,{method:'GET',credentials:'same-origin',signal:controller.signal});
        const entry={source:'observed_product_json_response',http_status:response.status};
        requests.push(entry);
        if(response.ok) {
          const raw=await response.text();
          if(raw.length<=4000000)walk(JSON.parse(raw),'response','observed_product_json_response');
        }
      }finally{clearTimeout(timer);}
    }catch(e){requests.push({source:'observed_product_json_response',error:e.name});}
  }
  let network={monitor_installed:false,requests_observed:0,responses_parsed:0};
  try {
    const el=document.getElementById('ozonBuyerPackageNetworkCache');
    if(el){const saved=JSON.parse(el.textContent);if(saved.product_id===product){network=saved;for(const c of saved.candidates||[])if(c.product_id===product)candidates.push(c);}}
  }catch(_){}
  let attributeObservations=null;
  try{const el=document.getElementById('ozonAttributePackageCache');if(el){const v=JSON.parse(el.textContent);if(v.product_id===product)attributeObservations=v;}}catch(_){}
  return {schema_version:2,attribute_observations:attributeObservations,network_monitor:network,product_id:product,captured_at:new Date().toISOString(),
    status:candidates.some(c=>c.semantic==='packaging_candidate')?'packaging_candidates_need_verification':(candidates.length?'unclassified_fields_only':'no_package_fields_found'),
    candidates,requests,nodes_scanned:visited,packaging_verified:false};
}
probeOzonPackageData();
