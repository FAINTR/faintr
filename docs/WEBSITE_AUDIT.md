# FAINTR website audit and release review

October 23, 2026. Initial inspection preceded changes. The review covers the browser application, calculation wrappers, build/deployment configuration, public sharing, account/storage source and the separate desktop host. It does not establish that every possible team, device or attack path has been tested.

## Findings, ranked by user impact

“Prepared” means changed locally and subject to the release checks; production verification is recorded in `AUDIT_PROGRESS.md` after deployment.

| Severity | Confirmed problem and impact | Reproduce / verify | Fix |
| --- | --- | --- | --- |
| High | Typed account details could be nearly invisible, preventing signup/sign-in | Open email/password fields under dark/system themes; pre-fix contrast measured about 1.10:1 | Explicit text/background/caret/autofill colors and theme color scheme; multi-theme browser tests |
| High | Engine failure could leave calculation/loading work unresolved | Simulated failed worker initialization, runtime crash and unavailable nested workers | Reject affected work, drain/release queued work, retain healthy engines and fallback; show retryable error |
| High | Stale account jobs or visible private views could survive sign-out/account switching, especially if the next account was offline | Synthetic account-switch, late direct/storage reply and offline-next-account browser tests | Terminate old worker, reject pending operations, guard replies, clear cache/private views immediately and explain that unsaved forms were closed |
| High | Evaluation refresh could overwrite edited or deleted roster data | Simulated background refresh plus concurrent cloud version update | Apply only evaluation/history to still-existing entries with matching inputs |
| High usability impact | First teams waited on unrelated league data and redundant workers | Local network/byte traces and before/after measurements | Load only needed format data; skip empty-roster work; defer extra engines |
| Medium | Import limits, unknown CSV forms/moves and uncertain retry could omit, misidentify or duplicate roster entries | Large import, unknown-form and replay tests; browser partial-import/export test | Strict validation, explicit pending indices, preview/batching, stable retry IDs and insert-only writes |
| Medium | Two edits of one roster entry could silently overwrite one another | Fake database conflict/retry regression | Canonical content-version check and retained draft with conflict guidance |
| Medium | Team Grader accepted duplicate species/forms or multiple Megas unlike search | Shared rule tests and backend trace | Match search's existing team legality checks before grading/saving |
| Medium | Level ceilings and Mega IV percentages were inconsistent | Real engine checks at level 40/50/51 | Apply requested ceiling to both constructed build and rank alternatives |
| Medium | Damage reference cards used post-battle debuffed stats | Melmetal Superpower fixture against Registeel | Fresh neutral stats for reference cards; actual battle effects retained |
| Medium | Narrow timeout lead could be mislabeled a draw | Explicit remaining-HP fraction test that rounds to rating 500 | Choose winner before rounding ratings |
| Medium | Populated Game Plan overflowed a 320px phone to 437px document width | Populated report browser reproduction | Accessible horizontal regions for wide tables; stacked report members; responsive cards/controls |
| Medium | Timeline text became too small when a desktop SVG shrank to a phone | Populated simulation inspection | Readable minimum-width chart in a scrollable region, with the existing detailed turn log retained |
| Medium | Late controls/content caused layout jumps | Local CLS and live Cloudflare affected-element evidence | Stable initial controls/layout and reserved loading space |
| Medium | Stale caches could be published as current calculations | Build input/provenance code trace and policy regression | Recorded provenance checks, current standard-league rebuilds, no stale inactive-cache publication |
| Medium availability | Manual update/status control looked available, but its Supabase function was absent | Live 404 plus dashboard listing only two billing functions | Tested fallback hides unavailable controls and links to the existing GitHub workflow. No new admin credential/endpoint needed; nightly/push builds remain separate |
| Low | Sign-out could report success even when provider returned an error | Synthetic provider-error test | Check returned error and retain a clear retry message |
| Low | Quick-add checking, export, deletion/undo and news-load failures lacked useful feedback | Failure-path source trace and isolated roster/browser tests | Catch errors, preserve drafts/pending rows, show retry guidance and accurate success acknowledgements |
| Low | Signup/roster save buttons allowed repeated submissions during work | Handler trace | Disable during request; restore on completion/failure |
| Low | Search suggestions and tab controls lacked complete keyboard/screen-reader relationships | Keyboard/touch browser tests and markup inspection | Combobox/listbox relationships, active-option announcement, click/touch selection and tab arrow/Home/End behavior; preserve existing element IDs |
| Low | Small touch controls and phone dialogs could be hard to use | Phone viewport checks | 44px action/label targets, 16px editable controls, bounded scrolling dialogs and contextual labels; badge size preserved |
| Low | Duplicate root description, absent sitemap/robots and inconsistent ancillary social metadata | Generated HTML inspection | One description, canonical/social metadata, sitemap/robots and a helpful 404 with return action |
| Low | Privacy wording still described verifying VIP for a free site | Privacy/Terms comparison | Removed stale current-VIP use wording while preserving earlier-payment support disclosure |
| Low | Known development dependency advisory | Online npm audit | Updated esbuild; final advisory check reports zero known vulnerabilities |

