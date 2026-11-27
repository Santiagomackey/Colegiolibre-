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
  const field = key => card.querySelector('[data-billing-' + key + ']');
  const transfers = window.colegioLibreTransfers;
  const form = field('form');
  let recipient = null;
  let owner = '';
  let editing = false;
  let detailsReady = false;
  let saving = false;
  let known = false;
  let revision = 0;
  let linked = false;
  let ready = false;
  let guest = false;
  let busy = false;
  let failure = '';
  const result = new URLSearchParams(location.search).get('mp_link');

  function render() {
    const hasAlias = recipient?.method === 'mercado_pago';
    const showDetails = !guest && (linked || hasAlias);
    field('state').textContent = guest ? 'Sin conectar' : !known ? 'Estado no disponible' : linked ? 'Conectada' : 'Sin conectar';
    card.setAttribute?.('data-billing-mode', linked ? 'linked' : 'unlinked');
    field('intro').textContent = showDetails && hasAlias ? 'Estos datos se muestran al comprador cuando elige pagar por transferencia.' : 'Administrá cómo cobrás tus ventas en ColeGo.';
    field('prompt').hidden = linked;
    field('edit').hidden = !showDetails || !detailsReady || editing || recipient?.method === 'bank';
    field('details').hidden = !showDetails || editing;
    field('alias').textContent = hasAlias ? recipient.alias || 'Sin cargar' : 'Sin cargar';
    field('holder').textContent = hasAlias ? recipient.holder_name || 'Sin cargar' : 'Sin cargar';
    field('copy').hidden = !hasAlias || !recipient.alias;
    form.hidden = !editing;
    button.hidden = guest;
    login.hidden = !guest;
    button.disabled = busy || !ready;
    button.textContent = linked ? text('Volver a conectar Mercado Pago','Reconnect Mercado Pago') : text('Conectar Mercado Pago','Connect Mercado Pago');
    status.textContent = failure || (linked ? text('Cuenta conectada para recibir pagos.','Account connected to receive payments.') :
      guest ? text('Iniciá sesión para conectar tu cuenta.','Sign in to connect your account.') :
      ready ? (result === 'error' ? text('Mercado Pago no completó la vinculación. Volvé a intentar.','Mercado Pago could not complete the connection. Try again.') :
        text('Vas a ir a Mercado Pago para autorizar la conexión con ColeGo.','You will authorize the connection in Mercado Pago.')) :
      text('La conexión de Mercado Pago no está disponible en este momento.','The Mercado Pago connection is currently unavailable.'));
  }

  async function load() {
    const current = ++revision;
    try {
      const { data, error } = await auth.getSession();
      if (current !== revision) return;
      if (error) throw error;
      guest = !data?.session?.user;
      const userId = data?.session?.user?.id || '';
      if (owner !== userId) {
        owner = userId;
        recipient = null;
        detailsReady = editing = linked = ready = known = false;
        field('message').textContent = '';
        render();
      }
      const [connection, settings] = await Promise.allSettled([
        guest ? null : checkout.request('?seller=1'),
        guest || !transfers ? null : transfers.rpc('get_my_payment_details')
      ]);
      const details = connection.value;
      if (current !== revision) return;
      known = connection.status === 'fulfilled' && Boolean(details);
      detailsReady = settings.status === 'fulfilled';
      if (detailsReady) recipient = settings.value;
      if (!guest && !detailsReady) field('message').textContent = 'No pudimos cargar los datos de transferencia.';
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
      linked = ready = known = detailsReady = editing = false;
      recipient = null;
      render();
    }
  }

  field('edit').addEventListener('click', () => {
    if (!detailsReady || guest || recipient?.method === 'bank') return;
    editing = true;
    form.elements.alias.value = recipient?.alias || '';
    form.elements.holder.value = recipient?.holder_name || '';
    field('message').textContent = '';
    render();
    form.elements.alias.focus();
  });
  field('cancel').addEventListener('click', () => { editing = false; render(); field('edit').focus(); });
  field('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(recipient.alias);
      field('message').textContent = 'Alias copiado.';
    } catch (_) { field('message').textContent = 'Podés seleccionar y copiar el alias.'; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !editing || !detailsReady || !owner) return;
    const currentOwner = owner;
    const submit = form.querySelector('[type=submit]');
    saving = submit.disabled = true;
    try {
      const saved = await transfers.saveMercadoPagoAlias(form.elements.alias.value, form.elements.holder.value);
      if (currentOwner !== owner) return;
      recipient = { ...saved, method: 'mercado_pago' };
      editing = false;
      render();
      field('message').textContent = 'Datos guardados.';
      field('edit').focus();
    } catch (error) {
      if (currentOwner === owner) field('message').textContent = transfers.errorMessage(error);
    } finally { saving = submit.disabled = false; }
  });
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
