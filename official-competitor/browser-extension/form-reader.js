function readOzonCurrentForm() {
  if(!['seller.ozon.ru','seller.ozonru.cn'].includes(location.hostname))throw new Error('请在Ozon卖家后台的商品参数页执行');
  if(/\/(?:settings|finance|chat|profile|account|login|auth|messages)(?:\/|$)/i.test(location.pathname))throw new Error('此工具只用于商品参数页，不读取账号或财务页面');
  const sensitive=/password|passwd|cookie|token|authorization|api.?key|csrf|session|验证码|密码|令牌|登录|пароль|токен|код подтверждения/i;
  const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
  const cut=(s,n=20000)=>String(s??'').slice(0,n);
  const visible=el=>Boolean(el.getClientRects().length);
  const roots=[document],fields=[],attributes=[],seen=new Set();
  let scanned=0,omitted=0,truncated=false,shadowRoots=0;
  for(let index=0;index<roots.length&&index<100;index++){
    const root=roots[index];
    for(const el of root.querySelectorAll('*')){
      if(++scanned>50000){truncated=true;break;}
      if(el.shadowRoot){if(roots.length<100){roots.push(el.shadowRoot);shadowRoots++;}else truncated=true;}
    }
    if(truncated)break;
  }
  function referenced(el,attr){return clean((el.getAttribute(attr)||'').split(/\s+/).filter(Boolean).map(id=>el.getRootNode().getElementById?.(id)?.textContent||'').join(' '));}
  function context(el){
    return el.closest('[data-field],[data-testid*="field"],.ant-form-item,[class*="formItem"],[class*="FormItem"],[class*="form-item"],[class*="field"],[class*="Field"],[role="group"]')||el.parentElement;
  }
  function labelOf(el){
    const explicit=clean(Array.from(el.labels||[]).map(l=>l.textContent).join(' '));
    if(explicit)return {text:explicit,source:'html_label'};
    const aria=referenced(el,'aria-labelledby')||clean(el.getAttribute('aria-label'));
    if(aria)return {text:aria,source:'aria_label'};
    const group=context(el);
    const near=group?.querySelector('label,[class*="label"],[class*="Label"],[data-label]');
    if(near&&near!==el&&!el.contains(near))return {text:clean(near.textContent),source:'nearby_label_candidate'};
    const fallback=clean(el.getAttribute('placeholder')||el.getAttribute('name')||el.id||'');
    return {text:fallback,source:fallback?'placeholder_name_or_id_candidate':'unlabelled'};
  }
  function unitTexts(el,label){
    const found=new Set();
    const unit=/(?:^|[\s,(（])(?:кг|г|мм|см|мл|л|шт\.?|kg|g|mm|cm|ml|pcs|公斤|千克|克|毫米|厘米|毫升|升|件|瓦|伏|Вт|В)(?=$|[\s,)）])/gi;
    for(const m of label.matchAll(unit))found.add(clean(m[0]).replace(/^[\s,(（，]+|[\s,)），]+$/g,''));
    if(found.size)return [...found];
    const group=context(el);
    if(!group || group.querySelectorAll('input,textarea,select,[role="combobox"],[role="spinbutton"]').length>1)return [];
    for(const node of group.querySelectorAll('span,small,[class*="suffix"],[class*="Suffix"],[class*="addon"]')){
      const text=clean(node.textContent);
      if(/^(?:кг|г|мм|см|мл|л|шт\.?|kg|g|mm|cm|ml|pcs|公斤|千克|克|毫米|厘米|毫升|升|件|瓦|伏|Вт|В)$/i.test(text))found.add(text);
    }
    return [...found];
  }
  function locator(el){
    const parts=[];let node=el;
    for(let i=0;node?.nodeType===1&&i<5;i++,node=node.parentElement){
      const siblings=node.parentElement?Array.from(node.parentElement.children).filter(v=>v.tagName===node.tagName):[node];
      parts.unshift(node.tagName.toLowerCase()+':nth-of-type('+(siblings.indexOf(node)+1)+')');
    }
    return parts.join(' > ');
  }
  for(const root of roots){
    for(const el of root.querySelectorAll('input,textarea,select,[role="combobox"],[role="checkbox"],[role="radio"],[role="spinbutton"],[contenteditable="true"]')){
      if(fields.length>=2000){truncated=true;break;}
      if(seen.has(el))continue;seen.add(el);
      if(!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)&&el.querySelector('input,textarea,select'))continue;
      const label=labelOf(el),type=String(el.type||el.getAttribute('role')||'contenteditable').toLowerCase();
      const identity=[label.text,el.id,el.getAttribute('name'),el.getAttribute('autocomplete')].join(' ');
      if(['hidden','password','email','file'].includes(type)||sensitive.test(identity)||/^(?:one-time-code|current-password|new-password|cc-number|cc-csc)$/.test(clean(el.getAttribute('autocomplete')))){omitted++;continue;}
      let value,selectedOptions;
      if(el.tagName==='SELECT'){
        selectedOptions=Array.from(el.selectedOptions).map(o=>({value:cut(o.value),text:cut(clean(o.textContent))}));
        value=el.multiple?selectedOptions.map(o=>o.value):el.value;
      }else if(el.tagName==='INPUT'||el.tagName==='TEXTAREA')value=el.value;
      else value=el.getAttribute('aria-valuenow')??el.getAttribute('aria-valuetext')??clean(el.textContent);
      const raw=typeof value==='string'?value:'';
      if(/^(?:Bearer\s+[A-Za-z0-9._-]{16,}|(?:sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{16,})$/.test(raw)){omitted++;continue;}
      const group=context(el),section=el.closest('fieldset,section,[role="tabpanel"]');
      const heading=section?.querySelector('legend,h1,h2,h3,h4,[role="heading"]');
      const required=el.required||el.getAttribute('aria-required')==='true';
      fields.push({index:fields.length+1,label:cut(label.text,500),label_source:label.source,
        value:typeof value==='string'?cut(value):value,value_truncated:raw.length>20000,
        selected_options:selectedOptions,unit_text_candidates:unitTexts(el,label.text),
        input_type:type,html_name:cut(el.getAttribute('name'),200),element_id:cut(el.id,200),
        checked:('checked' in el)?el.checked:(el.getAttribute('aria-checked')||null),
        required_explicit:Boolean(required),required_marker_seen:/[*＊]/.test(label.text),
        disabled:Boolean(el.disabled||el.getAttribute('aria-disabled')==='true'),read_only:Boolean(el.readOnly),
        visible:visible(el),section_heading:cut(clean(heading?.textContent),300),
        help_text:cut(referenced(el,'aria-describedby'),1000),locator:locator(el)});
      if(raw.length>20000)truncated=true;
    }
    for(const dt of root.querySelectorAll('dt')){
      const dd=dt.nextElementSibling,label=clean(dt.textContent);
      if(dd?.tagName==='DD'&&label&&!sensitive.test(label)&&attributes.length<1000)
        {const value=clean(dd.textContent);if(value.length>20000)truncated=true;attributes.push({label:cut(label,500),value:cut(value),value_truncated:value.length>20000,source:'dt_dd',visible:visible(dt)});}
    }
    for(const row of root.querySelectorAll('table tr')){
      const cells=Array.from(row.children).filter(c=>/^(TD|TH)$/.test(c.tagName));
      const label=clean(cells[0]?.textContent);
      if(cells.length===2&&label&&!sensitive.test(label)&&!row.querySelector('input,textarea,select')&&attributes.length<1000)
        {const value=clean(cells[1].textContent);if(value.length>20000)truncated=true;attributes.push({label:cut(label,500),value:cut(value),value_truncated:value.length>20000,source:'two_column_table',visible:visible(row)});}
    }
  }
  const url=new URL(location.href),references={};
  for(const key of ['sku','product_id','item_id','variant_id','bundle_id']){
    const value=url.searchParams.get(key);if(value&&/^\d+$/.test(value))references[key]=value;
  }
  return {schema_version:1,source:'user_initiated_current_form_read',captured_at:new Date().toISOString(),
    page:{origin:url.origin,path:url.pathname,numeric_references:references,heading:cut(clean(document.querySelector('h1')?.textContent),300)},
    source_sku_verified:false,fields,read_only_attributes:attributes,
    coverage:{field_count:fields.length,attribute_count:attributes.length,open_shadow_roots:shadowRoots,
      omitted_sensitive_or_hidden_controls:omitted,truncated,iframes_not_read:document.querySelectorAll('iframe').length,
      limits:['only currently loaded DOM; virtualized and other tabs may be missing','no dropdown opening, section switching, clicks or network requests','no closed shadow roots or iframe contents']},
    collector_initiated_network_requests:0,actions_performed:[],page_background_autosave_controlled:false,draft_state:'not_determined_by_reader'};
}
readOzonCurrentForm();
