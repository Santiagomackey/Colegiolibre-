import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const script=fs.readFileSync(new URL('../mp-link-settings.js',import.meta.url),'utf8');
async function fixture({rpc=async()=>null,response={ok:false,status:503,json:async()=>({error:'LINK_NOT_CONFIGURED'})},search=''}={}){
 const nodes=new Map(),events={},calls=[],navigations=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,disabled:false,dataset:{},listeners:{},addEventListener(k,fn){this.listeners[k]=fn;},reset(){this.elements.alias.value='';this.elements.holder_name.value='';},elements:{alias:{value:''},holder_name:{value:''}},querySelector:selector=>node(id+selector)});return nodes.get(id);};
 let language='es';
 const window={addEventListener:(name,fn)=>{events[name]=fn;},fetch:async()=>response,colegioLibreSupabase:{auth:{getSession:async()=>({data:{session:{user:{id:'test-seller'},access_token:'test-session'}}})}},colegioLibreTransfers:{text:(es,en)=>language==='es'?es:en,errorMessage:error=>error.message,rpc:async name=>{calls.push(name);return rpc(name);}}};
 const document={hidden:false,querySelector:selector=>selector==='#settings-panel'?null:node(selector),addEventListener:(name,fn)=>{events[name]=fn;}};
 vm.runInNewContext(script,{window,document,URL,URLSearchParams,location:{search,origin:'https://www.colegiolibre.com',assign:url=>navigations.push(url)}});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));await settle();
 return {node,events,calls,navigations,settle,language:value=>{language=value;events['colegiolibre:languagechange']();}};
}
test('unlinked seller sees only OAuth action; no transfer details are required',async()=>{
 const f=await fixture();assert.deepEqual(f.calls,['get_my_mp_link']);assert.equal(f.node('#mp-alias-form').hidden,true);assert.equal(f.node('#mp-link-message').textContent,'');
 const page=fs.readFileSync(new URL('../perfil.html',import.meta.url),'utf8');assert.equal(page.includes('id="seller-payment-form"'),false);assert.equal(page.includes('id="bank-payment-details"'),false);
});
test('a successful reload clears an earlier load error',async()=>{
 let broken=true;const f=await fixture({rpc:async()=>{if(broken)throw {code:'PGRST202'};return null;}});
 assert.equal(f.node('#mp-link-message').dataset.code,'LINK_STORAGE_MISSING');broken=false;f.events.visibilitychange();await f.settle();assert.equal(f.node('#mp-link-message').textContent,'');
});
test('server configuration failure remains accurate and translates on language change',async()=>{
 const f=await fixture();await f.node('#mp-link-connect').listeners.click();assert.equal(f.node('#mp-link-message').dataset.code,'LINK_NOT_CONFIGURED');assert.doesNotMatch(f.node('#mp-link-message').textContent,/manual/i);
 f.events.visibilitychange();await f.settle();assert.equal(f.node('#mp-link-message').dataset.code,'LINK_NOT_CONFIGURED');f.language('en');assert.match(f.node('#mp-link-message').textContent,/Server setup/);assert.equal(f.node('#mp-link-connect').disabled,false);
});
test('successful authorization navigates to the bound launch URL and rejects other hosts',async()=>{
 const url='https://www.colegiolibre.com/api/mercadopago-link?launch=test&state=test';
 const f=await fixture({response:{ok:true,status:200,json:async()=>({url})}});await f.node('#mp-link-connect').listeners.click();assert.deepEqual(f.navigations,[url]);
 const unsafe=await fixture({response:{ok:true,status:200,json:async()=>({url:'https://other.example/api/mercadopago-link'})}});await unsafe.node('#mp-link-connect').listeners.click();assert.deepEqual(unsafe.navigations,[]);
});
test('optional alias failure does not prevent OAuth and saved input survives translation',async()=>{
 const link={display_name:'Test',holder_name:'Test Seller'};
 const f=await fixture({rpc:async name=>{if(name==='get_my_mp_link')return link;throw Error('network');}});
 assert.equal(f.node('#mp-link-message').dataset.code,'LINK_DETAILS_FAILED');assert.equal(f.node('#mp-link-connect').disabled,false);assert.equal(f.node('#mp-alias-form').hidden,true);
 const loaded=await fixture({rpc:async name=>name==='get_my_mp_link'?link:{method:'mercado_pago',alias:'test.alias'}});
 assert.equal(loaded.node('#mp-alias-form').hidden,false);assert.equal(loaded.node('#mp-alias-form').elements.alias.value,'test.alias');loaded.node('#mp-alias-form').elements.alias.value='edited.alias';loaded.node('#mp-alias-form').listeners.input();loaded.language('en');assert.equal(loaded.node('#mp-alias-form').elements.alias.value,'edited.alias');
});
test('optional callback scroll cannot produce an account-load failure',async()=>{
 const f=await fixture({search:'?mp_link=cancelled'});assert.equal(f.node('#mp-link-message').dataset.code,'cancelled');assert.deepEqual(f.calls,['get_my_mp_link']);
});
