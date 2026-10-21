import { db, checked, price, serverKey, stripe } from '../_shared/billing.ts';

// Operator-only, read-only checks. Never return credentials or customer records.
export async function checkReadiness(token: string) {
  const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const supplied = new Uint8Array(await digest(token));
  const expected = new Uint8Array(await digest(serverKey()));
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= supplied[i] ^ expected[i];
  if (difference) return new Response('Unauthorized.', { status: 401 });
  try {
    const monthly = await stripe('prices/' + encodeURIComponent(price('monthly') || 'missing'));
    const lifetime = await stripe('prices/' + encodeURIComponent(price('lifetime') || 'missing'));
    const endpoints = await stripe('webhook_endpoints?limit=100');
    const url = Deno.env.get('SUPABASE_URL') + '/functions/v1/stripe-webhook';
    const required = ['checkout.session.completed', 'checkout.session.async_payment_succeeded',
      'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
      'customer.subscription.paused', 'customer.subscription.resumed', 'invoice.paid', 'invoice.payment_failed',
      'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'];
    const webhook = endpoints.data.find((e: any) => e.url === url && e.status === 'enabled');
    const admin = db();
    await checked(await admin.from('billing_customers').select('user_id').limit(0));
    await checked(await admin.from('billing_purchases').select('id').limit(0));
    await checked(await admin.from('user_storage').select('battles,vip_settings').limit(0));
    const checks = {
      monthlyPrice: monthly.active && monthly.livemode && monthly.currency === 'usd' && monthly.unit_amount === 399 && monthly.recurring?.interval === 'month',
      lifetimePrice: lifetime.active && lifetime.livemode && lifetime.currency === 'usd' && lifetime.unit_amount === 1000 && lifetime.type === 'one_time',
      webhookEvents: !!webhook && required.every(event => webhook.enabled_events.includes(event) || webhook.enabled_events.includes('*')),
      signingSecretConfigured: !!Deno.env.get('STRIPE_WEBHOOK_SECRET'),
      databaseAccess: true,
    };
    return Response.json({ ok: Object.values(checks).every(Boolean), checks }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, error: 'Configuration check failed. Inspect the server configuration.' }, { status: 503 });
  }
}
