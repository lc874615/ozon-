let sellerSyncBusy=false;
const sellerPatterns=['https://seller.ozon.ru/*','https://seller.ozonru.cn/*'];
async function formFingerprint(form){return JSON.stringify({page:form.page,fields:(form.fields||[]).map(f=>({label:f.label,value:f.value})),attributes:form.read_only_attributes});}
async function readBoundForm(tabId,binding){
 const form=(await chrome.scripting.executeScript({target:{tabId},files:['form-reader.js']}))[0]?.result;
 if(!form||await formFingerprint(form)!==binding.fingerprint)return {status:'source_binding_changed_reconfirm',sku:binding.sku};
 const properties=[];
 for(const f of [...form.fields,...form.read_only_attributes]){
  if(f.value===null||f.value===undefined||f.value==='')continue;
  const name=String(f.label||'').replace(/\s*[*＊]\s*$/,'').trim();
  // Explicit packaging labels and units only; no conversion from product dimensions.
  if(/^(?:包装(?:长度|宽度|高度)，毫米|含包装重量，克|Длина упаковки, мм|Ширина упаковки, мм|Высота упаковки, мм|Вес с упаковкой, г)$/i.test(name))properties.push({name,value:String(f.value),source:'user_bound_current_seller_form',source_page:form.page.origin+form.page.path,captured_at:form.captured_at});
 }
 return {status:'bound_form_read',sku:binding.sku,properties};
}
async function bindSellerForm(sku){
 if(!/^\d+$/.test(String(sku||'')))throw new Error('请输入此参数页实际复制来源SKU，并确认对应关系');
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw new Error('请打开对应卖家参数页');
 const form=(await chrome.scripting.executeScript({target:{tabId:tab.id},files:['form-reader.js']}))[0]?.result;
 if(!form?.fields?.length)throw new Error('未读到参数表单，不能绑定');
 const {sellerFormBindings={}}=await chrome.storage.local.get('sellerFormBindings');sellerFormBindings[tab.id]={sku:String(sku),fingerprint:await formFingerprint(form),bound_at:new Date().toISOString()};
 await chrome.storage.local.set({sellerFormBindings});return syncSellerVisible();
}
async function syncSellerVisible(expectedSku=null){
 if(sellerSyncBusy)return {status:'sync_busy'};sellerSyncBusy=true;
 try{
  const tabs=await chrome.tabs.query({url:sellerPatterns});
  const {sellerEvidence={},sellerFormBindings={}}=await chrome.storage.local.get(['sellerEvidence','sellerFormBindings']);
  const diagnostics=[];
  const merge=(sku,properties)=>{if(!properties?.length)return;const old=sellerEvidence[sku]||[];for(const p of properties)if(!old.some(x=>x.name===p.name&&x.value===p.value&&x.source===p.source))old.push(p);sellerEvidence[sku]=old;};
  for(const tab of tabs.slice(0,10)){
   try{
    if(/\/app\/analytics\//.test(new URL(tab.url).pathname)){
     const data=(await chrome.scripting.executeScript({target:{tabId:tab.id},files:['seller-visible-reader.js']}))[0]?.result;
     for(const row of data?.rows||[])merge(row.sku,row.properties);
     diagnostics.push({type:'analytics',status:data?.status,tables:data?.tables,rows:data?.rows?.length||0});
    }else if(sellerFormBindings[tab.id]){const data=await readBoundForm(tab.id,sellerFormBindings[tab.id]);if(data.status==='bound_form_read')merge(data.sku,data.properties);diagnostics.push({type:'bound_form',status:data.status,sku:data.sku,packaging_fields:data.properties?.length||0});}
   }catch(e){diagnostics.push({status:'read_failed',reason:String(e.message||e).slice(0,160)});}
  }
  const sellerSync={status:tabs.length?'seller_pages_checked':'seller_tabs_not_open',requested_sku:expectedSku,matched_current_sku:expectedSku?Boolean(sellerEvidence[expectedSku]?.length):null,checked_at:new Date().toISOString(),tabs_found:tabs.length,diagnostics};
  await chrome.storage.local.set({sellerEvidence,sellerSync});return sellerSync;
 }finally{sellerSyncBusy=false;}
}
function withSellerEvidence(data,evidence={}){return {...data,properties:[...(data.properties||[]),...(evidence[data.product_id]||[])]};}
