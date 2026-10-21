// The build embeds Anti-Meta verification privately in this Worker, outside static assets.
// __PREMIUM_DATA__, __SUPABASE_URL__ and __SUPABASE_KEY__ are replaced at build time.
const data = __PREMIUM_DATA__;
const supabaseUrl = __SUPABASE_URL__;
const supabaseKey = __SUPABASE_KEY__;
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/premium/antimeta') return env.ASSETS.fetch(request);
    const headers = { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json', 'Vary': 'Authorization' };
    const reply = (message, status) => new Response(JSON.stringify({ error: message }), { status, headers });
    if (request.method !== 'GET') return reply('Use GET.', 405);
    const auth = request.headers.get('Authorization') || '';
    if (!/^Bearer [A-Za-z0-9._-]+$/.test(auth)) return reply('Sign in first.', 401);
    try {
      const upstreamHeaders = { Authorization: auth, apikey: supabaseKey, 'Content-Type': 'application/json' };
      const user = await fetch(supabaseUrl + '/auth/v1/user', { headers: upstreamHeaders });
      if (!user.ok) return reply('Sign in first.', 401);
      const access = await fetch(supabaseUrl + '/rest/v1/rpc/has_premium', { method: 'POST', headers: upstreamHeaders, body: '{}' });
      if (!access.ok) return reply('Membership check unavailable.', 503);
      if (await access.json() !== true) return reply('Membership required.', 402);
      const value = data[url.searchParams.get('f')];
      if (!value) return reply('Unknown cup.', 404);
      return new Response(JSON.stringify(value), { headers });
    } catch (_) { return reply('Anti-Meta is temporarily unavailable.', 503); }
  },
};
