(() => {
 const params=new URLSearchParams(location.search),result=['linked','cancelled','error'].includes(params.get('result'))?params.get('result'):'error';
 const path='/perfil?view=settings&mp_link='+result+'#datos-cobro';
 const open=document.querySelector('#mp-result-open');open.href='colegiolibre://open?path='+encodeURIComponent(path);
 document.querySelector('#mp-result-web').href=path;
 if(document.documentElement.dataset.language==='en'){document.documentElement.lang='en';document.querySelector('#mp-result-title').textContent='Return to ColegioLibre';document.querySelector('#mp-result-copy').textContent='Open the app to continue with your account.';open.textContent='Open ColegioLibre';document.querySelector('#mp-result-web').textContent='Continue on the website';}
})();
