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
