# Security review — October 23, 2026

## Scope and stack

FAINTR is a JavaScript browser application on Cloudflare Pages, with Web Workers running PvPoke calculations locally. A Pages Worker serves deliberately shared teams/images. Supabase provides authentication, profiles, JSON account storage and database access policies. GitHub Actions builds/publishes game data, posts Discord ranking feeds and creates encrypted database backups. There is also a separate loopback-only Node desktop server. The website is free; historical billing source/records remain for support rather than being deleted indiscriminately.

This review combined source inspection, isolated browser tests, simulated failure/concurrency tests, public HTTPS header checks, zero-row anonymous API requests, dependency advisories and read-only dashboard inspection. No destructive production test, third-party attack, customer roster query, credential rotation or production permission change was performed. “No obvious issue found” is not a guarantee of security.

## Severity-ranked confirmed findings

| Severity | Finding and impact | Reproduce or verify | Safe fix / status |
| --- | --- | --- | --- |
| High | Account change could leave an earlier account's worker/undo/pending work alive. Delayed operations could cross an account boundary | Synthetic account-switch regression holds an operation and sends a late storage message after switching | Old worker terminated, pending operations rejected, late replies ignored, account cache cleared. Prepared application fix; no permission changes. No claim that a live cross-account disclosure was observed. |
| High (desktop source) | Loopback binding alone did not prevent a hostile page posting simple JSON-like form bodies to local mutation APIs; Host checks were absent | Source accepted any POST body as JSON. Pure request-policy test verifies cross-site Origin, simple text bodies and hostile Host are now denied | Require local Host, same-origin API requests and JSON POSTs; bounded body accumulation. Applies to rebuilt desktop source, not retroactively to an already downloaded executable. No exploit was run. |
| Medium | Admin update code forwarded account email/ID into public workflow inputs/logs | Trace `trigger-update` dispatch to the public workflow's requested-by logging | Replaced identity with “FAINTR administrator.” The function is currently absent in the live project's function list, so this path was not reachable during inspection. Prepared source fix precedes any future deployment. |
| Medium | Background storage refresh could overwrite newer edits or revive deletions | Simulated cloud conflict and refresh tests | Field-specific refresh patches and stale-edit rejection; documented in roster audit. |
| Low | Known development dependency advisory in the old esbuild version | npm advisory audit, then updated lockfile | esbuild updated to 0.28.2. Final online npm audit returned zero known vulnerabilities across 166 dependencies. This does not establish that all dependencies are safe or that an esbuild dev server was exposed in production. |

## Security improvements prepared for approval, not applied

1. **Bug-report rate-limit concurrency weakness (medium abuse risk).** The source trigger counts recent reports before insertion without locking. Concurrent requests can all see the earlier count. This is a code-level race, not a production load-test result. `supabase/review/bug-rate-limit.sql` serializes checks per account/anonymous bucket while preserving the existing limits and report data. Test it in a disposable database, then approve before applying to production.
2. **Stronger CSP isolation (low defense-in-depth).** The live page policy includes `unsafe-eval` because the current worker host evaluates trusted bundled engine code. An injection flaw would be more damaging with this permission. No working script injection was found. Do not remove it blindly: refactor the worker compilation or isolate worker policy, test all engine paths, then approve the production policy change.
3. **Optional analytics storage and endpoint.** Separate private tables, a server-only write credential, consent gate, payload validation and rate/retention limits are prepared. They stay disabled and unprovisioned until reviewed. See `ANALYTICS_PLAN.md`; a new tracker is not required to keep the existing Cloudflare traffic/performance analytics working.

## Checks that passed, and what they do not prove

- Live HTTPS responses for `/`, `/privacy/` and a known `/s/` share URL included nosniff, frame denial, strict-origin referrer policy and the configured CSP. HSTS and Permissions-Policy were not present in these responses; adding them is a separate reviewed configuration change, not proof of a current exploit.
- Read-only live database metadata queries confirmed row security enabled and anonymous SELECT grants absent on all five private tables above. The deployed roster SELECT/INSERT/UPDATE/DELETE policies all compare `auth.uid()` with `user_id`, including the update check. No customer rows were requested.
- Anonymous zero-row requests to `user_storage`, `profiles`, `billing_customers`, `billing_purchases` and `bug_reports` returned 401. These prove those anonymous requests were denied; they do **not** verify authenticated row isolation between two real users.
- Reviewed SQL enables ownership rules on account data. A live read-only column-privilege query confirmed authenticated users can update `display_name` but cannot update `is_admin`. The public share lookup is separate and reconstructs allowed game fields; it does not expose account identifiers or notes.
- Share tests check stripping private fields, input/move validation, oversized bodies, rate/error handling, preview escaping and scoped routes. Sharing intentionally makes the selected setup public to anyone holding its link.
- Client templates generally escape names/notes and validate numeric inputs. Native simulator HTML has trusted internal formatting. No confirmed stored/reflected XSS or SQL injection was found. This is not exhaustive proof for every template or future game-data value.
- Supabase browser publishable/anonymous keys are public client identifiers; database permissions provide protection. The service-role key and server-only sharing write key must never be in a browser bundle. Reviewed code keeps the sharing write key in Worker environment bindings.
- A current tracked-file scan found no matching live Stripe/GitHub/private-key patterns; a history scan excluding bulk game assets and the lockfile also found no matching commits. This is a limited pattern scan, not a comprehensive secret-history detector. Generated local files, provider secrets and every historical credential format were not certified.
- Production read-only checks never printed keys or response bodies from private tables. No write was attempted to test another user's data.

## Availability finding

The admin `trigger-update` endpoint returned 404. The signed-in Supabase dashboard listed only `billing` and `stripe-webhook`, confirming the admin update function is not deployed. The website's manual update/status action therefore cannot work through this endpoint. Nightly/push GitHub builds are independent and can still run. The function's reviewable source is prepared, but deploying it introduces a production admin endpoint and requires approval under the user's explicit restriction on production security changes.

## Follow-up verification

Use disposable accounts to verify account A cannot read, modify, delete or export account B's storage, or promote itself to admin; verify expired sessions and sign-out on a shared device. Validate proposed SQL and rate-limit concurrency in a disposable database. The latest October 22 backup workflow had both backup and isolated recovery jobs marked successful; no production restore or backup-content access was performed. Keep dependency scans, release tests and operational alerts active. Review any future data-collection or security-setting change before activation.
