import { connect } from 'node:http2';
import { sign } from 'node:crypto';
import { safePushPath } from './push-payload.js';

let cachedToken;
function providerToken() {
  const { APNS_KEY_ID: kid, APNS_TEAM_ID: iss, APNS_PRIVATE_KEY: key } = process.env;
  if (!kid || !iss || !key) throw Error('Faltan las credenciales de APNs.');
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken?.expires > now) return cachedToken.value;
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  const claims = encode({ alg: 'ES256', kid }) + '.' + encode({ iss, iat: now });
  const signature = sign('sha256', Buffer.from(claims), {
    key: key.replace(/\\n/g, '\n'), dsaEncoding: 'ieee-p1363'
  });
  cachedToken = { value: claims + '.' + signature.toString('base64url'), expires: now + 2400 };
  return cachedToken.value;
}

export async function sendApplePush(device, notice) {
  if (!/^[a-f0-9]+$/i.test(device.token)) throw Error('Token APNs inválido.');
  const authorization = 'bearer ' + providerToken();
  const host = process.env.APNS_ENVIRONMENT === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  const session = connect('https://' + host);
  try {
    await new Promise((resolve, reject) => {
      session.once('error', reject);
      session.setTimeout(8000, () => session.destroy(Error('APNs timeout')));
      const req = session.request({
        ':method': 'POST', ':path': '/3/device/' + device.token, authorization,
        'apns-topic': 'com.colegiolibre.app', 'apns-push-type': 'alert', 'apns-priority': '10'
      });
      let status;
      req.on('response', headers => { status = headers[':status']; });
      req.on('error', reject);
      req.on('end', () => status === 200 ? resolve() : reject(Object.assign(Error('APNs rechazó el envío.'), { status })));
      req.resume();
      req.end(JSON.stringify({
        aps: { alert: { title: String(notice.title || 'ColeGo').slice(0,120), body: String(notice.body || '').slice(0,240) }, sound: 'default' },
        url: safePushPath(notice.action_url), notification_id: String(notice.id)
      }));
    });
  } finally { session.destroy(); }
}
