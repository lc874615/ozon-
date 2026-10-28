const vm=require('vm'),fs=require('fs'),assert=require('assert/strict');
const m=JSON.parse(fs.readFileSync('browser-extension/manifest.json','utf8'));
assert.deepEqual(m.host_permissions,['https://www.ozon.ru/*','https://ozon.ru/*']);assert(!m.content_scripts?.length);assert(!m.permissions.includes('cookies'));assert(!m.permissions.includes('tabs'));
assert.deepEqual([...m.permissions].sort(),['activeTab','alarms','downloads','scripting','storage'].sort());
let handler,downloads=[],scriptCalls=0;
const c={importScripts:()=>{},TextEncoder,URL,Date,chrome:{runtime:{getManifest:()=>m,onMessage:{addListener:f=>handler=f}},tabs:{query:async()=>[{id:1}]},scripting:{executeScript:async req=>{scriptCalls++;assert.deepEqual([...req.files],['form-reader.js']);assert.equal(req.target.tabId,1);return [{result:{fields:[{label:'Width',value:'650'}],read_only_attributes:[],coverage:{truncated:false,omitted_sensitive_or_hidden_controls:0}}}];}},storage:{local:{get:async()=>({snapshots:{}})}},downloads:{download:async d=>downloads.push(d)}}};
vm.createContext(c);vm.runInContext(fs.readFileSync('browser-extension/background.js','utf8'),c);
function call(message){return new Promise(resolve=>handler(message,{},resolve));}
(async()=>{assert.equal((await call({action:'queue'})).status,'disabled');assert.equal(scriptCalls,0);
 const r=await call({action:'capture-form',sku_hint:'123'});assert.equal(r.status,'exported_loaded_fields');assert.equal(scriptCalls,1);assert.equal(downloads.length,1);
 const data=JSON.parse(decodeURIComponent(downloads[0].url.split(',').slice(1).join(',')));assert.equal(data.user_supplied_source_sku_hint,'123');assert.equal(data.extension_version,'0.4.6');
 console.log('PASS current-tab user-triggered export, temporary permissions only, data URL download, no batch or cookie access');})();
