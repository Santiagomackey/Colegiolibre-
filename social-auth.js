(() => {
  'use strict';
  let pending = false;
  const text = (es,en) => document.documentElement.dataset.language === 'en' ? en : es;
  window.colegioLibreSocialAuth = {
    async signIn(provider,next='/') {
      if (!['google','apple'].includes(provider) || pending) return;
      pending = true;
      const name = provider === 'apple' ? 'Apple' : 'Google';
      const status = document.querySelector('#social-auth-status');
      const buttons = document.querySelectorAll('[data-social-provider]');
      buttons.forEach(button => {button.disabled=true});
      if(status) status.textContent=text(`Conectando con ${name}…`,`Connecting to ${name}…`);
      try {
        const native=Boolean(window.Capacitor?.isNativePlatform?.());
        const base=String(window.colegioLibreConfig?.publicSiteUrl || window.location.origin).replace(/\/$/,'');
        const callback=new URL('/auth-callback',base);
        const destination=new URL(next,base);
        callback.searchParams.set('next',destination.origin===new URL(base).origin ? destination.pathname+destination.search : '/');
        callback.searchParams.set('source',native?'app':'web');
        const {data,error}=await window.colegioLibreSupabase.auth.signInWithOAuth({provider,options:{redirectTo:callback.href,skipBrowserRedirect:true,scopes:provider==='apple'?'email name':'email profile'}});
        if(error)throw error;
        if(!data?.url)throw Error('Missing OAuth URL');
        const browser=window.Capacitor?.Plugins?.Browser || (native?window.Capacitor?.registerPlugin?.('Browser'):null);
        if(native && browser?.open) await browser.open({url:data.url});
        else window.location.assign(data.url);
      } catch(error) {
        if(status) status.textContent=text(`No pudimos iniciar sesión con ${name}. Probá nuevamente o ingresá con tu email.`,`We couldn't sign you in with ${name}. Try again or use your email.`);
        console.error('Social sign-in failed',error?.code || 'oauth_error');
      } finally {
        pending=false;
        buttons.forEach(button=>{button.disabled=false});
      }
    }
  };
})();
