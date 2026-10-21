import { db, checked, form, price, serverKey, site, stripe } from '../_shared/billing.ts';
import { checkoutTerms, policyVersion } from './checkout-terms.ts';

// Operator-only checks. The optional probe creates unpaid, short-lived checkouts
// for a synthetic customer; it never submits payment or grants membership.
export async function checkReadiness(token: string, checkoutProbe = false) {
  const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const supplied = new Uint8Array(await digest(token));
  const expected = new Uint8Array(await digest(serverKey()));
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= supplied[i] ^ expected[i];
  if (difference) return new Response('Unauthorized.', { status: 401 });
  let stage = 'monthly_price';
  try {
    const monthly = await stripe('prices/' + encodeURIComponent(price('monthly') || 'missing'));
    stage = 'lifetime_price';
    const lifetime = await stripe('prices/' + encodeURIComponent(price('lifetime') || 'missing'));
    stage = 'webhook_configuration';
    const endpoints = await stripe('webhook_endpoints?limit=100');
    const url = Deno.env.get('SUPABASE_URL') + '/functions/v1/stripe-webhook';
    const required = ['checkout.session.completed', 'checkout.session.async_payment_succeeded',
      'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
      'customer.subscription.paused', 'customer.subscription.resumed', 'invoice.paid', 'invoice.payment_failed',
      'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'];
    const webhook = endpoints.data.find((e: any) => e.url === url && e.status === 'enabled');
    const admin = db();
    stage = 'billing_customers_table';
    await checked(await admin.from('billing_customers').select('user_id').limit(0));
    stage = 'billing_purchases_table';
    await checked(await admin.from('billing_purchases').select('id').limit(0));
    // Storage is tested with the authenticated trainer role in verify_paid_access.sql.
    // Billing's server credential only needs the server-owned payment tables.
    const checks: Record<string, boolean> = {
      monthlyPrice: monthly.active && monthly.livemode && monthly.currency === 'usd' && monthly.unit_amount === 399 && monthly.recurring?.interval === 'month',
      lifetimePrice: lifetime.active && lifetime.livemode && lifetime.currency === 'usd' && lifetime.unit_amount === 1000 && lifetime.type === 'one_time',
      webhookEvents: !!webhook && required.every(event => webhook.enabled_events.includes(event) || webhook.enabled_events.includes('*')),
      signingSecretConfigured: !!Deno.env.get('STRIPE_WEBHOOK_SECRET'),
      billingDatabaseAccess: true,
    };
    if (checkoutProbe && Object.values(checks).every(Boolean)) {
      stage = 'checkout_customer';
      const customer = await stripe('customers', form({ name: 'FAINTR configuration verification',
        'metadata[faintr_verification]': 'unpaid_checkout_probe' }), 'faintr-readiness-customer-v1');
      const probeWindow = Math.floor(Date.now() / 300000);
      for (const plan of ['monthly', 'lifetime']) {
        stage = 'checkout_' + plan;
        const session = await stripe('checkout/sessions', form({ ...checkoutTerms(plan), customer: customer.id,
          mode: plan === 'monthly' ? 'subscription' : 'payment',
          'line_items[0][price]': price(plan)!, 'line_items[0][quantity]': '1',
          'metadata[faintr_verification]': 'unpaid_checkout_probe',
          success_url: site(), cancel_url: site(), expires_at: String(probeWindow * 300 + 2160),
        }), `faintr-readiness-${policyVersion}-${plan}-${probeWindow}`);
        checks['checkout_' + plan] = session.status === 'open' && session.payment_status === 'unpaid' && !!session.url && session.consent_collection?.terms_of_service === 'required';
      }
      stage = 'billing_portal';
      const portal = await stripe('billing_portal/sessions', form({ customer: customer.id, return_url: site() }));
      checks.billingPortal = !!portal.url;
    }
    return Response.json({ ok: Object.values(checks).every(Boolean), checks }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, stage, error: 'Configuration check failed. Inspect the server configuration.' }, { status: 503 });
  }
}
