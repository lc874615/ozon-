for(const action of ['auto-start','auto-pause','capture-form','capture-buyer','read-links','save-queue','next','save-target','export','status'])document.getElementById(action).onclick=async()=>{
 const button=document.getElementById(action);button.disabled=true;
 try{const result=await chrome.runtime.sendMessage({action,limit:document.getElementById('limit').value,sku_hint:document.getElementById('sku-hint').value,target:document.getElementById('target').value,links:document.getElementById('links').value});document.getElementById('result').textContent=JSON.stringify(result,null,2);}
 catch(e){document.getElementById('result').textContent=String(e.message||e);}
 finally{button.disabled=false;}
};