import { createClient } from "npm:@supabase/supabase-js@2.117.2";

export const serverKey = () => {
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  const key = keys.default || Object.values(keys)[0] || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (typeof key !== 'string') throw new Error('Server database credentials are unavailable.');
  return key;
};
export const db = () => createClient(Deno.env.get('SUPABASE_URL')!, serverKey(), { auth: { persistSession: false, autoRefreshToken: false } });
export const site = () => Deno.env.get('FAINTR_SITE_URL') || 'https://faintr.com';
export const price = (plan: string) => Deno.env.get(plan === 'monthly' ? 'STRIPE_MONTHLY_PRICE_ID' : 'STRIPE_LIFETIME_PRICE_ID');

export async function stripe(path: string, body?: URLSearchParams, key?: string): Promise<any> {
  const secret = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secret) throw new Error('Payments are not configured yet.');
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${secret}`, 'Stripe-Version': '2025-06-30.basil',
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, body,
  });
  const data = await r.json();
  if (!r.ok) { console.error('Stripe request failed', r.status, data.error?.type); throw new Error('Payments are temporarily unavailable. Please try again shortly.'); }
  return data;
}
export function form(values: Record<string, string>) { return new URLSearchParams(values); }
export async function checked(result: any) { if (result.error) throw new Error('Could not update membership.'); return result.data; }
const objectId = (value: any): string => typeof value === 'string' ? value : value?.id;

// Re-read Stripe objects rather than trusting delivery order or client redirects.
export async function syncSubscription(id: string) {
  const synced_at = new Date().toISOString();
  const sub = await stripe('subscriptions/' + encodeURIComponent(id));
  const admin = db();
  const customer = await checked(await admin.from('billing_customers').select('user_id').eq('customer_id', objectId(sub.customer)).maybeSingle());
  if (!customer) return;
  const item = sub.items.data.find((i: any) => i.price.id === price('monthly'));
  const expires = item?.current_period_end || sub.current_period_end;
  await checked(await admin.rpc('sync_billing_purchase', { p: { id: sub.id, user_id: customer.user_id, kind: 'monthly',
    active: !!item && ['active', 'trialing'].includes(sub.status), expires_at: expires ? new Date(expires * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end || !!sub.cancel_at, synced_at } }));
}

export async function syncPayment(id: string) {
  const synced_at = new Date().toISOString();
  const payment = await stripe('payment_intents/' + encodeURIComponent(id) + '?expand[]=latest_charge');
  if (payment.metadata?.faintr_plan !== 'lifetime') return;
  const admin = db();
  const customer = await checked(await admin.from('billing_customers').select('user_id').eq('customer_id', objectId(payment.customer)).maybeSingle());
  if (!customer || payment.metadata?.faintr_user !== customer.user_id) return;
  let charge = payment.latest_charge;
  if (typeof charge === 'string') charge = await stripe('charges/' + encodeURIComponent(charge));
  let disputed = !!charge?.disputed;
  if (disputed) {
    const disputes = await stripe('disputes?charge=' + encodeURIComponent(charge.id));
    disputed = disputes.data.some((d: any) => !['won', 'warning_closed'].includes(d.status));
  }
  await checked(await admin.rpc('sync_billing_purchase', { p: { id: payment.id, user_id: customer.user_id, kind: 'lifetime',
    active: payment.status === 'succeeded' && payment.amount_received >= 1000 && payment.currency === 'usd' && !charge?.refunded && !disputed,
    expires_at: null, synced_at } }));
}

export async function syncCheckout(id: string, userId?: string) {
  const session = await stripe('checkout/sessions/' + encodeURIComponent(id) + '?expand[]=line_items');
  const admin = db();
  const customer = await checked(await admin.from('billing_customers').select('user_id').eq('customer_id', objectId(session.customer)).maybeSingle());
  if (!customer || (userId && customer.user_id !== userId) || session.client_reference_id !== customer.user_id) throw new Error('This checkout belongs to another account.');
  const plan = session.metadata?.faintr_plan;
  if (!['monthly', 'lifetime'].includes(plan) || !session.line_items?.data.some((i: any) => i.price.id === price(plan))) throw new Error('Unrecognized membership price.');
  if (session.mode === 'subscription' && session.subscription) await syncSubscription(objectId(session.subscription));
  else if (session.payment_status === 'paid' && session.payment_intent) await syncPayment(objectId(session.payment_intent));
}

export async function verifySignature(payload: string, header: string, secret: string, now = Date.now()) {
  const parts = header.split(',').map(s => s.trim().split('='));
  const t = parts.find(p => p[0] === 't')?.[1];
  if (!t || !/^\d+$/.test(t) || Math.abs(now / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(`${t}.${payload}`);
  for (const [, hex] of parts.filter(p => p[0] === 'v1')) {
    if (!/^[a-f0-9]{64}$/.test(hex)) continue;
    const bytes = Uint8Array.from(hex.match(/../g)!, h => parseInt(h, 16));
    if (await crypto.subtle.verify('HMAC', key, bytes, signed)) return true;
  }
  return false;
}
