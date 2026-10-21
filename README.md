# FAINTR

**Win the matchup.** FAINTR is a set of PvP team tools for Pokémon GO that runs PvPoke's own battle simulator on your computer. It finds and grades teams for Great, Ultra and Master League and this season's cups (FAINTR Teams), simulates battles with your real IVs (FAINTR Matchups), keeps a Roster of the Pokémon you've built, and updates itself every day. Brand rules live in `docs/FAINTR_BRAND_GUIDE.md`.

## The website

FAINTR also runs as a website with accounts (Cloudflare Pages + Supabase + a nightly GitHub Action). Everything above works in the browser, with results identical to the desktop app. Setup, costs and day-to-day running are in `docs/WEBSITE_SETUP.md`. The pieces:

| Path | What it is |
| --- | --- |
| `tools/build_web.js` | Builds the site into `site/`: downloads PvPoke (`--fetch`), rebuilds only the formats whose inputs changed, packs team data (`teamcodec.js`) and bundles the browser workers |
| `web/` | Browser code: `bridge.js` (main thread: accounts, storage, bug reports), `src/core.js` (app logic in a Web Worker), `src/engine-worker.js` (PvPoke engine pool) |
| `appcore.js` | App logic shared by the desktop server and the website |
| `supabase/` | Database setup (`migrations/001_init.sql`) and the admin update function (`functions/trigger-update`) |
| `.github/workflows/` | Nightly site update, weekly database backup, and a cloud build of the Windows app |

## Run it

Double-click `FAINTR.exe`. A console window opens and your browser opens to `http://127.0.0.1:5150/`. Keep the console window open while you use FAINTR; close it to quit.

Windows SmartScreen may warn because the file isn't code-signed. Choose **More info**, then **Run anyway**.

Nothing leaves your computer except the update download from PvPoke's public GitHub repository.

## Sections

