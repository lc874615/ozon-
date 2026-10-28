let sellerCopyBusy=false,sellerCopyTimer=null;
const COPY_ALARM='ozon-seller-copy-workflow';
function wakeSellerCopy(ms=2000){if(sellerCopyTimer!==null)clearTimeout(sellerCopyTimer);sellerCopyTimer=setTimeout(()=>{sellerCopyTimer=null;sellerCopyTick();},ms);}
async function copyUi(tabId,command){
 await chrome.scripting.executeScript({target:{tabId},files:['seller-copy-ui.js']});
 return (await chrome.scripting.executeScript({target:{tabId},func:c=>sellerCopyUi(c),args:[command]}))[0]?.result;
}
async function stopSellerCopy(reason){
 const {sellerCopyJob:j,sellerCopyBatch:b}=await chrome.storage.local.get(['sellerCopyJob','sellerCopyBatch']);
 if(j?.status==='running'){j.status='paused';j.reason=reason;j.cleanup_required=Boolean(j.copy_intent_at&&!j.deletion_verified);await chrome.storage.local.set({sellerCopyJob:j});if(b?.status==='running'){b.status='paused';b.reason=reason;await chrome.storage.local.set({sellerCopyBatch:b});}}
 await chrome.alarms.clear(COPY_ALARM);if(sellerCopyTimer!==null){clearTimeout(sellerCopyTimer);sellerCopyTimer=null;}
 if(/verification|access|denied|403|429/i.test(reason))await showVerificationAttention(j?.tab_id,'seller',reason);
 return {status:'seller_copy_paused',reason,cleanup_required:j?.cleanup_required||false};
}
async function finishSellerCopySkip(reason){
 const {sellerCopyJob:j,sellerCopyLedger=[]}=await chrome.storage.local.get(['sellerCopyJob','sellerCopyLedger']);
 if(!j||j.status!=='running')return {status:'no_running_task'};
 j.status='skipped';j.reason=reason;j.cleanup_required=Boolean(j.copy_intent_at&&!j.deletion_verified);j.finished_at=new Date().toISOString();
 if(!sellerCopyLedger.some(e=>e.id===j.id))sellerCopyLedger.push({id:j.id,sku:j.sku,tab_id:j.tab_id,draft_id:j.draft_id||null,cleanup_required:j.cleanup_required,reason,at:j.finished_at});
 await chrome.storage.local.set({sellerCopyJob:j,sellerCopyLedger});await chrome.alarms.clear(COPY_ALARM);await advanceSellerBatch();return {status:'seller_copy_skipped',cleanup_required:j.cleanup_required,reason};
}
async function startSellerCopyBatch(limit){
 const n=Number(limit||1);if(!Number.isInteger(n)||n<1||n>100)throw new Error('本批件数须为1至100');
 const {collectionQueue=[],sellerCopyBatch:old,sellerCopyConfig:config,sellerCopyJob:job,sellerCopyLedger=[]}=await chrome.storage.local.get(['collectionQueue','sellerCopyBatch','sellerCopyConfig','sellerCopyJob','sellerCopyLedger']);
 if(!config)throw new Error('请先在干净复制搜索页启用流程');
 if(old?.status==='running'||job?.status==='running')throw new Error('已有任务运行，请勿重复启动');
 const blocked=new Set(sellerCopyLedger.filter(e=>e.cleanup_required).map(e=>e.sku));
 const skus=[...new Set(collectionQueue.map(u=>{try{const x=new URL(u);return ['ozon.ru','www.ozon.ru'].includes(x.hostname)?x.pathname.match(/(?:-|\/)(\d+)\/?$/)?.[1]:null;}catch{return null;}}).filter(x=>x&&!blocked.has(x)))].slice(0,n);
 if(!skus.length)throw new Error('没有可处理SKU；未清理商品不会重复复制');
 await chrome.storage.local.set({sellerCopyBatch:{id:crypto.randomUUID(),status:'running',skus,index:0,results:[],next_at:0,started_at:new Date().toISOString()}});
 await chrome.alarms.create(COPY_ALARM,{periodInMinutes:0.5});await advanceSellerBatch();return {status:'seller_copy_batch_started',planned:skus.length};
}
async function advanceSellerBatch(){
 const {sellerCopyBatch:b,sellerCopyJob:j}=await chrome.storage.local.get(['sellerCopyBatch','sellerCopyJob']);if(b?.status!=='running')return;
 if(j?.status==='running')return;
 if(j?.batch_id===b.id&&!b.results.some(x=>x.id===j.id)){
  if(j.status==='paused'){b.status='paused';b.reason=j.reason;await chrome.storage.local.set({sellerCopyBatch:b});return;}
  b.results.push({id:j.id,sku:j.sku,status:j.status,cleanup_required:j.cleanup_required,packaging_fields:j.captured_properties?.length||0,reason:j.reason});b.index++;b.next_at=Date.now()+20000;
 }
 if(b.index>=b.skus.length){b.status='completed';b.finished_at=new Date().toISOString();await chrome.storage.local.set({sellerCopyBatch:b});await chrome.alarms.clear(COPY_ALARM);return;}
 await chrome.storage.local.set({sellerCopyBatch:b});const remaining=b.next_at-Date.now();if(remaining>0){await chrome.alarms.create(COPY_ALARM,{periodInMinutes:0.5});wakeSellerCopy(remaining);return;}
 await startSellerCopy(b.skus[b.index],b.id);
}
async function armSellerCopy(){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw new Error('请在干净的复制现成商品搜索页点击此按钮');
 const {sellerCopyJob:old}=await chrome.storage.local.get('sellerCopyJob');if(old?.status==='running')throw new Error('上次任务尚未确认清理，不能开始新任务');
 const state=await copyUi(tab.id,{action:'inspect'});if(state?.status!=='clean_copy_search')throw new Error('当前不是干净的复制搜索页，或存在旧草稿状态；未执行任何复制/删除');
 await chrome.storage.local.set({sellerCopyConfig:{tab_id:tab.id,copy_url:state.page,enabled_in_buyer_queue:true,armed_at:new Date().toISOString()}});return {status:'seller_copy_armed'};
}
async function startSellerCopy(sku,batchId=null){
 if(!/^\d+$/.test(String(sku||'')))throw new Error('请输入待验证的来源SKU');
 const {sellerCopyConfig:config,sellerCopyJob:old}=await chrome.storage.local.get(['sellerCopyConfig','sellerCopyJob']);
 if(!config)throw new Error('请先在干净复制搜索页启用自动流程');
 if(old?.status==='running')throw new Error('已有任务运行，不能重复复制');
 const {sellerCopyLedger=[]}=await chrome.storage.local.get('sellerCopyLedger');if(sellerCopyLedger.some(e=>e.sku===String(sku)&&e.cleanup_required))throw new Error('这个SKU已有未清理记录，不再重复复制');
 const taskTab=await chrome.tabs.create({url:config.copy_url,active:false});
 await chrome.storage.local.set({sellerCopyJob:{id:crypto.randomUUID(),sku:String(sku),batch_id:batchId,tab_id:taskTab.id,copy_url:config.copy_url,status:'running',phase:'init',started_at:new Date().toISOString(),phase_at:Date.now(),cleanup_required:false,deletion_verified:false,events:[]}});
 await chrome.alarms.create(COPY_ALARM,{periodInMinutes:0.5});wakeSellerCopy(0);return {status:'seller_copy_started'};
}
async function sellerCopyTick(){
 if(sellerCopyBusy)return;sellerCopyBusy=true;
 try{
  const {sellerCopyJob:j}=await chrome.storage.local.get('sellerCopyJob');if(j?.status!=='running'){await advanceSellerBatch();return;}
  const save=async()=>{const {sellerCopyJob:latest}=await chrome.storage.local.get('sellerCopyJob');if(latest?.id!==j.id||latest.status!=='running')return false;await chrome.storage.local.set({sellerCopyJob:j});return true;};
  const event=(phase,status)=>{j.events.push({phase,status,at:new Date().toISOString()});j.events=j.events.slice(-30);};
  if(Date.now()-j.phase_at>45000)return await finishSellerCopySkip('phase_timeout_'+j.phase);
  if(j.phase==='init'){
   const tab=await chrome.tabs.get(j.tab_id);if(tab.status!=='complete'){wakeSellerCopy();return;}
   const r=await copyUi(j.tab_id,{action:'inspect'});j.last_ui_inspection=r?.inspection||{status:r?.status};event('inspect',r?.status);
   if(r?.status==='blocked_verification'||r?.status==='seller_login_required'){await save();return await stopSellerCopy(r.status==='seller_login_required'?'seller_login_access_required':'verification_required');}
   if(r?.status==='existing_draft_state'){await save();return await finishSellerCopySkip('existing_draft_state_no_action');}
   if(r?.status!=='clean_copy_search'){
    await save();if(['copy_search_not_ready','not_copy_route','not_clean_copy_search'].includes(r?.status)&&Date.now()-j.phase_at<25000){wakeSellerCopy(1500);return;}
    return await finishSellerCopySkip('copy_search_not_ready_after_wait');
   }
   j.phase='search';j.phase_at=Date.now();await save();wakeSellerCopy(500);return;
  }
  if(j.phase==='search'){
   const r=await copyUi(j.tab_id,{action:'search',sku:j.sku});event(j.phase,r?.status);if(r?.status!=='search_entered'){await save();return await stopSellerCopy(r?.status||'search_failed');}
   j.phase='copy';j.phase_at=Date.now();await save();wakeSellerCopy(2500);return;
  }
  if(j.phase==='copy'){
   // Persist intent BEFORE a potentially creating click. Never retry an ambiguous copy.
   j.copy_intent_at=new Date().toISOString();j.cleanup_required=true;j.phase='copy_in_flight';if(!await save())return;
   const r=await copyUi(j.tab_id,{action:'copy',sku:j.sku});event('copy',r?.status);
   if(r?.status==='exact_sku_card_not_loaded'){j.copy_intent_at=null;j.cleanup_required=false;j.phase='copy';await save();wakeSellerCopy(2000);return;}
   if(r?.status==='blocked_verification'){j.phase='copy';j.copy_intent_at=null;j.cleanup_required=false;await save();return await stopSellerCopy('verification_required');}
   if(r?.status!=='copy_clicked'){j.phase='copy_uncertain';await save();return await stopSellerCopy(r?.status||'copy_result_unknown');}
   j.phase='read';j.phase_at=Date.now();await save();wakeSellerCopy(2500);return;
  }
  if(j.phase==='copy_in_flight'||j.phase==='delete_in_flight')return await stopSellerCopy('mutation_result_unknown_do_not_retry');
  if(j.phase==='read'){
   const form=(await chrome.scripting.executeScript({target:{tabId:j.tab_id},files:['form-reader.js']}))[0]?.result;
   const identity=await copyUi(j.tab_id,{action:'draft-identity'});if(identity?.status==='blocked_verification')return await stopSellerCopy('verification_required');
   const names=['包装长度，毫米','包装宽度，毫米','包装高度，毫米','含包装重量，克','Длина упаковки, мм','Ширина упаковки, мм','Высота упаковки, мм','Вес с упаковкой, г'];
   const properties=(form?.fields||[]).filter(f=>names.includes(String(f.label||'').replace(/\s*[*＊]\s*$/,'').trim())&&/^\d+(?:\.\d+)?$/.test(String(f.value))).map(f=>({name:String(f.label).replace(/\s*[*＊]\s*$/,'').trim(),value:String(f.value),source:'single_sku_copy_ui_transaction',source_sku:j.sku,captured_at:form.captured_at,source_page:form.page.origin+form.page.path}));
   if(properties.length<4&&Date.now()-j.phase_at<15000){wakeSellerCopy(2000);return;}
   j.captured_properties=properties;j.draft_id=identity?.draft_ids?.length===1?identity.draft_ids[0]:null;
   const {sellerEvidence={}}=await chrome.storage.local.get('sellerEvidence');sellerEvidence[j.sku]=[...(sellerEvidence[j.sku]||[]),...properties];await chrome.storage.local.set({sellerEvidence});
   event('read',properties.length>=4?'packaging_read':'packaging_incomplete');
   if(!j.draft_id){await save();return await finishSellerCopySkip('draft_id_not_exposed_cleanup_not_verified');}
   j.phase='delete';j.phase_at=Date.now();await save();wakeSellerCopy();return;
  }
  if(j.phase==='delete'){
   j.phase='delete_in_flight';if(!await save())return;
   const r=await copyUi(j.tab_id,{action:'delete-owned',draft_id:j.draft_id});event('delete',r?.status);
   if(r?.status==='blocked_verification'){j.phase='delete';await save();return await stopSellerCopy('verification_required');}
   if(r?.status!=='owned_delete_clicked'){j.phase='cleanup_needs_ui_adapter';await save();return await finishSellerCopySkip(r?.status||'delete_not_available');}
   j.phase='verify';j.phase_at=Date.now();await save();wakeSellerCopy(700);return;
  }
  if(j.phase==='verify'){
   const r=await copyUi(j.tab_id,{action:'verify-deletion'});if(r?.status==='blocked_verification')return await stopSellerCopy('verification_required');if(r?.status!=='deletion_confirmed'){wakeSellerCopy(1000);return;}
   j.deletion_verified=true;j.cleanup_required=false;j.status='completed';j.reason='single_copy_read_delete_verified';j.finished_at=new Date().toISOString();event('verify','deletion_confirmed');await save();await chrome.alarms.clear(COPY_ALARM);await advanceSellerBatch();return;
  }
  return await stopSellerCopy('unsupported_workflow_phase');
 }catch(e){const reason='ui_workflow_error: '+String(e.message||e).slice(0,180);const {sellerCopyJob:current}=await chrome.storage.local.get('sellerCopyJob');if(/access|denied|403|429/i.test(reason))await stopSellerCopy(reason);else if(current?.copy_intent_at)await finishSellerCopySkip(reason);else await stopSellerCopy(reason);}
 finally{sellerCopyBusy=false;}
}
chrome.alarms.onAlarm.addListener(a=>{if(a.name===COPY_ALARM)return sellerCopyTick();});
chrome.runtime.onStartup.addListener(()=>stopSellerCopy('browser_restarted_no_mutation_retry'));
chrome.runtime.onInstalled.addListener(()=>stopSellerCopy('extension_updated_no_mutation_retry'));

async function ensureSellerCopyForSku(sku){
 const {sellerCopyConfig:config,sellerCopyJob:j,sellerCopyBatch:b}=await chrome.storage.local.get(['sellerCopyConfig','sellerCopyJob','sellerCopyBatch']);
 if(!config?.enabled_in_buyer_queue)return {status:'disabled'};
 if(j?.sku===sku){if(j.status==='running')return {status:'waiting'};if(j.status==='paused')return {status:'paused'};if(['completed','skipped'].includes(j.status))return {status:'done',cleanup_required:j.cleanup_required};}
 if(j?.status==='running')return {status:'waiting'};
 if(b?.status==='running')return {status:'waiting'};
 const {sellerCopyLedger=[]}=await chrome.storage.local.get('sellerCopyLedger');if(sellerCopyLedger.some(e=>e.sku===sku&&e.cleanup_required))return {status:'done',cleanup_required:true};
 await startSellerCopy(sku);return {status:'waiting'};
}
