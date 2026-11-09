(() => {
  const form=document.querySelector('#wanted-form');
  if(!form)return;
  const preview=document.querySelector('#wanted-preview');
  const permissionButton=document.querySelector('#wanted-enable-notifications');
  const permissionText=document.querySelector('#wanted-notification-state');
  const t=(es,en)=>document.documentElement.dataset.language==='en'?en:es;
  function updatePreview(){
    const data=new FormData(form), title=String(data.get('title')||'').trim();
    const scope={school:t('Mi colegio','My school'),zone:t('Mi zona','My area'),country:t('Toda Argentina','Nationwide')}[data.get('scope')];
    preview.querySelector('strong').textContent=title||t('Tu próxima búsqueda','Your next search');
    preview.querySelector('span').textContent=[data.get('category'),scope].filter(Boolean).join(' · ');
  }
  async function updatePermission(){
    if(window.colegioLibreNative?.isNative){
      const status=await window.colegioLibreNative.notificationStatus();
      permissionText.textContent=status.registered?t('Listo: recibirás mensajes y coincidencias en tu teléfono.','Ready: messages and matches will appear on your phone.'):status.error==='sign_in_required'?t('Iniciá sesión para activar los avisos.','Sign in to enable notifications.'):status.error?t('No pudimos registrar el teléfono. Volvé a intentar.','We could not register this phone. Try again.'):status.permission==='denied'?t('Los avisos están bloqueados. Habilitalos en los ajustes del teléfono.','Notifications are blocked. Enable them in your phone settings.'):t('Recibí mensajes y coincidencias aunque no tengas la app abierta.','Receive messages and matches while the app is closed.');
      permissionButton.textContent=status.registered?t('Probar aviso','Test notification'):t('Activar avisos','Enable notifications');
      permissionButton.disabled=false;
    }else{
      permissionText.textContent=t('Avisos mientras navegás. Usá la app Android para recibirlos con el sitio cerrado.','Notifications while browsing. Use the Android app to receive them with the site closed.');
      permissionButton.disabled=!('Notification' in window)||Notification.permission==='granted';
      permissionButton.textContent=('Notification' in window)&&Notification.permission==='granted'?t('Avisos activados','Notifications enabled'):t('Activar avisos','Enable notifications');
    }
  }
  permissionButton?.addEventListener('click',async()=>{
    permissionButton.disabled=true;
    try{
      if(window.colegioLibreNative?.isNative){
        const state=await window.colegioLibreNative.notificationStatus();
        if(state.registered)await window.colegioLibreNative.showNotification('ColegioLibre',{body:t('Así vas a recibir tus avisos.','This is how you will receive notifications.'),data:{url:'/busco'}});
        else await window.colegioLibreNative.enablePushNotifications();
      }
      else if('Notification' in window)await Notification.requestPermission();
    }catch(_){permissionText.textContent=t('No pudimos activar los avisos. Volvé a intentar.','We could not enable notifications. Try again.');}
    finally{permissionButton.disabled=false;await updatePermission();}
  });
  form.addEventListener('input',updatePreview);
  form.addEventListener('change',updatePreview);
  form.addEventListener('reset',()=>setTimeout(updatePreview,0));
  window.addEventListener('colegiolibre:languagechange',()=>{updatePreview();void updatePermission()});
  window.addEventListener('colegiolibre:pushstatechange',()=>void updatePermission());
  updatePreview();void updatePermission();
})();
