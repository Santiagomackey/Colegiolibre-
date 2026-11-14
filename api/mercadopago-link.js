import {configuration,random,digest,validNonce,authorizationUrl,cookie,getCookie,db,authenticatedUser,exchangeIdentity} from '../server/mp-link.js';
import {checkoutConfig,encryptToken} from '../server/mp-checkout.js';
function json(res,status,body){res.status(status);res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(body));}
function redirect(res,url){res.status(303);res.setHeader('Location',url);res.end();}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return json(res,405,{error:'METHOD_NOT_ALLOWED'});}
 let config, checkout;
 try{config=configuration();checkout=checkoutConfig();}catch(_){return json(res,503,{error:'LINK_NOT_CONFIGURED'});}
 if(req.method==='POST'){
  if(req.body?.checkout===true&&!checkout)return json(res,503,{error:'MP_CHECKOUT_NOT_CONFIGURED'});
  try{
   const user=await authenticatedUser(config,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});
   const state=random(),launch=random(),verifier=random();
   await db(config,'prepare_mp_link',{p_seller_id:user.id,p_state_hash:digest(state),p_launch_hash:digest(launch),p_verifier:verifier,p_source:req.body?.source==='app'?'app':'web'});
   const url=new URL(config.redirect);url.searchParams.set('launch',launch);url.searchParams.set('state',state);
   console.info('MP_LINK_START','ready');
   return json(res,200,{url:url.href});
  }catch(error){
   const allowed=['LINK_STORAGE_MISSING','LINK_STORAGE_DENIED','LINK_RATE_LIMIT','LINK_SERVER_AUTH_FAILED','LINK_STORAGE_FAILED','LINK_STORAGE_RESPONSE_INVALID'];
   const code=allowed.includes(error.message)?error.message:'LINK_START_FAILED';
   // Log only a fixed diagnostic code, never tokens, identities, or request URLs.
   console.error('MP_LINK_START',code);
   return json(res,code==='LINK_RATE_LIMIT'?429:502,{error:code});
  }
 }
 const url=new URL(req.url,config.origin),state=url.searchParams.get('state'),launch=url.searchParams.get('launch');
 if(!validNonce(state))return json(res,400,{error:'INVALID_LINK_ATTEMPT'});
 if(launch){
  if(!validNonce(launch))return json(res,400,{error:'INVALID_LINK_ATTEMPT'});
  try{
   const value=random();const attempt=await db(config,'launch_mp_link',{p_state_hash:digest(state),p_launch_hash:digest(launch),p_cookie_hash:digest(value)});
   console.info('MP_LINK_LAUNCH','ready');
   res.setHeader('Set-Cookie',cookie(value));return redirect(res,authorizationUrl(config,state,attempt.verifier,Boolean(checkout)));
  }catch(_){return json(res,400,{error:'INVALID_OR_EXPIRED_LINK'});}
 }
 let attempt,stage='session';
 try{
  const value=getCookie(req.headers.cookie);if(!validNonce(value))return json(res,400,{error:'INVALID_LINK_SESSION'});
  attempt=await db(config,'consume_mp_link',{p_state_hash:digest(state),p_cookie_hash:digest(value)});
  res.setHeader('Set-Cookie',cookie('',true));
  if(url.searchParams.has('error')){
   const denied=url.searchParams.get('error')==='access_denied';
   return redirect(res,returnUrl(config,attempt.source,denied?'cancelled':'error',denied?'':'PROVIDER_AUTH_FAILED'));
  }
  const code=url.searchParams.get('code');if(!code||code.length>2000)throw Error('INVALID_CODE');
  stage='provider';
  const identity=await exchangeIdentity(config,code,attempt.verifier,Boolean(checkout));
  stage='save';
  const link={p_state_hash:digest(state),p_seller_id:attempt.seller_id,p_mp_user_id:identity.userId,p_display_name:identity.display,p_holder_name:identity.holder};
  if(checkout)await db(config,'save_mp_checkout_link',{...link,p_encrypted_token:encryptToken(checkout,attempt.seller_id,identity.checkoutToken)});
  else await db(config,'complete_mp_link',link);
  console.info('MP_LINK_CALLBACK','linked');
  return redirect(res,returnUrl(config,attempt.source,'linked'));
 }catch(error){
  const allowed=['PROVIDER_INVALID_CLIENT','PROVIDER_INVALID_GRANT','PROVIDER_INVALID_SCOPE','PROVIDER_UNAUTHORIZED_CLIENT','PROVIDER_AUTH_FAILED','IDENTITY_MISMATCH','LINK_STORAGE_MISSING','LINK_STORAGE_DENIED','LINK_SERVER_AUTH_FAILED','LINK_STORAGE_FAILED'];
  const reason=allowed.includes(error.message)?error.message:'LINK_CALLBACK_FAILED';
  console.error('MP_LINK_CALLBACK',stage,reason);
  return redirect(res,returnUrl(config,attempt?.source||'web','error',reason));
 }
}
function returnUrl(config,source,result,reason=''){const suffix=reason?'&mp_reason='+encodeURIComponent(reason):'';return source==='app'?config.origin+'/mp-vinculado?result='+result+suffix:config.origin+'/perfil?view=settings&mp_link='+result+suffix+'#datos-cobro';}
