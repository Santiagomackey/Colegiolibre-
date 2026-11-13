(() => {
  'use strict';
  const root = '/api/mercadopago-checkout';

  async function request(query = '', body) {
    const { data, error } = await window.colegioLibreSupabase.auth.getSession();
    if (error || !data?.session?.access_token) throw Error('AUTH_REQUIRED');
    const headers = { Authorization: 'Bearer ' + data.session.access_token };
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(root + query, {
      method: body ? 'POST' : 'GET', headers, cache: 'no-store',
      body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json();
    if (!response.ok) throw Error(payload.error || 'MP_CHECKOUT_UNAVAILABLE');
    return payload;
  }

  async function open(raw) {
    const url = new URL(raw, location.origin);
    const checkout = url.origin === 'https://www.mercadopago.com.ar' && url.pathname.startsWith('/checkout/');
    const link = url.origin === location.origin && url.pathname === '/api/mercadopago-link';
    const sellerLink = /^https:\/\/mpago[.]la\/[A-Za-z0-9]{4,64}$/.test(raw);
    const wallet = url.href === 'https://www.mercadopago.com.ar/';
    if (!checkout && !link && !sellerLink && !wallet) throw Error('MP_INVALID_REDIRECT');
    const capacitor = window.Capacitor;
    const browser = capacitor?.isNativePlatform?.()
      ? capacitor.Plugins?.Browser || capacitor.registerPlugin?.('Browser') : null;
    if (browser) await browser.open({ url: url.href });
    else location.assign(url.href);
  }

  window.colegioLibreMercadoPago = { request, open };
})();
