for(const action of ['capture','export','queue','resume','status','read-links'])document.getElementById(action).onclick=async()=>{
 const urls=document.getElementById('urls').value.split(/\s+/).filter(Boolean);
 const r=await chrome.runtime.sendMessage({action,urls});
 if(action==='read-links' && r.urls)document.getElementById('urls').value=r.urls.join('\n');
 const names={completed:'本批完成',running:'采集中',ready:'待开始',blocked_verification:'等待手动验证',attributes_missing:'参数未读取，请展开全部参数后重试'};
 if(r.batchStatus && names[r.batchStatus])r.batchStatus=names[r.batchStatus];
 const display=action==='status'?{done:r.queueIndex,total:r.queue?.length,status:r.batchStatus,collected:Object.keys(r.snapshots||{}).length}:r;
 document.getElementById('result').textContent=JSON.stringify(display,null,2);
};
