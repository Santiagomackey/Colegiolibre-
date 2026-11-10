(() => {
 const params=new URLSearchParams(location.search),result=['linked','cancelled','error'].includes(params.get('result'))?params.get('result'):'error';
 const reasons=['PROVIDER_INVALID_CLIENT','PROVIDER_INVALID_GRANT','PROVIDER_INVALID_SCOPE','PROVIDER_UNAUTHORIZED_CLIENT','PROVIDER_AUTH_FAILED','LINK_CALLBACK_FAILED','LINK_STORAGE_MISSING','LINK_STORAGE_DENIED','LINK_SERVER_AUTH_FAILED','LINK_STORAGE_FAILED','IDENTITY_MISMATCH'];
 const reason=params.get('mp_reason');
 const path='/perfil?view=settings&mp_link='+result+(reasons.includes(reason)?'&mp_reason='+encodeURIComponent(reason):'')+'#datos-cobro';
 const open=document.querySelector('#mp-result-open');open.href='colegiolibre://open?path='+encodeURIComponent(path);
 document.querySelector('#mp-result-web').href=path;
 if(document.documentElement.dataset.language==='en'){document.documentElement.lang='en';document.querySelector('#mp-result-title').textContent='Return to ColegioLibre';document.querySelector('#mp-result-copy').textContent='Open the app to continue with your account.';open.textContent='Open ColegioLibre';document.querySelector('#mp-result-web').textContent='Continue on the website';}
})();
