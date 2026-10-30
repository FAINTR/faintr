# Website update failure review — October 30, 2026

Scope: the owner's GitHub failure emails for **FAINTR site update**. Discord was explicitly excluded. No customer data, credentials, database settings or account records were inspected or changed.

## Confirmed cause and impact

The scheduled update ran, downloaded/built its data, verified hosting access and passed the 97 Node regression cases and sharing checks. Publication was then blocked by browser tests that assumed fixed locations for league controls. The website deliberately shows current leagues as buttons and moves other formats into its dropdown at a rotation. The tests incorrectly expected Fantasy Cup and Ultra League to remain buttons after October 27.

The October 30 failure artifact shows these exact waits: `#leagueSeg [data-f="fantasy-1500"]` and `#leagueSeg button[data-f="all-2500"]`. The saved page contains Ultra and Fantasy dropdown options instead, and correctly shows Mega Halloween Cup and Master as the live buttons. Repeated 90-second waits then exhausted the 15-minute browser-check step. This is a confirmed deployment-blocking test defect, not evidence of a website outage or damaged rosters.

The same two test names and timeout appear in runs 40579183718 and 40586432169 (October 27), 40638084244 (October 28), 40823650565 (October 29) and 41008664668 (October 30). Logs are preserved under sibling `output/site-failure-<run ID>.log`; the latest screenshots, page snapshots and traces are in `output/site-failure-41008664668/`.

Some later runs are green because they correctly skip the unused daylight-saving/rotation schedule slots. In particular, October 30 run 41014174973 skipped publication; it is not evidence of recovery. Operations-alert regressions confirm a skipped run cannot close a deployment-failure issue.

Before the fix, a public read-only check returned HTTP 200 and a manifest built October 27 at 05:39 UTC, using PvPoke `d98f521_2026-10-26`. The public schedule identifies Mega Halloween Cup and Master as current. This confirms the prior website remained available while subsequent updates were blocked. Raw result: `output/site-live-before-oct30.json`.

## Smallest correction

Release tests now select a format using its visible live button or its dropdown option, then wait for the matching grader description. All hardcoded league-selection controls in the browser suite use this helper, including other Great League tests that would otherwise fail at a future turnover.

A new isolated browser regression supplies two synthetic schedules: GL/UL/Fantasy as live buttons, then Master alone as live. It asserts the expected button/menu placement and selects GL, UL and Fantasy in both layouts. Real app rendering and format loading are used; no public schedule or production data is changed.

No browser assertions were removed, retries added or test time limits raised. Application behavior, Pokémon calculations, user data, free access and analytics settings are unchanged.

## Verification

All 15 targeted browser checks passed in 3.3 minutes across desktop, 320px, 375px, 430px and Safari/iPhone emulation. These cover both formerly failing flows and the new two-layout rotation regression. All six operations-alert tests also passed, including the skipped-run recovery guard. Local browser checks use bundled older PvPoke data and synthetic local rosters, with account/external traffic blocked. The normal publication gate must still validate the newest fetched data before any recovery is claimed.
