// ozon_attribute_monitor_v1
(() => {
  if(window.__ozonAttributeMonitor)return;
  window.__ozonAttributeMonitor=true;
  const records=[],seen=new Set();
  const sku=()=>location.pathname.match(/^\/product\/[^/]*?(\d+)(?:\/|$)/)?.[1];
  function publish(){
    if(!document.documentElement)return;
    let el=document.getElementById('ozonAttributePackageCache');
    if(!el){el=document.createElement('script');el.type='application/json';el.id='ozonAttributePackageCache';document.documentElement.appendChild(el);}
    el.textContent=JSON.stringify({installed:true,product_id:sku(),records});
  }
  function text(v){
    if(typeof v==='string'||typeof v==='number')return String(v);
    if(Array.isArray(v))return v.map(text).join(' ');
    return v&&typeof v==='object'?text(v.text??v.value??v.title??''):'';
  }
  function inspect(raw,url,product){
    if(product!==sku())return;
    try{
      if(typeof raw==='string'){if(raw.length>4000000)return;raw=JSON.parse(raw);}
      let count=0;
      function walk(node,path,scope){
        if(++count>60000||!node||typeof node!=='object')return;
        if(Array.isArray(node)){node.slice(0,1000).forEach((v,i)=>walk(v,path+'/'+i,scope));return;}
        scope=node.sku??node.skuId??node.productId??node.product_id??scope;
        if(scope&&/^\d+$/.test(String(scope))&&String(scope)!==product)return;
        if(/characteristic|attribute|specification/i.test(path)){
          const label=text(node.name??node.title??node.label??node.key??'').trim();
          const value=text(node.values??node.value??node.content??'').trim();
          if(label&&label.length<160&&value&&value.length<200&&/weight|packag|gross|net|dimension|length|width|height|depth|вес|упаков|брутто|нетто|габарит|размер|длина|ширина|высота/i.test(label)){
            const id=product+'|'+label+'|'+value;
            if(!seen.has(id)&&records.length<150){
              seen.add(id);records.push({label,value,product_id:product,sku_scope_verified:String(scope??'')===product,
                source:'observed_product_attribute',request_path:new URL(url,location.href).pathname,
                semantic:/net|нетто/i.test(label)?'net_weight':(/packag|gross|упаков|брутто/i.test(label)?'packaging_label':'product_or_ambiguous_label'),verified_for_costing:false});
            }
          }
        }
        for(const [key,value] of Object.entries(node)){
          if(/cookie|token|password|authorization|email|phone|address|session|private|review|question|recommend|similar/i.test(key))continue;
          if(value&&typeof value==='object')walk(value,path+'/'+key,scope);
          else if(typeof value==='string'&&/widgetStates/.test(path)&&value.startsWith('{')&&value.length<4000000){try{walk(JSON.parse(value),path+'/'+key,scope);}catch(_){}}
        }
      }
      walk(raw,'response',null);publish();
    }catch(_){}
  }
  function eligible(url){try{const u=new URL(url,location.href);return sku()&&u.origin===location.origin&&/^\/api\/(composer|entrypoint)-api\.bx\/(page|widget)\/json\//.test(u.pathname);}catch(_){return false;}}
  const fetchOriginal=window.fetch;
  window.fetch=function(...args){
    const url=typeof args[0]==='string'?args[0]:(args[0]?.url||String(args[0]));
    const product=sku(),observe=eligible(url);
    return Reflect.apply(fetchOriginal,this,args).then(r=>{if(observe&&r.ok&&/json/.test(r.headers.get('content-type')||''))r.clone().text().then(raw=>inspect(raw,url,product)).catch(()=>{});return r;});
  };
  const open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send,urls=new WeakMap();
  XMLHttpRequest.prototype.open=function(method,url,...rest){urls.set(this,String(url));return Reflect.apply(open,this,[method,url,...rest]);};
  XMLHttpRequest.prototype.send=function(...args){const url=urls.get(this),product=sku();if(eligible(url))this.addEventListener('load',()=>{try{if(this.status>=200&&this.status<300)inspect(this.responseType==='json'?this.response:this.responseText,url,product);}catch(_){}},{once:true});return Reflect.apply(send,this,args);};
  document.addEventListener('DOMContentLoaded',publish,{once:true});publish();
})();
