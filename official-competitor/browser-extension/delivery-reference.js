function deliveryReference(texts,now=new Date()){
 const minDays=[],evidence=[];
 const dayMS=86400000;
 const base=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const [y,m,d]=base.split('-').map(Number),today=Date.UTC(y,m-1,d);
 const months=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
 for(const raw of texts){
  const text=String(raw).replace(/\s+/g,' ');
  for(const x of text.matchAll(/(?:через|от|доставка[:：]?|送达|预计送达)\s*(\d+)\s*(?:[–—-]\s*(\d+)\s*)?(?:дн(?:ей|я|ь)|days?|天)/gi)){minDays.push(Number(x[1]));evidence.push({text:x[0],minimum_days:Number(x[1]),method:'explicit_duration'});}
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