| Tab | What it does |
| --- | --- |
| Teams (FAINTR Teams) | Every team from PvPoke's top 150 for the league or cup picked at the top, ranked by weights you set. Filters: must include, leave out, only Pokémon in your Roster, minimum grades, Shadow limit. The overall score is colored by where it ranks: top 0.1%, 1%, 5%, 25%. |
| Team Grader | Any three Pokémon with your movesets and IVs, or straight from your Roster. Verdict, nine grades with what an A needs, game plan versus the top 20 leads, a top-40 heat map at 0/1/2 shields, threats, per-member breakdown, IV effects, and best swaps. Find the rest fills a partial team for you. |
| Matchups (FAINTR Matchups) | 1v1 simulation with IVs, shields, baiting and start energy: timeline, HP chart, all nine shield scenarios, breakpoints, and the same battle with default and rank 1 IVs. One Pokémon against the top 100. Counter Finder: the best answers to up to three opponents, from the meta or from your Roster. |
| PvP IVs | Rank any IVs in every league and across the evolution family, with IV floors (trades, raids, lucky), best buddy levels, every combination in a table, matchups your IVs change versus rank 1, and a search string for the top IVs. |
| Roster | Your PvP-ready Pokémon: moves, IVs, CP, ball, shiny, best buddy. IV rank (★ for rank 1), level and power-up status in every league, sort by IV rank or CP, quick add from a list, Poke Genie and Calcy IV CSV import, card or list view, filters, pins, notes, XL markers, evolution ranks, Pokémon GO search string, export and import. |
| Meta | PvPoke's top 250 for the picked league or cup, with all role scores, who moved after each update, and an In my Roster filter. |
| My Teams | Saved teams with their league, re-graded after every data update with arrows showing what changed. |
| What's New | The changelog. |
| Report a Bug | Send a bug report or idea (saved to the FAINTR database when it's set up). Discord and Patreon links sit at the top of every page. |

## Anti-Meta

The Anti-Meta button next to the leagues ranks every team by how often it beats the 60 strongest varied teams in that league or cup (three games each, one per opposing lead) using FAINTR's 3v3 model. The top 200 are re-played as 3v3 chains on PvPoke's engine with HP, energy and shields carried over. The same results feed the Meta Wins check in the normal rankings.

## Leagues and cups

Great, Ultra and Master League and Fantasy Cup ship ready to use. Every cup PvPoke ranks this season appears in the cup menu; the first time you open one, FAINTR grades its teams on your computer (a minute or two), and after that it updates along with the leagues. Matchups, Meta and the Roster work for every cup straight away.

## Daily updates

- **Automatic:** FAINTR checks GitHub when it opens and every few hours while it is open. If PvPoke has new data, it downloads it, re-simulates every matchup and re-scores every team in the background (about 1 to 2 minutes on a 6 to 8 core PC). When nothing changed, the check takes a second or two.
- **Even when closed:** under **Data and updates**, tick **Update every day, even when FAINTR is closed**. This registers a Windows scheduled task that runs `FAINTR.exe --update` at the time you pick (6:00 AM by default). An open FAINTR window switches to the new data within a minute.
- Updated data, settings and saved teams live in `%LOCALAPPDATA%\FAINTR` (moved automatically from the old Triad folder). Delete that folder to reset to the bundled data.

## The grades

The four PvPoke grades (Coverage, Bulk, Safety, Consistency) are computed exactly as PvPoke's Team Builder computes them with default settings. Enter a team on pvpoke.com in the order FAINTR shows (lead, safe swap, closer) and you get the same letters; FAINTR's parity check matches the letters and the exact threat score on every random team tested (including shadows and cups), because it runs Team Builder's own 0-and-1-shield average pass.

The six FAINTR team checks are calibrated so the best 10% of all teams earn an A:

| Grade | Measures |
| --- | --- |
| Blind Spots | Top-100 meta Pokémon that beat all three members at 1 shield |
| Two Answers | Rank-weighted share of the top-100 meta that two or more members beat |
| Shield Resilience | Worst versus best meta coverage across 0, 1 and 2 shields |
| Shared Weakness | Common meta attack types that hit two or more members super-effectively |
| Pilot Ease | Share of meta matchups that are close or flip with shields |
| Meta Wins | Simulated 3v3 games won against the 60 strongest varied teams in the league |

Limits: the lead / safe swap / closer order and the game plan are heuristics from PvPoke's role scores and 1-shield matchups. Meta Wins and Anti-Meta use a 3v3 model (HP carries over, simple switching rules); it picks the same winner as engine 3v3 chains in about 72 to 84% of games depending on the league, and the engine re-check covers the Anti-Meta top 200. Neither is a human-played battle. Opponents always use PvPoke's default IVs and recommended movesets.

## Build from source

Requires Node 22.

```
npm install
node build.js assets/pvpoke-src assets/data/all-1500 150 all-1500   # re-simulate one league (all-2500, all-10000, or a cup key)
node server.js                                       # run without packaging
npx pkg . --compress GZip -t node22-win-x64 -o dist/FAINTR.exe
node validate_grades.js assets/data/all-1500 20      # parity check against PvPoke's exact Team Builder path
node tools/validate_3v3.js assets/data/all-1500 300  # does the ranking pick teams that win? (engine 3v3 chains)
```

| File | Role |
| --- | --- |
| `engine.js` | Loads PvPoke's browser scripts headlessly; IV support |
| `pvpoke_grades.js`, `memberlib.js` | In-engine helpers: Team Builder grade port, member simulations, IV rank, battles |
| `scoring.js`, `metrics.js` | Team scorer and grade definitions |
| `formats.js` | Leagues and this season's cups, and the PvPoke files each needs |
| `threevthree.js`, `antimeta_worker.js` | 3v3 model, meta field, Meta Wins and Anti-Meta verification on PvPoke's engine |
| `report.js` | Team Grader report: verdict, game plan, heat map, members, IV effects, swaps |
| `build.js`, `build_worker.js` | Matchup matrix and bulk team scoring |
| `pool.js`, `engine_worker.js` | Background engine workers |
| `updater.js`, `update_worker.js`, `store.js` | Updates, scheduled task, meta changes, user storage |
| `server.js`, `ui/` | The local app (`ui/brand/` holds the FAINTR mark, lockup and icon) |

## Credits

Battle simulator, game data and rankings: [PvPoke](https://github.com/pvpoke/pvpoke), MIT License (copy in `assets/pvpoke-src/LICENSE-pvpoke.txt`).

FAINTR is not affiliated with, endorsed by, or sponsored by Niantic, Nintendo, Game Freak, or The Pokémon Company. Pokémon and Pokémon GO are trademarks of their respective owners.
