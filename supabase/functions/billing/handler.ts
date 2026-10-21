import { db, stripe, form, price, site, syncCheckout, checked } from '../_shared/billing.ts';
import { checkReadiness } from './readiness.ts';

export async function handleBilling(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = [site(), 'https://faintr.pages.dev'];
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : site(),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  if (origin && !allowed.includes(origin)) return reply({ error: 'Invalid origin.' }, 403);
  const token = req.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (req.headers.get('x-faintr-readiness') === '1') {
    const body = await req.json().catch(() => ({}));
    return checkReadiness(req.headers.get('apikey') || token || '', body.checkoutProbe === true);
  }
  if (!token) return reply({ error: 'Sign in first.' }, 401);
  const admin = db();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return reply({ error: 'Sign in first.' }, 401);
  try {
    const body = await req.json();
    if (body.action === 'confirm') {
      if (typeof body.sessionId !== 'string' || !/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(body.sessionId)) return reply({ error: 'Invalid checkout.' }, 400);
      await syncCheckout(body.sessionId, user.id);
      return reply({ ok: true });
    }
    let customer = await checked(await admin.from('billing_customers').select('customer_id').eq('user_id', user.id).maybeSingle());
    if (body.action === 'delete-account') {
      if (customer) {
        const subs = await stripe('subscriptions?customer=' + encodeURIComponent(customer.customer_id) + '&status=all&limit=100');
        if (subs.data.some((s: any) => !['canceled', 'incomplete_expired'].includes(s.status) && !s.cancel_at_period_end && !s.cancel_at)) {
          return reply({ error: 'Cancel your subscription in Manage billing before deleting your account. This prevents future renewal charges.' }, 409);
        }
      }
      const deleted = await admin.auth.admin.deleteUser(user.id);
      if (deleted.error) throw new Error('Could not delete your account.');
      return reply({ ok: true });
    }
    if (body.action === 'portal') {
      if (!customer) return reply({ error: 'No billing account yet.' }, 400);
      const session = await stripe('billing_portal/sessions', form({ customer: customer.customer_id, return_url: site() }));
      return reply({ url: session.url });
    }
    if (body.action !== 'checkout' || !['monthly', 'lifetime'].includes(body.plan)) return reply({ error: 'Choose a valid plan.' }, 400);
    if (!price(body.plan)) return reply({ error: 'Checkout is not available yet.' }, 503);
    const purchases = await checked(await admin.from('billing_purchases').select('kind,active,expires_at').eq('user_id', user.id).eq('active', true));
    if (purchases.some((p: any) => p.kind === 'lifetime' || (p.kind === 'monthly' && Date.parse(p.expires_at) > Date.now()))) {
      return reply({ error: 'You already have access. Manage your current plan before starting another.' }, 409);
    }
    if (!customer) {
      const made = await stripe('customers', form({ email: user.email || '', 'metadata[faintr_user]': user.id }), `faintr-customer-${user.id}`);
      await checked(await admin.from('billing_customers').upsert({ user_id: user.id, customer_id: made.id }, { onConflict: 'user_id' }));
      customer = { customer_id: made.id };
    }
    // Catch subscriptions even if their webhook hasn't arrived yet.
    const subs = await stripe('subscriptions?customer=' + encodeURIComponent(customer.customer_id) + '&status=all&limit=100');
    if (subs.data.some((s: any) => ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'].includes(s.status))) return reply({ error: 'A subscription already exists. Use Manage billing.' }, 409);
    const values: Record<string, string> = { customer: customer.customer_id, mode: body.plan === 'monthly' ? 'subscription' : 'payment',
      client_reference_id: user.id, 'line_items[0][price]': price(body.plan)!, 'line_items[0][quantity]': '1',
      'metadata[faintr_plan]': body.plan, 'metadata[faintr_user]': user.id,
      success_url: site() + '/?checkout=success&session_id={CHECKOUT_SESSION_ID}', cancel_url: site() + '/?checkout=canceled' };
    const prefix = body.plan === 'monthly' ? 'subscription_data' : 'payment_intent_data';
    values[`${prefix}[metadata][faintr_user]`] = user.id;
    values[`${prefix}[metadata][faintr_plan]`] = body.plan;
    const session = await stripe('checkout/sessions', form(values), `faintr-checkout-${user.id}-${body.plan}-${Math.floor(Date.now() / 300000)}`);
    return reply({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not start billing.';
    console.error('Billing request failed', message);
    return reply({ error: message }, 400);
  }
}
