function inspectBuyerSearch(action='read'){
 const u=new URL(location.href);if(!['ozon.ru','www.ozon.ru'].includes(u.hostname))return {status:'not_search_page'};
 const visible=e=>!!e.getClientRects().length,text=(document.body?.innerText||'').slice(0,12000);
 if(/captcha|验证码|проверка безопасности|доступ ограничен|访问受限|access denied/i.test(text))return {status:'blocked_verification'};
 if(!/^\/(?:search|category)(?:\/|$)/.test(u.pathname))return {status:'not_search_page'};
 if(document.querySelector('input[type=password]'))return {status:'seller_login_required'};
 const anchors=[...document.querySelectorAll('a[href]')].filter(visible),links=new Map();
 for(const a of anchors){try{const x=new URL(a.href);const sku=x.pathname.match(/^\/product\/(?:[^/]*-)?(\d+)\/?$/)?.[1];if(x.protocol==='https:'&&['ozon.ru','www.ozon.ru'].includes(x.hostname)&&sku)links.set(sku,x.origin+x.pathname);}catch{}}
 const page=Number(u.searchParams.get('page')||1);let next=null;
 for(const a of anchors){try{const x=new URL(a.href);if(x.origin!==u.origin||x.pathname!==u.pathname)continue;const nextPage=Number(x.searchParams.get('page'));if(!Number.isInteger(nextPage)||nextPage!==page+1)continue;
 const old=new URLSearchParams(u.search);old.delete('page');const fresh=new URLSearchParams(x.search);fresh.delete('page');old.sort();fresh.sort();if(old.toString()!==fresh.toString())continue;
 next=x.href;break;}catch{}}
 if(action==='scroll')window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});
 return {status:'search_page_read',url:u.href,links:[...links.values()].slice(0,500),next_url:next};
}
