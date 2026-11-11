(() => {
 'use strict';
 const header=document.querySelector('.cl-site-header');if(!header)return;
 const labels={searchLabel:['Buscar material escolar','Search school supplies'],searchPlaceholder:['¿Qué material estás buscando?','What school supplies are you looking for?'],messages:['Mensajes','Messages'],favorites:['Favoritos','Favorites'],profile:['Mi perfil','My profile'],settings:['Configuración','Settings'],orders:['Mis compras y ventas','My purchases and sales'],logout:['Cerrar sesión','Sign out'],accountMenu:['Abrir menú de cuenta','Open account menu'],categories:['Categorías','Categories'],accountActions:['Acciones de tu cuenta','Account actions'],all:['Todo','All'],explore:['Explorar','Browse'],newest:['Recién publicados','New arrivals'],notes:['Apuntes y exámenes','Notes and exams'],alerts:['Alertas','Alerts'],school:['Mi colegio','My school'],help:['Ayuda','Help'],sell:['Publicar','Sell'],home:['Inicio','Home'],login:['Iniciar sesión','Sign in'],Libros:['Libros','Books'],Apuntes:['Apuntes','Notes'],Cuadernos:['Cuadernos','Notebooks'],'Útiles':['Útiles','Supplies'],Mochilas:['Mochilas','Backpacks'],'Tecnología':['Tecnología','Technology'],Uniformes:['Uniformes','Uniforms'],Otros:['Otros','Other']};
 let user=null,profile=null,run=0;
 const text=key=>(labels[key]||[key,key])[document.documentElement.dataset.language==='en'?1:0];
 labels.linkMercadoPago=['Vincular Mercado Pago','Link Mercado Pago'];
 labels.browseCategories=['Ver todas las categorías','Browse all categories'];
 function addMenuLinks(){
  header.querySelector('.cl-site-account-menu [data-site-text="settings"]')?.insertAdjacentHTML(
   'afterend','<a class="cl-site-mp-link" href="/mas#mercado-pago" data-site-text="linkMercadoPago">Vincular Mercado Pago</a>'
  );
  header.querySelector('.cl-site-categories .cl-site-menu-panel')?.insertAdjacentHTML(
   'beforeend','<a class="cl-site-all-categories" href="/explorar" data-site-text="browseCategories">Ver todas las categorías</a>'
  );
 }
 function render(){
  header.querySelectorAll('[data-site-text]').forEach(node=>{node.textContent=text(node.dataset.siteText);});
  header.querySelectorAll('[data-site-label]').forEach(node=>node.setAttribute('aria-label',text(node.dataset.siteLabel)));
  const name=String(profile?.name||'').trim().split(/\s+/)[0];
  const account=header.querySelector('#accountButton');
  header.querySelector('#accountText').textContent=user?(name||text('profile')):text('login');
  account.href=user?'/perfil':'/login';account.setAttribute('aria-label',user?(name||text('profile')):text('login'));
  header.querySelector('input[type=search]').placeholder=text('searchPlaceholder');
  header.querySelector('[data-site-logout]').hidden=!user;
  const category=new URLSearchParams(location.search).get('category');
  header.querySelectorAll('.cl-site-nav-scroll a, .cl-site-categories .cl-site-menu-panel a').forEach(link=>{if(new URL(link.href,location.origin).searchParams.get('category')===category&&category)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  const route=location.pathname.replace(/\.html$/,'').split('/').filter(Boolean).pop()||'';
  header.querySelectorAll('[data-site-nav]').forEach(link=>{if(link.dataset.siteNav===route)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
 }
 function placeLanguage(){const controls=document.querySelector('#preference-controls');if(controls&&controls.parentElement!==document.body)document.body.appendChild(controls);}
 async function hydrate(){
  const current=++run;
  try{
   const api=window.colegioLibreApi;if(!api)return;
   const account=await api.getCurrentUser();
   let details=null;
   if(account){try{details=await api.getCurrentProfile();}catch(_){}}
   if(current!==run)return;user=account;profile=details;render();
  }catch(_){if(current===run){user=null;profile=null;render();}}
 }
 header.querySelector('[data-site-logout]').addEventListener('click',async event=>{
  const button=event.currentTarget;button.disabled=true;
  try{const result=await window.colegioLibreSupabase.auth.signOut();if(result.error)throw result.error;location.assign('/login');}
  catch(_){button.disabled=false;}
 });
 document.addEventListener('click',event=>{if(!header.contains(event.target))header.querySelectorAll('details[open]').forEach(menu=>menu.open=false);});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')header.querySelectorAll('details[open]').forEach(menu=>menu.open=false);});
 window.addEventListener('colegiolibre:languagechange',()=>{render();placeLanguage();});
 window.addEventListener('pageshow',event=>{if(event.persisted)void hydrate();});
 function initialize(){addMenuLinks();placeLanguage();render();void hydrate();window.colegioLibreSupabase?.auth?.onAuthStateChange?.(()=>{queueMicrotask(()=>void hydrate());});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
