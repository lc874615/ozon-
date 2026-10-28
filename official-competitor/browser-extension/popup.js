for(const action of ['export','status'])document.getElementById(action).onclick=async()=>{
  const result=await chrome.runtime.sendMessage({action});
  document.getElementById('result').textContent=JSON.stringify(result,null,2);
};
