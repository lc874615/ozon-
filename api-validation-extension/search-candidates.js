// Bounded normal search JSON discovery, follows only server-provided nextPage.
async function discoverSearchCandidates(mode,value,limit){
 if(!['www.ozon.ru','ozon.ru'].includes(location.hostname))return {status:'invalid_context'};
 let route;if(mode==='keyword')route='/search/?'+new URLSearchParams({text:value});else{try{const u=new URL(value,location.origin);if(u.origin!==location.origin||!/^\/(category|search)\//.test(u.pathname))return {status:'invalid_category_url'};route=u.pathname+u.search;}catch{return {status:'invalid_category_url'};}}
 const ids=new Set(),pages=new Set();let next=route;
 for(let page=0;page<5&&next&&ids.size<limit;page++){
  if(pages.has(next))break;pages.add(next);const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);
  try{const r=await fetch('/api/entrypoint-api.bx/page/json/v2?'+new URLSearchParams({url:next}),{credentials:'include',signal:c.signal});if(!r.ok)return {status:[401,403,429].includes(r.status)?'access_or_rate_limit':'http_error',http_status:r.status};const raw=await r.text();if(raw.length>6000000)return {status:'response_too_large'};const d=JSON.parse(raw);if(d.incidentId||d.challengeURL||d.blockURL)return {status:'blocked_verification'};next=null;
   const walk=(x,depth=0)=>{if(depth>18||!x)return;if(typeof x==='string'){if(/^\s*[{[]/.test(x)){try{walk(JSON.parse(x),depth+1);}catch{}}if(x.startsWith('/product/')){const id=x.split('?')[0].match(/(?:-|\/)(\d+)\/?$/)?.[1];if(id&&ids.size<limit)ids.add(id);}return;}if(typeof x==='object')for(const [k,v]of Object.entries(x).slice(0,300)){if(k==='nextPage'&&typeof v==='string'){try{const u=new URL(v,location.origin);if(u.origin===location.origin&&/^\/(search|category)\//.test(u.pathname))next=u.pathname+u.search;}catch{}}walk(v,depth+1);}};walk(d);
  }catch{return {status:'search_read_failed'};}finally{clearTimeout(timer);}
 }
 return {status:ids.size?'search_candidates_read':'search_candidates_empty',skus:[...ids],pages_read:pages.size,bounded:true,candidate_limit:limit,more_available:!!next};
}
