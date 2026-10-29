async function sellerCopyUi(command){
 if(!['seller.ozon.ru','seller.ozonru.cn'].includes(location.hostname))throw new Error('请打开Ozon卖家后台');
 const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
 const text=clean(document.body?.innerText),visible=el=>!!el.getClientRects().length;
 if(/captcha|验证码|проверка безопасности|доступ ограничен|доступ запрещ[её]н|нет доступа|недостаточно прав|access denied|权限不足|访问受限|访问被拒绝|HTTP\s*(?:403|429)/i.test(text.slice(0,12000)))return {status:'blocked_verification'};
 const buttons=[...document.querySelectorAll('button,[role="button"]')].filter(visible);
 const labelKey=v=>clean(v).replace(/\s+/g,'').toLowerCase();
 const exact=(names,scope=buttons)=>scope.filter(e=>names.some(n=>labelKey(n)===labelKey(e.innerText))&&!e.disabled);
 const source=new URL(location.href);const refs={};for(const k of ['draft_id','draftId','bundle_id','bundleId']){const v=source.searchParams.get(k);if(v&&/^\d+$/.test(v))refs[k]=v;}
 const draftIds=Object.values(refs);
 const deleteButtons=exact(['删除草稿','Удалить черновик','Delete draft']);
 const dialogs=[...document.querySelectorAll('[role="dialog"],dialog')].filter(visible);
 const restoreSeen=/您已开始创建商品|您已开始创建产品|Вы начали создание|начали создавать товар/i.test(text);
 const headings=[...document.querySelectorAll('h1,h2,[role="heading"]')].filter(visible).map(e=>clean(e.innerText));
 const copyHeading=headings.find(h=>/^(?:商品复制|复制商品|复制现成商品|Копирование товара|Копирование товаров|Copy product)$/i.test(h));
 const copyRoute=/\/app\/products\/copy(?:\/list)?\/?$/.test(location.pathname);
 const copySearch=Boolean(copyHeading&&copyRoute);
 const selectedCounts=[...text.matchAll(/(?:已选择|已选|Выбрано|Selected)\s*[:：]?\s*(\d+)/gi)].map(m=>Number(m[1]));
 const packagingLabels=[...document.querySelectorAll('label,[class*="label"],[class*="Label"]')].filter(visible).map(e=>clean(e.textContent)).filter(t=>t.length<160&&/包装(?:长|宽|高|重量)|含包装重量|(?:Длина|Ширина|Высота|Вес).*упаков|(?:Package|Packaging).*(?:length|width|height|weight)/i.test(t));
 const parameterFormDetected=packagingLabels.length>0&&([...document.querySelectorAll('input[type="number"],[role="spinbutton"]')].some(visible)||[...document.querySelectorAll('input')].filter(visible).length>=4);
 const inventory=/\/products\/(?:list|archive)(?:\/|$)/.test(location.pathname);
 if(inventory)return {status:'wrong_page'};
 if(command.action==='inspect'){
  const inputs=[...document.querySelectorAll('input')].filter(e=>visible(e)&&!e.disabled&&['text','search'].includes(e.type));
  const loginSeen=/\/(?:login|auth)(?:\/|$)/i.test(location.pathname)||[...document.querySelectorAll('input[type="password"]')].some(visible);
  const inspection={ready_state:document.readyState,path:location.pathname,headings:headings.slice(0,8).map(x=>x.slice(0,160)),copy_heading_found:!!copyHeading,copy_route:copyRoute,visible_search_inputs:inputs.length,input_hints:inputs.slice(0,8).map(e=>({placeholder:clean(e.placeholder).slice(0,160),aria_label:clean(e.getAttribute('aria-label')).slice(0,160),type:e.type})),delete_buttons:deleteButtons.length,restore_seen:restoreSeen,dialog_count:dialogs.length,parameter_form_detected:parameterFormDetected,packaging_labels:packagingLabels.slice(0,8),selected_counts:selectedCounts};
  const status=loginSeen?'seller_login_required':restoreSeen||deleteButtons.length?'existing_draft_state':parameterFormDetected?'parameter_form_already_open':copySearch&&selectedCounts.some(n=>n>0)?'selected_product_state_already_open':copySearch&&inputs.length?'clean_copy_search':copyRoute?'copy_search_not_ready':'not_copy_route';
  return {status,page:source.origin+source.pathname+source.search,heading:copyHeading||headings[0]||'',draft_ids:draftIds,inspection};
 }
 if(command.action==='search'){
  if(!copySearch||deleteButtons.length||restoreSeen||parameterFormDetected||selectedCounts.some(n=>n>0))return {status:'existing_state_do_not_touch'};
  const inputs=[...document.querySelectorAll('input')].filter(e=>visible(e)&&!e.disabled&&['text','search'].includes(e.type));
  const hinted=inputs.filter(e=>/sku|商品|产品|ссылк|назван|артикул/i.test(e.placeholder+' '+e.getAttribute('aria-label')));
  const target=hinted.length===1?hinted[0]:inputs.length===1?inputs[0]:null;
  if(!target)return {status:'search_input_ambiguous',input_hints:inputs.slice(0,8).map(e=>({placeholder:e.placeholder,type:e.type}))};
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(target,command.sku);
  target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('change',{bubbles:true}));
  return {status:'search_entered'};
 }
 if(command.action==='copy'){
  if(!copySearch||deleteButtons.length||restoreSeen||parameterFormDetected)return {status:'existing_state_do_not_touch'};
  const anchors=[...document.querySelectorAll('a[href]')].filter(a=>{try{const u=new URL(a.href);return ['ozon.ru','www.ozon.ru'].includes(u.hostname)&&u.pathname.match(/(?:-|\/)(\d+)\/?$/)?.[1]===command.sku;}catch{return false;}});
  const matches=new Set();for(const a of anchors){let parent=a;for(let i=0;parent&&i<7;i++,parent=parent.parentElement){const adds=exact(['添加','Добавить','Add'],[...parent.querySelectorAll('button,[role="button"]')].filter(visible));if(adds.length===1){matches.add(adds[0]);break;}}}
  // Some result cards render the SKU as text/data rather than a buyer link.
  if(!matches.size){
   const markers=[...document.querySelectorAll('[data-sku],[data-product-id],span,p')].filter(e=>visible(e)&&(e.getAttribute('data-sku')===command.sku||e.getAttribute('data-product-id')===command.sku||!e.children.length&&clean(e.textContent)===command.sku));
   for(const marker of markers){for(let parent=marker,i=0;parent&&parent!==document.body&&i<7;parent=parent.parentElement,i++){
    const adds=exact(['添加','Добавить','Add'],[...parent.querySelectorAll('button,[role="button"]')].filter(visible));
    if(adds.length===1){matches.add(adds[0]);break;}
   }}
  }
  if(matches.size!==1)return {status:matches.size?'ambiguous_matching_product':'exact_sku_card_not_loaded',inspection:{path:location.pathname,search_values:[...document.querySelectorAll('input')].filter(e=>visible(e)&&['text','search'].includes(e.type)).map(e=>e.value===command.sku?'requested_sku':e.value?'other_value':'empty'),matching_sku_anchors:anchors.length,add_controls:buttons.filter(e=>['添加','Добавить','Add'].some(n=>labelKey(n)===labelKey(e.innerText))).map(e=>({disabled:!!e.disabled,aria_disabled:e.getAttribute('aria-disabled')})),result_links:[...document.querySelectorAll('a[href]')].filter(visible).flatMap(a=>{try{const u=new URL(a.href);return ['ozon.ru','www.ozon.ru'].includes(u.hostname)&&u.pathname.startsWith('/product/')?[u.pathname]:[];}catch{return [];}}).slice(0,8),no_results_message:/未找到|没有找到|ничего не найдено|no results/i.test(text)}};

  [...matches][0].click();return {status:'copy_clicked',source_sku:command.sku};
 }
 if(command.action==='open-parameter-step'){
  if(parameterFormDetected)return {status:'parameters_already_open'};
  if(!command.copy_clicked||!copySearch||restoreSeen||deleteButtons.length)return {status:'not_owned_selection_step'};
  const skuInput=[...document.querySelectorAll('input')].some(e=>visible(e)&&e.value===command.sku);
  if(!skuInput)return {status:'selected_source_sku_not_visible'};
  const continueNames=['继续','Продолжить','Continue'];
  let continues=exact(continueNames);
  if(!continues.length){
   // The site may use a clickable div/span rather than a semantic button.
   continues=[...document.querySelectorAll('a,span,div')].filter(e=>visible(e)&&!e.children.length&&continueNames.some(n=>labelKey(n)===labelKey(e.textContent))).filter(e=>{
    for(let p=e.parentElement,depth=0;p&&p!==document.body&&depth<5;p=p.parentElement,depth++)if(/(?:已选择|已选|Выбрано|Selected)\s*[:：]?\s*1(?!\d)/i.test(clean(p.innerText)))return true;
    return false;
   });
  }
  if(continues.length){
   const counts=[...text.matchAll(/(?:已选择|已选|Выбрано|Selected)\s*[:：]?\s*(\d+)/gi)].map(m=>Number(m[1]));
   if(counts.length!==1||counts[0]!==1)return {status:'selected_count_not_single',selected_counts:counts};
  }
  // Prefer the selection toolbar's Continue over the step heading "填写特征".
  const next=continues.length?continues:exact(['下一步','填写特征','Далее','Заполнить характеристики','Next']);
  if(next.length!==1)return {status:'parameter_step_control_not_ready',matches:next.length,inspection:{path:location.pathname,headings:headings.slice(0,4),parameter_form_detected:parameterFormDetected,controls:buttons.slice(0,30).map(e=>({text:clean(e.innerText).slice(0,100),aria_label:clean(e.getAttribute('aria-label')).slice(0,100),disabled:!!e.disabled,aria_disabled:e.getAttribute('aria-disabled')}))}};
  if(next[0].getAttribute('aria-disabled')==='true')return {status:'parameter_step_control_disabled'};
  const control_label=clean(next[0].innerText);next[0].click();return {status:'parameter_step_clicked',control_label};
 }
 if(command.action==='draft-identity')return {status:'identity_read',draft_ids:draftIds,heading:clean(document.querySelector('h1')?.innerText)};
 if(command.action==='back-from-parameters'){
  if(!command.form_read_confirmed)return {status:'parameter_read_not_confirmed'};
  if(copySearch&&!parameterFormDetected)return {status:'still_on_copy_search_do_not_navigate'};
  const candidates=exact(['返回','Назад','Back']);
  const links=[...document.querySelectorAll('a[href]')].filter(a=>visible(a)&&['返回','Назад','Back'].includes(clean(a.innerText))&&(()=>{try{const u=new URL(a.href),expected=new URL(command.copy_url);return u.origin===expected.origin&&u.pathname===expected.pathname;}catch{return false;}})());
  const labelled=[...document.querySelectorAll('button[aria-label],[role="button"][aria-label]')].filter(e=>visible(e)&&['返回','Назад','Back'].includes(clean(e.getAttribute('aria-label'))));
  const all=[...new Set([...candidates,...links,...labelled])];
  if(all.length!==1)return {status:'back_button_ambiguous_or_missing',candidates:all.length};
  all[0].click();return {status:'back_clicked'};
 }
 if(command.action==='discard-unsaved'){
  if(!command.back_clicked)return {status:'back_action_not_confirmed'};
  const discard=exact(['退出且不保存','退出并且不保存','退出并不保存','Выйти без сохранения','Выйти и не сохранять','Не сохранять','Exit without saving']);
  if(discard.length!==1)return {status:'discard_confirmation_not_ready',matches:discard.length};
  discard[0].click();return {status:'discard_clicked'};
 }
 if(command.action==='verify-discard'){
  const remaining=exact(['退出且不保存','退出并且不保存','退出并不保存','Выйти без сохранения','Выйти и не сохранять','Не сохранять','Exit without saving']);
  const inputs=[...document.querySelectorAll('input')].filter(e=>visible(e)&&!e.disabled&&['text','search'].includes(e.type));
  let expectedPath=false;try{const u=new URL(command.copy_url);expectedPath=u.origin===source.origin&&u.pathname===source.pathname;}catch{}
  return {status:expectedPath&&copySearch&&inputs.length&&!remaining.length&&!restoreSeen&&!deleteButtons.length?'discard_return_confirmed':'discard_not_confirmed',verification_scope:'normal_UI_return_after_explicit_discard_not_server_draft_audit'};
 }
 return {status:'unsupported_action'};
}
