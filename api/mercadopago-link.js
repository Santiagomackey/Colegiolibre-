import {configuration,random,digest,validNonce,authorizationUrl,cookie,getCookie,db,authenticatedUser,exchangeIdentity} from '../server/mp-link.js';
function json(res,status,body){res.status(status);res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(body));}
function redirect(res,url){res.status(303);res.setHeader('Location',url);res.end();}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return json(res,405,{error:'METHOD_NOT_ALLOWED'});}
 let config;
 try{config=configuration();}catch(_){return json(res,503,{error:'LINK_NOT_CONFIGURED'});}
 if(req.method==='POST'){
  try{
   const user=await authenticatedUser(config,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});
   const state=random(),launch=random(),verifier=random();
   await db(config,'prepare_mp_link',{p_seller_id:user.id,p_state_hash:digest(state),p_launch_hash:digest(launch),p_verifier:verifier,p_source:req.body?.source==='app'?'app':'web'});
   const url=new URL(config.redirect);url.searchParams.set('launch',launch);url.searchParams.set('state',state);
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
   res.setHeader('Set-Cookie',cookie(value));return redirect(res,authorizationUrl(config,state,attempt.verifier));
  }catch(_){return json(res,400,{error:'INVALID_OR_EXPIRED_LINK'});}
 }
 let attempt;
 try{
  const value=getCookie(req.headers.cookie);if(!validNonce(value))return json(res,400,{error:'INVALID_LINK_SESSION'});
  attempt=await db(config,'consume_mp_link',{p_state_hash:digest(state),p_cookie_hash:digest(value)});
  res.setHeader('Set-Cookie',cookie('',true));
  if(url.searchParams.has('error'))return redirect(res,returnUrl(config,attempt.source,'cancelled'));
  const code=url.searchParams.get('code');if(!code||code.length>2000)throw Error('INVALID_CODE');
  const identity=await exchangeIdentity(config,code,attempt.verifier);
  await db(config,'complete_mp_link',{p_state_hash:digest(state),p_seller_id:attempt.seller_id,p_mp_user_id:identity.userId,p_display_name:identity.display,p_holder_name:identity.holder});
  return redirect(res,returnUrl(config,attempt.source,'linked'));
 }catch(_){return redirect(res,returnUrl(config,attempt?.source||'web','error'));}
}
function returnUrl(config,source,result){return source==='app'?config.origin+'/mp-vinculado?result='+result:config.origin+'/perfil?view=settings&mp_link='+result+'#datos-cobro';}
