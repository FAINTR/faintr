# FAINTR measurement plan — October 23, 2026

## Existing setup and recommendation

Cloudflare Web Analytics is already installed with automatic setup for faintr.com. The signed-in dashboard showed 142 page views and 125 visits in the previous 24 hours during this audit. Those are different measures; neither establishes 125 individual people. Keep this existing installation for traffic and real-user performance. Do not add another Cloudflare beacon.

Cloudflare's [metric definitions](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/) describe visits using entry referrers. Its [FAQ](https://developers.cloudflare.com/web-analytics/faq/) says custom events and UTM reporting are not supported. Existing analytics therefore cannot provide the requested completed-tool counts or returning-browser funnel.

The prepared supplement uses the existing Cloudflare/Supabase stack, adds no vendor SDK, and is **disabled by default**. On October 23 the owner explicitly chose **keep it off pending review**. Its production table, credential, routes, privacy wording and activation remain unprovisioned; no new production tracking is enabled.

## What each number means

| Measure | Definition and limit |
| --- | --- |
| Cloudflare visits | Entries detected by Cloudflare from direct or external referrals. Use for overall traffic trends, not as unique people or the custom session count. |
| Consented unique browsers | Distinct random browser identifiers observed in a selected window of at most 30 days. Identifiers expire 30 days after creation. One person on two devices counts twice; clearing storage creates another identifier. People who decline or block tracking are excluded. Never label this “all unique people.” |
| Custom sessions | Distinct random session IDs; a new session begins after 30 minutes without a tracked action, or after the browser identifier expires. Closing a tab alone does not necessarily start another session. |
| Page/tool views | The first displayed page plus each actual change of tool tab. Repainting results or selecting an already active tab does not add a view. These count attention, not time spent reading. |
| Completed actions | A successful visible tool result or acknowledged save, as specified below. Repeated deliberate actions count again. Background comparison battles do not each count as a user simulation. |
| Returning browsers | Consented browser IDs with an event marked as a subsequent session within their 30-day lifetime. This cannot measure a person's lifetime retention. |
| Engaged sessions | Sessions with at least one completed grade, simulation, IV calculation, roster save/import, or team save. |
| Acquisition | Session-entry bucket: direct, search, Discord, social, supporter, or other referral. No full referral URL or arbitrary UTM string is retained. Session source remains fixed through later page changes. |

Report overall Cloudflare traffic separately from the consented action sample. Do not add the two page-view totals together or extrapolate consented conversion rates to everyone without explaining sampling bias.

## Event dictionary

| Event | Exactly when it is emitted |
| --- | --- |
| `page_view` | Initial page or change of active tool. Allowing analytics records the current page once. |
| `builder_started` | First populated Team Grader slot since the builder was cleared/rebuilt. Restoring a shared setup also counts as starting with a setup. |
| `builder_completed` | All three slots populated for the first time in that builder attempt. This means a team was assembled, not that it was graded or recommended. |
| `grade_started` / `grade_completed` | Valid three-slot grading request begins / its report is rendered successfully. |
| `simulation_started` / `simulation_completed` | One user 1v1 simulation begins / its primary result and comparisons render successfully. |
| `roster_saved` | One roster entry save is acknowledged. Includes changes to league choices or pinning. |
| `roster_imported` | A batch acknowledges at least one imported entry. This counts successful batches, not Pokémon. Retrying an uncertain acknowledgement can overcount this action while entry storage remains idempotent. |
| `roster_exported` | The browser is given the downloadable JSON. Browsers cannot prove that the user retained the file. |
| `iv_started` / `iv_completed` | Valid IV-tool calculation begins / the latest requested table and family results render. Superseded calculations do not emit completion. |
| `team_saved` | A saved-team request is acknowledged. |
| `action_failed` | Grading or simulation fails; only the tool name is sent, never the error text. |

No event includes names, emails, account IDs, Pokémon, forms, IVs, CP, moves, notes, passwords, team links, query strings or error messages. The collector rebuilds an allowlisted payload rather than storing arbitrary supplied fields.

## Funnels and abandonment

Calculate conversion using distinct sessions, not raw event totals:

