export function confirmAction({title,description,action,cancel='Cancel',danger=true}) {
  const dialog=document.getElementById('confirm-dialog') as HTMLDialogElement;
  if(dialog.open) return Promise.resolve(null);
  dialog.querySelector<HTMLElement>('h2').textContent=title;
  dialog.querySelector<HTMLElement>('p').textContent=description;
  dialog.querySelector<HTMLElement>('#confirm-cancel').textContent=cancel;
  const accept=dialog.querySelector<HTMLElement>('#confirm-action');
  accept.textContent=action;
  accept.className=danger?'discard-action':'primary';
  dialog.returnValue='';
  return new Promise(resolve=>{
    dialog.addEventListener('close',()=>resolve(dialog.returnValue||null),{once:true});
    dialog.showModal();
  });
}
