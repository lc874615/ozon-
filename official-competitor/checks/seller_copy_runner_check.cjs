const vm=require('vm'),fs=require('fs'),assert=require('assert/strict');let state,removeFails=false,identityMissing=false,blocked=false,notifications=0,delayedInspections=0;
const clone=x=>JSON.parse(JSON.stringify(x));
const fields=['包装长度，毫米','包装宽度，毫米','包装高度，毫米','含包装重量，克'].map((label,i)=>({label,value:String([650,650,100,2500][i])}));
const chrome={storage:{local:{get:async k=>clone(Object.fromEntries((Array.isArray(k)?k:[k]).map(x=>[x,state[x]]))),set:async x=>Object.assign(state,clone(x))}},tabs:{create:async()=>({id:9}),get:async()=>({status:'complete'}),query:async()=>[{id:1}]},scripting:{executeScript:async req=>{
 if(req.files)return [{result:req.files[0]==='form-reader.js'?{fields,captured_at:'2026-10-29',page:{origin:'https://seller.ozon.ru',path:'/app/products/create'}}:undefined}];
 const c=req.args[0];if(blocked)return [{result:{status:'blocked_verification'}}];
 if(c.action==='inspect'&&delayedInspections>0){delayedInspections--;return [{result:{status:'copy_search_not_ready',inspection:{headings:[],copy_route:true}}}];}
 const statuses={inspect:'clean_copy_search',search:'search_entered',copy:'copy_clicked','back-from-parameters':'back_clicked','discard-unsaved':removeFails?'discard_not_available':'discard_clicked','verify-discard':'discard_return_confirmed','draft-identity':'identity_read'};
 if(c.action==='copy')assert.equal(state.sellerCopyJob.phase,'copy_in_flight');
 if(c.action==='discard-unsaved'){assert.equal(state.sellerCopyJob.phase,'discard_in_flight');assert(c.back_clicked);}
 return [{result:{status:statuses[c.action],draft_ids:identityMissing?[]:['777']}}];
}},alarms:{create:async()=>{},clear:async()=>{},onAlarm:{addListener:()=>{}}},runtime:{onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}}}};
const c={chrome,URL,Date,crypto:{randomUUID:()=>String(Math.random())},setTimeout:()=>1,clearTimeout:()=>{},showVerificationAttention:async()=>notifications++};vm.createContext(c);vm.runInContext(fs.readFileSync('browser-extension/seller-copy-runner.js','utf8'),c);
const reset=()=>state={sellerCopyConfig:{tab_id:1,copy_url:'https://seller.ozon.ru/app/products/copy'},sellerEvidence:{}};
const run=async()=>{await c.startSellerCopy('123');for(let i=0;i<20&&state.sellerCopyJob.status==='running';i++)await c.sellerCopyTick();};
(async()=>{reset();await run();assert.equal(state.sellerCopyJob.status,'completed');assert.equal(state.sellerCopyJob.discard_verified,true);assert.equal(state.sellerEvidence['123'].length,4);
 reset();delayedInspections=3;await run();assert.equal(state.sellerCopyJob.status,'completed');assert(state.sellerCopyJob.events.filter(e=>e.status==='copy_search_not_ready').length===3);
 reset();removeFails=true;await run();assert.equal(state.sellerCopyJob.status,'skipped');assert.equal(state.sellerCopyLedger[0].cleanup_required,true);assert.equal((await c.startSellerCopy('123')).status,'seller_already_collected');removeFails=false;
 reset();identityMissing=true;await run();assert.equal(state.sellerCopyJob.status,'completed');assert.equal(state.sellerCopyJob.discard_verified,true);identityMissing=false;
 reset();blocked=true;await run();assert.equal(state.sellerCopyJob.status,'paused');assert.equal(notifications,1);blocked=false;
 console.log('PASS copy/read/back/discard transaction, persisted discard intent, exit failure logged and skipped, no draft ID required, collected SKU not recopied, verification notifies and pauses');})();
