import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildPushMessage,safePushPath} from '../server/push-payload.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('Apple OAuth uses the existing callback and recovers from a disabled provider',async()=>{
 const requests=[],status={textContent:''},buttons=[{},{}],assigned=[];let fail=false;
 const window={location:{origin:'https://www.colegiolibre.com',assign:url=>assigned.push(url)},colegioLibreSupabase:{auth:{signInWithOAuth:async request=>{requests.push(request);return fail?{error:{code:'provider_disabled'}}:{data:{url:'https://appleid.apple.com/auth/authorize?state=test'}}}}}};
 const document={documentElement:{dataset:{}},querySelector:()=>status,querySelectorAll:()=>buttons};
 vm.runInNewContext(read('social-auth.js'),{window,document,URL,console:{error(){}}});
 await window.colegioLibreSocialAuth.signIn('apple','/busco');
 assert.equal(requests[0].provider,'apple');assert.equal(requests[0].options.skipBrowserRedirect,true);
 const callback=new URL(requests[0].options.redirectTo);assert.equal(callback.pathname,'/auth-callback');assert.equal(callback.searchParams.get('next'),'/busco');assert.equal(assigned.length,1);
 fail=true;await window.colegioLibreSocialAuth.signIn('apple');assert.match(status.textContent,/No pudimos/);assert.equal(buttons[0].disabled,false);assert.equal(assigned.length,1);
});
test('FCM payload targets the phone tray and keeps taps inside ColegioLibre',()=>{
 const payload=buildPushMessage({token:'device'},{id:'notice-1',title:'Coincidencia',body:'Libro',type:'wanted_match',action_url:'producto.html?id=123'});
 assert.equal(payload.message.android.notification.channel_id,'colegiolibre-general');assert.equal(payload.message.android.notification.tag,'colegiolibre-notice-1');
 assert.equal(payload.message.data.url,'/producto?id=123');assert.equal(payload.message.notification.title,'Coincidencia');assert.equal(payload.message.android.priority,'high');
 assert.equal(safePushPath('https://evil.invalid/mensajes?id=1'),'/');assert.equal(safePushPath('javascript:alert(1)'),'/');assert.equal(safePushPath('/mensajes?id=1'),'/mensajes?id=1');
});
test('native opt-in registers the device and displays foreground pushes without an alarm',async()=>{
 const callbacks={},registered=[],scheduled=[],events=[];let permission='granted';
 const push={checkPermissions:async()=>({receive:permission}),requestPermissions:async()=>({receive:permission}),createChannel:async()=>{},addListener:async(key,fn)=>{callbacks[key]=fn},register:async()=>{await callbacks.registration({value:'fcm-test-device-token-123456789'})}};
 const local={checkPermissions:async()=>({display:'granted'}),createChannel:async()=>{},addListener:async()=>{},schedule:async data=>scheduled.push(data)};
 const window={Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android',Plugins:{PushNotifications:push,LocalNotifications:local}},location:{origin:'https://www.colegiolibre.com'},fetch:async()=>({}),addEventListener(){},dispatchEvent:event=>events.push(event),setTimeout(){},localStorage:{},colegioLibreApi:{getCurrentUser:async()=>({id:'user'})},colegioLibreSupabase:{rpc:async(name,args)=>{registered.push([name,args]);return {}},auth:{onAuthStateChange(){}}}};
 const document={documentElement:{dataset:{}},addEventListener(){}};
 vm.runInNewContext(read('native-bridge.js'),{window,document,URL,Request,File:class{},CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail}},console});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(registered[0][0],'register_push_token');assert.equal((await window.colegioLibreNative.notificationStatus()).registered,true);
 callbacks.pushNotificationReceived({title:'Match',body:'Book',data:{url:'/producto?id=1'}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(scheduled.length,1);const notice=scheduled[0].notifications[0];assert.equal(notice.channelId,'colegiolibre-general');assert.equal(notice.extra.url,'/producto?id=1');assert.equal('schedule' in notice,false);
 permission='denied';const before=registered.length;await window.colegioLibreNative.enablePushNotifications();assert.equal(registered.length,before);
});
test('push endpoint rejects untrusted calls and ignores read-only updates',async()=>{
 const {default:handler}=await import('../api/push-notification.js');
 const previous=process.env.PUSH_WEBHOOK_SECRET;process.env.PUSH_WEBHOOK_SECRET='test-only-secret';
 const response=()=>({headers:{},status(value){this.code=value},setHeader(key,value){this.headers[key]=value},end(value){this.body=JSON.parse(value)}});
 try{
  const denied=response();await handler({method:'POST',headers:{},body:{id:'n',user_id:'u'}},denied);assert.equal(denied.code,401);
  const read=response();await handler({method:'POST',headers:{'x-push-secret':'test-only-secret'},body:{type:'UPDATE',record:{id:'n',user_id:'u',read:true,updated_at:'new'},old_record:{updated_at:'old'}}},read);assert.equal(read.code,200);assert.equal(read.body.skipped,true);
 }finally{if(previous===undefined)delete process.env.PUSH_WEBHOOK_SECRET;else process.env.PUSH_WEBHOOK_SECRET=previous;}
});
