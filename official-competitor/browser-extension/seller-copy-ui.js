async function sellerCopyUi(command){
 if(!['seller.ozon.ru','seller.ozonru.cn'].includes(location.hostname))throw new Error('请打开Ozon卖家后台');
 const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
 const text=clean(document.body?.innerText),visible=el=>!!el.getClientRects().length;
 if(/captcha|验证码|проверка безопасности|доступ ограничен/i.test(text.slice(0,12000)))return {status:'blocked_verification'};
 const buttons=[...document.querySelectorAll('button,[role="button"]')].filter(visible);
 const exact=(names,scope=buttons)=>scope.filter(e=>names.includes(clean(e.innerText))&&!e.disabled);
 const source=new URL(location.href);const refs={};for(const k of ['draft_id','draftId','bundle_id','bundleId']){const v=source.searchParams.get(k);if(v&&/^\d+$/.test(v))refs[k]=v;}
 const draftIds=Object.values(refs);
 const deleteButtons=exact(['删除草稿','Удалить черновик','Delete draft']);
 const dialogs=[...document.querySelectorAll('[role="dialog"],dialog')].filter(visible);
 const restoreSeen=/您已开始创建商品|您已开始创建产品|Вы начали создание|начали создавать товар/i.test(text);
 const headings=[...document.querySelectorAll('h1,h2,[role="heading"]')].filter(visible).map(e=>clean(e.innerText));
 const copyHeading=headings.find(h=>/^(?:商品复制|复制商品|复制现成商品|Копирование товара|Копирование товаров|Copy product)$/i.test(h));
 const copyRoute=/\/app\/products\/copy(?:\/list)?\/?$/.test(location.pathname);
 const copySearch=Boolean(copyHeading&&copyRoute);
 const inventory=/\/products\/(?:list|archive)(?:\/|$)/.test(location.pathname);
 if(inventory)return {status:'wrong_page'};
 if(command.action==='inspect'){
  const inputs=[...document.querySelectorAll('input')].filter(e=>visible(e)&&!e.disabled&&['text','search'].includes(e.type));
  const loginSeen=/\/(?:login|auth)(?:\/|$)/i.test(location.pathname)||[...document.querySelectorAll('input[type="password"]')].some(visible);
  const inspection={ready_state:document.readyState,path:location.pathname,headings:headings.slice(0,8).map(x=>x.slice(0,160)),copy_heading_found:!!copyHeading,copy_route:copyRoute,visible_search_inputs:inputs.length,input_hints:inputs.slice(0,8).map(e=>({placeholder:clean(e.placeholder).slice(0,160),aria_label:clean(e.getAttribute('aria-label')).slice(0,160),type:e.type})),delete_buttons:deleteButtons.length,restore_seen:restoreSeen,dialog_count:dialogs.length};
  const status=loginSeen?'seller_login_required':restoreSeen||deleteButtons.length?'existing_draft_state':copySearch&&inputs.length?'clean_copy_search':copyRoute?'copy_search_not_ready':'not_copy_route';
  return {status,page:source.origin+source.pathname+source.search,heading:copyHeading||headings[0]||'',draft_ids:draftIds,inspection};
 }
 if(command.action==='search'){
  if(!copySearch||deleteButtons.length||restoreSeen)return {status:'existing_state_do_not_touch'};
  const inputs=[...document.querySelectorAll('input')].filter(e=>visible(e)&&!e.disabled&&['text','search'].includes(e.type));
  const hinted=inputs.filter(e=>/sku|商品|产品|ссылк|назван|артикул/i.test(e.placeholder+' '+e.getAttribute('aria-label')));
  const target=hinted.length===1?hinted[0]:inputs.length===1?inputs[0]:null;
  if(!target)return {status:'search_input_ambiguous',input_hints:inputs.slice(0,8).map(e=>({placeholder:e.placeholder,type:e.type}))};
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(target,command.sku);
  target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('change',{bubbles:true}));
  return {status:'search_entered'};
 }
 if(command.action==='copy'){
  if(!copySearch||deleteButtons.length||restoreSeen)return {status:'existing_state_do_not_touch'};
  const anchors=[...document.querySelectorAll('a[href]')].filter(a=>{try{const u=new URL(a.href);return ['ozon.ru','www.ozon.ru'].includes(u.hostname)&&u.pathname.match(/(?:-|\/)(\d+)\/?$/)?.[1]===command.sku;}catch{return false;}});
  const matches=new Set();for(const a of anchors){let parent=a;for(let i=0;parent&&i<7;i++,parent=parent.parentElement){const adds=exact(['添加','Добавить','Add'],[...parent.querySelectorAll('button,[role="button"]')].filter(visible));if(adds.length===1){matches.add(adds[0]);break;}}}
  if(matches.size!==1)return {status:matches.size?'ambiguous_matching_product':'exact_sku_card_not_loaded'};
  [...matches][0].click();return {status:'copy_clicked',source_sku:command.sku};
 }
 if(command.action==='draft-identity')return {status:'identity_read',draft_ids:draftIds,heading:clean(document.querySelector('h1')?.innerText)};
 if(command.action==='delete-owned'){
  if(!command.draft_id||!/^\d+$/.test(command.draft_id))return {status:'cleanup_identity_missing'};
  const ownedDialog=dialogs.find(d=>[...d.querySelectorAll('[data-draft-id],[data-bundle-id]')].some(e=>[e.getAttribute('data-draft-id'),e.getAttribute('data-bundle-id')].includes(command.draft_id)));
  const ownedPage=draftIds.includes(command.draft_id);
  if(!ownedPage&&!ownedDialog)return {status:'cleanup_identity_not_visible'};
  const allowed=ownedDialog?exact(['删除草稿','Удалить черновик','Delete draft'],[...ownedDialog.querySelectorAll('button,[role="button"]')].filter(visible)):deleteButtons;
  if(allowed.length!==1)return {status:'owned_draft_delete_button_not_found'};
  allowed[0].click();return {status:'owned_delete_clicked',draft_id:command.draft_id};
 }
 if(command.action==='verify-deletion'){
  const alerts=[...document.querySelectorAll('[role="alert"],[role="status"],[class*="toast"],[class*="Toast"]')].filter(visible).map(e=>clean(e.innerText));
  return {status:alerts.some(t=>/草稿已删除|已删除草稿|Черновик удал[её]н|Draft deleted/i.test(t))?'deletion_confirmed':'deletion_not_confirmed',copy_search:copySearch&&!restoreSeen,visible_draft_ids:draftIds};
 }
 return {status:'unsupported_action'};
}
