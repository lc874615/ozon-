(() => {
  if(window.__ozonPackageMonitorInstalled)return;
  window.__ozonPackageMonitorInstalled=true;
  const cache={version:2,diagnostics:[],monitor_installed:true,requests_observed:0,responses_parsed:0,parse_errors:0,candidates:[]};
  const seen=new Set();
  const sku=()=>location.pathname.match(/^\/product\/[^/]*?(\d+)(?:\/|$)/)?.[1];
  function publish() {
    if(!document.documentElement)return;
    let el=document.getElementById('ozonBuyerPackageNetworkCache');
    if(!el){el=document.createElement('script');el.type='application/json';el.id='ozonBuyerPackageNetworkCache';document.documentElement.appendChild(el);}
    el.textContent=JSON.stringify({...cache,product_id:sku(),updated_at:new Date().toISOString()});
  }
  function eligible(url) {
    try {const u=new URL(url,location.href);return sku() && u.origin===location.origin && /^\/api\//.test(u.pathname) && !/cart|basket|checkout|payment|account|profile|auth|order|address|message/i.test(u.pathname);}catch(_){return false;}
  }
  function consume(data,product,requestPath) {
    let nodes=0;
    const diagnostic={request_path:requestPath,nodes_scanned:0,widget_names:[],related_fields:[],truncated:false};
    const sensitive=/cookie|token|password|authorization|email|phone|address|session|private/i;
    const related=/weight|dimension|packag|gross|length|width|height|depth|брутто|упаков|вес|габарит|размер/i;
    const safePath=path=>path.split('/').map(v=>/^[a-zA-Z0-9_.:\-\u0400-\u04ff]{1,100}$/.test(v)?v:'[key]').join('/');
    function walk(node,path,inheritedScope) {
      if(++nodes>80000){diagnostic.truncated=true;return;} if(!node || typeof node!=='object')return;
      if(Array.isArray(node)){node.slice(0,1000).forEach((v,i)=>walk(v,path+'/'+i,inheritedScope));return;}
      const scope=node.sku || node.skuId || node.productId || node.product_id || inheritedScope;
      if(scope && /^\d+$/.test(String(scope)) && String(scope)!==product)return;
      for(const [key,value] of Object.entries(node)) {
        const full=path+'/'+key;
        if(sensitive.test(key))continue;
        if(/widgetStates$/.test(path) && diagnostic.widget_names.length<60)diagnostic.widget_names.push(safePath(key));
        if(related.test(key) && diagnostic.related_fields.length<80)diagnostic.related_fields.push({path:safePath(full),type:Array.isArray(value)?'array':typeof value});
        if(/sharing|separator|grid|layout|spacer|banner|gallery|recommend|similar/i.test(full))continue;
        const numeric=(typeof value==='number' && Number.isFinite(value) && value>0) ||
          (typeof value==='string' && /^\d+(?:[.,]\d+)?$/.test(value.trim()) && Number(value.replace(',','.'))>0);
        if(numeric && /^(weight|grossWeight|packageWeight|weightGross|weightInPackage|length|width|height|depth|packageLength|packageWidth|packageHeight|packageDepth)(?:_?(?:kg|g|mm|cm))?$/i.test(key)) {
          const unit=/weight/i.test(key)?(node.weightUnit||node.weight_unit||node.unit||null):(node.dimensionUnit||node.dimension_unit||node.unit||null);
          const id=product+'|'+requestPath+'|'+full+'|'+value;
          if(!seen.has(id) && cache.candidates.length<400) {
            seen.add(id);cache.candidates.push({source:'observed_buyer_network_response',request_path:requestPath,path:full,key,value,unit,
              product_id:product,sku_scope_verified:String(scope||'')===product,
              semantic:/packag|gross|брутто|упаков/i.test(full)?'packaging_candidate':'unclassified_dimension_or_weight',verified_for_costing:false});
          }
        }
        if(value && typeof value==='object')walk(value,full,scope);
        else if(typeof value==='string' && /widgetStates/.test(path) && value.startsWith('{') && value.length<4000000){try{walk(JSON.parse(value),full,scope);}catch(_){}}
      }
    }
    walk(data,'response',null);
    diagnostic.nodes_scanned=nodes;
    if(cache.diagnostics.length<40)cache.diagnostics.push(diagnostic);
    publish();
  }
  function parse(raw,product,url) {
    try {
      if(typeof raw==='string') {if(raw.length>4000000)return;raw=JSON.parse(raw);}
      cache.responses_parsed++;consume(raw,product,new URL(url,location.href).pathname);
    }catch(_){cache.parse_errors++;publish();}
  }
  const nativeFetch=window.fetch;
  window.fetch=function(...args) {
    const url=typeof args[0]==='string'?args[0]:(args[0]?.url || String(args[0]));
    const product=sku(),observe=eligible(url);
    const promise=Reflect.apply(nativeFetch,this,args);
    if(observe){cache.requests_observed++;publish();}
    return promise.then(response=>{
      if(observe && response.ok && /json/.test(response.headers.get('content-type')||'')) {
        response.clone().text().then(raw=>parse(raw,product,url)).catch(()=>{cache.parse_errors++;publish();});
      }
      return response;
    });
  };
  const open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send,urls=new WeakMap();
  XMLHttpRequest.prototype.open=function(method,url,...rest){urls.set(this,String(url));return Reflect.apply(open,this,[method,url,...rest]);};
  XMLHttpRequest.prototype.send=function(...args){
    const url=urls.get(this),product=sku();
    if(eligible(url)) {
      cache.requests_observed++;publish();
      this.addEventListener('load',()=>{
        try{if(this.status>=200 && this.status<300 && /json/.test(this.getResponseHeader('content-type')||''))parse(this.responseType==='json'?this.response:this.responseText,product,url);}catch(_){cache.parse_errors++;publish();}
      },{once:true});
    }
    return Reflect.apply(send,this,args);
  };
  document.addEventListener('DOMContentLoaded',publish,{once:true});publish();
})();
