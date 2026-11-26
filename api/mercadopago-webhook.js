import { config, select, send } from '../server/school-portal.js';
import { mp, notifyRejectedRenewal, signedNotification, subscriptionFields, syncSubscription } from '../server/school-billing.js';

export default async function handler(req,res) {
  if (req.method !== 'POST') return send(res,405,{ok:false});
  try {
    const cfg = config();
    const type = req.query?.type || req.body?.type;
    if (!['subscription_preapproval','subscription_authorized_payment'].includes(type)) return send(res,200,{ignored:true});
    const id = signedNotification(cfg.webhook,req);
    if (!id) return send(res,401,{ok:false});
    const invoice = type === 'subscription_authorized_payment' ? await mp(cfg,'/authorized_payments/'+id) : null;
    const providerId = invoice ? invoice.preapproval_id : id;
    if (!providerId) return send(res,200,{ignored:true});
    const [subscription] = await select(cfg,'institution_subscriptions',subscriptionFields,{provider_subscription_id:providerId});
    if (!subscription) return send(res,503,{ok:false});
    const synced = await syncSubscription(cfg,subscription);
    if (synced?.renewalFailed) await notifyRejectedRenewal(cfg,synced,invoice);
    return send(res,200,{ok:true});
  } catch (_) {
    return send(res,503,{ok:false});
  }
}
