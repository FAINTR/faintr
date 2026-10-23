# Additional reliability checks — October 23, 2026

The owner requested all four suggested follow-ups: cross-device/account sync, shared-link recovery, large-roster/continuous-session stress and more battle edge cases. This supplements the earlier audit. All tools remain free. Optional product analytics remains off. No customer records, credentials or production security settings are used or changed in this work.

## Confirmed findings and changes

| Severity | Finding and impact | Reproduction / verification | Smallest fix |
| --- | --- | --- | --- |
| Medium | A large roster created an excessive number of page elements. Opening or clearing a search could freeze the interface, especially on a slow phone. | Seed 500 or 2,000 synthetic entries with cached IV evaluations; open Roster and clear a search. The old 2,000-entry page contained 418,584 elements. The slow-phone opening exceeded the 30-second action timeout. | Render 50 cards or rows per page, with Previous/Next above and below. Search, sorting, filters, copy-search and export still operate on the complete roster. Changing criteria resets to page one; deletion clamps the current page. No entries are removed, rewritten or migrated. |
| Medium | Morpeko could remain Hangry after its second charged attack, causing subsequent Aura Wheels to use the wrong type. | Reproduced with both bundled `bdbb22c` and production-source `415436c`. Full Belly has a toggle transition; Hangry lacks its reverse rule. Two consecutive charged attacks leave it Hangry in the uncorrected engine. | Add only the missing reverse rule in the shared desktop/browser engine boot adapter. An explicit future upstream rule takes precedence. Test Aura Wheel and other charged moves, energy, buffs, form reset and preservation of future rules. Rebuild affected team data before publication. |
| Medium | The battle result renderer still called a narrow timeout result a tie when its score rounded to 500, although the engine result already contained an exact winner. This also affected the IV comparison labels. | Feed the renderer a result with rating 500 and winner 0/1; the old heading and table label read Tie. Actual narrow-fraction arithmetic is covered separately by the mechanics suite. | Use the returned exact winner for Win/Loss/Tie and its colors; use exact remaining-HP fractions only as a compatibility fallback. Cover win, loss and draw at rating 500 in browser tests. |
| Low | Some startup/shared-link failures left users with a transient message or an unhelpful error response. This made a temporary failure look like a dead link. | Simulate missing assets, failed lookup, malformed backend JSON, interrupted HTML reads and invalid team content. Test the branded error page and successful retry of the same URL. | Persistent recovery panel in the grader, startup reload button, and a responsive server error page with retry/home controls. Temporary failures return 503/no-store; unknown links remain 404 and invalid links 400. HEAD responses have no body. No hidden substitution of moves or IVs. |

These are bounded, reproduced problems. The earlier single intermittent live shared-team loading timeout remains **unexplained**: later repeated checks passed. Better recovery does not prove that its original cause has been identified or eliminated.

## Calculation evidence and limits

The expanded mechanics suite covers unrounded Attack priority on either side, Shadow/stat-stage separation from priority, a charged knockout canceling the lower-priority action without spending its energy, shielding with guaranteed effects, the ±4 stage cap, damage rounding, one-turn fast-versus-charged knockouts, equal-Attack mirrors, and Morpeko transitions. Existing arithmetic checks and 72 native-engine/wrapper fixture comparisons remain in place.

The Morpeko expectation follows the [official Pokémon GO announcement](https://pokemongo.com/news/halloween-part-1-2024): charged attacks change its form, and Aura Wheel's type follows its current form. The repair is a FAINTR compatibility rule, disclosed alongside the adapter hash in the published source-provenance file; it does not edit the upstream source files.

[PvPoke's CMP explanation](https://pvpoke.com/attack-cmp-chart/all/1500/bewear/) specifies full-decimal Attack priority, unaffected by Shadow damage bonuses or buffs, with random priority for identical Attack. The reference simulator resolves equal-Attack mirrors symmetrically instead. That is a **confirmed approximation**, now explained in the battle result. A deterministic draw is not a guarantee that a real mirror will draw. Native parity alone is not independent proof of mechanics.

The charged-before-fast knockout regression is consistent with the [official 2026 battle-system description](https://pokemongo.com/news/pvp-updates2026). This checks that interaction, not every swap, timing window, network delay or possible changing form. No unverified engine-wide timing rewrite was made.

## Large-roster measurements

Local Chromium, one sample per condition, synthetic copies with actual cached evaluation data. Desktop 1440×1000; phone 375×812 with 4× CPU slowdown. These timings include automation and local storage refresh and are not field INP or real-phone results.

| Profile / roster size | Old opening | Paged opening | Old clear search | Paged clear search | Old / paged page elements |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop / 500 | 3,196 ms | 434 ms | 1,872 ms | 131 ms | 108,084 / 17,192 |
| Desktop / 2,000 | 18,867 ms | 510 ms | 11,258 ms | 198 ms | 418,584 / 24,692 |
| Slow phone / 500 | 24,324 ms | 1,367 ms | 9,392 ms | 661 ms | 108,084 / 17,192 |
| Slow phone / 2,000 | Opening action timed out at 30 seconds | 2,518 ms | Not captured | 690 ms | Not captured / 24,692 |

The original run overlapped recovery browser tests for part of its duration; the paged run did not. Treat time differences as diagnostic samples, **not a controlled speed-up percentage or guarantee**. The DOM reduction and bounded 50-card render are directly verified. Main-thread heap was recorded after the change only; no before/after whole-browser or worker-memory claim is justified. Raw captures are in sibling workspace `output/roster-baseline.json` and `output/roster-paged.json`; the baseline was transcribed from tool output after its final condition timed out.

The roster browser case uses 2,000 entries at every test size. It verifies next/previous pages in card and list modes, searching the final entry across all pages, editing and refresh persistence, criteria resetting pagination, export of all 2,000 entries even while one search result is shown, and no page-wide overflow.

## Device and account boundaries

Five new storage stress tests run the real browser bridge with an emulated authenticated database transport. They cover two synthetic devices sharing 2,000 entries; a separate account receiving none of them; reopening/signing out without erasing server data; simultaneous independent import batches; expired sessions; interrupted writes; lost acknowledgement after a committed import; idempotent retry; and bounded repeated-conflict failure without overwriting the other device. Existing PostgreSQL policy tests remain separate.

These tests do not validate real Supabase JWT processing or account behavior on two physical devices. A request for two explicitly designated disposable live accounts is pending. Customer accounts are not a substitute. The owner explicitly deferred physical-phone testing, so browser emulation remains the boundary of the current phone verification.

## Verification status

In progress: final continuous-session stress run, full regression gate, fresh-data production build and post-publication smoke checks. Update this section with actual outcomes before reporting deployment complete. No new bug-fix What's New entry is being published.
