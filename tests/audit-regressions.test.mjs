import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
function query(result,calls=[]){const proxy=new Proxy({}, {get:(_,key)=>key==='then'?((resolve,reject)=>Promise.resolve(result).then(resolve,reject)):(...args)=>{calls.push([key,...args]);return proxy}});return proxy}
test('catalog never substitutes fixtures for errors or an empty production table',async()=>{
 const window={};vm.runInNewContext(read('products.js'),{window});
 assert.equal(window.getColegioLibreStaticProducts().length,0);assert.equal(window.getColegioLibreStaticProductById('prod-casio-almagro'),null);
 await assert.rejects(window.cargarProductosDesdeSupabase());
 window.colegioLibreSupabase={from:()=>query({data:[],error:null})};assert.equal((await window.cargarProductosDesdeSupabase()).length,0);
 window.colegioLibreSupabase={from:()=>query({data:null,error:{message:'unavailable'}})};await assert.rejects(window.cargarProductosDesdeSupabase());
});
test('catalog bounds pages and explicitly selects available approved records',async()=>{
 const calls=[],window={colegioLibreSupabase:{from:()=>query({data:[],error:null},calls)}};vm.runInNewContext(read('products.js'),{window});
 await window.cargarProductosDesdeSupabase({offset:50,limit:10000});
 assert.ok(calls.some(([key,field,value])=>key==='eq'&&field==='status'&&value==='available'));
 assert.ok(calls.some(([key,filter])=>key==='or'&&filter.includes('moderation_status.eq.approved')));
 assert.ok(calls.some(([key,from,to])=>key==='range'&&from===50&&to===149));
});
test('native API string and Request calls reach the public HTTPS backend',async()=>{
 const calls=[],window={Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android',Plugins:{}},fetch:async input=>{calls.push(typeof input==='string'?input:input.url);return {}},addEventListener(){},setTimeout(){},localStorage:{}};
 const document={documentElement:{dataset:{}},addEventListener(){}};
 vm.runInNewContext(read('native-bridge.js'),{window,document,Request,URL,console,File:class {}});
 await window.fetch('/api/moderate-product');await window.fetch(new Request('https://localhost/api/upload?test=1'));await window.fetch('https://example.org/file');
 assert.deepEqual(calls,['https://www.colegiolibre.com/api/moderate-product','https://www.colegiolibre.com/api/upload?test=1','https://example.org/file']);
});
test('telemetry is scoped, respects authentication and matches the SQL error schema',async()=>{
 const handlers={},rows=[];let user=null;
 const client={auth:{getUser:async()=>({data:{user}}),onAuthStateChange(){}},from:()=>({insert:async row=>{rows.push(row)}})};
 const window={colegioLibreSupabase:client,addEventListener:(key,fn)=>{handlers[key]=fn},matchMedia:()=>({matches:false})};
 const context=vm.createContext({window,document:{addEventListener(){},title:''},location:{pathname:'/login',href:'https://www.colegiolibre.com/login?secret=hidden'},navigator:{},localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null,setItem(){}},URL,URLSearchParams,setTimeout,clearTimeout,console});
 vm.runInContext('const SUPABASE_URL="existing"; const supabase="existing";'+read('telemetry.js'),context);
 await handlers.error({message:'test user@example.org https://secret.invalid/?token=123',filename:'https://www.colegiolibre.com/app.js?token=123'});assert.equal(rows.length,0);
 user={id:'test-user'};await handlers.error({message:'test user@example.org https://secret.invalid/?token=123',filename:'https://www.colegiolibre.com/app.js?token=123'});
 assert.equal(rows.length,1);assert.equal(rows[0].user_id,'test-user');assert.equal(rows[0].page_path,'/login');assert.equal(rows[0].error_source,'/app.js');assert.ok(rows[0].error_message.includes('[email]'));assert.ok(!rows[0].error_message.includes('token=123'));assert.ok(!('kind' in rows[0]));
});
test('Explore exposes retry and truthful empty states after server failures',async()=>{
 const elements=new Map(),handlers=new Map(),calls=[];
 const element=selector=>{if(!elements.has(selector))elements.set(selector,{value:'',hidden:false,textContent:'',open:true,replaceChildren(){},setAttribute(){},addEventListener(event,fn){handlers.set(selector+':'+event,fn)}});return elements.get(selector)};
 let result={data:null,error:{message:'offline'}},pending;
 const window={colegioLibreSupabase:{from:()=>query(result,calls)}};
 const document={querySelector:element,querySelectorAll:()=>[]};
 const history={replaceState(){}};
 vm.runInNewContext(read('explorar.js'),{window,document,location:{href:'https://www.colegiolibre.com/explorar'},history,URL,AbortController,setTimeout,clearTimeout,matchMedia:()=>({matches:true,addEventListener(){}})});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(element('#results-error').hidden,false);assert.equal(element('#catalog-filters').open,false);assert.equal(element('#empty').hidden,true);
 result={data:[],error:null,count:0};await element('#retry').onclick();
 assert.equal(element('#results-error').hidden,true);assert.equal(element('#empty').hidden,false);assert.equal(element('#count').textContent,'0 resultados');
 assert.ok(calls.some(([method,start,end])=>method==='range'&&start===0&&end===23));
});

