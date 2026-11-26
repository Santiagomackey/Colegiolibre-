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
        const config = window.colegioLibreConfig;
        if (provider === 'apple' && config?.supabaseUrl && config.supabaseKey) {
          const settings = await fetch(config.supabaseUrl + '/auth/v1/settings', {headers:{apikey:config.supabaseKey}});
          if (settings.ok && (await settings.json()).external?.apple === false) {
            if (status) status.textContent = text('Apple todavía no está habilitado. Podés ingresar con Google o email.', 'Apple sign-in is not available yet. Use Google or email.');
            return;
          }
        }
        const native=Boolean(window.Capacitor?.isNativePlatform?.());
        const base=String(window.colegioLibreConfig?.publicSiteUrl || window.location.origin).replace(/\/$/,'');
        const callback=new URL('/auth-callback',base);
        const destination=new URL(next,base);
        callback.searchParams.set('next',destination.origin===new URL(base).origin ? destination.pathname+destination.search : '/');
        callback.searchParams.set('source',native?'app':'web');
        const {data,error}=await window.colegioLibreSupabase.auth.signInWithOAuth({provider,options:{redirectTo:callback.href,skipBrowserRedirect:true,scopes:provider==='apple'?'email name':'email profile'}});
        if(error)throw error;
        if(!data?.url)throw Error('Missing OAuth URL');
        let authorizationUrl = data.url;
        if (provider === 'google') {
          const endpoint = new URL('/api/google-signin', base);
          endpoint.search = new URL(data.url).search;
          const response = await fetch(endpoint, {cache: 'no-store'});
          if (!response.ok) {
            if (status) status.textContent = text('No pudimos conectar con Google ahora. Esperá unos segundos y volvé a intentarlo.', 'Google sign-in is temporarily unavailable. Try again in a moment.');
            return;
          }
          authorizationUrl = (await response.json()).url;
          if (new URL(authorizationUrl).origin !== 'https://accounts.google.com') throw Error('Unexpected authorization URL');
        }
        try {
          sessionStorage.setItem('colego-oauth-return', JSON.stringify({next: callback.searchParams.get('next'), at: Date.now()}));
        } catch {}
        const browser=window.Capacitor?.Plugins?.Browser || (native?window.Capacitor?.registerPlugin?.('Browser'):null);
        if(native && browser?.open) await browser.open({url:authorizationUrl});
        else window.location.assign(authorizationUrl);
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
