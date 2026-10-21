// Admin-only: starts (or lists) the GitHub Action that rebuilds and publishes FAINTR's data.
// Secrets (Supabase > Edge Functions > Secrets): GITHUB_TOKEN, GITHUB_REPO ("owner/name"), optional GITHUB_WORKFLOW (default daily-data.yml).
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase automatically.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);

  // Who is asking? Their own session decides; is_admin can only be set in the Supabase dashboard.
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return reply({ error: "Sign in first." }, 401);
  const { data: prof } = await sb.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!prof?.is_admin) return reply({ error: "Only FAINTR admins can do that." }, 403);

  const token = Deno.env.get("GITHUB_TOKEN"), repo = Deno.env.get("GITHUB_REPO");
  const workflow = Deno.env.get("GITHUB_WORKFLOW") ?? "daily-data.yml";
  if (!token || !repo) return reply({ error: "The GitHub token or repository isn't set in Supabase secrets yet." }, 500);
  const gh = (path: string, init: RequestInit = {}) =>
    fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "faintr-admin", ...(init.headers ?? {}) },
    });

  let body: { action?: string; force?: boolean; formats?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }

  if (body.action === "status") {
    const r = await gh(`/actions/workflows/${workflow}/runs?per_page=8`);
    if (!r.ok) return reply({ error: `GitHub said ${r.status}: ${(await r.text()).slice(0, 200)}` }, 502);
    const j = await r.json();
    return reply({
      runs: (j.workflow_runs ?? []).map((w: Record<string, unknown>) => ({
        id: w.id, created_at: w.created_at, updated_at: w.updated_at, event: w.event, status: w.status, conclusion: w.conclusion, html_url: w.html_url,
      })),
    });
  }

  // Don't stack runs: one at a time
  const live = await gh(`/actions/workflows/${workflow}/runs?per_page=5`);
  if (live.ok) {
    const j = await live.json();
    if ((j.workflow_runs ?? []).some((w: { status: string }) => w.status === "queued" || w.status === "in_progress")) {
      return reply({ message: "An update is already running. It goes live when it finishes." });
    }
  }
  const formats = String(body.formats ?? "").replace(/[^a-z0-9,\-]/gi, "").slice(0, 300);
  const r = await gh(`/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: Deno.env.get("GITHUB_REF") ?? "main", inputs: { force: body.force ? "true" : "false", formats, requested_by: (user.email ?? user.id).slice(0, 80) } }),
  });
  if (r.status !== 204) return reply({ error: `GitHub said ${r.status}: ${(await r.text()).slice(0, 200)}` }, 502);
  return reply({ message: body.force ? "Full rebuild started. New data goes live in about 30 to 90 minutes." : "Update started. If PvPoke changed, new data goes live in about 5 to 60 minutes." });
});
