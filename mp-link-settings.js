(() => {
 'use strict';
 const card=document.querySelector('#mp-link-card');if(!card)return;
 const T=window.colegioLibreTransfers,status=document.querySelector('#mp-link-status'),button=document.querySelector('#mp-link-connect'),remove=document.querySelector('#mp-link-remove'),form=document.querySelector('#mp-alias-form'),message=document.querySelector('#mp-link-message');
 const t=T.text;
 const messages={
  opening:['Abriendo Mercado Pago…','Opening Mercado Pago…'],
  AUTH_REQUIRED:['Iniciá sesión nuevamente para vincular tu cuenta.','Sign in again to link your account.'],
  LINK_NOT_CONFIGURED:['ColegioLibre todavía no habilitó Mercado Pago. Falta completar la configuración del servidor.','ColegioLibre has not enabled Mercado Pago yet. Server setup must be completed.'],
  LINK_ENDPOINT_MISSING:['La conexión con Mercado Pago no está instalada en el servidor de ColegioLibre.','The Mercado Pago connection is not installed on the ColegioLibre server.'],
  LINK_STORAGE_MISSING:['Falta actualizar la base de datos de vinculación de ColegioLibre.','The ColegioLibre account-linking database needs an update.'],
  LINK_STORAGE_DENIED:['No pudimos acceder al vínculo de tu cuenta. Volvé a iniciar sesión.','We could not access your account link. Sign in again.'],
  LINK_LOAD_FAILED:['No pudimos cargar tu cuenta vinculada. Volvé a intentar.','We could not load your linked account. Try again.'],
  LINK_DETAILS_FAILED:['Tu cuenta está vinculada, pero no pudimos cargar el alias. Volvé a intentar antes de editarlo.','Your account is linked, but we could not load your alias. Try again before editing it.'],
  LINK_RATE_LIMIT:['Hay varios intentos de vinculación pendientes. Esperá 10 minutos y volvé a intentar.','Several linking attempts are pending. Wait 10 minutes and try again.'],
  LINK_SERVER_AUTH_FAILED:['El servidor de ColegioLibre no pudo acceder a la base de datos. Es necesario revisar su configuración.','The ColegioLibre server could not access the database. Its configuration needs to be checked.'],
  LINK_STORAGE_FAILED:['No pudimos preparar la vinculación en la base de datos. Volvé a intentar.','We could not prepare account linking in the database. Try again.'],
  LINK_STORAGE_RESPONSE_INVALID:['La base de datos devolvió una respuesta inesperada. Volvé a intentar.','The database returned an unexpected response. Try again.'],
  LINK_START_FAILED:['No pudimos abrir Mercado Pago. Volvé a intentar.','We could not open Mercado Pago. Try again.'],
  LINK_NETWORK_FAILED:['No pudimos conectar con el servidor. Revisá tu conexión y volvé a intentar.','We could not connect to the server. Check your connection and try again.'],
  PROVIDER_INVALID_CLIENT:['Mercado Pago rechazó las credenciales de ColegioLibre. El administrador debe revisar el Client ID y Client Secret de la misma aplicación.','Mercado Pago rejected ColegioLibre’s credentials. The administrator must check the Client ID and Client Secret belong to the same application.'],
  PROVIDER_INVALID_GRANT:['El permiso de Mercado Pago venció o no coincide con este intento. Volvé a vincular tu cuenta.','The Mercado Pago authorization expired or does not match this attempt. Link your account again.'],
  PROVIDER_INVALID_SCOPE:['Mercado Pago no aceptó los permisos de la aplicación. El administrador debe habilitar el acceso de lectura.','Mercado Pago did not accept the application permissions. The administrator must enable read access.'],
  PROVIDER_UNAUTHORIZED_CLIENT:['Mercado Pago no autorizó esta aplicación para tu cuenta. Revisá los permisos en Mercado Pago o contactá a su soporte.','Mercado Pago did not authorize this application for your account. Check its permissions in Mercado Pago or contact their support.'],
  PROVIDER_AUTH_FAILED:['Mercado Pago rechazó la autorización. Comprobá que la URL de retorno y PKCE estén habilitados en la aplicación.','Mercado Pago rejected authorization. Check that the application has its callback URL and PKCE enabled.'],
  error:['No se completó la vinculación. Volvé a intentar.','Linking did not complete. Try again.'],
  cancelled:['Vinculación cancelada. No cambiamos tu cuenta.','Linking cancelled. Your account was not changed.'],
  removed:['Vínculo eliminado de ColegioLibre. También podés retirar el permiso desde Mercado Pago. Tus pedidos existentes no cambian.','Link removed from ColegioLibre. You can also revoke access in Mercado Pago. Existing orders are unchanged.'],
  saved:['Listo para recibir transferencias. Los pedidos ya iniciados no cambian.','Ready to receive transfers. Existing orders are unchanged.']
 };
 let link=null,details=null,pending=false,dirty=false,detailsLoaded=false,generation=0,messageCode='',messageSource='';
 function show(code='',source='action'){
  messageCode=code;messageSource=source;message.dataset.code=code;
  message.textContent=messages[code]?t(...messages[code]):'';
 }
 function render(fill=false){
  status.textContent=link?t('Cuenta vinculada: ','Linked account: ')+link.display_name:t('Vinculá tu cuenta para empezar.','Link your account to get started.');
  button.textContent=link?t('Vincular otra cuenta','Link another account'):t('Vincular Mercado Pago','Link Mercado Pago');
  remove.hidden=!link;form.hidden=!link||!detailsLoaded;
  if(link&&fill){
   form.elements.alias.value=details?.method==='mercado_pago'&&new URLSearchParams(location.search).get('mp_link')!=='linked'?details.alias:'';
   form.elements.holder_name.value=link.holder_name||details?.holder_name||'';
   const needsName=!link.holder_name;form.querySelector('[data-mp-holder]').hidden=!needsName;form.elements.holder_name.required=needsName;
  }
 }
 function loadError(error){
  if(error?.code==='PGRST202'||error?.code==='42883')return 'LINK_STORAGE_MISSING';
  if(error?.code==='42501')return 'LINK_STORAGE_DENIED';
  if(error?.message==='AUTH_REQUIRED'||error?.code==='PGRST301')return 'AUTH_REQUIRED';
  return 'LINK_LOAD_FAILED';
 }
 async function load(){
  if(pending)return;
  const run=++generation;
  try{
   const {data,error}=await window.colegioLibreSupabase.auth.getSession();
   if(run!==generation)return;
   if(error||!data?.session?.user){link=null;details=null;form.reset();render();show('AUTH_REQUIRED','load');return;}
   const account=await T.rpc('get_my_mp_link');
   if(run!==generation)return;
   link=account;details=null;detailsLoaded=false;render();
   // A saved alias is not needed to authorize an account. A failure loading
   // optional transfer details must never prevent the OAuth button working.
   if(link){
    try{details=await T.rpc('get_my_payment_details');detailsLoaded=true;}
    catch(_){if(run===generation){show('LINK_DETAILS_FAILED','load');form.hidden=true;}return;}
   }
   if(run!==generation)return;
   render(!dirty);
   if(messageSource==='load')show('','load');
  }catch(error){if(run===generation)show(loadError(error),'load');}
 }
 // Scrolling is presentation work and cannot turn a successful database read
 // into an account-linking error.
 if(new URLSearchParams(location.search).has('mp_link')){
  const panel=document.querySelector('#settings-panel');
  const scroll=()=>card.scrollIntoView?.({block:'nearest'});
  if(!panel||!panel.hidden)scroll();
  else{const observer=new MutationObserver(()=>{if(!panel.hidden){observer.disconnect();scroll();}});observer.observe(panel,{attributes:true,attributeFilter:['hidden']});}
 }
 button.addEventListener('click',async()=>{
  if(pending)return;pending=true;++generation;button.disabled=true;show('opening');
  try{
   const {data,error}=await window.colegioLibreSupabase.auth.getSession();
   if(error||!data?.session?.access_token)throw Error('AUTH_REQUIRED');
   const native=Boolean(window.Capacitor?.isNativePlatform?.());
   let response;
   try{response=await window.fetch('/api/mercadopago-link',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify({source:native?'app':'web'})});}
   catch(_){throw Error('LINK_NETWORK_FAILED');}
   if(response.status===404)throw Error('LINK_ENDPOINT_MISSING');
   if(response.status===401)throw Error('AUTH_REQUIRED');
   let payload;try{payload=await response.json();}catch(_){throw Error('LINK_START_FAILED');}
   if(!response.ok)throw Error(payload.error||'LINK_START_FAILED');
   const url=new URL(payload.url),expected=new URL(window.colegioLibreConfig?.publicSiteUrl||'https://www.colegiolibre.com');
   if(url.protocol!=='https:'||![expected.origin,location.origin].includes(url.origin)||url.pathname!=='/api/mercadopago-link')throw Error('LINK_START_FAILED');
   const browser=native?(window.Capacitor.Plugins?.Browser||window.Capacitor.registerPlugin?.('Browser')):null;
   if(browser?.open)await browser.open({url:url.href});else location.assign(url.href);
  }catch(error){show(messages[error.message]?error.message:'LINK_START_FAILED');}
  finally{pending=false;button.disabled=false;}
 });
 remove.addEventListener('click',async()=>{
  if(pending)return;pending=true;++generation;remove.disabled=true;
  try{await T.rpc('remove_my_mp_link');link=null;details=null;dirty=false;form.reset();render();show('removed');}
  catch(error){show(loadError(error));}finally{pending=false;remove.disabled=false;}
 });
 form.addEventListener('input',()=>{dirty=true;});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(pending||!link)return;
  const alias=form.elements.alias.value.trim().toLowerCase(),name=form.elements.holder_name.value.trim();
  if(!/^[a-z0-9.-]{6,20}$/.test(alias)){message.textContent=T.errorMessage(Error('INVALID_ALIAS'));return;}
  if(!link.holder_name&&(name.length<2||name.length>100)){message.textContent=T.errorMessage(Error('INVALID_HOLDER'));return;}
  pending=true;++generation;const save=form.querySelector('[type="submit"]');save.disabled=true;
  try{await T.rpc('save_linked_mp_alias',{p_alias:alias,p_holder_name:name});details={method:'mercado_pago',alias,holder_name:link.holder_name||name};dirty=false;show('saved');}
  catch(error){message.textContent=T.errorMessage(error);}finally{pending=false;save.disabled=false;}
 });
 window.addEventListener('pageshow',event=>{if(event.persisted)void load();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load();});
 window.addEventListener('colegiolibre:languagechange',()=>{render();show(messageCode,messageSource);});
 window.addEventListener('pagehide',()=>{++generation;form.reset();status.textContent='';link=null;details=null;dirty=false;});
 const result=new URLSearchParams(location.search).get('mp_link');
 const reason=new URLSearchParams(location.search).get('mp_reason');
 if(result==='error'||result==='cancelled')show(result==='error'&&messages[reason]?reason:result,'callback');
 void load();
})();
