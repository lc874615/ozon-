const internationalBrands=['apple','samsung','sony','lg','philips','panasonic','dyson','bosch','siemens','makita','dewalt','nike','adidas','puma','reebok','new balance','gucci','louis vuitton','prada','chanel','dior','hermes','rolex','cartier','lego','ikea','xiaomi','huawei','oneplus','lenovo','asus','acer','dell','hp','canon','nikon','bose','jbl','nintendo','microsoft','dji','godox'];
// Evaluate only explicit, labelled observations. Missing evidence is review, never pass.
function parseFilterSettings(raw={}){
 const date=String(raw.after_date||'');
 if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))throw new Error('请输入有效上架日期');
 const number=(v,name)=>{if(v===undefined||v===null||String(v).trim()==='')return null;const n=Number(v);if(!Number.isFinite(n)||n<0)throw new Error(name+'必须是非负数');return n;};
 const min=number(raw.amount_min,'金额下限'),max=number(raw.amount_max,'金额上限');
 if(min!==null&&max!==null&&min>max)throw new Error('金额下限不能高于上限');
 const sales=number(raw.min_sold28??6,'最低销量');if(sales===null||!Number.isInteger(sales)||sales<1)throw new Error('最低销量须为正整数');
 const mode=raw.amount_metric||'unit_price';if(!['unit_price','revenue28'].includes(mode))throw new Error('金额口径无效');
 return {after_date:date||null,amount_min:min,amount_max:max,amount_metric:mode,min_sold28:sales,period_days:28,currency:'CNY',fulfillment_mode:'delivery_at_least_7_days_heuristic',minimum_delivery_days:7,exclude_international_brands:true,brand_exclusions:internationalBrands};
}
function evaluateCaptureFilters(data,settings){
 const f=parseFilterSettings(settings),checks=[],props=data.properties||[];
 const norm=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
 const values=names=>props.filter(p=>names.includes(norm(p.name))).map(p=>({value:String(p.value).trim(),source:p.source||'labelled_product_property',label:p.name,is_estimate:!!p.is_estimate,calculation:p.calculation||null}));
 const one=names=>{const a=values(names);return a.length&&new Set(a.map(x=>norm(x.value))).size===1?a[0]:null;};
 const push=(field,state,evidence=null)=>checks.push({field,state,evidence});
 const scheme=one(['схема продаж','sales schema','履约方式','发货方式']);
 let e=one(['参考最短送达天数']);const delivery=e&&/^\d+$/.test(e.value)?Number(e.value):null;
 const schemes=scheme?norm(scheme.value).split(/[,，;|\s]+/).filter(Boolean):[];
 const mixed=schemes.includes('fbs')&&schemes.includes('fbo');
 push('delivery_at_least_7_days',mixed?(delivery===null?'review':delivery>=7?'pass':'exclude'):scheme&&norm(scheme.value)==='fbs'?'pass':scheme&&['fbo','rfbs','real fbs'].includes(norm(scheme.value))?'exclude':delivery===null?'review':delivery>=7?'pass':'exclude',mixed?{...scheme,delivery_days:delivery,delivery_evidence:e||null}:scheme||e);
 const brandRows=values(['бренд','brand','品牌']);
 const blocked=brandRows.find(row=>internationalBrands.includes(norm(row.value)));
 const title=norm(data.title);const titleSignal=internationalBrands.find(b=>new RegExp('(^|[^a-z0-9])'+b.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z0-9]|$)','i').test(title));
 push('international_brand_exclusion',blocked?'exclude':titleSignal?'review':brandRows.some(r=>['无品牌','без бренда','нет бренда','no brand','unbranded'].includes(norm(r.value)))?'pass':'review',blocked||(titleSignal?{source:'title_brand_signal_not_identity_proof',value:titleSignal}:brandRows[0]||{source:'brand_identity_not_verified',value:'missing'}));
 const category=one(['类目和类型 *','类目和类型','категория','category','类目']);
 const forbidden=category&&/(?:药品|服装|服饰|лекарств|медикамент|одежд|\bclothing\b|\bapparel\b|\bmedicines\b)/i.test(category.value);
 if(forbidden)push('excluded_category','exclude',category);
 const banned=one(['平台禁售禁运核查','ozon prohibited check','ogl禁运核查']);
 if(banned&&['禁止','禁运','禁售','prohibited','not allowed'].includes(norm(banned.value)))push('prohibited_goods','exclude',banned);
 const digits=s=>/^\d+$/.test(s)?Number(s):null;
 e=one(['продано за 28 дней, шт','sales in 28 days','销量（近28天）','近28天销量']);
 const sold=e?digits(e.value):null;push('sold28',sold===null?'review':sold>=f.min_sold28?'pass':'exclude',e);
 {
  e=one(['дата появления на ozon','дата размещения на ozon','上架日期','listing date']);
  let day=null;if(e){let x=e.value.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(x)day=e.value;else {x=e.value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);if(x)day=x[3]+'-'+x[2]+'-'+x[1];}}
  if(day){try{if(new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)day=null;}catch{day=null;}}
  push('listed_after',!day?'review':!f.after_date||day>f.after_date?'pass':'exclude',e);
 }
 {
  const names=f.amount_metric==='unit_price'?['售价（人民币）','销售价格（人民币）','sale price, cny']:['近28天销售额（人民币）','sales revenue in 28 days, cny'];
  e=values(names).length?one(names):f.amount_metric==='unit_price'?one(['参考售价估计（人民币）']):null;const amount=e&&/^\d+(?:\.\d+)?$/.test(e.value)?Number(e.value):null;
  push(f.amount_metric,amount===null||!Number.isFinite(amount)?'review':(f.amount_min===null||amount>=f.amount_min)&&(f.amount_max===null||amount<=f.amount_max)?'pass':'exclude',e);
 }
 return {decision:checks.some(x=>x.state==='exclude')?'exclude':checks.some(x=>x.state==='review')?'review':'pass',settings:f,checks,scope:'observed_evidence_only_not_listing_approval'};
}

