import webpush from 'web-push';
import {safePushPath} from './push-payload.js';

const services = new Set(['https://fcm.googleapis.com', 'https://web.push.apple.com',
  'https://updates.push.services.mozilla.com']);

export async function sendWebPush(device, notice) {
  const endpoint = new URL(device.endpoint);
  if (!services.has(endpoint.origin) || endpoint.username || endpoint.password) {
    throw new Error('Invalid push service');
  }
  const payload = JSON.stringify({id: String(notice.id), title: String(notice.title || 'ColeGo').slice(0,120),
    body: String(notice.body || '').slice(0,240), url: safePushPath(notice.action_url)});
  await webpush.sendNotification({endpoint: device.endpoint, keys: {auth: device.auth, p256dh: device.p256dh}}, payload, {
    TTL: 86400, urgency: 'high', timeout: 8000,
    vapidDetails: {subject: 'https://www.colego.com.ar', publicKey: process.env.WEB_PUSH_PUBLIC_KEY,
      privateKey: process.env.WEB_PUSH_PRIVATE_KEY}
  });
}
