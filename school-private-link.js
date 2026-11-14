(async () => {
  const link = document.querySelector('#school-private-link');
  const code = new URLSearchParams(location.search).get('code');
  if (!link || !code) return;
  try {
    const { data } = await window.colegioLibreSupabase.auth.getSession();
    if (!data?.session?.access_token) return;
    const response = await fetch('/api/school-portal?code=' + encodeURIComponent(code) + '&summary=1', {
      headers: { Authorization:'Bearer ' + data.session.access_token }, cache:'no-store'
    });
    if (!response.ok) return;
    link.href = '/portal-colegio?code=' + encodeURIComponent(code);
    link.hidden = false;
  } catch (_) {
    // The public school page is usable even when the private portal is unavailable.
  }
})();