## Product review

All website tools remain free. The existing visual identity, visible grade badges, full Pokémon names/moves, sharing, simulations and advanced report sections remain. No getting-started guide was added, and bug fixes were not added to What's New. Roster league choices and the earlier scavenger credit remain intact.

The roster now explains whether data is saved to an account or only this browser. Missing/failed state messages avoid claiming a save succeeded before acknowledgement. Wide tables scroll within labeled keyboard-focusable regions instead of forcing the whole page sideways. The Data and updates dialog remains closable and is included in the release tests.

Tool tabs still share one application URL; search engines cannot index a unique static page for every tool. The sitemap covers the actual standalone pages, not invented indexable tool routes. Back-button/deep-link routing, full search-engine discoverability of calculated results and a complete screen-reader usability study remain opportunities requiring separate design/testing; no claim of full SEO or WCAG compliance is made.

## Phone/desktop checks

The release suite checks Chromium at 320×740, 375×812, 430×932 and 1440×1000, plus WebKit's iPhone 13 profile. It exercises rankings and visible grades, every built league, Anti-Meta, filters, data/help dialogs, short/legacy sharing, populated reports across all eight tabs, simulation/timeline/log, IV ranking/family tables, roster edit/persistence/eligibility/import/export/delete/undo, saved teams, account fields in several themes, optional consent flows, and public supporters/privacy/terms/licenses/sources pages.

This is emulated viewport and browser-engine coverage. It does not emulate an actual iOS on-screen keyboard or every hardware/browser combination. Use a real phone to verify keyboard opening/rotation/zoom, screen-reader announcements and long battle sessions before claiming those are fully verified. Touch selection is exercised in the mobile browser tests.

## Maintainability

The shared core and engine glue avoid implementing separate formulas for browser and desktop. New worker-pool, storage-patch, team-rule and build-policy modules isolate the fragile paths and have focused tests. The large UI script, string-evaluated engine helpers and growing caches remain maintenance risks. A broad framework rewrite would add risk without fixing the verified failures, so no storage/framework migration was attempted.

## Follow-up reports and boundaries

- `SECURITY_AUDIT.md`: security findings, live checks, production approvals and limits.
- `ROSTER_AUDIT.md`: exact persistence/import/export/concurrency behavior.
- `BATTLE_AUDIT.md`: mechanics trace, reference tests and unsupported cases.
- `PERFORMANCE_AUDIT.md`: baseline, changes and measured limits.
- `ANALYTICS_PLAN.md`: existing analytics, event definitions, consent and disabled implementation.

Untested concerns are explicitly identified in those reports. No production security policy, credential or optional-analytics schema was changed without approval; no customer's private roster was used for testing. Preserve this distinction when reviewing or communicating the release.
