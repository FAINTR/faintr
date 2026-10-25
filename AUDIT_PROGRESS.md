# FAINTR audit completion record

## Current status — October 24, 2026

The previously requested follow-up checks are complete within their documented limits. Commit 2ce4587 passed 87 Node cases, sharing/reported-team checks and the full 130-case browser release gate, and published successfully in run 40063063902. Final production checks passed in Chromium at 1440/320/375/430px and WebKit at 375px. Source matched, ten badges remained visible, scores were nonzero, sharing/paging/names and Morpeko transitions worked. Evidence: sibling output/live-followup.json. Final isolated roster measurement is saved in output/roster-final.json and docs/FOLLOWUP_AUDIT.md. Do not repeat completed audits or benchmarks.

The new email-confirmation recovery is also published. Commit 2c9bc8462f3aeba0e2003f7b299a41e8a74ff117 passed 89 Node cases, sharing/reported-team checks and 135 browser cases (7.1 minutes) in release 40140998103, then deployed to https://459a4b1f.faintr.pages.dev and faintr.com. The intermediate create-project step failed because the project already exists; the subsequent publish step succeeded. Live source matched and recovery passed in Chromium/Safari at 375px using the real SDK for rejected callbacks and simulated sign-in/resend. Evidence: sibling output/live-auth-recovery.json. No real emails were sent, no accounts inspected, and no production auth settings or saved data changed.

Confirmed missing UX is fixed: explicit confirmation resend, friendly expired/unconfirmed notices, recoverable email-limit/delivery errors and callback error cleanup. The screenshot alone does not diagnose that member's underlying provider/link failure; inbox delivery, project email templates/redirect configuration and real-account end-to-end confirmation remain unverified. Physical phone and two designated live disposable-account checks remain deferred. Optional analytics is OFF; all tools remain free. Do not reactivate VIP/Stripe. No production security-setting changes without approval.

The authorized automated follow-up checks are complete within these limits. Delete only finish-faintr-follow-up-verification; do not redo completed audits or change unrelated automations. Further provider investigation needs access to read-only configuration/log evidence or a designated controlled inbox/account, rather than customer-data inspection.
The record below covers the earlier completed audit.
Updated October 23, 2026. The reviewed application fixes are published and verified. This records the bounded audit results; it is not a guarantee that every device, matchup or security scenario has been exhaustively tested.

## Published releases

- Baseline before audit: `aa89d56768ba75a0f449c5113713750865e031ae`.
- Main application fixes: `24f9b5b1588421abe67a33c5f368888ceaeafbb8`, release39971805865 succeeded. Five formats were rebuilt against PvPoke `415436c_2026-10-21`: Great, Ultra, Master, Master Mega and Fantasy Cup.
- Database regression CI and admin-update fallback: `938572efbb8137f0bb6472081401469f57e94452`, release39975947216 and database39975947209 succeeded.
- Corrected the existing What's New description to match visible grade badges: `8c603d929069c702eb70cc04719b7fb525b3de9f`, release39978029657 succeeded. Deployment: https://8dae74aa.faintr.pages.dev and https://faintr.com.
- Final public-page verification at18:05UTC confirmed live app source matches the tested source, free access, optional analytics off, canonical tags, public pages, robots, sitemap and correct404 handling. Existing short link returned200.

## Owner decisions

- All website tools are free; there is no VIP. Do not reintroduce monetization. The owner reaffirmed this after a review of leftover payment code. The unpublished Stripe-related draft was discarded; no billing UI, SQL deletion guard or billing endpoint change was deployed.
- Optional product analytics stays OFF pending owner review. No new schema, credential, Cron job or draft privacy wording was provisioned/published. Existing Cloudflare Web Analytics remains active.
- The owner specifically approved the bug-report serialization fix. Applied transactionally to Supabase; read-back confirmed the lock and active trigger. Existing reports and roster permissions preserved. Migration: `supabase/migrations/008_report_serialization.sql`. Local proof: sibling `output/bug-report-fix-verified.png`.
- The optional in-site admin update endpoint remains unprovisioned. A tested link to existing GitHub update controls replaces unavailable controls. Scheduled updates remain independent.
- No getting-started guide and no new bug-fix What's New announcement. Existing roster-checkbox explanation/scavenger credit remains. The obsolete hidden-grade description was corrected in place.

## Completed review and fixes

Reports:
- `docs/WEBSITE_AUDIT.md`: severity, impact, reproduction, fixes, product/mobile/architecture review and unresolved observations.
- `docs/SECURITY_AUDIT.md`: actual stack/deployment checks, findings, approved production change and remaining limits.
- `docs/ROSTER_AUDIT.md`: exact local/cloud persistence, account boundaries, import/export, copies/forms/moves/leagues, conflicts and failure recovery.
- `docs/BATTLE_AUDIT.md`: calculation path, reference comparisons, verified fixes and unsupported/unproven mechanics.
- `docs/PERFORMANCE_AUDIT.md`: baseline, measured changes, costs and monitoring instructions.
- `docs/ANALYTICS_PLAN.md`: existing analytics, distinct metric/event definitions, funnels, consent, disabled implementation and activation review.

Application fixes include readable account/autofill text; worker failure recovery and lazy initialization; immediate account-boundary cleanup; stale-response rejection; roster metadata/deletion preservation; conflicting-edit rejection; replay-safe validated imports with retained failures; accurate save/export/delete/undo feedback; level-cap/Mega/minimum-HP fixes; neutral damage reference stats; exact timeout winner before rounding; shared team legality; responsive reports/tables/charts/dialogs; keyboard/touch controls; stable loading layout; current-data build provenance; and public-page SEO metadata. Existing badges, full names/moves, sharing, free tools and visual identity are preserved. No storage architecture migration or existing-user-data migration occurred.

