import { stripe, syncCheckout, syncPayment, syncSubscription, verifySignature } from '../_shared/billing.ts';

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Use POST.', { status: 405 });
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return new Response('Not configured.', { status: 503 });
  const payload = await req.text();
  if (!await verifySignature(payload, req.headers.get('stripe-signature') || '', secret)) return new Response('Invalid signature.', { status: 400 });
  try {
    const event = JSON.parse(payload), obj = event.data.object;
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) await syncCheckout(obj.id);
    else if (event.type.startsWith('customer.subscription.')) await syncSubscription(obj.id);
    else if (['invoice.paid', 'invoice.payment_failed'].includes(event.type)) {
      const sub = obj.parent?.subscription_details?.subscription || obj.subscription;
      if (sub) await syncSubscription(typeof sub === 'string' ? sub : sub.id);
    } else if (['charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'].includes(event.type)) {
      const charge = event.type.startsWith('charge.dispute.') ? await stripe('charges/' + encodeURIComponent(typeof obj.charge === 'string' ? obj.charge : obj.charge.id)) : obj;
      const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      if (pi) await syncPayment(pi);
    }
    return new Response('ok');
  } catch (e) { console.error('Webhook processing failed', e instanceof Error ? e.message : 'Unknown error'); return new Response('Please retry.', { status: 500 }); }
});
