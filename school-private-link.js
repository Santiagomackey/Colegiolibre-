window.colegoPrivateSchoolPath = async function (code) {
  try {
    const { data } = await window.colegioLibreSupabase.auth.getSession();
    if (!data?.session?.access_token) return;
    const response = await fetch('/api/school-portal?code=' + encodeURIComponent(code) + '&summary=1', {
      headers: { Authorization:'Bearer ' + data.session.access_token }, cache:'no-store'
    });
    if (!response.ok) return;
    const { path } = await response.json();
    if (!/^\/(?:comunidad\/[a-z0-9_-]{1,80}|[a-z0-9_-]+-school|colegio-[a-z0-9_-]+)$/.test(path || '')) return;
    return path;
  } catch (_) { return null; }
};
(async () => {
  const link = document.querySelector('#school-private-link');
  const code = location.pathname.match(/^\/colegio\/([a-z0-9_-]{1,80})\/?$/i)?.[1] || new URLSearchParams(location.search).get('code');
  if (!link || !code) return;
  const path = await window.colegoPrivateSchoolPath(code);
  if (path) {
    link.href = path;
    link.hidden = false;
  }
})();
