for(const action of ['capture-form','export','status'])document.getElementById(action).onclick=async()=>{
  const button=document.getElementById(action);button.disabled=true;
  try{
    const result=await chrome.runtime.sendMessage({action,sku_hint:document.getElementById('sku-hint').value});
    document.getElementById('result').textContent=JSON.stringify(result,null,2);
  }catch(e){document.getElementById('result').textContent=String(e.message||e);}
  finally{button.disabled=false;}
};
