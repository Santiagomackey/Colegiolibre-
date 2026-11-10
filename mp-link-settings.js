(() => {
 const card=document.querySelector('#mp-link-card');if(!card)return;
 const T=window.colegioLibreTransfers,status=document.querySelector('#mp-link-status'),button=document.querySelector('#mp-link-connect'),remove=document.querySelector('#mp-link-remove'),form=document.querySelector('#mp-alias-form'),message=document.querySelector('#mp-link-message');
 let link=null,details=null,pending=false,dirty=false;
 const t=T.text;
 function render(fill=false){
  status.textContent=link?t('Cuenta vinculada: ','Linked account: ')+link.display_name:t('Vinculá tu cuenta para empezar.','Link your account to get started.');
  button.textContent=link?t('Vincular otra cuenta','Link another account'):t('Vincular Mercado Pago','Link Mercado Pago');
  remove.hidden=!link;form.hidden=!link;
  if(link&&fill){
   form.elements.alias.value=details?.method==='mercado_pago'&&new URLSearchParams(location.search).get('mp_link')!=='linked'?details.alias:'';
   form.elements.holder_name.value=link.holder_name||details?.holder_name||'';
   const needsName=!link.holder_name;form.querySelector('[data-mp-holder]').hidden=!needsName;form.elements.holder_name.required=needsName;
  }
 }
 async function load(){try{const user=await window.colegioLibreApi.getCurrentUser(true);if(!user){link=null;details=null;form.reset();render();return;}[link,details]=await Promise.all([T.rpc('get_my_mp_link'),T.rpc('get_my_payment_details')]);render(!dirty);if(new URLSearchParams(location.search).has('mp_link')){const panel=document.querySelector('#settings-panel');const show=()=>document.querySelector('#datos-cobro').scrollIntoView({block:'start'});if(!panel||!panel.hidden)show();else {const observer=new MutationObserver(()=>{if(!panel.hidden){observer.disconnect();show();}});observer.observe(panel,{attributes:true,attributeFilter:['hidden']});}}}catch(_){message.textContent=t('La vinculación todavía no está disponible. Podés usar los datos manuales.','Account linking is not available yet. You can use manual payment details.');}}
 button.addEventListener('click',async()=>{
  if(pending)return;pending=true;button.disabled=true;message.textContent=t('Abriendo Mercado Pago…','Opening Mercado Pago…');
  try{
   const {data}=await window.colegioLibreSupabase.auth.getSession();if(!data?.session?.access_token)throw Error('AUTH_REQUIRED');
   const native=Boolean(window.Capacitor?.isNativePlatform?.());
   const response=await window.fetch('/api/mercadopago-link',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify({source:native?'app':'web'})});
   const payload=await response.json();if(!response.ok)throw Error(payload.error||'LINK_START_FAILED');
   const url=new URL(payload.url);const expected=new URL(window.colegioLibreConfig?.publicSiteUrl||'https://www.colegiolibre.com');
   if(url.protocol!=='https:'||![expected.origin,location.origin].includes(url.origin)||url.pathname!=='/api/mercadopago-link')throw Error('INVALID_LINK_URL');
   const browser=native?(window.Capacitor.Plugins?.Browser||window.Capacitor.registerPlugin?.('Browser')):null;
   if(browser?.open)await browser.open({url:url.href});else location.assign(url.href);
  }catch(error){message.textContent=error.message==='LINK_NOT_CONFIGURED'?t('ColegioLibre todavía debe habilitar la vinculación. Podés usar los datos manuales mientras tanto.','ColegioLibre still needs to enable account linking. You can use manual details for now.'):error.message==='AUTH_REQUIRED'?t('Iniciá sesión nuevamente para vincular tu cuenta.','Sign in again to link your account.'):t('No pudimos vincular la cuenta. Volvé a intentar.','We could not link your account. Try again.');}
  finally{pending=false;button.disabled=false;}
 });
 remove.addEventListener('click',async()=>{
  if(pending)return;pending=true;remove.disabled=true;
  try{await T.rpc('remove_my_mp_link');link=null;render();message.textContent=t('Vínculo eliminado de ColegioLibre. También podés retirar el permiso desde Mercado Pago. Tus pedidos existentes no cambian.','Link removed from ColegioLibre. You can also revoke access in Mercado Pago. Existing orders are unchanged.');}
  catch(error){message.textContent=T.errorMessage(error);}finally{pending=false;remove.disabled=false;}
 });
 form.addEventListener('input',()=>{dirty=true});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(pending)return;
  const alias=form.elements.alias.value.trim().toLowerCase(),name=form.elements.holder_name.value.trim();
  if(!/^[a-z0-9.-]{6,20}$/.test(alias)){message.textContent=T.errorMessage(Error('INVALID_ALIAS'));return;}
  if(!link?.holder_name&&(name.length<2||name.length>100)){message.textContent=T.errorMessage(Error('INVALID_HOLDER'));return;}
  pending=true;const save=form.querySelector('[type="submit"]');save.disabled=true;
  try{await T.rpc('save_linked_mp_alias',{p_alias:alias,p_holder_name:name});details={method:'mercado_pago',alias,holder_name:link.holder_name||name};dirty=false;message.textContent=t('Listo para recibir transferencias. Los pedidos ya iniciados no cambian.','Ready to receive transfers. Existing orders are unchanged.');}
  catch(error){message.textContent=T.errorMessage(error);}finally{pending=false;save.disabled=false;}
 });
 window.addEventListener('pageshow',event=>{if(event.persisted)void load()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load()});
 window.addEventListener('colegiolibre:languagechange',()=>{render();message.textContent=''});
 window.addEventListener('pagehide',()=>{form.reset();status.textContent='';link=null;details=null;dirty=false});
 const result=new URLSearchParams(location.search).get('mp_link');
 if(result==='error')message.textContent=t('No se completó la vinculación. Volvé a intentar.','Linking did not complete. Try again.');
 if(result==='cancelled')message.textContent=t('Vinculación cancelada. No cambiamos tu cuenta.','Linking cancelled. Your account was not changed.');
 void load();
})();
