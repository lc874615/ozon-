function parameterSnapshotSignature(form){return JSON.stringify({fields:(form?.fields||[]).map(f=>({label:f.label,value:f.value,units:f.unit_text_candidates||[],section:f.section_heading||''})),readonly:(form?.read_only_attributes||[]).map(f=>({label:f.label,value:f.value}))});}
function compareParameterForms(before,after){
 if(!before||!after)return {compatible:false,reason:'parameter_snapshot_missing'};
 if(before.page?.origin!==after.page?.origin||before.page?.path!==after.page?.path)return {compatible:false,reason:'parameter_page_changed'};
 const a=extractPackaging(before),b=extractPackaging(after);
 for(const [k,v] of Object.entries(a.values))if(b.values[k]!==v)return {compatible:false,reason:'packaging_value_changed_or_missing',field:k};
 const key=f=>f.html_name||f.label||'',value=f=>String(f.value??'').replace(/\s+/g,' ').trim();
 const previous=new Map((before.fields||[]).map(f=>[key(f),f]));const current=new Map((after.fields||[]).map(f=>[key(f),f]));
 const added=[],filled=[],changed=[];
 for(const [k,f]of previous){
  if(['depth','width','height','weight'].includes(k))continue; // Compared as normalized packaging values above.
  const next=current.get(k);
  if(value(f)&&(!next||value(next)!==value(f)))changed.push(k);
  else if(!value(f)&&next&&value(next))filled.push(k);
 }
 for(const k of current.keys())if(!previous.has(k))added.push(k);
 const oldRefs=before.page?.numeric_references||{},newRefs=after.page?.numeric_references||{};
 for(const k of Object.keys(oldRefs))if(newRefs[k]!==oldRefs[k])changed.push('page_reference:'+k);
 return {compatible:changed.length===0,reason:changed.length?'existing_parameter_values_changed':'existing_values_stable',changed_fields:changed,added_fields:added,filled_fields:filled};
}
async function sellerAlreadyCollected(sku){
 const {sellerCollectionHistory={},sellerEvidence={},sellerCopyJob:j}=await chrome.storage.local.get(['sellerCollectionHistory','sellerEvidence','sellerCopyJob']);
 if(sellerCollectionHistory[sku])return true;
 if(j?.sku===sku&&extractPackaging({fields:(j.captured_properties||[]).map(p=>({label:p.name,value:p.value}))}).complete)return true;
 return extractPackaging({fields:(sellerEvidence[sku]||[]).map(p=>({label:p.name,value:p.value}))}).complete;
}
let sellerCopyBusy=false,sellerCopyTimer=null;
const COPY_ALARM='ozon-seller-copy-workflow';
function wakeSellerCopy(ms=2000){if(sellerCopyTimer!==null)clearTimeout(sellerCopyTimer);sellerCopyTimer=setTimeout(()=>{sellerCopyTimer=null;sellerCopyTick();},ms);}
async function copyUi(tabId,command){
 await chrome.scripting.executeScript({target:{tabId},files:['seller-copy-ui.js']});
 return (await chrome.scripting.executeScript({target:{tabId},func:c=>sellerCopyUi(c),args:[command]}))[0]?.result;
}
async function stopSellerCopy(reason){
 const {sellerCopyJob:j,sellerCopyBatch:b}=await chrome.storage.local.get(['sellerCopyJob','sellerCopyBatch']);
 if(j?.status==='running'){j.status='paused';j.reason=reason;j.cleanup_required=Boolean(j.copy_intent_at&&!(j.deletion_verified||j.discard_verified));await chrome.storage.local.set({sellerCopyJob:j});if(b?.status==='running'){b.status='paused';b.reason=reason;await chrome.storage.local.set({sellerCopyBatch:b});}}
 await chrome.alarms.clear(COPY_ALARM);if(sellerCopyTimer!==null){clearTimeout(sellerCopyTimer);sellerCopyTimer=null;}
 if(/verification|access|denied|403|429/i.test(reason))await showVerificationAttention(j?.tab_id,'seller',reason);
 return {status:'seller_copy_paused',reason,cleanup_required:j?.cleanup_required||false};
}
async function finishSellerCopySkip(reason){
 const {sellerCopyJob:j,sellerCopyLedger=[]}=await chrome.storage.local.get(['sellerCopyJob','sellerCopyLedger']);
 if(!j||j.status!=='running')return {status:'no_running_task'};
 j.status='skipped';j.reason=reason;j.cleanup_required=Boolean(j.copy_intent_at&&!(j.deletion_verified||j.discard_verified));j.finished_at=new Date().toISOString();
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
 if(await sellerAlreadyCollected(b.skus[b.index])){b.results.push({sku:b.skus[b.index],status:'skipped_already_collected',cleanup_required:false});b.index++;await chrome.storage.local.set({sellerCopyBatch:b});await advanceSellerBatch();return;}
 await startSellerCopy(b.skus[b.index],b.id);
}
const AUTOMATIC_SELLER_COPY_URL='https://seller.ozonru.cn/app/products/copy/list';
async function ensureAutomaticSellerEntry(){
 const {sellerCopyConfig:old,sellerCopyJob:j}=await chrome.storage.local.get(['sellerCopyConfig','sellerCopyJob']);
 if(j?.status==='running'||j?.status==='paused')return old||null;
 let tab=null;
 if(old?.tab_id){try{tab=await chrome.tabs.get(old.tab_id);}catch{}}
 if(!tab)tab=await chrome.tabs.create({url:AUTOMATIC_SELLER_COPY_URL,active:false});
 const config={...(old||{}),tab_id:tab.id,copy_url:AUTOMATIC_SELLER_COPY_URL,enabled_in_buyer_queue:true,automatic_entry:true,configured_at:new Date().toISOString()};
 await chrome.storage.local.set({sellerCopyConfig:config});return config;
}
async function armSellerCopy(){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw new Error('请在干净的复制现成商品搜索页点击此按钮');
 const {sellerCopyJob:old}=await chrome.storage.local.get('sellerCopyJob');if(old?.status==='running')throw new Error('上次任务尚未确认清理，不能开始新任务');
 const state=await copyUi(tab.id,{action:'inspect'});if(state?.status!=='clean_copy_search')throw new Error('当前不是干净的复制搜索页，或存在旧草稿状态；未执行任何复制/删除');
 await chrome.storage.local.set({sellerCopyConfig:{tab_id:tab.id,copy_url:state.page,enabled_in_buyer_queue:true,armed_at:new Date().toISOString()}});return {status:'seller_copy_armed'};
}
async function startSellerCopy(sku,batchId=null){
 if(!/^\d+$/.test(String(sku||'')))throw new Error('请输入待验证的来源SKU');
 await ensureAutomaticSellerEntry();
 if(await sellerAlreadyCollected(String(sku)))return {status:'seller_already_collected',sku:String(sku)};
 const {sellerCopyConfig:config,sellerCopyJob:old}=await chrome.storage.local.get(['sellerCopyConfig','sellerCopyJob']);
 if(!config)throw new Error('请先在干净复制搜索页启用自动流程');
 if(old?.status==='running')throw new Error('已有任务运行，不能重复复制');
 const {sellerCopyLedger=[]}=await chrome.storage.local.get('sellerCopyLedger');if(sellerCopyLedger.some(e=>e.sku===String(sku)&&e.cleanup_required))throw new Error('这个SKU已有未清理记录，不再重复复制');
 let taskTab=null,reused=false;
 try{const existing=await chrome.tabs.get(config.tab_id);if(existing?.status==='complete'){const ready=await copyUi(config.tab_id,{action:'inspect'});if(ready?.status==='clean_copy_search'){taskTab=config.automatic_entry&&typeof chrome.tabs.update==='function'?await chrome.tabs.update(config.tab_id,{url:AUTOMATIC_SELLER_COPY_URL}):existing;reused=true;}}}catch{}
 if(!taskTab)taskTab=await chrome.tabs.create({url:config.copy_url,active:false});
 if(config.automatic_entry)await chrome.storage.local.set({sellerCopyConfig:{...config,tab_id:taskTab.id}});
 await chrome.storage.local.set({sellerCopyJob:{id:crypto.randomUUID(),sku:String(sku),batch_id:batchId,tab_id:taskTab.id,reused_armed_tab:reused,copy_url:config.copy_url,status:'running',phase:'init',started_at:new Date().toISOString(),phase_at:Date.now(),cleanup_required:false,deletion_verified:false,events:[]}});
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
   const r=await copyUi(j.tab_id,{action:'copy',sku:j.sku});j.last_copy_result=r;event('copy',r?.status);
   if(r?.status==='exact_sku_card_not_loaded'&&r.inspection?.no_results_message&&Date.now()-j.phase_at>=6000){j.copy_intent_at=null;j.cleanup_required=false;j.phase='copy';await save();return await finishSellerCopySkip('seller_search_no_results');}
   if(r?.status==='exact_sku_card_not_loaded'){j.copy_intent_at=null;j.cleanup_required=false;j.phase='copy';await save();wakeSellerCopy(2000);return;}
   if(r?.status==='blocked_verification'){j.phase='copy';j.copy_intent_at=null;j.cleanup_required=false;await save();return await stopSellerCopy('verification_required');}
   if(r?.status!=='copy_clicked'){j.phase='copy_uncertain';await save();return await stopSellerCopy(r?.status||'copy_result_unknown');}
   j.phase='continue';j.phase_at=Date.now();await save();wakeSellerCopy(1000);return;
  }
  if(j.phase==='copy_in_flight'||j.phase==='delete_in_flight'||j.phase==='discard_in_flight'||j.phase==='back_in_flight')return await stopSellerCopy('mutation_result_unknown_do_not_retry');
  if(j.phase==='continue'){
   if(j.parameter_step_intent_at)return await stopSellerCopy('parameter_step_result_unknown_do_not_retry');
   j.parameter_step_intent_at=new Date().toISOString();if(!await save())return;
   const next=await copyUi(j.tab_id,{action:'open-parameter-step',copy_clicked:!!j.copy_intent_at,sku:j.sku});j.last_parameter_step=next;event('continue',next?.status);
   if(next?.status!=='parameter_step_clicked')j.parameter_step_intent_at=null;
   if(next?.status==='blocked_verification'){await save();return await stopSellerCopy('verification_required');}
   if(next?.status==='parameter_step_clicked'||next?.status==='parameters_already_open'){
    if(next.status==='parameter_step_clicked')j.parameter_step_clicked_at=new Date().toISOString();else j.parameter_step_not_needed=true;
    j.phase='read';j.phase_at=Date.now();await save();wakeSellerCopy(1500);return;
   }
   await save();if(Date.now()-j.phase_at>=15000)return await finishSellerCopySkip('continue_control_not_confirmed');
   wakeSellerCopy(1000);return;
  }
  if(j.phase==='read'){
   const form=(await chrome.scripting.executeScript({target:{tabId:j.tab_id},files:['form-reader.js']}))[0]?.result;
   const identity=await copyUi(j.tab_id,{action:'draft-identity'});if(identity?.status==='blocked_verification')return await stopSellerCopy('verification_required');
   const packaging=extractPackaging(form);j.packaging_capture=packaging;
   const properties=packaging.properties.map(p=>({...p,source:'single_sku_copy_ui_transaction',source_sku:j.sku,captured_at:form.captured_at,source_page:form.page.origin+form.page.path}));
   if(!packaging.candidates.length&&!j.parameter_step_clicked_at&&!j.parameter_step_not_needed){
    if(j.parameter_step_intent_at)return await stopSellerCopy('parameter_step_result_unknown_do_not_retry');
    j.parameter_step_intent_at=new Date().toISOString();if(!await save())return;
    const next=await copyUi(j.tab_id,{action:'open-parameter-step',copy_clicked:!!j.copy_intent_at,sku:j.sku});j.last_parameter_step=next;event('open_parameters',next?.status);
    if(next?.status!=='parameter_step_clicked')j.parameter_step_intent_at=null;
    if(next?.status==='parameters_already_open')j.parameter_step_not_needed=true;
    if(next?.status==='blocked_verification'){await save();return await stopSellerCopy('verification_required');}
    if(next?.status==='parameter_step_clicked'){j.parameter_step_clicked_at=new Date().toISOString();j.phase_at=Date.now();await save();wakeSellerCopy(2000);return;}
   }
   if(!packaging.complete&&Date.now()-j.phase_at<15000){await save();wakeSellerCopy(2000);return;}
   if(packaging.complete){const {sellerCollectionHistory={}}=await chrome.storage.local.get('sellerCollectionHistory');sellerCollectionHistory[j.sku]={captured_at:new Date().toISOString(),complete:true,field_keys:Object.keys(packaging.values),verified_units:true,job_id:j.id};await chrome.storage.local.set({sellerCollectionHistory});}
   j.captured_form_properties=(form.fields||[]).filter(f=>String(f.value??'').trim()&&/^(?:name|category|attribute#\d+)$/.test(f.html_name||'')).map(f=>({name:f.label,value:f.value,attribute_key:f.html_name,source:'exact_sku_copy_form',source_sku:j.sku,captured_at:form.captured_at}));
   j.captured_properties=properties;j.draft_id=identity?.draft_ids?.length===1?identity.draft_ids[0]:null;
   const {sellerEvidence={}}=await chrome.storage.local.get('sellerEvidence');sellerEvidence[j.sku]=[...(sellerEvidence[j.sku]||[]),...properties,...j.captured_form_properties];await chrome.storage.local.set({sellerEvidence});
   event('read',packaging.complete?'packaging_read':'packaging_'+packaging.status);
   // A search input is not proof that the product parameter form opened.
   const formFields=form?.fields||[],formAttrs=form?.read_only_attributes||[];
   const searchOnly=/\/app\/products\/copy(?:\/list)?\/?$/.test(form?.page?.path||'')&&formAttrs.length===0&&formFields.length<=1&&formFields.every(f=>/SKU|条形码|Ozon链接|商品名称|search/i.test([f.label,f.input_type].join(' ')));
   j.form_snapshot=form;
   if(searchOnly||!(formFields.length||formAttrs.length)){await save();return await finishSellerCopySkip(searchOnly?'copy_did_not_open_parameter_form_no_back_attempt':'parameter_form_not_loaded_cannot_exit_safely');}
   j.form_snapshot=form;j.form_signature=parameterSnapshotSignature(form);
   j.phase='back';j.phase_at=Date.now();await save();wakeSellerCopy();return;
  }
  if(j.phase==='back'){
   const current=(await chrome.scripting.executeScript({target:{tabId:j.tab_id},files:['form-reader.js']}))[0]?.result;
   const comparison=compareParameterForms(j.form_snapshot,current);j.exit_form_comparison=comparison;
   if(!comparison.compatible){await save();return await finishSellerCopySkip('parameter_form_changed_before_exit');}
   // Extra asynchronously loaded fields are captured without changing the product or packaging.
   j.exit_form_snapshot=current;
   const extra=(current.fields||[]).filter(f=>String(f.value??'').trim()&&/^(?:name|category|attribute#\d+)$/.test(f.html_name||'')).map(f=>({name:f.label,value:f.value,attribute_key:f.html_name,source:'exact_sku_copy_form',source_sku:j.sku,captured_at:current.captured_at}));
   const {sellerEvidence:latestEvidence={}}=await chrome.storage.local.get('sellerEvidence');
   const combined=[...(latestEvidence[j.sku]||[]),...extra];latestEvidence[j.sku]=[...new Map(combined.map(p=>[(p.attribute_key||p.name)+'|'+p.value,p])).values()];
   j.captured_form_properties=extra;await chrome.storage.local.set({sellerEvidence:latestEvidence});


   let r=await copyUi(j.tab_id,{action:'back-from-parameters',form_read_confirmed:true,copy_url:j.copy_url});event('back',r?.status);
   if(r?.status==='back_button_ambiguous_or_missing'&&r.candidates===0&&typeof chrome.tabs.goBack==='function'){j.phase='back_in_flight';if(!await save())return;await chrome.tabs.goBack(j.tab_id);j.back_method='browser_history_one_step_after_verified_parameter_form';r={status:'back_clicked'};event('back','browser_back_triggered');}
   if(r?.status==='blocked_verification')return await stopSellerCopy('verification_required');
   if(r?.status!=='back_clicked'){await save();return await finishSellerCopySkip(r?.status||'back_not_available');}
   j.phase='discard';j.back_clicked_at=new Date().toISOString();j.phase_at=Date.now();await save();wakeSellerCopy(700);return;
  }
  if(j.phase==='discard'){
   j.phase='discard_in_flight';if(!await save())return;
   const r=await copyUi(j.tab_id,{action:'discard-unsaved',back_clicked:!!j.back_clicked_at});event('discard',r?.status);
   if(r?.status==='blocked_verification'){j.phase='discard';await save();return await stopSellerCopy('verification_required');}
   if(r?.status==='discard_confirmation_not_ready'){
    j.phase='discard';await save();if(Date.now()-j.phase_at<12000){wakeSellerCopy(1000);return;}return await finishSellerCopySkip('discard_dialog_not_identified');
   }
   if(r?.status!=='discard_clicked'){await save();return await finishSellerCopySkip(r?.status||'discard_not_available');}
   j.phase='verify_discard';j.phase_at=Date.now();j.discard_clicked_at=new Date().toISOString();await save();wakeSellerCopy(700);return;
  }
  if(j.phase==='verify_discard'){
   const r=await copyUi(j.tab_id,{action:'verify-discard',copy_url:j.copy_url});
   if(r?.status==='blocked_verification')return await stopSellerCopy('verification_required');
   if(r?.status!=='discard_return_confirmed'){wakeSellerCopy(1000);return;}
   j.discard_verified=true;j.discard_verification_scope=r.verification_scope;j.cleanup_required=false;j.status=j.packaging_capture?.complete?'completed':'completed_partial';j.reason=j.packaging_capture?.complete?'copy_read_back_discard_ui_verified':'packaging_incomplete_but_exit_confirmed';j.finished_at=new Date().toISOString();event('verify_discard','returned_after_exit_without_saving');await save();await chrome.alarms.clear(COPY_ALARM);await advanceSellerBatch();return;
  }
  return await stopSellerCopy('unsupported_workflow_phase');
 }catch(e){const reason='ui_workflow_error: '+String(e.message||e).slice(0,180);const {sellerCopyJob:current}=await chrome.storage.local.get('sellerCopyJob');if(/access|denied|403|429/i.test(reason))await stopSellerCopy(reason);else if(current?.copy_intent_at)await finishSellerCopySkip(reason);else await stopSellerCopy(reason);}
 finally{sellerCopyBusy=false;}
}
chrome.alarms.onAlarm.addListener(a=>{if(a.name===COPY_ALARM)return sellerCopyTick();});
chrome.runtime.onStartup.addListener(()=>stopSellerCopy('browser_restarted_no_mutation_retry'));
chrome.runtime.onInstalled.addListener(()=>stopSellerCopy('extension_updated_no_mutation_retry'));

async function ensureSellerCopyForSku(sku){
 await ensureAutomaticSellerEntry();
 const {sellerCopyConfig:config,sellerCopyJob:j,sellerCopyBatch:b}=await chrome.storage.local.get(['sellerCopyConfig','sellerCopyJob','sellerCopyBatch']);
 if(!config?.enabled_in_buyer_queue)return {status:'disabled'};
 if(j?.sku===sku){if(j.status==='running')return {status:'waiting'};if(j.status==='paused')return {status:'paused'};if(['completed','completed_partial','skipped'].includes(j.status))return {status:'done',terminal_status:j.status,reason:j.reason,discard_verified:j.discard_verified===true,cleanup_required:j.cleanup_required};}
 if(j?.status==='running')return {status:'waiting'};
 if(await sellerAlreadyCollected(sku))return {status:'done',already_collected:true};
 if(b?.status==='running')return {status:'waiting'};
 const {sellerCopyLedger=[]}=await chrome.storage.local.get('sellerCopyLedger');if(sellerCopyLedger.some(e=>e.sku===sku&&e.cleanup_required))return {status:'done',cleanup_required:true};
 await startSellerCopy(sku);return {status:'waiting'};
}
