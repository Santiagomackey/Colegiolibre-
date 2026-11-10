(() => {
 const form=document.querySelector('#seller-payment-form');if(!form)return;
 const T=window.colegioLibreTransfers,message=document.querySelector('#seller-payment-message'),save=form.querySelector('[type="submit"]');
 let saved=false,lastError=null;
 async function load(){try{
  const user=await window.colegioLibreApi.getCurrentUser(true);if(!user){form.reset();save.disabled=true;return;}save.disabled=false;
  const data=await T.rpc('get_my_payment_details');
  if(data?.method==='bank')document.querySelector('#bank-payment-details').open=true;
  if(data)Object.entries(data).forEach(([key,value])=>{if(form.elements[key])form.elements[key].value=value||''});
  lastError=null;
 }catch(error){message.textContent=T.errorMessage(error);message.dataset.state='error';}}
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(save.disabled)return;
  try{
   const data=T.validatePayment(Object.fromEntries(new FormData(form)));
   save.disabled=true;message.textContent=T.text('Guardando datos…','Saving details…');message.dataset.state='loading';
   await T.rpc('save_my_payment_details',{p_method:data.method,p_alias:data.alias,p_account_number:data.account_number,p_holder_name:data.holder_name});
   message.textContent=T.text('Datos guardados. Los pedidos ya iniciados conservan los datos anteriores.','Details saved. Existing orders keep their original payment details.');message.dataset.state='success';saved=true;lastError=null;
  }catch(error){lastError=error;message.textContent=T.errorMessage(error);message.dataset.state='error'}finally{save.disabled=false}
 });
 document.querySelector('[data-payment-retry]')?.addEventListener('click',()=>void load());
 window.addEventListener('pageshow',event=>{if(event.persisted)void load()});
 window.addEventListener('colegiolibre:languagechange',()=>{if(lastError)message.textContent=T.errorMessage(lastError);else if(saved)message.textContent=T.text('Datos guardados. Los pedidos ya iniciados conservan los datos anteriores.','Details saved. Existing orders keep their original payment details.');});
 window.addEventListener('pagehide',()=>form.reset());
 void load();
})();
