(() => {
 if(!['ozon.ru','www.ozon.ru'].includes(location.hostname)||!/^\/product\//.test(location.pathname))return {status:'wrong_page'};
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 if(/доступ ограничен|проверка безопасности|captcha|验证码|完成验证/i.test(clean(document.body?.innerText).slice(0,12000)))return {status:'blocked_verification'};
 const panel=document.querySelector('[data-widget="webCharacteristics"],[data-widget="webShortCharacteristics"],#section-characteristics');
 const labels=['Все характеристики','Характеристики','全部参数','所有参数','所有特征','全部特征','商品参数'];
 const controls=[...document.querySelectorAll('a,button,[role="button"]')];
 const button=controls.find(el=>{
  if(!labels.includes(clean(el.innerText))||!el.getClientRects().length||el.closest('form')||el.disabled)return false;
  if(el.tagName==='BUTTON'&&el.type==='submit')return false;
  if(el.tagName!=='A')return true;
  const u=new URL(el.href,location.href);return u.origin===location.origin&&u.pathname===location.pathname&&u.search===location.search&&u.hash&&/characteristics|характер|参数/.test(u.hash);
 });
 if(button){button.scrollIntoView({block:'center'});button.click();return {status:'prepared',action:'opened_native_characteristics'};}
 if(panel){panel.scrollIntoView({block:'center'});return {status:'prepared',action:'scrolled_to_characteristics'};}
 window.scrollTo(0,Math.min(document.documentElement.scrollHeight,window.innerHeight*2));
 return {status:'prepared',action:'bounded_scroll_for_lazy_loading'};
})();
