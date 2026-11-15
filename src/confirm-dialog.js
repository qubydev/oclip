export function confirmAction({title,description,action,cancel='Cancel',danger=true}) {
  const dialog=document.getElementById('confirm-dialog');
  if(dialog.open) return Promise.resolve(null);
  dialog.querySelector('h2').textContent=title;
  dialog.querySelector('p').textContent=description;
  dialog.querySelector('#confirm-cancel').textContent=cancel;
  const accept=dialog.querySelector('#confirm-action');
  accept.textContent=action;
  accept.className=danger?'discard-action':'primary';
  dialog.returnValue='';
  return new Promise(resolve=>{
    dialog.addEventListener('close',()=>resolve(dialog.returnValue||null),{once:true});
    dialog.showModal();
  });
}
