import { verifySignature, syncSubscription, syncPayment, syncCheckout } from '../supabase/functions/_shared/billing.ts';
import { handleBilling } from '../supabase/functions/billing/handler.ts';

const assert = (value: unknown, message = 'Assertion failed') => { if (!value) throw new Error(message); };
Deno.env.set('SUPABASE_URL', 'https://database.example');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake-test-key');
Deno.env.set('STRIPE_SECRET_KEY', 'fake-stripe-test-key');
Deno.env.set('STRIPE_MONTHLY_PRICE_ID', 'price_monthly');
Deno.env.set('STRIPE_LIFETIME_PRICE_ID', 'price_lifetime');

Deno.test('webhook accepts signed payloads and rejects tampering, old signatures, missing headers', async () => {
  const t = Math.floor(Date.now() / 1000), payload = '{"type":"checkout.session.completed"}', secret = 'test-webhook-secret';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)));
  const header = `t=${t},v1=${Array.from(signature, n => n.toString(16).padStart(2, '0')).join('')}`;
  assert(await verifySignature(payload, header, secret));
  assert(!await verifySignature(payload + ' ', header, secret));
  assert(!await verifySignature(payload, header, secret, (t + 301) * 1000));
  assert(!await verifySignature(payload, '', secret));
  assert(!await verifySignature(payload, `t=${t},v1=wrong`, secret));
});

Deno.test('checkout authenticates the account and chooses the price on the server', async () => {
  const original = globalThis.fetch;
  const user = '00000000-0000-4000-8000-000000000001';
  let paid = false, checkout: URLSearchParams | null = null;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    let data: any;
    if (url.includes('/auth/v1/user')) data = { id: user, email: 'test@example.com' };
    else if (url.includes('/rest/v1/billing_customers')) data = { customer_id: 'cus_example' };
    else if (url.includes('/rest/v1/billing_purchases')) data = paid ? [{kind:'lifetime',active:true}] : [];
    else if (url.includes('/subscriptions?')) data = { data: [] };
    else if (url.endsWith('/checkout/sessions')) { checkout = new URLSearchParams(String(init?.body)); data = {url:'https://checkout.stripe.com/test'}; }
    else throw new Error('Unexpected request ' + url);
    return new Response(JSON.stringify(data), { headers: {'Content-Type':'application/json'} });
  };
  const request = (body: unknown, token = 'test-token', origin = 'https://faintr.com') => new Request('https://database.example/functions/v1/billing', {
    method: 'POST', headers: { 'Content-Type':'application/json', origin, ...(token ? {Authorization:`Bearer ${token}`} : {}) }, body: JSON.stringify(body) });
  try {
    assert((await handleBilling(request({action:'checkout',plan:'monthly'}, ''))).status === 401);
    assert((await handleBilling(request({action:'checkout',plan:'monthly'}, 'test-token','https://evil.example'))).status === 403);
    assert((await handleBilling(request({action:'checkout',plan:'free'}))).status === 400);
    const response = await handleBilling(request({action:'checkout',plan:'monthly',userId:'attacker',price:'price_free'}));
    assert(response.status === 200);
    const sent = checkout as unknown as URLSearchParams;
    assert(sent.get('line_items[0][price]') === 'price_monthly');
    assert(sent.get('client_reference_id') === user);
    assert(sent.get('mode') === 'subscription');
    paid = true; checkout = null;
    assert((await handleBilling(request({action:'checkout',plan:'monthly'}))).status === 409);
    assert(checkout === null, 'Do not charge an account that already has access');
  } finally { globalThis.fetch = original; }
});

Deno.test('fresh Stripe state controls access, including cancellation, refunds and account isolation', async () => {
  const original = globalThis.fetch;
  let state = 'active', write: any = null;
  globalThis.fetch = async (input, init) => {
    const url = String(input), body = init?.body;
    let data: any;
    if (url.includes('/rest/v1/billing_customers')) data = { user_id: 'account-a' };
    else if (url.includes('/rest/v1/rpc/sync_billing_purchase')) { write = JSON.parse(String(body)).p; data = null; }
    else if (url.includes('/subscriptions/sub_example')) data = { id: 'sub_example', customer: 'cus_example', status: state, cancel_at_period_end: true,
      items: { data: [{ price: { id: 'price_monthly' }, current_period_end: 2000000000 }] } };
    else if (url.includes('/payment_intents/pi_example')) data = { id: 'pi_example', customer: 'cus_example', status: 'succeeded', currency: 'usd', amount_received: 1000,
      metadata: { faintr_plan: 'lifetime', faintr_user: 'account-a' }, latest_charge: { refunded: state === 'refunded', disputed: false } };
    else if (url.includes('/checkout/sessions/cs_example')) data = { customer: 'cus_example', client_reference_id: 'account-a', metadata: { faintr_plan: 'lifetime' },
      mode: 'payment', payment_status: 'unpaid', payment_intent: 'pi_example', line_items: { data: [{ price: { id: 'price_lifetime' } }] } };
    else throw new Error('Unexpected network request ' + url);
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await syncSubscription('sub_example'); assert(write.active && write.kind === 'monthly'); assert(write.expires_at === new Date(2000000000000).toISOString());
    state = 'canceled'; await syncSubscription('sub_example'); assert(write.active === false);
    state = 'past_due'; await syncSubscription('sub_example'); assert(write.active === false);
    state = 'succeeded'; await syncPayment('pi_example'); assert(write.active && write.kind === 'lifetime');
    state = 'refunded'; await syncPayment('pi_example'); assert(write.active === false);
    write = null; await syncCheckout('cs_example', 'account-a'); assert(write === null, 'Unpaid checkout must never unlock access');
    let rejected = false;
    try { await syncCheckout('cs_example', 'account-b'); } catch (_) { rejected = true; }
    assert(rejected, 'Another account cannot claim a purchase');
  } finally { globalThis.fetch = original; }
});
