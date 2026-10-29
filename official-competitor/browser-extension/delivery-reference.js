function deliveryReference(texts,now=new Date()){
 const minDays=[],evidence=[];
 const dayMS=86400000;
 const base=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const [y,m,d]=base.split('-').map(Number),today=Date.UTC(y,m-1,d);
 const months=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
 for(const raw of texts){
  const text=String(raw).replace(/\s+/g,' ');
  for(const x of text.matchAll(/(?:через|от|доставка[:：]?|доставим[:：]?|送达|预计送达)\s*(\d+)\s*(?:(?:[–—-]|до)\s*(\d+)\s*)?(?:дн(?:ей|я|ь)|days?|天)/gi)){minDays.push(Number(x[1]));evidence.push({text:x[0],minimum_days:Number(x[1]),method:'explicit_duration'});}
  for(const x of text.matchAll(/(\d{1,2})\s*(?:[–—-]\s*\d{1,2}\s*)?(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(20\d{2}))?/gi)){
   const month=months.indexOf(x[2].toLowerCase()),day=Number(x[1]);let year=x[3]?Number(x[3]):y;
   if(!x[3]&&m===12&&month===0)year++;
   const target=Date.UTC(year,month,day),date=new Date(target);
   if(date.getUTCDate()!==day||date.getUTCMonth()!==month)continue;
   const diff=(target-today)/dayMS;if(diff<0||diff>180)continue;
   minDays.push(diff);evidence.push({text:x[0],minimum_days:diff,method:'displayed_calendar_date_reference',base_date:base,timezone_reference:'Europe/Moscow',year_inferred:!x[3]});
  }
  if(/(?:^|\s)завтра(?:\s|$|[,.])/i.test(text)){minDays.push(1);evidence.push({minimum_days:1,method:'tomorrow_reference'});}
  if(/(?:^|\s)сегодня(?:\s|$|[,.])/i.test(text)){minDays.push(0);evidence.push({minimum_days:0,method:'today_reference'});}
 }
 return {minimum_days:minDays.length?Math.min(...minDays):null,evidence,actual_fulfillment_scheme_verified:false};
}

function readBuyerDelivery(root=document,now=new Date()){
 const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
 const visible=e=>!!e.getClientRects().length;
 const timePatterns=[/(?:через|от|доставка[:：]?|доставим[:：]?|送达|预计送达)\s*\d+\s*(?:(?:[–—-]|до)\s*\d+\s*)?(?:дн(?:ей|я|ь)|days?|天)/gi,/\d{1,2}\s*(?:[–—-]\s*\d{1,2}\s*)?(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+20\d{2})?/gi,/(?:^|\s)(?:завтра|сегодня)(?=\s|$|[,.])/gi];
 const snippets=[],sources=[];const add=(text,source)=>{for(const pattern of timePatterns)for(const m of String(text).matchAll(pattern)){const fragment=clean(m[0]);if(!snippets.includes(fragment))snippets.push(fragment);if(!sources.includes(source))sources.push(source);}};
 const widgets=[...root.querySelectorAll('[data-widget]')].filter(e=>visible(e)&&/delivery|shipping|logistic|currentseller|offerwarehouse|transport/i.test(e.getAttribute('data-widget')||''));
 for(const e of widgets)add(e.innerText,'delivery_widget');
 // The buy button often contains the delivery promise without any delivery-named widget.
 const labels=/доставим|доставка|привез[её]м|получите|预计送达|送达|delivery/i;
 const nodes=[...root.querySelectorAll('button,[role="button"],a,span,div')].filter(visible);
 for(const e of nodes){
  const text=clean(e.innerText||e.textContent);if(!text||text.length>220||!labels.test(text))continue;
  if(e.children.length&&![...e.children].every(child=>!labels.test(clean(child.innerText||child.textContent))))continue;
  add(text,'explicit_delivery_promise');
  // A label and its date may be adjacent spans inside the same compact row/button.
  if(!/завтра|сегодня|\d/i.test(text)){
   for(let parent=e.parentElement,depth=0;parent&&parent!==root.body&&depth<2;parent=parent.parentElement,depth++){
    const context=clean(parent.innerText);if(context.length>220)break;add(context,'labelled_delivery_row');
   }
  }
 }
 const result=deliveryReference(snippets,now);
 return {texts:snippets,...result,widget_names:widgets.map(e=>e.getAttribute('data-widget')),sources,note:snippets.length?'time_fragments_only_no_destination_address':'no_readable_delivery_promise'};
}