test('native system bars follow initial and changed themes with the navigation inset',async()=>{
 const calls=[],handlers={},styles={};
 const root={dataset:{theme:'light'},style:{setProperty:(key,value)=>{styles[key]=value}}};
 const window={Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android',Plugins:{},registerPlugin:name=>{if(name!=='SystemAppearance')return null;return {setTheme:async value=>{calls.push(value.theme);return {bottomInset:24}}}}},fetch:async()=>({}),addEventListener:(key,fn)=>{handlers[key]=fn},setTimeout(){},localStorage:{}};
 const document={documentElement:root,addEventListener(){}};
 vm.runInNewContext(read('native-bridge.js'),{window,document,Request,URL,console,File:class {}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,['light']);assert.equal(styles['--cl-native-bottom'],'24px');
 root.dataset.theme='dark';await handlers['colegiolibre:themechange']();
 assert.deepEqual(calls,['light','dark']);assert.equal(root.dataset.nativeApp,'android');
});
test('mobile account shows the profile name and resets after sign-out',async()=>{
 const code=read('script.js').match(/async function refreshAccountButton\(force = false\) \{[\s\S]*?\n\}/)[0];
 const label={textContent:'',toggleAttribute:(key,value)=>{label.protected=value}};
 const mobile={setAttribute:(key,value)=>{mobile[key]=value},querySelector:()=>label};
 const state={user:{id:'example'}},elements={accountText:{},mobileSessionButton:mobile};
 const context={state,elements,getCurrentUser:async()=>state.user,getCurrentProfile:async()=>({name:'Santiago Pérez'})};
 vm.runInNewContext(code+';this.refresh=refreshAccountButton',context);
 await context.refresh();assert.equal(label.textContent,'Santiago');assert.equal(mobile.href,'/perfil');assert.equal(label.protected,true);
 state.user=null;await context.refresh(true);assert.equal(label.textContent,'Iniciar sesión');assert.equal(mobile.href,'/login');assert.equal(label.protected,false);
});
test('UI cache returns fresh layout code online and the current cached code offline',async()=>{
 const handlers={},writes=[];let offline=false,promise;
 const old={text:'old layout'},fresh={text:'new layout',ok:true,clone(){return this}};
 const cache={match:async()=>old,put:async(request,response)=>writes.push(response)};
 const self={location:{origin:'https://www.colegiolibre.com'},addEventListener:(key,fn)=>{handlers[key]=fn}};
 vm.runInNewContext(read('service-worker.js'),{self,URL,caches:{open:async()=>cache},fetch:async()=>{if(offline)throw Error('offline');return fresh}});
 const event={request:{method:'GET',url:'https://www.colegiolibre.com/mobile.css?v=current',mode:'cors',destination:'style'},respondWith:value=>{promise=value}};
 handlers.fetch(event);assert.equal(await promise,fresh);assert.deepEqual(writes,[fresh]);
 offline=true;handlers.fetch(event);assert.equal(await promise,old);
});
test('bottom navigation switches both ways from an English startup without changing routes',()=>{
 class Node {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.textContent=''}
  setAttribute(key,value){this.attributes[key]=value}
  append(...nodes){this.children.push(...nodes)}
  appendChild(node){this.append(node)}
  querySelector(selector){return this.children.find(node=>node.tag===selector)||null}
  querySelectorAll(){return this.children.filter(node=>node.dataset.mobileNavKey)}
 }
 const handlers={},body=new Node('body'),root={dataset:{language:'en'}};
 const document={documentElement:root,body,readyState:'complete',querySelector:()=>body.children.find(node=>node.className==='cl-mobile-nav'),createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag)};
 const window={location:{pathname:'/favoritos'},addEventListener:(key,fn)=>{handlers[key]=fn}};
 vm.runInNewContext(read('mobile-ui.js'),{window,document});
 const nav=body.children[0],items=nav.children,routes=items.map(link=>link.href);
 assert.deepEqual(items.map(link=>link.querySelector('span').textContent),['Home','Favorites','Sell','Messages','Profile']);
 assert.equal(nav.attributes['data-no-translate'],'');
 for(const language of ['es','en','es']){
  root.dataset.language=language;handlers['colegiolibre:languagechange']();
  const expected=language==='en'?['Home','Favorites','Sell','Messages','Profile']:['Inicio','Favoritos','Publicar','Mensajes','Mi perfil'];
  assert.deepEqual(items.map(link=>link.querySelector('span').textContent),expected);
  assert.deepEqual(items.map(link=>link.attributes['aria-label']),expected);
  assert.equal(items[2].attributes.title,expected[2]);assert.deepEqual(items.map(link=>link.href),routes);
  assert.equal(items[1].attributes['aria-current'],'page');
 }
});
