(() => {
  'use strict';
  const checkout = window.colegioLibreMercadoPago;
  const auth = window.colegioLibreSupabase?.auth;
  const card = document.querySelector('[data-mp-connect-card]');
  if (!checkout || !auth || !card) return;

  const button = card.querySelector('[data-mp-connect]');
  const status = card.querySelector('[data-mp-status]');
  const login = card.querySelector('[data-mp-login]');
  const text = (es, en) => document.documentElement.dataset.language === 'en' ? en : es;
  let revision = 0;
  let linked = false;
  let ready = false;
  let guest = false;
  let busy = false;
  let failure = '';
  const result = new URLSearchParams(location.search).get('mp_link');

  function render() {
    button.hidden = guest;
    login.hidden = !guest;
    button.disabled = busy || !ready;
    button.textContent = linked ? text('Volver a conectar Mercado Pago','Reconnect Mercado Pago') : text('Conectar Mercado Pago','Connect Mercado Pago');
    status.textContent = failure || (linked ? text('Cuenta conectada para recibir pagos.','Account connected to receive payments.') :
      guest ? text('Iniciá sesión para conectar tu cuenta.','Sign in to connect your account.') :
      ready ? (result === 'error' ? text('Mercado Pago no completó la vinculación. Volvé a intentar.','Mercado Pago could not complete the connection. Try again.') :
        text('Conectá la cuenta donde querés recibir tus ventas.','Connect the account where you want to receive sales payments.')) :
      text('La conexión de Mercado Pago no está disponible en este momento.','The Mercado Pago connection is currently unavailable.'));
  }

  async function load() {
    const current = ++revision;
    try {
      const { data, error } = await auth.getSession();
      if (current !== revision) return;
      if (error) throw error;
      guest = !data?.session?.user;
      const details = guest ? null : await checkout.request('?seller=1');
      if (current !== revision) return;
      linked = Boolean(details?.linked);
      ready = Boolean(details?.enabled);
      render();
      if (linked && result === 'linked') {
        const destination = sessionStorage.getItem('colegiolibre-mp-onboarding-next');
        sessionStorage.removeItem('colegiolibre-mp-onboarding-next');
        if (destination) {
          const next = new URL(destination, location.origin);
          if (next.origin === location.origin) location.replace(next.pathname + next.search);
        }
      }
    } catch (_) {
      if (current !== revision) return;
      linked = ready = false;
      render();
    }
  }

  button.addEventListener('click', async () => {
    if (busy || !ready) return;
    busy = true;
    failure = '';
    render();
    try { await checkout.connect(); }
    catch (_) { failure = text('No pudimos abrir Mercado Pago. Volvé a intentar.','Could not open Mercado Pago. Try again.'); }
    finally { busy = false; render(); }
  });
  window.addEventListener('colegiolibre:languagechange', render);
  window.addEventListener('colegiolibre:auth-state', () => void load());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void load(); });
  void load();
})();
