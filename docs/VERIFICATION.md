# FAINTR 1.3.0 verification report

Run on October 20, 2026 against PvPoke commit `bdbb22c` (October 16, 2026). That commit is byte-for-byte the same as PvPoke's current game master and Fantasy Cup rankings. Tools: `validate_grades.js`, `tools/validate_3v3.js`, plus API and browser (Playwright) tests.

## 1. Accuracy against pvpoke.com

`validate_grades.js` grades random teams two ways: from FAINTR's stored matchup matrix, and by running PvPoke Team Builder's exact code path. It then compares the four letters and the threat score.

| Format | Teams | Letters match | Max threat-score difference |
| --- | --- | --- | --- |
| Great League | 40 | 160 / 160 | 0 |
| Ultra League | 12 | 48 / 48 | 0 |
| Master League | 12 | 48 / 48 | 0 |
| Fantasy Cup (type-restricted cup) | 12 | 48 / 48 | 0 |
| Master League: Mega Edition (Megas, extra moves) | 12 | 48 / 48 | 0 |
| Little Cup (500 CP) | 12 | 48 / 48 | 0 |

What testing found and fixed:

1. **Coverage mismatch on a few teams (fixed).** Before 1.3.0, about 1 random Great League team in 5 had a threat score off by up to 5 points; the letters still matched. Cause: PvPoke's Team Builder rates threats with an "average of 0 and 1 shields" pass. In a small share of matchups (for example Shadow Forretress vs Shadow Dragonair), the 1-shield battle in that pass doesn't come out the same as a standalone 1-shield battle. FAINTR now runs Team Builder's own average pass and takes Coverage and threat traits from it. After the fix, every team tested matches exactly.
2. **Same-species teams (fixed).** Teams could pair different forms with one Pokédex number, like Stunfisk with Galarian Stunfisk, or Dialga with Dialga (Origin). GO and PvPoke don't allow that, so teams now use one Pokémon per Pokédex number and at most one Mega. Great League dropped from 545,972 to 544,360 teams.
3. **Mega "+" moves (fixed).** In Mega Edition formats, Megas have an extra charged move (for example Drill Peck+), and FAINTR was dropping it. Two of 12 Mega Master teams mismatched as a result (one Consistency letter and one Coverage letter). The engine now keeps the extra move, and after a rebuild all 12 match exactly.
4. **"None" second charged move (fixed).** Choosing "None" for charged move 2 now really battles with one charged move.

## 2. Does the ranking find teams that actually win?

`tools/validate_3v3.js` plays 3v3 chains on PvPoke's engine, with HP, energy and shields carried between fights and simple switching rules. Teams are drawn from each slice of the ranking and play a **held-out** field: 30 strong teams that aren't in the 60-team field Meta Wins uses. That gives 90 games per team and 15 teams per slice.

Engine win rate, ranked with 1.3.0's score (includes Meta Wins) vs the old score (without it):

| Slice | Great new / old | Ultra new / old | Master new / old | Fantasy new / old |
| --- | --- | --- | --- | --- |
| Top 50 | 71% / 68% | 70% / 65% | 64% / 61% | 70% / 70% |
| Top 0.1% | 70% / 59% | 61% / 56% | 63% / 56% | 73% / 70% |
| 0.1–1% | 58% / 55% | 55% / 55% | 54% / 53% | 60% / 60% |
| 1–10% | 52% / 45% | 51% / 44% | 47% / 49% | 47% / 42% |
| 10–50% | 44% / 41% | 47% / 46% | 37% / 37% | 29% / 31% |
| Bottom 50% | 34% / 36% | 35% / 38% | 18% / 25% | 17% / 17% |
| **Anti-Meta top 15** | **81%** | **77%** | **72%** | **87%** |

What this shows:
- The old score already put strong teams at the very top, but it barely separated the middle of the list. Adding Meta Wins makes win rates fall steadily from the top of the list to the bottom, and lifts the top 0.1% by 5 to 11 points.
- Anti-Meta teams beat the held-out field more often than any slice of the normal ranking. That's expected, since they are chosen for head-to-head wins rather than all-round grades.
- FAINTR's fast 3v3 model picks the same winner as the engine chains in 79 to 82% of games. Its scores run 5 to 9 points optimistic for the very top teams (picking the best of many results inflates them), which is why the Anti-Meta top 200 are re-played on the engine.

Limits: the engine chains are still a model, not human play. Switching is rule-based, opponents use PvPoke's default IVs and moves, and real players pick their lead after seeing yours. Read the numbers as relative strength.

## 3. Reliability

| Area | Test | Result |
| --- | --- | --- |
| Startup | Server ready with 15 formats loaded | about 1 second to load data; page usable right after |
| Port in use | Second copy started on a taken port | moved to the next port (5192 → 5193) |
| Persistence | Roster, saved teams and settings across restarts | kept (`%LOCALAPPDATA%\FAINTR`) |
| Damaged file | Truncated `roster.json` | kept a copy of the damaged file, restored the last good version, and recovered all entries; happens only once |
| Update check | No new PvPoke data | "Already on the latest PvPoke data. Nothing to rebuild." |
| Full update | Forced download and rebuild of 4 formats | completed, swapped in, re-graded saved teams; the old data stayed in use until it finished |
| Offline | Network failure during update | "Couldn't reach GitHub. Check your internet connection…"; data unchanged |
| Old data | Team data from an older FAINTR | ignored and rebuilt instead of misread |
| Cup set-up | First-time build of an unbuilt cup | completed in the app; about 4 to 6 minutes on 2 cores (faster on a typical 6 to 8 core PC) |
| Browser flows | Teams, Anti-Meta, Team Grader (search, swap, arrows, grade, Vs meta), Matchups, Counter finder, Roster (add, CSV import, list view, delete + undo), PvP IVs, league switching, dark mode | no page errors |

Not verifiable from this environment, so test these on a Windows PC: double-clicking `FAINTR.exe`, SmartScreen, the Windows scheduled task for daily updates (`schtasks`), and how fast builds run on that machine's CPU. The Windows code paths were reviewed: the task runs `"<exe path>" --update`, and data lives under `%LOCALAPPDATA%\FAINTR`. If the exe is moved after the daily task is turned on, turn the task off and on again so it points at the new location.

## 4. Documented capabilities

| Area | Documented | Verified |
| --- | --- | --- |
| Teams | Ranked combinations from the top 150 | Yes. 3 leagues plus the live cups; PvPoke letters exact; now ranked with Meta Wins; Anti-Meta mode |
| Team Grader | Nine grades, heat maps, threats, swaps | Yes, and now ten grades, a Vs meta teams tab, search plus Roster in every slot, and swap on duplicate |
| Matchups | IV-aware sims, shields, energy, breakpoints | Yes, plus Counter finder (targeted engine battles; Roster answers in about 1 second) |
| Roster | Collection, IV ranks, import and export | Yes, plus CSV import (Poke Genie and Calcy IV), list view, filters, pins, notes, XL, evolutions, undo, and recovery from damaged files |
| PvP IVs | New | Ranks match PvPoke's own IV generator; IV floors, best buddy, family, matchups changed vs rank 1, search string |
| Meta | Rankings and changes | Yes, per format |
| My Teams | Saved teams with re-grading | Yes, re-graded after the full update test |
| Updates | Automatic PvPoke sync | Yes: check, full rebuild, swap and offline paths tested. Live GO Battle League formats are kept built. |
