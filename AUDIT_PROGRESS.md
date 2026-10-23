# FAINTR audit working record

Updated October 23, 2026, 15:04 UTC. This is a continuation record, not a claim that every check or deployment is complete.

## Release state

- Previously deployed baseline: `aa89d56768ba75a0f449c5113713750865e031ae`.
- Main audit release committed/pushed: `24f9b5b1588421abe67a33c5f368888ceaeafbb8` (46 files). Workflow `39971805865` succeeded and published at15:07UTC, with5formats freshly rebuilt,72Node regressions and100browser checks passed. Live smoke verification remains pending.
- Follow-up change: disposable database CI, proposed analytics SQL syntax correction, approved report-limit migration, and tested admin-update fallback to GitHub. Commit/publication pending.
- No customer roster, backup contents, credentials or account deletion was used for testing.

## Owner decisions and production change

- Owner explicitly approved report spam-limit fix. Applied transactionally in Supabase October23; read-back: `serialized_report_limit=true`, `active_report_trigger=true`. Existing limits, reports and roster policies intact. SQL: `supabase/migrations/008_report_serialization.sql`. Local screenshot: sibling `output/bug-report-fix-verified.png`.
- Owner explicitly chose **keep optional analytics off pending review**. Do not enable its flags, provision schema/write credential/Cron job, or publish draft privacy language. Existing Cloudflare Web Analytics remains active.
- Optional `trigger-update` is absent in production with no GitHub credential. Do not provision new access. UI fallback offers existing GitHub workflow instead of dead controls; scheduled updates remain independent.

## Inspection and fixes completed

Detailed severity/reproduction/fix reports: `docs/WEBSITE_AUDIT.md`, `SECURITY_AUDIT.md`, `ROSTER_AUDIT.md`, `BATTLE_AUDIT.md`, `PERFORMANCE_AUDIT.md`, `ANALYTICS_PLAN.md`.

- Account input/autofill colors, sign-out errors, immediate account-boundary cleanup, stale operation/reply rejection.
- Worker startup/runtime failure recovery, lazy pool, retryable load errors.
- Roster field-specific refresh/no resurrection, stale edit rejection, replay-safe imports, validation, retained pending rows/download, save/export/delete/undo feedback, retention notice. No storage migration or existing-data loss.
- Default-IV/Mega level ceilings, minimum/fixed HP, neutral battle reference stats, exact timeout winner before rating rounding, shared species/one-Mega legality.
- 320px report overflow, readable scrolling tables/charts, 44px controls, bounded dialogs, keyboard/listbox/tab relationships, Safari touch picking. Grade badge sizes/visibility, full moves/names and sharing preserved.
- Stable initial controls/layout; unnecessary matrices/eager engines removed; current-input provenance and standard-league rebuilds.
- Canonical/social metadata, sitemap/robots, helpful404, stale VIP privacy wording. All tools free, no getting-started guide, no bug-fix What's New entry. Earlier scavenger credit remains.
- Desktop source Host/Origin/JSON protections and bounded bodies. Previously downloaded executables are not retroactively rebuilt.
- Disabled optional consent-first analytics, no vendor SDK. SQL/retention/privacy proposals remain unprovisioned.

## Verification

- 72 Node cases passed:21audit,13battle,9analytics,23grading/roster,6operations. Sharing and reported-team reproduction passed.
- Battle suite includes72native-engine/wrapper matchup comparisons plus independent arithmetic, energy/shields, buffs, fainting, timeout, level caps, HP and legality. Engine parity does not independently prove every game mechanic.
- Disposable PostgreSQL suite:8tests passed. Actual migrations with synthetic accounts; anonymous denial, owner isolation/export/update/delete, protected admin flag, report limits/server stamps, intentional share privacy, analytics proposal credential/validation/idempotency/retention and deletion cascades. Dedicated CI has no production credentials.
- Earlier90browser checks passed. Later unpublished Safari touch regression fixed and30focused cases passed;5admin-fallback checks passed. Final105-case suite PASSED in7.7minutes across desktop,320/375/430px and iPhone WebKit. Five focused admin-dialog cases also passed after the final explanatory-text change.
- Physical iOS keyboard/rotation/screen readers and real two-device JWT flow not verified. Disposable SQL emulates identity functions; no real parallel PostgreSQL connection/load test.
- Live metadata: RLS on5private tables; anonSELECT absent;4owner roster policies; no authenticated admin-flag UPDATE. Anonymous zero-row reads401. No customer rows requested.
- Live public headers: CSP/frame denial/nosniff/referrer policy. Required unsafe-eval remains; HSTS/Permissions-Policy absent in sampled responses. No working XSS found; not security certification.
- npm audit:0known vulnerabilities/166dependencies. Limited current/history credential scans:0matches, not exhaustive.
- Backup39869002881(Oct22): encrypted backup and isolated recovery jobs success. No production restore/content access.

## Performance evidence

Same local cold-load conditions, uncompressed local delivery including workers. Phone375px,4xCPU,150ms latency,200KB/s. One sample per condition, not field CWV/INP.

| Metric | Baseline | Optimized |
| --- | ---: | ---: |
| Delivered bytes |42,731,823|8,246,254|
| Desktop teams ready |3,576ms|2,006ms|
| Slower phone teams ready |185,035ms|46,441ms|
| Phone LCP |1,804ms|1,604ms|
| Desktop CLS |0.1539|0.0304|
| Phone CLS |0.2657|0.0577|

Evidence: sibling `output/performance-baseline.json`, `output/performance-optimized.json`. Large team binaries remain a slow-connection cost. Existing Cloudflare pre-release24h:125visits/142pageviews,LCP P75 976ms,INP81%good/19%needs improvement,CLS50%good/35%poor. Compare equivalent windows after deployment; visits are not unique people.

## Next actions

1. Local105browser suite completed successfully; do not rerun without new changes/failures. Disposable database8cases passed after both migration-source updates.
2. Commit/push the tested follow-up and verify its queued release/database CI. First release39971805865 succeeded and saved valid data cache; follow-up should reuse it.
3. Verify deployed commit/assets, free tools, account-field visibility, phone layout, nonzero scores and shared links. Record actual publication; do not claim live fixes prematurely.
4. Keep analytics off as chosen. Finish plain-English results/report links/limits. Stop completion heartbeat only once authorized work is actually complete.

## Boundaries

No secrets printed, customer roster testing, third-party attacks, silent data discard/migration, or production security changes beyond approved report-limit fix. Continue independent work when approval needed. Preserve all free tools and visual identity. No getting-started guide or bug-fix What's New entry.
