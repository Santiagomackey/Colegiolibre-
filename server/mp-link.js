import crypto from 'node:crypto';
export const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
export const random=()=>crypto.randomBytes(32).toString('base64url');
export const challenge=value=>crypto.createHash('sha256').update(value).digest('base64url');
export const validNonce=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
export function configuration(env=process.env){
 env=Object.fromEntries(Object.entries(env).map(([key,value])=>[key,typeof value==='string'?value.trim():value]));
 const redirect=new URL(env.MERCADOPAGO_REDIRECT_URI||'https://www.colegiolibre.com/api/mercadopago-link');
 if(redirect.protocol!=='https:'||redirect.pathname!=='/api/mercadopago-link'||redirect.search||redirect.hash)throw Error('CONFIGURATION_REQUIRED');
 if(!env.MERCADOPAGO_CLIENT_ID||!env.MERCADOPAGO_CLIENT_SECRET||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('CONFIGURATION_REQUIRED');
 return {redirect:redirect.href,origin:redirect.origin,clientId:env.MERCADOPAGO_CLIENT_ID,clientSecret:env.MERCADOPAGO_CLIENT_SECRET,supabase:env.SUPABASE_URL,key:env.SUPABASE_SERVICE_ROLE_KEY};
}
export function authorizationUrl(config,state,verifier){const url=new URL('https://auth.mercadopago.com/authorization');Object.entries({client_id:config.clientId,response_type:'code',platform_id:'mp',state,redirect_uri:config.redirect,code_challenge:challenge(verifier),code_challenge_method:'S256',scope:'read'}).forEach(([key,value])=>url.searchParams.set(key,value));return url.href;}
export function getCookie(header){return String(header||'').split(';').map(value=>value.trim()).find(value=>value.startsWith('__Host-cl-mp='))?.slice('__Host-cl-mp='.length)||'';}
export function cookie(value,clear=false){return `__Host-cl-mp=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${clear?0:600}`;}
export async function db(config,name,args){
 const response=await fetch(config.supabase+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+config.key,'Content-Type':'application/json'},body:JSON.stringify(args)});
 // PostgREST returns HTTP 204 with no body for functions returning void.
 // Parsing that response as JSON incorrectly turns successful writes into errors.
 const body=await response.text();
 if(!response.ok){
  let reason={};try{reason=JSON.parse(body);}catch(_){}
  const code=['PGRST202','42883'].includes(reason.code)?'LINK_STORAGE_MISSING'
   :reason.code==='42501'?'LINK_STORAGE_DENIED'
   :reason.message==='TOO_MANY_ATTEMPTS'?'LINK_RATE_LIMIT'
   :[401,403].includes(response.status)?'LINK_SERVER_AUTH_FAILED':'LINK_STORAGE_FAILED';
  throw Error(code);
 }
 if(!body.trim())return null;
 try{return JSON.parse(body);}catch(_){throw Error('LINK_STORAGE_RESPONSE_INVALID');}
}
export async function authenticatedUser(config,request){const match=/^Bearer ([A-Za-z0-9._-]+)$/.exec(String(request.headers.authorization||''));if(!match)return null;const response=await fetch(config.supabase+'/auth/v1/user',{headers:{apikey:config.key,Authorization:'Bearer '+match[1]}});if(!response.ok)return null;const user=await response.json();return user?.id?user:null;}
export async function exchangeIdentity(config,code,verifier){
 const response=await fetch('https://api.mercadopago.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:config.clientId,client_secret:config.clientSecret,grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:config.redirect})});
 const token=await response.json();
 if(!response.ok){const codes={invalid_client:'PROVIDER_INVALID_CLIENT',invalid_grant:'PROVIDER_INVALID_GRANT',invalid_scope:'PROVIDER_INVALID_SCOPE',unauthorized_client:'PROVIDER_UNAUTHORIZED_CLIENT'};throw Error(codes[token.error]||'PROVIDER_AUTH_FAILED');}
 if(!token.access_token||!/^\d+$/.test(String(token.user_id)))throw Error('PROVIDER_AUTH_FAILED');
 // Only account identity is retained. Access/refresh tokens never reach the
 // browser or database: manual transfers do not need ongoing account access.
 let holder='',display='Cuenta Mercado Pago';
 try{const account=await fetch('https://api.mercadolibre.com/users/me',{headers:{Authorization:'Bearer '+token.access_token}});if(account.ok){const profile=await account.json();if(String(profile.id)!==String(token.user_id))throw Error('IDENTITY_MISMATCH');holder=[profile.first_name,profile.last_name].filter(value=>typeof value==='string').join(' ').trim();display=holder||profile.nickname||display;}}
 catch(error){if(error.message==='IDENTITY_MISMATCH')throw error;}
 return {userId:String(token.user_id),display:String(display).slice(0,100),holder:holder.slice(0,100)};
}
