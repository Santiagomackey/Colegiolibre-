import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
function environment(url){
 const u=new URL(url),values=new Map(),redirects=[],historyChanges=[],elements=new Map();
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const location={origin:u.origin,pathname:u.pathname,search:u.search,hash:u.hash,replace:target=>redirects.push(target)};
 const document={title:'Recovery',documentElement:{dataset:{language:'es'}},querySelector:id=>{if(!elements.has(id))elements.set(id,{textContent:'',hidden:true,href:''});return elements.get(id);}};
 const window={sessionStorage:storage,location};
 const context={window,document,location,history:{replaceState:(_,title,path)=>historyChanges.push(path)},URL,URLSearchParams,sessionStorage:storage,Date,console};
 vm.runInNewContext(source('auth-routing.js'),context);
 return {context,window,document,storage,redirects,historyChanges,elements};
}
async function callback(url,auth={}){
 const e=environment(url);e.window.colegioLibreSupabase={auth};vm.runInNewContext(source('recovery-callback.js'),e.context);await new Promise(resolve=>setImmediate(resolve));return e;
}
const session={user:{id:'recovery-user'},access_token:'test-access',refresh_token:'test-refresh'};
test('recovery links landing on home or login forward intact before SDK initialization',()=>{
 for(const path of ['/','/login','/auth-callback']){
  const e=environment('https://www.colegiolibre.com'+path+'#access_token=test&refresh_token=test&type=recovery');
  assert.equal(e.window.colegioLibreRecoveryRedirect,true);assert.equal(e.redirects[0],'/recovery-callback#access_token=test&refresh_token=test&type=recovery');
 }
 assert.equal(environment('https://www.colegiolibre.com/#type=signup&access_token=test').redirects.length,0);
 assert.equal(environment('https://www.colegiolibre.com/recovery-callback?code=test').redirects.length,0);
});
test('phone and desktop token links establish the recovery session then open the web password form',async()=>{
 let calls=0;const e=await callback('https://www.colegiolibre.com/recovery-callback?next=https://external.example/#access_token=test-access&refresh_token=test-refresh&type=recovery',{setSession:async values=>{calls++;assert.equal(values.access_token,'test-access');return {data:{session}};}});
 assert.equal(calls,1);assert.deepEqual(e.historyChanges,['/recovery-callback']);assert.deepEqual(e.redirects,['/login?mode=recovery&next=%2F']);
 assert.equal(e.window.colegioLibreRecovery.readMarker().userId,'recovery-user');assert.equal(e.redirects.some(p=>p.startsWith('colegiolibre:')),false);
});
test('PKCE exchanges once and never falls back to an unrelated existing session',async()=>{
 let exchanges=0,reads=0;
 const e=await callback('https://www.colegiolibre.com/recovery-callback?code=single-use',{exchangeCodeForSession:async()=>{exchanges++;return {error:{code:'expired'}};},getSession:async()=>{reads++;return {data:{session}};}});
 assert.equal(exchanges,1);assert.equal(reads,0);assert.equal(e.redirects.length,0);assert.equal(e.window.colegioLibreRecovery.readMarker(),null);assert.equal(e.elements.get('#callback-action').href,'/login?view=forgot');
});
test('valid PKCE and token-hash links both open password update, not the home page',async()=>{
 const a=await callback('https://www.colegiolibre.com/recovery-callback?code=single-use',{exchangeCodeForSession:async()=>({data:{session}})});
 assert.match(a.redirects[0],/^\/login\?mode=recovery/);
 const b=await callback('https://www.colegiolibre.com/recovery-callback?token_hash=test-hash&type=recovery',{verifyOtp:async p=>{assert.equal(p.type,'recovery');return {data:{session}};}});
 assert.match(b.redirects[0],/^\/login\?mode=recovery/);
});
test('missing or expired links cannot reuse a logged-in account as recovery proof',async()=>{
 for(const suffix of ['', '#error=access_denied&error_code=otp_expired']){
  const e=await callback('https://www.colegiolibre.com/recovery-callback'+suffix,{getSession:async()=>{throw Error('Must not consult unrelated session');}});
  assert.equal(e.redirects.length,0);assert.equal(e.elements.get('#callback-loader').hidden,true);assert.equal(e.elements.get('#callback-action').hidden,false);
 }
});
test('recovery markers expire and constrain next destinations to ColegioLibre pages',()=>{
 const e=environment('https://www.colegiolibre.com/recovery-callback');const R=e.window.colegioLibreRecovery;
 R.mark(session,'/perfil?view=settings');assert.equal(R.readMarker().next,'/perfil?view=settings');
 e.storage.setItem('colegiolibre-password-recovery',JSON.stringify({userId:'recovery-user',createdAt:Date.now()-31*60*1000}));assert.equal(R.readMarker(),null);
 assert.equal(R.safeNext('//external.example/'),'/');assert.equal(R.safeNext('/unknown'),'/');
});
