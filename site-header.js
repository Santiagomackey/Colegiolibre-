(() => {
 'use strict';
 if (window.Capacitor?.isNativePlatform?.() || window.navigator?.standalone === true) {
  document.documentElement.dataset.nativeApp ||= window.Capacitor?.getPlatform?.() || 'true';
 }
 const header=document.querySelector('.cl-site-header');if(!header)return;
 const labels={searchLabel:['Buscar material escolar','Search school supplies'],searchPlaceholder:['¿Qué material estás buscando?','What school supplies are you looking for?'],messages:['Mensajes','Messages'],favorites:['Favoritos','Favorites'],profile:['Mi perfil','My profile'],settings:['Configuración','Settings'],orders:['Mis compras y ventas','My purchases and sales'],logout:['Cerrar sesión','Sign out'],accountMenu:['Abrir menú de cuenta','Open account menu'],categories:['Categorías','Categories'],accountActions:['Acciones de tu cuenta','Account actions'],all:['Todo','All'],explore:['Explorar','Browse'],newest:['Recién publicados','New arrivals'],notes:['Apuntes y exámenes','Notes and exams'],alerts:['Alertas','Alerts'],school:['Mi colegio','My school'],help:['Ayuda','Help'],sell:['Publicar','Sell'],home:['Inicio','Home'],login:['Iniciar sesión','Sign in'],Libros:['Libros','Books'],Apuntes:['Apuntes','Notes'],Cuadernos:['Cuadernos','Notebooks'],'Útiles':['Útiles','Supplies'],Mochilas:['Mochilas','Backpacks'],'Tecnología':['Tecnología','Technology'],Uniformes:['Uniformes','Uniforms'],Otros:['Otros','Other']};
 let user=null,profile=null,run=0;
 const text=key=>(labels[key]||[key,key])[document.documentElement.dataset.language==='en'?1:0];
 function buildAccountMenu() {
  const menu = header.querySelector('.cl-site-account-menu .cl-site-menu-panel');
  if (!menu) return;
  const logout = menu.querySelector('[data-site-logout]');
  const entries = [
  [
    "profile",
    "Perfil",
    "Profile",
    "<circle cx=\"12\" cy=\"8\" r=\"4\" /> <path d=\"M4.5 19.5a8.5 8.5 0 0 1 15 0\" />"
  ],
  [
    "settings",
    "Ajustes",
    "Settings",
    "<path d=\"M12 8.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8Zm8.1 3.4c0-.4 0-.7-.1-1l2-1.5-2-3.5-2.4 1a8.5 8.5 0 0 0-1.8-1l-.4-2.6H9.4L9 6a8.5 8.5 0 0 0-1.8 1L4.8 6 2.8 9.5l2 1.5c-.1.3-.1.6-.1 1s0 .7.1 1l-2 1.5 2 3.5 2.4-1c.6.4 1.2.7 1.8 1l.4 2.6h4.1l.4-2.6c.6-.3 1.2-.6 1.8-1l2.4 1 2-3.5-2-1.5c.1-.3.1-.6.1-1Z\" />"
  ],
  [
    "publications",
    "Mis publicaciones",
    "My listings",
    "<path d=\"M4 10h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z\" /> <path d=\"m6 10 1.6-5h8.8L18 10\" /> <path d=\"M9 14h6\" />"
  ],
  [
    "purchases",
    "Compras",
    "Purchases",
    "<path d=\"M6 8h12l1 11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z\" /> <path d=\"M9 8V6a3 3 0 0 1 6 0v2\" />"
  ],
  [
    "sales",
    "Ventas",
    "Sales",
    "<path d=\"M20 10 11 19 3 11V4h7Z\" /> <circle cx=\"7.5\" cy=\"7.5\" r=\"1\" />"
  ],
  [
    "requests",
    "Mis pedidos",
    "My requests",
    "<circle cx=\"12\" cy=\"8\" r=\"4\" /> <path d=\"M4.5 19.5a8.5 8.5 0 0 1 15 0\" />"
  ],
  [
    "billing",
    "Datos de cobro",
    "Payment details",
    "<path d=\"M20 10 11 19 3 11V4h7Z\" /> <circle cx=\"7.5\" cy=\"7.5\" r=\"1\" />"
  ],
  [
    "logout",
    "Cerrar sesión",
    "Sign out",
    "<path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\" /> <path d=\"m16 17 5-5-5-5\" /> <path d=\"M21 12H9\" />"
  ]
];
  menu.replaceChildren();
  for (const [view, es, en, icon] of entries) {
   if (view === 'requests') menu.append(document.createElement('hr'));
   const item = view === 'logout' ? logout : document.createElement('a');
   if (!item) continue;
   item.removeAttribute('data-site-text');
   if (view !== 'logout') item.href = view === 'profile' ? '/perfil' : '/perfil?view=' + view;
   item.dataset.accountSection = view;
   item.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24">' + icon + '</svg>';
   const label = document.createElement('span');
   const key = 'account_' + view;
   labels[key] = [es, en];
   label.dataset.siteText = key;
   label.textContent = text(key);
   item.append(label);
   menu.append(item);
  }
  menu.parentElement.addEventListener('toggle', () => {
   const active = /^\/perfil(?:\.html)?\/?$/.test(location.pathname)
     ? document.body.dataset.accountView || new URLSearchParams(location.search).get('view') || 'profile' : '';
   for (const link of menu.querySelectorAll('a')) {
    if (link.dataset.accountSection === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
   }
  });
 }

 labels.browseCategories=['Ver todas las categorías','Browse all categories'];
 function addMenuLinks(){
  if (!document.querySelector('.colego-publish-cta') && !/^\/publicar(?:\.html)?\/?$/.test(location.pathname)) {
   document.body.insertAdjacentHTML('beforeend',
    '<a class="colego-publish-cta colego-publish-floating" href="/publicar" aria-label="Publicar un producto" data-site-text="sell">Publicar</a>');
  }
  buildAccountMenu();
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
  header.querySelectorAll('#header-messages-link, #header-favorites-link').forEach(link=>{
   if (link.getAttribute('href') === '/' + route) link.setAttribute('aria-current','page');
   else link.removeAttribute('aria-current');
  });
  header.querySelectorAll('[data-site-nav]').forEach(link=>{if(link.dataset.siteNav===route)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
 }
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
 window.addEventListener('colegiolibre:languagechange',()=>{render();});
 window.addEventListener('pageshow',event=>{if(event.persisted)void hydrate();});
 function initializeCompactNavigation(){
  if (typeof ResizeObserver !== 'function') return;
  const top=header.querySelector('.cl-site-top');
  const input=top?.querySelector('input[type=search]');
  if (!input) return;

  const fullControls=Array.from(top.children);
  const dock=document.createElement('div');
  dock.className='cl-pastel-dock';
  dock.inert=true;
  dock.innerHTML='<a href="/" aria-label="Inicio"><img src="/images/colego-cart-palette.webp" alt=""></a><button type="button" aria-label="Buscar materiales"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></svg></button>';
  if (!/^\/publicar(?:\.html)?\/?$/.test(location.pathname)) {
   const publish=document.createElement('a');
   publish.className='cl-pastel-dock-publish';
   publish.href='/publicar';
   publish.dataset.siteText='sell';
   dock.append(publish);
  }
  top.append(dock);
  header.classList.add('cl-transition-header');

  let compact=false;
  function update(){
   const next=window.scrollY>90 && !fullControls.some(node=>node.contains(document.activeElement));
   if (next===compact) return;
   compact=next;
   header.classList.toggle('cl-header-compact',compact);
   for (const control of fullControls) control.inert=compact;
   dock.inert=!compact;
  }
  function reserveSpace(){
   if (!compact) header.style.setProperty('--cl-top-height',top.offsetHeight+'px');
  }
  const size=new ResizeObserver(reserveSpace);
  size.observe(top);
  reserveSpace();
  window.addEventListener('scroll',update,{passive:true});
  top.addEventListener('focusout',()=>queueMicrotask(update));
  dock.querySelector('button').addEventListener('click',()=>{
   window.scrollTo({top:0,behavior:'instant'});
   update();
   input.focus({preventScroll:true});
  });
  update();
 }
 function initialize(){addMenuLinks();initializeCompactNavigation();render();void hydrate();window.colegioLibreSupabase?.auth?.onAuthStateChange?.(()=>{queueMicrotask(()=>void hydrate());});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