- Assembly: sessions with `builder_completed` divided by sessions with `builder_started`.
- Grading reliability: sessions with `grade_completed` divided by sessions with `grade_started`.
- Simulation reliability: sessions with `simulation_completed` divided by sessions with `simulation_started`.
- Source quality: engaged sessions divided by all consented sessions for each source bucket.
- Tool interest: page views and distinct sessions per tool, alongside completed actions per tool.

An attempt without completion is a **possible drop-off**, not a proven error. A visitor may leave intentionally, decline consent halfway through, change a calculation, lose connectivity or block an event. Let a session become inactive before treating it as abandoned. These session-level funnels do not establish ordering or one-to-one attempt conversion when a person makes several attempts in one session.

## Privacy and production activation review

The optional tracker sends nothing and creates no analytics identifier before affirmative consent. “Keep analytics off” and “Allow usage analytics” are equally available in Analytics choices; all tools remain usable. Consent expires after 180 days. Withdrawal removes local visitor/session IDs and stops future events. Global Privacy Control and Do Not Track suppress optional collection. Existing cookie-free Cloudflare traffic/performance analytics remain separate.

Browser/session IDs are HMAC-hashed by Cloudflare before reaching the separate private database schema. A daily keyed network hash is used only for short-lived abuse limits; raw network addresses are not saved by this collector. Hosting providers still process requests under their own policies. Events expire after 30 days during active collection. If collection is switched off, an operator must run the documented retention deletion after that interval; a durable scheduled purge must be agreed before activation. Withdrawing consent does not identify and erase historical pseudonymous events automatically.

The proposed collector limits requests to 1 KB, checks origin/content type, validates all fields, authenticates database writes with a server-only credential, and caps per-network and total daily writes. The cap can drop counts; clients can fabricate events, so these are product statistics, not fraud-proof financial records. `supabase/review/usage-retention.sql` prepares an hourly expired-event purge using the existing database's optional Cron module, following [Supabase's documented scheduling interface](https://supabase.com/docs/guides/cron/quickstart). With that job approved and running, records expire at 30 days and are removed by the next hourly run; monitor job failures. The job remains uninstalled.

Consent requirements vary by jurisdiction and use. The [ICO's current guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-comply-with-the-pecr-rules/) requires an applicable exception or consent; its [exceptions guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/) has conditions. This design takes an opt-in approach worldwide rather than assuming an exemption applies. Update the privacy policy with the exact purpose, identifiers, retention, recipient services and withdrawal behavior before activation; obtain qualified advice for remaining legal obligations.

Reviewable files: `ui/analytics.js`, `web/analytics-endpoint.js`, `supabase/review/usage-analytics.sql`. Approval must cover the new private schema/RPC, server-only analytics credential, retention job and privacy wording. Then set both build-time and Cloudflare runtime `FAINTR_ANALYTICS_ENABLED=true` and provision the separate write key securely. Do not reuse a service-role key or paste credentials in reports.

## Verification and operation

- `node --test tools/analytics.test.cjs` tests disabled behavior, consent/withdrawal, expiry, source/session stability, allowlists, body limits, same-origin checks and hashed storage payloads.
- The release browser test uses a synthetic enabled configuration and intercepts `/a/event` locally. It checks no pre-consent request, one grading completion despite comparison work, withdrawal, payload shape and phone dialog layout. It never sends test data to production.
- Disposable PostgreSQL tests now confirm the proposal compiles, bad write keys/invalid tools fail, anonymous direct table reads fail, duplicate event IDs insert once and ingestion purges expired events. This caught and fixed a reserved SQL column before deployment. The tests do not simulate parallel connections or execute the optional Cron background job, which remains uninstalled. Test those before activation.
- After an approved deployment, opt in with a dedicated test browser, complete one workflow and verify aggregate counts increased once. Confirm the network payload contains only the documented fields. Verify an opted-out browser sends none. Do not use real roster contents as test labels.
- Existing Cloudflare Web Analytics remains the place to monitor field LCP, INP and CLS. Watch mobile P75 over a consistent 7/28-day window; do not treat local lab timings as field measurements.
