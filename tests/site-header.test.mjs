import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('public sections ship the same header with one search and one account action',()=>{
 const template=source('templates/site-header.html');
 const pages=['index','explorar','producto','publicar','favoritos','mensajes','perfil','perfil-publico','colegio','busco','compra','pedidos','apuntes','materia','curso','ayuda','seguridad','terminos','privacidad','productos-prohibidos','instituciones','login','beta'];
 for(const page of pages){const html=source(page+'.html');assert.equal(html.match(/<header class="cl-site-header"[\s\S]*?<\/header>/)?.[0],template,page);assert.equal((html.match(/id="accountButton"/g)||[]).length,1,page);assert.equal((html.match(/id="search-form-desktop"/g)||[]).length,1,page);}
});
test('a retained dark preference cannot activate dark mode or restore its removed control',()=>{
 const store=new Map([['colegiolibre-theme','dark']]);const storage={getItem:key=>store.get(key)||null,setItem:(k,v)=>store.set(k,v)};
 const root={dataset:{}},document={documentElement:root,body:null,title:'ColegioLibre',querySelector:()=>null,getElementById:()=>null,addEventListener(){}};
 const window={matchMedia:()=>({matches:true,addEventListener(){}}),dispatchEvent(){},addEventListener(){}};
 vm.runInNewContext(source('preferences.js'),{window,document,localStorage:storage,MutationObserver:class{observe(){}disconnect(){}},CustomEvent:class{}});
 assert.equal(root.dataset.theme,'light');assert.equal(store.get('colegiolibre-theme'),'light');window.colegioLibrePreferences.setTheme('dark');assert.equal(root.dataset.theme,'light');assert.equal(source('preferences.js').includes('id="preference-theme"'),false);
});
test('shared account labels preserve the seller name across language changes and clear on sign-out',async()=>{
 const events={},nodes=new Map(),navigations=[];let currentUser={id:'test-seller'},onAuth;
 function node(id){if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},listeners:{},attrs:{},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},addEventListener(k,v){this.listeners[k]=v}});return nodes.get(id);}
 const message=node('message');message.dataset.siteText='messages';
 const header={querySelector:node,querySelectorAll:selector=>selector==='[data-site-text]'?[message]:[],contains:()=>false};
 const document={readyState:'complete',documentElement:{dataset:{language:'es'}},querySelector:selector=>selector==='.cl-site-header'?header:null,addEventListener(){}};
 const window={addEventListener:(k,v)=>events[k]=v,colegioLibreApi:{getCurrentUser:async()=>currentUser,getCurrentProfile:async()=>({name:'Santiago Pérez'})},colegioLibreSupabase:{auth:{onAuthStateChange:fn=>{onAuth=fn},signOut:async()=>({error:null})}}};
 vm.runInNewContext(source('site-header.js'),{document,window,location:{pathname:'/mensajes',assign:p=>navigations.push(p)},queueMicrotask});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));await settle();
 assert.equal(node('#accountText').textContent,'Santiago');assert.equal(node('#accountButton').href,'/perfil');
 document.documentElement.dataset.language='en';events['colegiolibre:languagechange']();assert.equal(message.textContent,'Messages');assert.equal(node('#accountText').textContent,'Santiago');
 currentUser=null;onAuth();await settle();assert.equal(node('#accountText').textContent,'Sign in');assert.equal(node('#accountButton').href,'/login');assert.equal(node('[data-site-logout]').hidden,true);
 currentUser={id:'test-seller'};window.colegioLibreApi.getCurrentProfile=async()=>{throw Error('network')};onAuth();await settle();assert.equal(node('#accountButton').href,'/perfil');assert.equal(node('#accountText').textContent,'My profile');
});