function withListingEvidence(data,evidence={}){
 const rows=evidence[data.product_id]||[];
 return {...data,properties:[...(data.properties||[]),...rows.map(e=>({name:'listing date',value:e.value,source:e.source,original_label:e.label,source_page:e.source_page,captured_at:e.captured_at}))]};
}

// Final collection gate is separate from preliminary product eligibility.
function applyCollectionCompleteness(review,data,sellerProperties=[]){
 if(['page_load_timeout','wrong_or_empty_product_page','cannot_prepare_characteristics','images_missing_after_recheck','attributes_missing_after_bounded_preparation'].includes(data.collection_issue)||['seller_search_no_results','packaging_missing_after_recheck'].includes(data.seller_collection_outcome?.reason))return {...review,decision:'exclude',checks:[...review.checks,{field:data.collection_issue||data.seller_collection_outcome.reason,state:'exclude',evidence:{reason:data.collection_issue||data.seller_collection_outcome.reason}}]};
 // Formal results always require complete collection, including historical records.
 if(review.decision!=='pass')return review;
 const packaging=extractPackaging({fields:sellerProperties.map(p=>({label:p.name,value:p.value}))});
 const outcome=data.seller_collection_outcome||{};
 const catalogue=sellerProperties.find(p=>/^(?:类目和类型\s*\*?|категория|category|类目)$/i.test(p.name||''));
 const carrier=sellerProperties.find(p=>p.name==='OGL嘉兴承运资格'&&['已确认可承运','eligible'].includes(String(p.value))&&p.verified===true);
 const tasks=[...(data.collection_todos||[]),...(outcome.collection_todos||[]),...(!catalogue?[{code:'category_not_verified'}]:[]),...(!carrier?[{code:'carrier_not_verified'}]:[])];

 const checks=[{field:'no_pending_tasks',state:tasks.length?'review':'pass',evidence:tasks},{field:'buyer_images',state:data.images?.length?'pass':'review',evidence:{count:(data.images||[]).length}},{field:'packaging_complete',state:packaging.complete?'pass':'review',evidence:{values:packaging.values,missing:packaging.missing}},
 {field:'copy_exit_state',state:!outcome.cleanup_required&&(outcome.already_collected===true&&outcome.discard_verified===true||outcome.terminal_status==='completed'&&outcome.discard_verified===true)?'pass':'review',evidence:outcome}];
 return {...review,checks:[...review.checks,...checks],decision:review.decision==='exclude'?'exclude':review.decision==='review'||checks.some(c=>c.state==='review')?'review':'pass'};
}

function mandatorySelectionGaps(review){
 if(review.decision==='exclude')return [];
 return ['sold28','listed_after','unit_price','delivery_at_least_7_days'].filter(name=>!review.checks.some(c=>c.field===name&&c.state==='pass'));
}
