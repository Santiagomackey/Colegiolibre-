import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../preferences.js',import.meta.url),'utf8');
function fixture(){
 const root={dataset:{}},events={},observers=[];
 const document={documentElement:root,body:null,title:'ColegioLibre',querySelector:()=>null,getElementById:()=>null,addEventListener:(name,fn)=>events[name]=fn,createTreeWalker(target){let i=0;return{currentNode:null,nextNode(){this.currentNode=target.textNodes?.[i++];return Boolean(this.currentNode);}}}};
 const pending=[],dialogs=[];
 const window={prompt:(...args)=>{dialogs.push(args);return 'My collection';},matchMedia:()=>({addEventListener(){}}),dispatchEvent(){},requestAnimationFrame:fn=>{pending.push(fn);return pending.length;}};
 vm.runInNewContext(source,{window,document,localStorage:{getItem:()=>null,setItem(){}},MutationObserver:class{constructor(fn){observers.push(fn)}observe(){}disconnect(){}},CustomEvent:class{},Node:{ELEMENT_NODE:1,TEXT_NODE:3},NodeFilter:{SHOW_TEXT:4,FILTER_ACCEPT:1,FILTER_REJECT:2}});
 const attributes=new Map([['placeholder','Buscar material escolar']]);
 const parent={nodeType:1,closest:()=>null,hasAttribute:k=>attributes.has(k),getAttribute:k=>attributes.get(k),setAttribute:(k,v)=>attributes.set(k,v),querySelectorAll:()=>[]};
 let text='Cargando publicaciones…',writes=0;
 const node={nodeType:3,parentElement:parent,isConnected:true,get nodeValue(){return text},set nodeValue(v){writes++;text=v}};
 const body={...parent,textNodes:[node],querySelectorAll:()=>[parent],contains:()=>false};document.body=body;
 return{window,dialogs,api:window.colegioLibrePreferences,document,parent,node,attributes,pending,writes:()=>writes,events,observers};
}
test('UI text, attributes and dynamic counts survive repeated language changes',()=>{
 const f=fixture();f.api.setLanguage('en');assert.equal(f.node.nodeValue,'Loading listings…');assert.equal(f.attributes.get('placeholder'),'Search school supplies');
 f.node.nodeValue='3 resultados';f.api.refresh();assert.equal(f.node.nodeValue,'3 results');f.api.setLanguage('es');assert.equal(f.node.nodeValue,'3 resultados');assert.equal(f.attributes.get('placeholder'),'Buscar material escolar');
 f.api.setLanguage('en');f.attributes.set('placeholder','Buscar por persona o producto');f.api.refresh();assert.equal(f.attributes.get('placeholder'),'Search by person or product');f.api.setLanguage('es');assert.equal(f.attributes.get('placeholder'),'Buscar por persona o producto');
});
test('English content produced by bilingual components returns to Spanish; user content is preserved',()=>{
 const f=fixture();f.api.setLanguage('en');f.node.nodeValue='Account settings';f.api.refresh();f.api.setLanguage('es');assert.equal(f.node.nodeValue,'Configuración de la cuenta');
 f.parent.closest=()=>({});f.node.nodeValue='Guardar esta búsqueda';f.api.setLanguage('en');assert.equal(f.node.nodeValue,'Guardar esta búsqueda');
});
test('refreshing translated nodes does not write again or lose new server text',()=>{
 const f=fixture();f.api.setLanguage('en');const count=f.writes();f.api.refresh();f.api.refresh();assert.equal(f.writes(),count);
 f.node.nodeValue='No pudimos cargar las publicaciones.';f.api.refresh();assert.equal(f.node.nodeValue,'We could not load the listings.');f.api.setLanguage('es');assert.equal(f.node.nodeValue,'No pudimos cargar las publicaciones.');
});
test('new public sections and their status messages have English translations',()=>{
 const f=fixture();for(const text of ['DESCUBRÍ EN COLEGIOLIBRE','Escribinos por correo','Crear portal gratis','Revisá tu email','Activá los avisos para enterarte a tiempo.','Guardar esta búsqueda','Navegación principal','Apuntes y exámenes'])assert.notEqual(f.api.translate(text),text,text);
 assert.equal(f.api.translate('Resultados para “Cambridge”'),'Results for “Cambridge”');assert.equal(f.api.translate('4.º año'),'Year 4');
});


test('browser prompts translate their question while preserving entered values',()=>{
 const f=fixture();f.api.setLanguage('en');assert.equal(f.window.prompt('Nombre de la nueva colección','Historia'),'My collection');assert.deepEqual(f.dialogs[0],['New collection name','Historia']);
});
