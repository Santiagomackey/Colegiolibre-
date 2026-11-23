(() => {
  if (window.Capacitor?.isNativePlatform?.() || !window.PushManager ||
      !window.Notification || !navigator.serviceWorker) return;
  const client = window.colegioLibreSupabase;
  if (!client?.auth) return;

  const publicKey = 'BI64lVCxWCEYaii9BfDBhNhAfZRgHYHk5GGULID4dbdaYV7N-0w2BG1F5iPCnSjpambJ_AP5HM1eXDXd0kAlJXQ';
  const applicationServerKey = Uint8Array.from(
    atob(publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='), c => c.charCodeAt(0)
  );
  let activeUser;
  let queue = Promise.resolve();
  function synchronize(userId) {
    activeUser = userId;
    document.removeEventListener('click', requestPermission, true);
    if (userId && Notification.permission === 'default') {
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
