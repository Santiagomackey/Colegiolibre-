(() => {
  "use strict";

  const form = document.getElementById("mp-alias-form");
  if (!form) return;

  const transfers = window.colegioLibreTransfers;
  const auth = window.colegioLibreSupabase.auth;
  const message = document.getElementById("mp-alias-message");
  const signIn = document.getElementById("mp-alias-sign-in");
  const alias = form.elements.alias;
  const holder = form.elements.holder_name;
  const save = form.querySelector('[type="submit"]');
  const checkout = window.colegioLibreMercadoPago;
  const checkoutSettings = document.getElementById('mp-checkout-settings');
  const checkoutStatus = document.getElementById('mp-checkout-link-status');
  const checkoutButton = document.getElementById('mp-checkout-link');
  let checkoutLinked = false;
  let linkError = false;

  function renderCheckoutSettings() {
    if (!checkoutStatus || !checkoutButton) return;
    checkoutStatus.textContent = linkError
      ? transfers.text('No pudimos vincular la cuenta. Volvé a intentar.', 'Could not connect the account. Try again.')
      : checkoutLinked
        ? transfers.text('Checkout de Mercado Pago activo.', 'Mercado Pago checkout is active.')
        : transfers.text('Vinculá tu cuenta para recibir pagos desde el checkout de Mercado Pago.', 'Connect your account to receive payments through Mercado Pago checkout.');
    checkoutButton.textContent = checkoutLinked
      ? transfers.text('Volver a vincular Mercado Pago', 'Reconnect Mercado Pago')
      : transfers.text('Vincular Mercado Pago', 'Connect Mercado Pago');
  }

  checkoutButton?.addEventListener('click', async () => {
    checkoutButton.disabled = true;
    linkError = false;
    renderCheckoutSettings();
    try {
      const { data } = await auth.getSession();
      const response = await fetch('/api/mercadopago-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (data?.session?.access_token || '') },
        body: JSON.stringify({ source: window.Capacitor?.isNativePlatform?.() ? 'app' : 'web' })
      });
      const payload = await response.json();
      if (!response.ok || !payload.url) throw Error('MP_LINK_FAILED');
      await checkout.open(payload.url);
    } catch {
      linkError = true;
      renderCheckoutSettings();
    } finally {
      checkoutButton.disabled = false;
    }
  });

  const messages = {
    loadFailed: ["No pudimos cargar tus datos de cobro. Volvé a intentar.", "We could not load your payment details. Try again."],
    saving: ["Guardando alias…", "Saving alias…"],
    saved: ["Alias guardado.", "Alias saved."]
  };

  let ownerId = null;
  let messageCode = "";
  let saveError = null;
  let revision = 0;
  let dirty = false;
  let saving = false;
  let reloadAfterSave = false;

  function renderMessage() {
    message.textContent = saveError
      ? transfers.errorMessage(saveError)
      : messages[messageCode] ? transfers.text(...messages[messageCode]) : "";
  }

  function show(code = "", error = null) {
    messageCode = code;
    saveError = error;
    renderMessage();
  }

  async function load() {
    if (saving) {
      reloadAfterSave = true;
      return;
    }

    const current = ++revision;
    try {
      const { data, error } = await auth.getSession();
      if (current !== revision) return;
      if (error) throw error;

      const user = data?.session?.user;
      if ((user?.id || null) !== ownerId) {
        ownerId = user?.id || null;
        form.reset();
        form.hidden = true;
        dirty = false;
        show();
      }
      if (signIn) signIn.hidden = Boolean(user);
      if (checkoutSettings) checkoutSettings.hidden = true;
      if (!user) return;

      if (checkout && checkoutSettings) {
        void checkout.request('?seller=1').then(status => {
          if (current !== revision || !status.enabled) return;
          checkoutLinked = Boolean(status.linked);
          linkError = new URLSearchParams(location.search).get('mp_link') === 'error';
          checkoutSettings.hidden = false;
          renderCheckoutSettings();
        }).catch(() => {});
      }

      const details = await transfers.rpc("get_my_payment_details");
      if (current !== revision) return;

      if (!dirty) {
        const legacyAlias = String(user.user_metadata?.mercadopago_alias || "").trim().toLowerCase();
        alias.value = details?.method === "mercado_pago"
          ? details.alias || ""
          : !details && /^[a-z0-9.-]{6,20}$/.test(legacyAlias) ? legacyAlias : "";
        holder.value = details?.method === "mercado_pago" ? details.holder_name || "" : "";
      }
      form.hidden = false;
      if (messageCode === "loadFailed") show();
    } catch {
      if (current !== revision) return;
      form.hidden = true;
      show("loadFailed");
    }
  }

  form.addEventListener("input", () => { dirty = true; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving || form.hidden || !ownerId) return;

    const current = ++revision;
    saving = true;
    save.disabled = alias.disabled = holder.disabled = true;
    show("saving");
    try {
      const { data, error } = await auth.getSession();
      if (current !== revision) return;
      if (error || data?.session?.user?.id !== ownerId) {
        reloadAfterSave = true;
        throw new Error("AUTH_REQUIRED");
      }
      const recipient = await transfers.saveMercadoPagoAlias(alias.value, holder.value);
      if (current !== revision) return;
      alias.value = recipient.alias;
      holder.value = recipient.holder_name;
      dirty = false;
      show("saved");
    } catch (error) {
      if (current === revision) show("", error);
    } finally {
      saving = false;
      save.disabled = alias.disabled = holder.disabled = false;
      if (reloadAfterSave) {
        reloadAfterSave = false;
        void load();
      }
    }
  });

  window.addEventListener("colegiolibre:languagechange", () => {
    renderMessage();
    renderCheckoutSettings();
  });
  window.addEventListener("colegiolibre:auth-state", () => void load());
  window.addEventListener("pageshow", (event) => { if (event.persisted) void load(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void load(); });
  window.addEventListener("pagehide", () => {
    ++revision;
    ownerId = null;
    dirty = false;
    form.reset();
    form.hidden = true;
    if (signIn) signIn.hidden = true;
    show();
  });

  void load();
})();