## Verification completed

- 105 browser release cases passed across desktop1440px, phone320/375/430px and iPhone WebKit. Latest production gate passed in5.2minutes. Earlier full local suite passed in7.7minutes. A Safari touch issue found in an unpublished build was corrected and retested before release.
- 72 Node regression cases passed:21audit,13battle,9analytics,23grading/roster,6operations. Sharing and reported-team reproduction checks also passed.
- Eight disposable PostgreSQL tests passed locally and on GitHub: actual migration SQL with synthetic identities, anonymous denials, owner-only reads/exports/updates/deletes, protected admin flags, report limits/server stamps, intentional public-sharing privacy, proposed analytics SQL validation/authentication/idempotency/retention and isolated deletion cascades. No production credentials or customer data used.
- Battle suite includes72native-engine/wrapper comparisons, plus independent arithmetic, energy/shields, buffs, fainting, timeout, level caps, HP and legality. Both local pinned and newer production source passed. Engine parity is not independent proof of all mechanics.
- Live Chromium at1440/320/375/430px: nonzero scores, ten visible grade badges, unclipped names/moves, no page-wide overflow, account-field contrast about10.49:1, restored and graded public sharing. Live WebKit also restored and graded it under production CSP.
- One earlier live share-panel load timed out without captured failure details. Focused diagnostic, five consecutive fresh-browser runs and later full smoke check succeeded. Cause unconfirmed; do not call it a proven defect or a fixed issue. See `output/share-reliability.json`, `deployed-smoke.json`, `deployed-smoke-webkit.json` in sibling workspace.
- Live read-only metadata: RLS enabled on five private tables; anonymous SELECT absent; all four roster operations owner-scoped; authenticated users cannot update admin flag. Anonymous zero-row requests returned401. No customer rows inspected.
- Live headers included CSP/frame denial/nosniff/referrer policy. Required unsafe-eval remains; sampled responses lacked HSTS/Permissions-Policy. No working XSS found. These are bounded checks, not security certification.
- Online npm audit: zero known vulnerabilities across166dependencies. Limited current/history credential scans found no matches; no secrets printed, no exhaustive secret-history certification.
- Backup39869002881: encrypted backup and isolated recovery jobs succeeded. No production restore or backup-content access.
- Discord sidebar role grouping was inspected: FOUNDER, CEO and Helper display grouping enabled; FOUNDER visible in member list. Offline members remain under Offline. No role permissions changed.

## Performance evidence

Same local cold-load profile, uncompressed local delivery including workers. Phone375px,4xCPU,150ms latency,200KB/s. One run per condition; not field Core Web Vitals/INP proof.

| Metric | Baseline | Optimized |
| --- | ---: | ---: |
| Delivered bytes |42,731,823|8,246,254|
| Desktop teams ready |3,576ms|2,006ms|
| Slower phone teams ready |185,035ms|46,441ms|
| Phone LCP |1,804ms|1,604ms|
| Desktop CLS |0.1539|0.0304|
| Phone CLS |0.2657|0.0577|

Raw evidence: sibling `output/performance-baseline.json` and `output/performance-optimized.json`. Team-data download remains a slower-connection cost. Pre-release Cloudflare24h:125visits/142pageviews,LCP P75 976ms,INP81%good/19%needs improvement,CLS50%good/35%poor. Monitor equivalent mobile/desktop windows over7/28days after deployment; visits are not unique people.

## Deliberate limits and future review

Physical iPhone keyboard/rotation/screen-reader testing, two-real-device authenticated JWT testing, real parallel PostgreSQL sessions, long-session memory profiling and exhaustive independent battle outcomes were not performed. Desktop-source security fixes do not retroactively change downloaded executables. Stronger security policies and optional analytics require separate reviewed approval. These are disclosed limits, not claimed completed certifications or invented vulnerabilities.

The current authorized audit/release work is complete. Stop the completion heartbeat; future tracking activation or new changes require a fresh user request. Preserve all existing data and do not reactivate Stripe/VIP.

## October 25 — all-league rotation automation published

Owner requested early Halloween dropdown availability, automatic changeover updates, and official schedule discovery for GL/UL/ML and their cups. Completed in commit 2fdda2142c3ea8a90f405aa79a1da82128fdd48b / release 40239306429. The normal publication gate passed 94 Node cases, sharing/reported-team checks and 140 browser cases (9.2 minutes). Deployment: https://de9fdad3.faintr.pages.dev and faintr.com. The existing-project creation warning did not prevent publication.

Live public source/manifest/menu checks passed in Chromium at 1440/320/375/430px and Safari at 375px: official schedule sync verified, next rotation October 27 at 20:00 UTC / 3 p.m. Central, pending Halloween menu entry visible and accurately labeled, ten grade badges retained, no page-wide overflow or page errors. Evidence: sibling output/live-rotations.json. All 15 focused local browser cases and 35 focused Node cases had passed before publication.

Official schedule discovery, cached fallback, current + immediate-next data preparation, GL/UL/ML and non-Tuesday changeover dates, DST-safe midnight and 20:00/21:00 UTC rotation-day attempts are configured. Details and limits: docs/ROTATION_AUTOMATION.md. PvPoke currently has no Halloween format/cup definition; it is listed but disabled awaiting real rules/rankings. No invented datasets or regular-versus-Mega substitutions were published. An open tab may need a refresh for a new build. GitHub scheduling/builds can delay publication; future trigger execution is configured/tested, not represented as already observed. Official fetch/parse failure retains last validated schedule rather than silently replacing it. No user data, account/security configuration, billing or analytics changes. The authorized rotation work is complete; no chat follow-up automation was created for it.
