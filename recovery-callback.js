(() => {
 'use strict';
 const params=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.replace(/^#/,''));
 const R=window.colegioLibreRecovery;
 const title=document.querySelector('#callback-title'),message=document.querySelector('#callback-message'),loader=document.querySelector('#callback-loader'),action=document.querySelector('#callback-action');
 const english=()=>document.documentElement.dataset.language==='en';
 const t=(es,en)=>english()?en:es;
 function fail(){
  R.clear();title.textContent=t('El enlace no está disponible','This link is unavailable');
  message.textContent=t('Puede haber vencido o ya haber sido utilizado. Pedí un enlace nuevo para cambiar tu contraseña.','It may have expired or already been used. Request a new link to reset your password.');
  loader.hidden=true;action.href='/login?view=forgot';action.textContent=t('Pedir un enlace nuevo','Request a new link');action.hidden=false;
 }
 async function finish(){
  try{
   // Supabase auto-detection is disabled on this route. We own this exchange,
   // including legacy #type=recovery links forwarded from the homepage.
   const client=window.colegioLibreSupabase;
   const next=R.safeNext(params.get('next')||sessionStorage.getItem('colegiolibre-recovery-next'));
   const code=params.get('code'),tokenHash=params.get('token_hash');
   const accessToken=hash.get('access_token'),refreshToken=hash.get('refresh_token');
   const providerError=params.has('error')||hash.has('error');
   // Remove credentials from the visible URL/history before any async work.
   history.replaceState({},document.title,'/recovery-callback');
   R.clear();
   if(providerError)throw Error('RECOVERY_LINK_INVALID');
   let result;
   if(code)result=await client.auth.exchangeCodeForSession(code);
   else if(tokenHash&&params.get('type')==='recovery')result=await client.auth.verifyOtp({token_hash:tokenHash,type:'recovery'});
   else if(accessToken&&refreshToken&&hash.get('type')==='recovery')result=await client.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
   else throw Error('RECOVERY_LINK_MISSING');
   if(result.error||!result.data?.session?.user)throw Error('RECOVERY_LINK_INVALID');
   R.mark(result.data.session,next);
   sessionStorage.removeItem('colegiolibre-recovery-next');
   location.replace('/login?mode=recovery&next='+encodeURIComponent(next));
  }catch(_){fail();}
 }
 void finish();
})();
