# FAINTR audit working record

Updated 2026-10-23. This is a working record, not a claim that all checks are complete.
Baseline deployed commit: `aa89d56768ba75a0f449c5113713750865e031ae`.
Current audit changes are not yet published. Working reports now exist in `docs/WEBSITE_AUDIT.md`, `SECURITY_AUDIT.md`, `ROSTER_AUDIT.md`, `BATTLE_AUDIT.md`, `PERFORMANCE_AUDIT.md` and `ANALYTICS_PLAN.md`.

## Confirmed problems and prepared fixes

| Severity | Problem and impact | Verification | Prepared fix |
| --- | --- | --- | --- |
| High | Account email/password text unreadable in dark themes | Browser contrast measured 1.10:1 before fix; synthetic inputs only | Explicit field colors, autofill colors and color scheme; browser regression |
| High | Worker crashes could leave grading operations waiting indefinitely | Simulated boot and runtime worker failures | Reject affected operations, release queued jobs, preserve fallback; regressions |
| High | Old account calculations/storage replies could survive an account change | Synthetic account-switch test | Terminate old core, reject old work and guard stale replies |
| High | Background evaluation refresh could overwrite edits or revive deleted entries | Storage patch regression tests | Apply evaluation/history only to unchanged existing inputs |
| Medium | Same roster entry edited on two devices could lose the newer edit | Synthetic content-version tests | Reject conflicting edit while retaining form draft |
| Medium | Large imports and invalid forms could silently omit or misidentify entries | 1,001-row and invalid-form regressions | Explicit rejected indices, retained pending entries, validated moves/CP/forms |
| Medium | Explicit level ceilings were ignored for default IVs; Mega rank comparisons used a different ceiling | Real engine level-40/50/51 checks | Consistent explicit ceiling for actual and comparison builds |
| Medium | Battle reference damage used stats altered by a previous simulated battle | Melmetal Superpower / Registeel reference check | Compute reference damage from fresh neutral starting stats |
| Medium | Grader could accept duplicate species/forms or multiple Megas unlike team search | Code trace; dedicated regression pending | Shared team legality checks |
| Medium | Populated report overflowed 320px phone (437px document width) | Browser reproduction | Scrollable accessible tables, stacked report members, wrapped controls |
| Medium | Initial empty-roster load pulled unrelated league matrices | Local cold-load measurement | Avoid matrices for empty roster and website information; catalog-only eligibility |
| Low | Root metadata duplicated; ancillary pages lacked canonical/social metadata and sitemap | Generated output inspection | Public-page metadata, sitemap/robots and useful 404 |
| Low | Development esbuild server advisory | npm audit; development-only exposure | esbuild updated; npm reports zero known dependency vulnerabilities |

## Performance evidence

One local cold-load sample per condition, uncompressed local delivery including workers. Slower phone: 375px, 4x CPU slowdown, 150ms latency, approximately 1.6Mbps download. These are lab observations, not real-user Core Web Vitals.

| Metric | Baseline | Prepared changes (first measurement) |
| --- | ---: | ---: |
| Delivered bytes | 42,731,823 | 16,192,019 |
| Desktop teams ready | 3,576ms | 2,556ms |
| Slower phone teams ready | 185,035ms | 48,086ms |
| Slower phone LCP | 1,804ms | 1,880ms |
| Slower phone CLS | 0.266 | 0.271 |

Team readiness improved in these samples; LCP and CLS did not. Further layout stabilization is prepared but unmeasured. Raw measurements: sibling workspace `output/performance-baseline.json` and `output/performance-after.json`.

## Storage model established

The live site requires an account for rosters. Supabase stores a JSON storage row per account, protected by owner policies in the reviewed SQL. Local browser cache is account-scoped. Guest saved teams are local and do not automatically move between devices. Clearing browser data removes local-only data and cache; account cloud data remains. Cloud writes use compare-and-swap version checks. Prepared improvements retain failed import entries, detect same-entry edit conflicts, refresh open views and explain retention. No production schema changes or user-data migrations have been made in this audit.

## Verification completed so far

