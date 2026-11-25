// Resolve the first redirect here so an upstream outage is handled on the login page.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).end();

  const params = new URL(req.url, 'https://www.colego.com.ar').searchParams;
  const upstream = new URL('/auth/v1/authorize', process.env.SUPABASE_URL || 'https://riqhwmszshleyyaxlwqu.supabase.co');
  try {
    const callback = new URL(params.get('redirect_to'));
    if (callback.origin !== 'https://www.colego.com.ar' || callback.pathname !== '/auth-callback') {
      return res.status(400).end();
    }
    upstream.searchParams.set('provider', 'google');
    upstream.searchParams.set('redirect_to', callback.href);
    upstream.searchParams.set('scopes', 'email profile');
    for (const key of ['code_challenge', 'code_challenge_method']) {
      if (params.has(key)) upstream.searchParams.set(key, params.get(key));
    }
    const response = await fetch(upstream, {redirect: 'manual', signal: AbortSignal.timeout(8000)});
    const location = response.headers.get('location');
    if (response.status !== 302 || !location || new URL(location).origin !== 'https://accounts.google.com') {
      return res.status(503).json({error: 'google_unavailable'});
    }
    return res.status(200).json({url: location});
  } catch {
    return res.status(503).json({error: 'google_unavailable'});
  }
}
