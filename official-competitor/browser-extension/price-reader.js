// Read labelled prices only. This is an observed payment-conditional price, not settlement income.
function readOzonPriceWidget(root){
 const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
 if(!root)return {status:'price_widget_missing',bank_price:null,reference_price:null};
 const amount=raw=>{
  const m=clean(raw).match(/^(\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?)\s*(¥|￥|CNY)$/i);if(!m)return null;
  const text=m[1].replace(/[ \u00a0\u202f]/g,'').replace(',','.');const cents=Math.round(Number(text)*100);return Number.isSafeInteger(cents)&&cents>=0?cents:null;
 };
 const crossed=el=>{for(let p=el,i=0;p&&p!==root&&i<5;p=p.parentElement,i++){if(p.matches('del,s,strike,[data-old-price="true"]')||/line-through/i.test(p.getAttribute('style')||''))return true;try{if(p.ownerDocument.defaultView?.getComputedStyle(p).textDecorationLine.includes('line-through'))return true;}catch{}}return false;};
 const moneyIn=node=>{
  const values=[];
  for(const el of node.querySelectorAll('span,div,p,b,strong,del,s')){
   if(el.children.length||crossed(el))continue;
   const n=amount(el.textContent);if(n!==null)values.push(n);
  }
  return [...new Set(values)];
 };
 const labels={bank:['с банками','с ozon картой','с ozon картой и другими банками','银行卡优惠价','银行卡价'],other:['с другими банками','其他银行卡价']};
 const candidates={bank:[],other:[]};
 for(const el of root.querySelectorAll('span,div,p')){
  const name=clean(el.textContent).toLowerCase();const kind=Object.keys(labels).find(k=>labels[k].includes(name));if(!kind)continue;
  if([...el.children].some(c=>clean(c.textContent).toLowerCase()===name))continue;
  for(let parent=el.parentElement,depth=0;parent&&root.contains(parent)&&depth<7;parent=parent.parentElement,depth++){
   const values=moneyIn(parent);if(!values.length)continue;
   if(values.length===1)candidates[kind].push({cents:values[0],label:clean(el.textContent)});
   break;
  }
 }
 // Some widgets replace the bank text with the explicit Ozon payment-price icon.
 // Restrict to that named payment asset and the nearest single-price container.
 for(const img of root.querySelectorAll('img[src]')){
  let u;try{u=new URL(img.getAttribute('src'), 'https://www.ozon.ru');}catch{continue;}
  if(!/^ir(?:-\d+)?\.(?:ozonstatic\.cn|ozone\.ru)$/.test(u.hostname)||!/^\/s3\/payments-cdn\/(?:wc\d+\/)?ozon-price-compact-new-ozon-light\.png$/.test(u.pathname))continue;
  for(let parent=img.parentElement,depth=0;parent&&root.contains(parent)&&depth<7;parent=parent.parentElement,depth++){
   const values=moneyIn(parent);if(!values.length)continue;
   if(values.length===1)candidates.bank.push({cents:values[0],label:'official_ozon_payment_price_icon',source_asset:u.hostname+u.pathname});
   break;
  }
 }
 const unique=kind=>[...new Set(candidates[kind].map(c=>c.cents))];const bank=unique('bank'),other=unique('other');
 const formatted=n=>(n/100).toFixed(2);
 const reference=bank.length===1?{value:formatted(Math.round(bank[0]*110/100)),currency:'CNY',is_estimate:true,source:'user_confirmed_payment_conditional_price_times_1_10',observed_bank_price:formatted(bank[0]),multiplier:'1.10',currency_basis:'user_confirmed_CNY_display_not_symbol_alone',settlement_price_verified:false}:null;
 return {status:bank.length===1?'labelled_bank_price_read':bank.length?'ambiguous_bank_price':'bank_price_label_not_found',bank_price:bank.length===1?formatted(bank[0]):null,other_bank_price:other.length===1?formatted(other[0]):null,currency:'CNY',currency_basis:'user_confirmed_CNY_display_not_symbol_alone',reference_price:reference,candidates};
}
function readShortCharacteristicPairs(root){
 if(!root)return [];
 const clean=x=>String(x||'').replace(/\s+/g,' ').trim();const pairs=[],seen=new Set();
 for(const label of root.querySelectorAll('.tsBodyM,[style*="--textSecondary"]')){
  const name=clean(label.textContent);if(!name||name.length>160)continue;
  for(let row=label.parentElement,depth=0;row&&root.contains(row)&&depth<5;row=row.parentElement,depth++){
   if(row.children.length!==2||!row.children[0].contains(label))continue;
   const left=clean(row.children[0].textContent),value=clean(row.children[1].textContent);
   if(left!==name||!value||value.length>2000)continue;
   const key=name+'\n'+value;if(!seen.has(key)){seen.add(key);pairs.push({name,value,source:'dom:short_explicit_label_value'});}break;
  }
 }
 return pairs;
}
function readOzonBankPriceText(text){
 const raw=String(text||'').replace(/\s+/g,' ').trim();
 const pattern=/(\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?)\s*(¥|￥|CNY)\s*(С банками|С Ozon Картой|银行卡优惠价|银行卡价)/gi;
 const values=[];for(const m of raw.matchAll(pattern)){const cents=Math.round(Number(m[1].replace(/[ \u00a0\u202f]/g,'').replace(',','.'))*100);if(Number.isSafeInteger(cents)&&cents>=0)values.push({cents,label:m[3]});}
 const unique=[...new Set(values.map(v=>v.cents))],one=unique.length===1,price=one?(unique[0]/100).toFixed(2):null;
 return {status:one?'labelled_bank_price_read':unique.length?'ambiguous_bank_price':'bank_price_label_not_found',bank_price:price,other_bank_price:null,currency:'CNY',currency_basis:'user_confirmed_CNY_display_not_symbol_alone',method:'explicit_adjacent_bank_label_in_saved_price_text',reference_price:one?{value:(Math.round(unique[0]*110/100)/100).toFixed(2),currency:'CNY',is_estimate:true,source:'user_confirmed_payment_conditional_price_times_1_10',observed_bank_price:price,multiplier:'1.10',settlement_price_verified:false}:null,candidates:{bank:values}};
}

function withSavedPriceEvidence(data){
 let price=data.price_observation;
 if(!price||['price_widget_missing','bank_price_label_not_found'].includes(price.status))price=readOzonBankPriceText(data.price_widget_text);
 if(!price.reference_price)return data;
 const r=price.reference_price,property={name:'参考售价估计（人民币）',value:r.value,source:r.source,is_estimate:true,currency:'CNY',calculation:'observed_conditional_bank_price × 1.10'};
 const props=[...(data.properties||[])];if(!props.some(p=>p.name===property.name&&p.value===property.value&&p.source===property.source))props.push(property);
 return {...data,properties:props,price_observation:price};
}
