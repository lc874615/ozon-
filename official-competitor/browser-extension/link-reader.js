(() => {
 if(!['ozon.ru','www.ozon.ru'].includes(location.hostname)) throw new Error('请打开Ozon买家搜索页');
 const links=new Map();
 for(const a of document.querySelectorAll('a[href]')){
  const u=new URL(a.href,location.href);
  if(!['ozon.ru','www.ozon.ru'].includes(u.hostname))continue;
  const id=u.pathname.match(/^\/product\/(?:[^/]*-)?(\d+)\/?$/)?.[1];
  if(id&&!links.has(id))links.set(id,u.origin+u.pathname);
 }
 return [...links.values()].slice(0,500);
})();
