# Performance evidence — October 23, 2026

## Live baseline

The existing Cloudflare Web Analytics dashboard was inspected read-only. For its previous-24-hour, bot-excluded faintr.com view before this release, it showed:

- 125 visits and 142 page views; these include whatever traffic the dashboard classifies, not a controlled sample of customers.
- LCP P75: 976 ms. LCP classification: 92% good, 3% needs improvement, 4% poor (displayed rounded percentages).
- INP classification: 81% good, 19% needs improvement, 0% poor. Reported problematic controls included navigation, filters, league selection, account-name input and grading.
- CLS classification: 50% good, 15% needs improvement, 35% poor. Main content, footer and loader were prominent shift sources.

These are all-device observations from that dashboard window, not mobile-only statistics or proof that this release improved field performance. Field results after publication require fresh traffic and a comparable observation window.

## Reproducible local comparison

`tools/measure-performance.cjs` serves the local build read-only, substitutes empty account configuration, blocks outside requests, uses cold browser contexts and includes worker file delivery in its server byte count. Slower phone: 375px viewport, 4x CPU slowdown, 150ms latency and 200,000 bytes/second download. Assets are delivered uncompressed by the local server except already-compressed team binaries. Cloudflare's production compression/cache behavior is different.

| Metric | Before | After prepared fixes |
| --- | ---: | ---: |
| Bytes delivered before first teams | 42,731,823 | 8,246,254 |
| Desktop first teams ready | 3,576 ms | 2,006 ms |
| Slower-phone first teams ready | 185,035 ms | 46,441 ms |
| Desktop lab LCP | 1,044 ms | 976 ms |
| Slower-phone lab LCP | 1,804 ms | 1,604 ms |
| Desktop CLS | 0.154 | 0.030 |
| Slower-phone CLS | 0.266 | 0.058 |
| Phone Team Grader tab switch | 273 ms | 184 ms |

This is one baseline and one final sample under the same defined lab profile, not a statistical benchmark. Delivered bytes fell about 81%; phone team-readiness time fell about 75% in these samples. The small LCP/tab-timing differences may contain normal variation. The measured largest interaction in the final phone sample was 88 ms, but that single scripted interaction is **not field INP**. Do not advertise “46 seconds load time” as the production result; the local delivery and throttling intentionally stress first-use data loading.

Raw evidence is in the sibling workspace `output/performance-baseline.json` and `output/performance-optimized.json`. Intermediate experiments were retained separately; do not replace the baseline with an intermediate run. Later consent-dialog/accessibility text edits were not the cause of these measured data-loading changes; final release regression checks cover them separately.

## Verified bottlenecks and changes

| Severity | Bottleneck / verification | Change |
| --- | --- | --- |
| High usability impact | An empty roster/startup info request loaded Great, Ultra and Master team matrices in addition to the visible cup. Request traces showed all four team binaries | Return immediately for an empty roster; calculate eligibility from catalogs; website info no longer loads default-league team data |
| Medium | Four extra battle engines initialized on first visit, each reading game data even when only precomputed rankings were needed | Create engine workers on demand and grow to actual calculation demand. Preserve priority, error rejection, healthy workers and inline fallback |
| Medium | Late league controls, loaded filter controls and appearing content moved the page; reproduced CLS around 0.266 on the phone profile | Prerender disabled current league controls, use a stable phone control grid, reserve note/filter/content space and keep the loading state visible |
| Medium correctness impact | Old build caches could be treated as current when source/code changed; seed checks recomputed today's code hash rather than proving what built the seed | Require recorded input provenance, rebuild standard leagues plus active cups, withhold stale inactive caches in production. Explicit local preview mode can still use existing data for UI checks |

Large team binaries remain intentional: the current Fantasy binary is about 4.35 MB already compressed. Game-master JSON is about 1.71 MB before production transport compression. Fonts are locally served WOFF2; no remote font request or oversized creature artwork caused the measured primary delay. The application runs calculations in workers rather than sending rosters to a simulation API.

## Remaining costs and monitoring

Generating reports/custom IV matchups is computationally expensive. The worker pool, prefetch/cache and precomputed matrices reduce repeated work, but slower phones can still need time. Existing calculations were preserved and regression-tested; no formula was simplified to gain speed. Nested-worker failure falls back to the core worker with visible error/retry behavior rather than hanging forever.

Memory across many loaded leagues, unbounded combinations of member calculations and very large rosters remain concerns that need targeted long-session profiling on low-memory phones. No actual memory crash was reproduced in this audit, so these are not reported as confirmed defects. An eviction policy should be based on measured memory and must not discard stored user data.

After deployment, use Cloudflare → Observability → Analytics → Web Analytics → faintr.com → Core Web Vitals. Compare mobile and desktop separately over consistent 7/28-day windows. Inspect P75 LCP/INP/CLS and the affected-element breakdown, allowing for sample size and browser API support. Watch team-ready time separately from LCP: a heading can paint quickly while team data is still downloading. Re-run the local script after changes to data loading, worker startup or layout; keep old measurements for comparison.

No new performance infrastructure was added.
