const vm=require('vm'),fs=require('fs'),assert=require('assert/strict');
let state,blocked=false,writes=0,alarms=0;
const clone=x=>JSON.parse(JSON.stringify(x));
const chrome={storage:{local:{get:async k=>clone(Object.fromEntries((Array.isArray(k)?k:[k]).map(x=>[x,state[x]??null]))),set:async x=>Object.assign(state,clone(x))}},tabs:{create:async()=>({id:9}),update:async()=>({id:9}),get:async()=>({status:'complete'})},scripting:{executeScript:async()=>[{result:blocked?{status:'blocked_verification'}:{product_id:'456',title:'Lamp',properties:[{name:'Power',value:'124W'}]}}]},alarms:{create:async()=>alarms++,clear:async()=>alarms--,onAlarm:{addListener:()=>{}}},runtime:{onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}}}};
chrome.tabs.onUpdated={addListener:()=>{}};const c={syncNativeMarketForSku:async()=>({status:"seller_tabs_not_open"}),ensureSellerCopyForSku:async()=>({status:"disabled"}),showVerificationAttention:async()=>{},chrome,URL,Date,setTimeout:()=>1,clearTimeout:()=>{}};vm.createContext(c);vm.runInContext(fs.readFileSync('browser-extension/selection-filters.js','utf8'),c);vm.runInContext(fs.readFileSync('browser-extension/seller-sync.js','utf8'),c);vm.runInContext(fs.readFileSync('browser-extension/auto-queue.js','utf8'),c);
c.syncSellerVisible=async()=>({status:'seller_tabs_not_open'});
(async()=>{
 state={captureFilters:{},snapshots:{'123':{old:true}},collectionQueue:['https://evil.example/product/777/','https://www.ozon.ru/product/123/','https://www.ozon.ru/product/456/','https://www.ozon.ru/product/x-456/']};
 assert.equal((await c.autoQueueAction({action:'auto-start',limit:5})).planned,1);
 assert.equal(state.autoQueue.phase,'read');await c.autoQueueTick();
 assert.equal(state.autoQueue.status,'completed');assert(state.snapshots['456']);assert(state.snapshots['123'].old);
 delete state.snapshots['456'];blocked=true;await c.autoQueueAction({action:'auto-start',limit:5});await c.autoQueueTick();
 assert.equal(state.autoQueue.status,'paused');assert.equal(state.autoQueue.reason,'verification_required');assert(!state.snapshots['456']);
 blocked=false;await c.autoQueueAction({action:'auto-start',limit:5});await c.autoQueueAction({action:'auto-pause'});await c.autoQueueTick();assert(!state.snapshots['456']);
 await c.autoQueueAction({action:'auto-start',limit:5});await c.autoQueueTick();assert.equal(state.autoQueue.status,'completed');
 console.log('PASS deduplicate SKU, skip stored records, complete and stop, verification pauses, explicit resume, user pause prevents capture');
})();
