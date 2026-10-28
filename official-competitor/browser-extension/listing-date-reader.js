(() => {
 if(!['seller.ozon.ru','seller.ozonru.cn'].includes(location.hostname)||!/\/app\/analytics\//.test(location.pathname))throw new Error('请打开有权访问的Ozon官方选品分析页面');
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const skuNames=['sku','ozon sku','артикул ozon','sku ozon','ozon商品编号'];
 const dateNames=['дата появления на ozon','дата размещения на ozon','上架日期','上架时间','listing date'];
 const evidence=[],diagnostics=[];
 for(const table of document.querySelectorAll('table,[role="table"],[role="grid"]')){
  const rows=[...table.querySelectorAll('tr,[role="row"]')];
  let headerIndex=-1,headers=[],si=-1,di=-1;
  for(let i=0;i<Math.min(rows.length,8);i++){
   const h=[...rows[i].querySelectorAll('th,td,[role="columnheader"],[role="cell"],[role="gridcell"]')].map(x=>clean(x.innerText).toLowerCase());
   const a=h.findIndex(x=>skuNames.includes(x)),d=h.findIndex(x=>dateNames.includes(x));
   if(a>=0&&d>=0){headerIndex=i;headers=h;si=a;di=d;break;}
  }
  if(headerIndex<0){diagnostics.push({reason:'no_exact_sku_and_listing_date_headers'});continue;}
  for(const row of rows.slice(headerIndex+1)){
   const cells=[...row.querySelectorAll('td,[role="cell"],[role="gridcell"]')];
   const sku=clean(cells[si]?.innerText),raw=clean(cells[di]?.innerText);
   if(!/^\d+$/.test(sku))continue;
   let day=null;if(/^\d{4}-\d{2}-\d{2}$/.test(raw))day=raw;else{const x=raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);if(x)day=x[3]+'-'+x[2]+'-'+x[1];}
   try{if(!day||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)continue;}catch{continue;}
   evidence.push({sku,value:day,label:headers[di],source:'official_analytics_visible_table',source_page:location.origin+location.pathname,captured_at:new Date().toISOString()});
  }
 }
 return {evidence,diagnostics,scope:'loaded_table_rows_only',no_network_requests:true};
})();
