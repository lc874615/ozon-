(() => {
 if(!['seller.ozon.ru','seller.ozonru.cn'].includes(location.hostname)||!/\/app\/analytics\//.test(location.pathname))return {status:'not_analysis_page',rows:[]};
 const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
 const period=[...document.querySelectorAll('[aria-selected="true"],[aria-pressed="true"],option:checked')].map(x=>clean(x.textContent)).find(x=>/^(?:28\s*(?:дней|days|天)|(?:近|最近)28天)$/i.test(x));
 const aliases={sku:['sku','ozon sku','артикул ozon','sku ozon','ozon商品编号'],sales:['продано за 28 дней, шт','sales in 28 days','销量（近28天）','近28天销量','продано товаров за 28 дней, шт'],genericSales:['продано, шт','销量','sold units'],brand:['бренд','brand','品牌'],date:['дата появления на ozon','дата размещения на ozon','上架日期','上架时间','listing date']};
 const rows=[],tables=[];
 for(const table of document.querySelectorAll('table,[role="table"],[role="grid"]')){
  const rr=[...table.querySelectorAll('tr,[role="row"]')];let index=-1,headers=[],si=-1;
  for(let i=0;i<Math.min(rr.length,8);i++){
   const h=[...rr[i].querySelectorAll('th,td,[role="columnheader"],[role="cell"],[role="gridcell"]')].map(x=>clean(x.innerText).toLowerCase());const a=h.findIndex(x=>aliases.sku.includes(x));if(a>=0){index=i;headers=h;si=a;break;}
  }
  if(index<0)continue;tables.push({headers:headers.slice(0,40),selected_period:period||null});
  for(const row of rr.slice(index+1)){
   const cells=[...row.querySelectorAll('td,[role="cell"],[role="gridcell"]')],sku=clean(cells[si]?.innerText);if(!/^\d+$/.test(sku))continue;
   const properties=[];
   for(const [key,name] of [['sales','近28天销量'],['brand','品牌'],['date','listing date']]){
    let pos=headers.findIndex(x=>aliases[key].includes(x));if(key==='sales'&&pos<0&&period)pos=headers.findIndex(x=>aliases.genericSales.includes(x));
    let value=clean(cells[pos]?.innerText);if(pos<0||!value)continue;
    if(key==='sales'){value=value.replace(/[\s\u00a0\u202f]/g,'');if(!/^\d+$/.test(value))continue;}
    properties.push({name,value,source:'official_analytics_visible_table',original_label:headers[pos],source_page:location.origin+location.pathname,captured_at:new Date().toISOString(),period_days:key==='sales'?28:null});
   }
   rows.push({sku,properties});
  }
 }
 return {status:rows.length?'rows_read':'no_loaded_rows',rows,tables,scope:'currently_loaded_rows_only',no_network_requests:true};
})();
