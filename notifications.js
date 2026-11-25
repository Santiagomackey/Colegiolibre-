(() => {
  if (window.Capacitor?.isNativePlatform?.() || !window.PushManager ||
      !window.Notification || !navigator.serviceWorker) return;
  const client = window.colegioLibreSupabase;
  if (!client?.auth) return;

  const publicKey = 'BI64lVCxWCEYaii9BfDBhNhAfZRgHYHk5GGULID4dbdaYV7N-0w2BG1F5iPCnSjpambJ_AP5HM1eXDXd0kAlJXQ';
  const applicationServerKey = Uint8Array.from(
    atob(publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='), c => c.charCodeAt(0)
  );
  const installed = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  let prompt;
  function offerPermission() {
    if (prompt || sessionStorage.getItem('colego-push-prompt')) return;
    prompt = document.createElement('aside');
    prompt.setAttribute('aria-label', 'Notificaciones del celular');
    Object.assign(prompt.style, {
      position:'fixed', top:'max(12px, env(safe-area-inset-top))', left:'12px', right:'12px',
      maxWidth:'420px', margin:'0 auto', zIndex:10000, padding:'16px', borderRadius:'12px',
      background:'#fff', color:'#102b50', border:'1px solid #ccd7e5', boxShadow:'0 4px 18px #102b5022'
    });
    prompt.innerHTML = '<p style="margin:0 0 8px">¿Querés recibir avisos de mensajes y ventas en tu celular?</p><button type="button">Activar notificaciones</button> <button type="button">Ahora no</button>';
    const [allow, later] = prompt.querySelectorAll('button');
    for (const button of [allow, later]) button.style.minHeight = '44px';
    function dismiss() {
      sessionStorage.setItem('colego-push-prompt', '1');
      prompt.remove();
      prompt = null;
    }
    allow.onclick = () => {
      const permission = Notification.requestPermission();
      dismiss();
      permission.then(() => synchronize(activeUser)).catch(() => {});
    };
    later.onclick = dismiss;
    document.body.append(prompt);
  }
  let activeUser;
  let queue = Promise.resolve();
  function synchronize(userId) {
    activeUser = userId;
    document.removeEventListener('click', requestPermission, true);
    if (installed && Notification.permission === 'default') {
      offerPermission();
      if (userId) return;
    } else if (userId && Notification.permission === 'default') {
      document.addEventListener('click', requestPermission, true);
      return;
    }
    queue = queue.then(async () => {
      if (userId !== activeUser) return;
      const registration = await navigator.serviceWorker.ready;
      if (userId !== activeUser) return;
      let subscription = await registration.pushManager.getSubscription();
      if (!userId) {
        if (subscription) await subscription.unsubscribe();
        return;
      }
      if (Notification.permission !== 'granted') return;
      subscription ||= await registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey});
      if (userId !== activeUser) return;
      const {endpoint, keys} = subscription.toJSON();
      const {error} = await client.rpc('register_web_push', {
        p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth
      });
      if (error) throw error;
    }).catch(() => console.warn('ColeGo could not register this browser for phone notifications.'));
  }
  function requestPermission(event) {
    if (!event.isTrusted || !activeUser) return;
    document.removeEventListener('click', requestPermission, true);
    Notification.requestPermission().then(result => {
      if (result === 'granted') synchronize(activeUser);
    }).catch(() => {});
  }
  client.auth.onAuthStateChange((event, session) => {
    if (['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT'].includes(event)) {
      synchronize(session?.user?.id || null);
    }
  });
})();
