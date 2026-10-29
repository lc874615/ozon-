// Normalize only explicit packaging dimensions/gross weight; preserve source labels and units.
function extractPackaging(form){
 const candidates=[],diagnostics=[],clean=x=>String(x??'').replace(/\s+/g,' ').trim();
 const rows=[...(form?.fields||[]),...(form?.read_only_attributes||[])];
 for(const row of rows){
  const label=clean(row.label).replace(/\s*[*＊]\s*$/,'');const context=clean(row.section_heading);
  if(!/包装|упаков|packag|packed|gross|毛重/i.test(label+' '+context))continue;
  let key;if(/毛重|重量|вес|weight/i.test(label))key='gross_weight_g';else if(/宽|ширин|width/i.test(label))key='width_mm';else if(/高|высот|height/i.test(label))key='height_mm';else if(/长|深|длин|глубин|length|depth/i.test(label))key='length_mm';else continue;
  const raw=clean(row.value);if(!raw)continue;
  const match=raw.match(/^(\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?)\s*([A-Za-zА-Яа-яЁё\u4e00-\u9fff]*)$/);
  if(!match){diagnostics.push({key,label,reason:'non_numeric_packaging_value'});continue;}
  const value=Number(match[1].replace(/[ \u00a0\u202f]/g,'').replace(',','.'));
  if(!Number.isFinite(value)||value<=0){diagnostics.push({key,label,reason:'non_positive_packaging_value'});continue;}
  const unitText=[label,...(row.unit_text_candidates||[]),match[2]].join(' ').toLowerCase();
  const units=[];const has=(r,u)=>{if(r.test(unitText))units.push(u);};
  if(key==='gross_weight_g'){
   has(/千克|公斤|\bkg\b|(?:^|[\s,(（，])кг(?=$|[\s,)），])/i,'kg');
   has(/(?:^|[^千])克|\bg\b|(?:^|[\s,(（，])г(?=$|[\s,)），])/i,'g');
  }else{
   has(/毫米|\bmm\b|(?:^|[\s,(（，])мм(?=$|[\s,)），])/i,'mm');
   has(/厘米|\bcm\b|(?:^|[\s,(（，])см(?=$|[\s,)），])/i,'cm');
  }
  const unique=[...new Set(units)];
  if(unique.length!==1){diagnostics.push({key,label,reason:unique.length?'conflicting_units':'unit_not_confirmed'});continue;}
  const unit=unique[0],normalized=value*(unit==='kg'?1000:unit==='cm'?10:1);
  candidates.push({key,value:Number(normalized.toFixed(6)),source_label:label,source_value:raw,source_unit:unit,source_type:row.source||'form_control',visible:row.visible!==false});
 }
 const values={},conflicts=[];
 for(const key of ['length_mm','width_mm','height_mm','gross_weight_g']){
  const all=candidates.filter(x=>x.key===key);const visible=all.filter(x=>x.visible);const considered=visible.length?visible:all;
  const unique=[...new Set(considered.map(x=>x.value))];
  if(unique.length===1)values[key]=unique[0];else if(unique.length>1)conflicts.push({key,values:unique});
 }
 const missing=['length_mm','width_mm','height_mm','gross_weight_g'].filter(k=>values[k]===undefined);
 const canonical={length_mm:'包装长度，毫米',width_mm:'包装宽度，毫米',height_mm:'包装高度，毫米',gross_weight_g:'含包装重量，克'};
 const properties=Object.entries(values).map(([key,value])=>({name:canonical[key],value:String(value),normalized_key:key,unit:key==='gross_weight_g'?'g':'mm',original_observations:candidates.filter(x=>x.key===key&&x.value===value)}));
 return {status:conflicts.length?'conflict':missing.length?'incomplete':'complete',complete:missing.length===0&&conflicts.length===0,values,missing,conflicts,candidates,diagnostics,properties};
}
