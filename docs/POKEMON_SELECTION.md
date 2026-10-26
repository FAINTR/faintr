# Complete legal selection and expanded Great League rankings

Owner requested all eligible Pokémon selectable, then explicitly chose top 250 for open Great League ranked teams. Other ranked pools retain their existing size. Manual selection is separate from the ranked candidate pool.

Confirmed causes: Ursaluna is already in open Great League's manual catalog (PvPoke rank 180 in the reviewed source), but was absent from the old top-150 ranked-team filters. The manual catalog also inherited the opponent generator's minimum-stat-product cutoff, hiding hundreds of low-stat but eligible species. Fantasy Cup excludes Ursaluna correctly: its Ground/Normal typing does not meet the required Dragon/Steel/Fairy restriction. No rule bypass is added.

Changes: use the native eligibility generator with only its competitiveness cutoff disabled for manual pickers, preserving release/cup bans and forms; include Pokédex numbers in API catalog results; search all legal catalog entries in include/exclude filters; explain an include outside the ranked pool and offer a button to open a new manual team. Ranked threat lists, grading denominators and native eligibility checks are unchanged. With the current source this exposes 1,506 open-GL choices instead of 1,154, and 237 Fantasy choices instead of 197. Ursaluna stays absent from Fantasy Cup.

Open Great League's ranked candidate target is 250. Other formats retain 150. Pool size participates in cache invalidation, the existing byte-index format is guarded at 256 candidates, and UI pool descriptions use the actual loaded pool size. The separate top-150 meta-change digest retains its accurate existing label. Old data is rebuilt before normal publication; local preview matrices must not be deployed.

Local tests: full eligibility sets compared with the native unpruned generator across GL/UL/ML and Fantasy, valid move pools, no duplicates, unchanged threat pools, legal Ursaluna GL inclusion and Fantasy exclusion, low-stat Abra/Azurill visibility, candidate index249 preservation, and pool policy isolation. Focused audit/battle suites passed 53 cases. Desktop browser flow graded Abra/Ursaluna/Azumarill successfully; mobile-flow test setup is being corrected to open the existing collapsed filter controls. Test-only timing/control mistakes are not application findings. Full release, real top-250 data and performance evidence are pending.

Focused selection checks now pass on desktop, 320px phone and Safari, including real Abra/Ursaluna/Azumarill grading, numeric Pokédex search and Fantasy rejection. The updated 53 Node audit/battle cases also pass. The initial GL150 baseline is saved in sibling output/great-150-baseline.json: local cold desktop 2,600ms and slowed phone 71,092ms, 12,917,472 delivered bytes; phone profile is 150ms latency, 200KB/s and 4x CPU. These single lab samples are not field guarantees. The enlarged pool's measured costs remain pending fresh data.

Counter Finder now accepts legal low-stat opponents that are absent from its precomputed threat list, using native direct matchups while retaining cached rows for ordinary ranked threats. Tests cover both cached and uncached cases. Fifty-four focused Node tests passed, and the combined UI flow (including real Counter Finder results for Abra) passed desktop and Safari. The earlier candidate was cancelled before publication so this related correction ships together.

A later full release gate caught a roster confirmation race: background card rendering removed the Yes-remove prompt. Trace evidence confirmed the confirmation button detached before the click; two profiles failed while143 cases passed. Publication was blocked. Pending confirmation and in-flight deletion now live in UI state and survive background rendering; Keep, explicit confirmation, failed-delete retry, Undo and account-boundary cleanup remain intact. No stored entries are rewritten by this fix. Regression coverage forces the background render rather than relying on timing.

## Publication and final verification — October 26

Commit92ca5be11b6349bfd9baf9bf18983e74f7c43d45 / [release40278971955](https://github.com/FAINTR/faintr/actions/runs/40278971955) is published to https://e11d17fa.faintr.pages.dev and https://faintr.com. It passed97 Node cases, sharing/reported-team checks and145 browser cases (13.4minutes). The intermediate project-create step returned the existing-project warning; publication and live source verification succeeded. The earlier cancelled and failed candidates were not published.

The published GL dataset contains250 candidates and2,553,186 legal teams. Other ranked pool targets stay150. Live Chromium1440/320 and Safari375 checks confirmed Ursaluna can filter ranked GL teams, low-stat Pokémon can be found by Pokédex number, Counter Finder accepts Abra, Fantasy excludes Ursaluna with a type explanation, and no page-wide overflow or page errors occurred. Raw evidence: sibling output/live-pokemon-selection.json. The full pre-publication gate also covers375/430px and all existing functions. Physical-device testing remains deferred.

## Measured expansion cost

Single cold local lab samples, same server/profile method. Slower phone:375px,4xCPU,150ms latency,200KB/s download. Both runs disable third-party traffic/accounts. Final public assets were captured with content checksums into output/great-250-site. The baseline's numerical dataset is older(bdbb22c_2026-10-16); final is38f7032_2026-10-23, with small intervening UI changes. These are diagnostic cost samples, not a controlled pool-only percentage, field Core Web Vitals or a real-phone guarantee.

| Metric |150-candidate baseline|250-candidate release|
|---|---:|---:|
|Legal ranked teams|544,360|2,553,186|
|Compressed team file|4,172,951 bytes|19,362,700 bytes|
|Delivered bytes at teams ready, local uncompressed delivery except the team file|12,917,472|30,503,783|
|Desktop teams ready|2,600ms|11,627ms|
|Slower-phone teams ready|71,092ms|171,552ms|

The expanded cold load is materially heavier. The250 target was retained as explicitly chosen; no speed improvement is claimed. Public hosting compression/cache behavior differs from this local no-cache sample, and a single run cannot establish typical user experience. Existing immutable caching remains in place; no unsupported warm-load timing claim is made. All published data files remain below the host's25MB individual-file limit. Raw captures: sibling output/great-150-baseline.json and output/great-250-final.json. Existing rosters/accounts are preserved; no storage migration, production security setting, billing or analytics change was made.

All authorized automated work for this request is complete within these stated limits. The usage-aware continuation can stop; physical-phone and controlled real-account/inbox work remains deliberately deferred.
