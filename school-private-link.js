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
    return;
  }
  const button = document.querySelector('#request-school-access');
  const status = document.querySelector('#school-access-status');
  async function refresh(submit) {
    const { data } = await window.colegioLibreSupabase.auth.getSession();
    if (!data?.session?.access_token) return;
    const response = await fetch('/api/school-portal?' + new URLSearchParams({code,access:'1'}), {
      method:submit ? 'POST' : 'GET',headers:{Authorization:'Bearer '+data.session.access_token},cache:'no-store'
    });
    if (!response.ok) {
      if (submit) throw Error('No pudimos enviar tu solicitud. Volvé a intentar.');
      return;
    }
    const result = await response.json();
    button.hidden = result.status !== 'available';
    const messages = {pending:'Solicitud enviada. Tu colegio está revisando tu acceso.',
      rejected:'El colegio no autorizó tu acceso. Comunicate con su administración.'};
    status.textContent = messages[result.status] || '';
    status.hidden = !status.textContent;
    if (result.status === 'approved') {
      const destination = await window.colegoPrivateSchoolPath(code);
      if (destination) { link.href = destination; link.hidden = false; }
    }
  }
  button.addEventListener('click',async () => {
    button.disabled = true;
    try { await refresh(true); }
    catch { status.hidden = false; status.textContent = 'No pudimos confirmar el envío. Volvé a intentar.'; }
    finally { button.disabled = false; }
  });
  try { await refresh(false); } catch {
    status.hidden = false;
    status.textContent = 'No pudimos consultar tu acceso. Recargá la página para volver a intentar.';
  }
})();
