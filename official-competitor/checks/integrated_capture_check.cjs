const vm=require('vm'),fs=require('fs'),assert=require('assert/strict');
let handler,script='collector.js',opened=[];
const state={captureFilters:{},snapshots:{'123':{product_id:'123',old:true}}};
const chrome={runtime:{getManifest:()=>({version:'0.4.2'}),onMessage:{addListener:f=>handler=f}},storage:{local:{get:async k=>Object.fromEntries((Array.isArray(k)?k:[k]).map(x=>[x,state[x]])),set:async x=>Object.assign(state,x)}},tabs:{query:async()=>[{id:7}],create:async x=>opened.push(x)},scripting:{executeScript:async r=>{script=r.files[r.files.length-1];return [{result:script==='link-reader.js'?['https://www.ozon.ru/product/test-123/','https://www.ozon.ru/product/456/']:{product_id:'456',status:'attributes_observed',properties:[{name:'Color',value:'Black'}]}}]}},downloads:{download:async()=>{}}};
const context={captureBuyerSearchSource:async()=>null,chrome,URL,Date,TextEncoder,importScripts:()=>{}};vm.createContext(context);vm.runInContext(fs.readFileSync('browser-extension/selection-filters.js','utf8'),context);vm.runInContext(fs.readFileSync('browser-extension/seller-sync.js','utf8'),context);vm.runInContext(fs.readFileSync('browser-extension/background.js','utf8'),context);
const call=m=>new Promise(r=>handler(m,{},r));
(async()=>{
 assert.equal((await call({action:'save-target',target:0})).status,'error');
 assert.equal((await call({action:'save-target',target:10})).status,'target_saved');
 assert.equal((await call({action:'read-links'})).total,2);
 assert.equal((await call({action:'save-queue',links:'https://evil.example/product/999/ https://www.ozon.ru/product/456/'})).total,2);
 assert.equal((await call({action:'next'})).status,'opened_next');assert.equal(opened[0].url,'https://www.ozon.ru/product/456/');
 assert.equal((await call({action:'capture-buyer'})).collected,2);assert(state.snapshots['123'].old);
 assert.equal((await call({action:'next'})).status,'queue_complete_or_empty');
 assert.equal((await call({action:'status'})).dailyGoal.target,10);
 assert.equal((await call({action:'create-product'})).status,'disabled');
 console.log('PASS target validation, URL validation, queue deduplication, skip saved SKU, preserve historical records, no publishing');
})();
