(() => {
 'use strict';
 const key='colegiolibre-password-recovery';
 const allowed=new Set(['/','/admin','/perfil','/producto','/publicar','/favoritos','/mensajes','/colegio','/portal-colegio','/instituciones','/busco','/compra','/pedidos','/mas']);
 function safeNext(raw){try{const u=new URL(raw||'/',location.origin);return u.origin===location.origin&&allowed.has(u.pathname)?u.pathname+u.search:'/';}catch(_){return '/';}}
 function readMarker(){try{const item=JSON.parse(sessionStorage.getItem(key)||'null');return item?.userId&&Number.isFinite(item.createdAt)&&item.createdAt<=Date.now()+60000&&Date.now()-item.createdAt<30*60*1000?item:null;}catch(_){return null;}}
 function mark(session,next='/'){if(!session?.user?.id)throw Error('RECOVERY_SESSION_REQUIRED');sessionStorage.setItem(key,JSON.stringify({createdAt:Date.now(),userId:session.user.id,next:safeNext(next)}));}
 function clear(){sessionStorage.removeItem(key);}
 window.colegioLibreRecovery={safeNext,readMarker,mark,clear};
 const query=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.replace(/^#/,''));
 const recovery=query.get('type')==='recovery'||hash.get('type')==='recovery';
 const callback=location.pathname.replace(/\.html$/,'')==='/recovery-callback';
 if(recovery&&!callback){
  // Run before Supabase or the normal signed-in homepage redirect can consume
  // the one-use recovery URL. Keep tokens in the fragment, never in a query.
  window.colegioLibreRecoveryRedirect=true;
  location.replace('/recovery-callback'+location.search+location.hash);
 }
})();
