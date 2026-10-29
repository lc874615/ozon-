const vm=require('vm'),fs=require('fs'),assert=require('assert/strict');const c={chrome:{alarms:{onAlarm:{addListener:()=>{}}},runtime:{onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}}}}};vm.createContext(c);for(const f of ['packaging-reader.js','seller-copy-runner.js'])vm.runInContext(fs.readFileSync('browser-extension/'+f,'utf8'),c);
const base={page:{origin:'https://seller.ozon.ru',path:'/app/products/copy',numeric_references:{draft_id:'1'}},fields:[{html_name:'name',label:'名称',value:'Product'},...['包装长度，毫米','包装宽度，毫米','包装高度，毫米','含包装重量，克'].map((label,i)=>({html_name:['depth','width','height','weight'][i],label,value:String([125,65,50,50][i])}))]};
let next=structuredClone(base);next.fields.reverse();next.fields.push({html_name:'attribute#123',label:'材质',value:'Steel'});next.fields[0].section_heading='Loaded section';assert(c.compareParameterForms(base,next).compatible);
next=structuredClone(base);next.fields[1].value='126';assert(!c.compareParameterForms(base,next).compatible);
next=structuredClone(base);next.fields[0].value='Other product';assert(!c.compareParameterForms(base,next).compatible);
next=structuredClone(base);next.page.numeric_references.draft_id='2';assert(!c.compareParameterForms(base,next).compatible);
next=structuredClone(base);next.fields.pop();assert(!c.compareParameterForms(base,next).compatible);
console.log('PASS ordering, section metadata and new loaded fields do not block exit; changed product, draft identity or packaging values still block');