- 11 audit regression tests plus 23 existing grading/roster tests passed before the latest small edits.
- Reported Master team grading regression passed for custom/default/perfect IVs and a repeated calculation.
- Four focused 320px browser tests passed: populated report tabs, populated battle/log, ancillary pages and account-input themes.
- Full five-browser/viewport suite and final rebuild remain pending.

## Latest work completed and immediate continuation

- Battle suite now has 13 passing cases, including 72 native-engine/wrapper matchup comparisons, independent arithmetic, energy/shields, buffs reference regression, simultaneous fainting, timeout, level caps, Shedinja HP and team rules. Narrow timeout winner rounding fixed.
- Audit regression suite now has 21 passing cases, including cloud CAS conflicts, retry-safe imports, sign-out error, worker failures/lazy startup, stale direct API replies and local desktop request protections.
- Analytics suite has 9 passing cases. Existing Cloudflare setup verified in dashboard (142 page views / 125 visits over its prior 24h). Optional action tracking implemented **disabled**; SQL/credential/retention/privacy activation remains a review proposal.
- Earlier 90-case full browser run passed. Latest 95-case run on the newer accessibility build has 94 expected passes and one confirmed Safari touch-selection regression, now fixed in working source but awaiting rebuild/retest. The run is session 83997, almost complete as of 14:34 UTC. Do not interpret this as a production defect: it was caught in the unpublished changes.
- Latest working code also clears previous-account private UI immediately on account changes, before network lookups; a new browser test uses two entirely synthetic accounts, with the second offline. This test is not yet run. The bridge also guards late direct API responses by account epoch.
- Initial controls preserve existing `vipTab` ID; an earlier test-caught navigation regression is fixed.
- Final measured data-loading/layout sample is `../output/performance-optimized.json`: desktop 2,006ms / 8,246,254 bytes / CLS .0304; slower phone 46,441ms / same bytes / CLS .0577 / LCP1,604ms. Baseline same profile was 185,035ms / 42,731,823 bytes / CLS .2657 on phone. Lab uncompressed local delivery, not field claims.
- npm online audit returns zero known vulnerabilities. Limited current/history secret-pattern scans found no matches; no credentials printed.
- Live anonymous zero-row reads of private tables returned401. Admin update endpoint404 and Supabase dashboard confirms it is absent; source prepared, deployment needs approval. Live headers include CSP/frame denial/nosniff/referrer policy. No production security settings changed.
- Current application changes are still UNCOMMITTED/UNDEPLOYED.

Next steps:
1. Session83997 finished:94 passed, one Safari touch failure. That failure is fixed: rebuilt current site and ran30 focused browser regressions (session82964), ALL PASSED, including Safari touch selection and the offline-next-account case at all5 viewport projects. Latest source also guards late direct API responses. All72 node regressions plus sharing and reported-team checks passed. Do not redo completed checks without a new reason.
2. Read-only live database metadata confirms RLS enabled/anon SELECT absent for5 private tables, all4 roster ownership policies, and profile column privileges (admin promotion false, display-name edit true). Backup39869002881: both backup and isolated recovery jobs success.
3. Run final complete 100-case browser suite if needed (95 earlier cases plus account-switch case across5 projects). CI will also run the full suite after the production rebuild. Local preview intentionally uses stale prebuilt game matrices; normal production build now rebuilds valid current inputs.
4. Update test totals and report/progress status, commit/push authorized application fixes, watch the site workflow. Normal rebuild covers current cups AND standard leagues and may take a long time. No optional analytics/security SQL is applied by the workflow.
5. Verify live assets and behavior after deployment. Obtain specific approval for proposed production SQL, analytics activation/credential/retention and absent admin endpoint deployment, while continuing independent work. Do not claim all work finished until outstanding approvals/verification are honestly reported.

## Boundaries

Do not print credentials, access customer rosters, attack third-party systems, silently discard/migrate user data, or change production security policies without approval. Pending approvals must not stop unrelated authorized work. Do not announce bug fixes in What's New. Preserve badge sizes, visible grades, full names/moves and the free website model.
