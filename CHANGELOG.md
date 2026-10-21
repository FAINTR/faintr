# What's new in FAINTR

## 1.4.0 (October 20, 2026)

### FAINTR is now a website
- Everything in the desktop app runs in your browser: Teams, Anti-Meta, the Team Grader, Matchups, Roster, PvP IVs, Meta and My Teams. PvPoke's battle engine runs right on your device, so results come back as fast as in the app.
- The website's grades, rankings and battles match the desktop app exactly. We compared every kind of result across Great, Ultra and Master League, Fantasy Cup and Master League: Mega Edition: no differences.
- Team data downloads once (about 5 MB per league or cup) and your browser keeps it until the next update.
- New data every night at midnight Central time. FAINTR checks PvPoke for new rankings and moves, re-runs only the leagues and cups that changed, and publishes them on its own.

### Accounts
- Create a free account with your email, or sign in with Discord or Google where they're turned on.
- Your Roster is saved to your own account, private to you, on any device. Saving on your phone and your computer at the same time never loses a Pokémon.
- Saved teams follow your account too. Teams you saved before signing in can be moved to your account in one tap.
- Delete your account and everything in it from the account panel at any time.

### Community
- **Discord** and **Patreon** buttons at the top of every page.
- New **Report a Bug** tab. Pick what kind of report it is, describe what happened, and send. The page, league or cup and version are attached for you.

### Changes
- Roster cards no longer take pictures. Every card shows the pixel type icons, in shiny colors for shinies.
- Quick add saves in batches, so adding 30 Pokémon takes a moment instead of 30 saves.
- The Roster holds up to 2,000 Pokémon.
- Works on phones: the tabs scroll sideways, team cards fit the screen, and the header scrolls away so the results get the room.

## 1.3.0 (October 20, 2026)

### Anti-Meta
- A new **Anti-Meta** button next to the leagues turns amber and flips the header to light. Teams are then ranked purely by how often they beat the 60 strongest varied teams in that league or cup, playing each one three times (once against each of its leads).
- The top 200 Anti-Meta teams are re-played on PvPoke's own battle engine, with HP, energy and shields carried between fights. Their scores say "verified".
- Open any team to see every meta team it beats or loses to, hardest first.

### Rankings that pick teams that win
- New FAINTR check, **Meta Wins**: simulated 3v3 games won against those 60 teams. It counts in the overall score, so the top of the list now holds teams that actually win, not just teams with good numbers.
- We tested it on PvPoke's engine against a separate field of strong teams the score never saw. In Great League the top 0.1% now win 70% of games (59% before), and win rates fall steadily down the ranking. Anti-Meta's top teams win 81%. Ultra, Master and Fantasy Cup show the same pattern.
- The Team Grader has a new **Vs meta teams** tab with your result against all 60.

### Correct team rules
- Teams now follow Pokémon GO's rule of one Pokémon per Pokédex number, so pairs like Stunfisk and Galarian Stunfisk, or Dialga and Dialga (Origin), no longer show up together. At most one Mega per team.
- Fixed a rare Coverage mismatch with pvpoke.com: a small share of matchups behave differently in Team Builder's 0-and-1-shield average than in a plain 1-shield battle, so FAINTR now runs that exact average. Coverage and threats match pvpoke.com on every team tested.

### What's live, up front
- The buttons at the top now follow the GO Battle League schedule. This week that's Fantasy Cup, Ultra League and Master League: Mega Edition, and FAINTR opens on Fantasy Cup. Great League and every other league and cup are in the More leagues and cups menu.
- The buttons switch on their own when a new week starts. While FAINTR is open it gets this week's and next week's formats ready in the background, and daily updates keep them current.
- Fantasy Cup and Master League: Mega Edition ship ready to use.
- Megas keep their extra "+" charged move (like Drill Peck+), so Mega Edition grades match pvpoke.com.
- Picking "None" for a second charged move now really leaves it empty.

### PvP IVs (new tab)
- Rank any IVs in Little, Great, Ultra and Master League, with the stat product, level, CP and how each stat ranks.
- The whole evolution family at once, including the CP an earlier stage should stay under before evolving. If a Pokémon can't reach the cap, one tap ranks it as its evolution.
- Every IV combination in a sortable, filterable table. Tap a row to load it.
- IV floors for wild catches, each trade friendship level, weather boost, raids and research, and lucky trades. Best buddy levels too.
- See which top-100 matchups your IVs win or lose compared with rank 1.
- A Pokémon GO search string for the top 50 IVs in the family.

### Team Grader
- Search for any Pokémon in every slot; your Roster is a menu right beside it.
- Pick a Pokémon that's already in another slot and the two slots swap. Arrow buttons move a Pokémon between Lead, Safe swap and Closer.

### Roster
- **List view**: every Pokémon with its rank in all four leagues in one table.
- Show only what's ready, needs powering up, has top 100 IVs, is pinned, is shiny, or is a duplicate.
- Pin favorites to the top, add notes, and sort by Pokédex number.
- "XL" marks power-ups that need XL Candy.
- Shows how the IVs rank if you evolve it.
- Import a CSV export from Poke Genie or Calcy IV, with moves.
- Undo after removing a Pokémon.
- Press / to search.

### Reliability
- If a saved file is ever damaged, FAINTR keeps a copy and uses the last good version instead of starting empty.
- A clear message when an update can't reach GitHub.
- Team data from older versions is rebuilt automatically instead of being misread.

## 1.2.0 (October 20, 2026)

**Win the matchup.** FAINTR now covers every league, every cup this season, and the Pokémon you actually own.

### Every league and cup
- A league bar under the header switches the whole app between **Great**, **Ultra** and **Master League**. Great League is the default, and FAINTR remembers your pick.
- The cup menu lists every cup PvPoke ranks this season (12 right now, including Little Cup and the Battle Frontier cups). The first time you open a cup, FAINTR grades its teams on your computer in a minute or two, and from then on it updates with everything else. Matchups, Meta and your Roster work for a cup right away.
- Grades, bulk goals, threats, the game plan and the Pokémon GO search string all follow the league you pick. FAINTR checks are scored against every team in that same league or cup.

### Roster (new tab)
- Save the Pokémon you've built for PvP with their real moves, IVs and CP, plus the ball they were caught in, shiny, best buddy and a nickname.
- Each card shows pixel icons for the Pokémon's types (in shiny colors if it's shiny), and its IV rank, stat product, level and status in Little, Great, Ultra and Master League: Ready, Power up to level X, Over the cap, or "tops out at" when it can't reach the cap.
- Rank 1 IVs get a ★.
- Sort by best IV rank for any league, CP high to low or low to high, name or newest. Filter by name or type.
- Quick add a whole list at once ("Azumarill 0/15/15 1498 shiny"), copy a Pokémon GO search string, and export or import your Roster as a file.
- Moves left on "PvPoke's pick" follow PvPoke's recommended moveset in each league.

### Using your Roster everywhere
- **Teams:** tick "Only Pokémon in my Roster" to see the best teams you can field today. A ✓ marks Roster Pokémon in any team.
- **Team Grader:** every slot has a From your Roster menu that loads moves, IVs and level cap. Opening a team from Teams grades your own copies when you have them, and Find the rest stays inside your Roster when the filter is on.
- **Counter Finder (Matchups):** pick up to three opponents and get the best answers from the meta or from your Roster, with your IVs, at 0, 1 and 2 shields. Open it from a Roster card or from a team report's threats.
- **Meta:** an In my Roster filter.

### Clearer grades and scores
- New grade colors from the FAINTR palette, each far from the next: A Amber, B Signal red, C Charcoal, D Steel, F empty.
- The overall score is colored by where it ranks among every team in the league: top 0.1%, top 1%, top 5%, top 25%. The label under it says which.
- Every grade card in the report says what an A needs, and FAINTR checks say how many teams you beat.

### Smaller things
- New tagline: Win the matchup.
- Tabs in Title Case: Team Grader, My Teams, What's New.
- My Teams shows each team's league and opens it in the right one.
- Roster cards show the Stardust cost of a second charged move when you haven't unlocked one.
- Best buddy (level 51) IVs are now handled correctly everywhere.

## 1.1.0 (October 20, 2026)

Triad is now **FAINTR**: PvP team tools for Pokémon GO. In Pokémon, a Pokémon faints when its HP hits zero; FAINTR also plays on the feint, the fake-out that baits a shield.

### New look
- The FAINTR shield mark and wordmark in the header, and a new app icon.
- The FAINTR palette everywhere: Signal red and Charcoal lead, Steel and Mist support, and Amber shows up only for focus and the logo's center dot.
- Inter replaces the condensed headline font. Sentence case throughout.
- Rounder, calmer controls: 8 px corners on controls and 12 px on cards.
- Grades go from green to gray. Blue is gone from the brand and from data accents.

### Product names
- **FAINTR Teams** (the team finder, with the Team grader) and **FAINTR Matchups** (the battle simulator).

### Small things that help
- **Find the rest:** pick one or two Pokémon in the Team grader and FAINTR fills the other slots with the best match, from your box if you've entered one.
- **Shield pips:** pick shields in Matchups by tapping two shield pips. Filled means available.
- When Your box is filled in, results read "Best 3 for your box".
- Short explanations of breakpoints, bulkpoints and CMP where they come up.
- Deleting a saved team now asks you to confirm inline instead of opening a pop-up.
- The data panel's button is now Check for updates, and nothing is rebuilt if PvPoke hasn't changed.
- A footer on every page with the unaffiliated notice and PvPoke attribution.

### Moving from Triad
- Your saved teams, settings and downloaded data move from `%LOCALAPPDATA%\Triad` to `%LOCALAPPDATA%\FAINTR` the first time FAINTR opens.
- If you turned on the daily background update in Triad, FAINTR replaces it with its own scheduled task at 6:00 AM.


## 1.0.0 (October 20, 2026), released as Triad

Great League Team Finder became Triad, with light and dark modes and six sections instead of one page.

### Team grader, rebuilt
- **Your actual IVs.** Enter Attack, Defense and HP for each Pokémon, plus max level (40, 41, 50 or 51). It shows the level, CP, stats, IV rank out of 4,096, stat product as a percent of rank 1, and per-stat ranks. One click sets PvPoke's default IVs or rank 1 IVs.
- **Verdict at the top.** An overall score out of 100 with a plain-language summary: strengths, weak spots, the biggest threat and how many of your three it beats, blind spots and shared weaknesses.
- **Seven report tabs:**
  - **Overview:** every grade with its number, a meter, and what an A needs.
  - **Game plan:** for the 20 most popular leads, whether to stay in, switch (and to whom), or expect a hard fight.
  - **Matchups:** a heat map of all three members against the top 40 at 0, 1 or 2 shields, with your best answer for each.
  - **Threats:** PvPoke's six top threats with your rating against each, blind spots, and shared weaknesses.
  - **Members:** each Pokémon's IVs, stats, weaknesses, wins against the top 100 at every shield count, best and worst matchups, PvPoke role scores, and the meta Pokémon only it can beat.
  - **IV effects:** every top-100 matchup where your IVs change the winner compared with PvPoke's default IVs and with rank 1.
  - **Improve:** the best single swap for each slot, with the new grades and a Try it button.
- **Faster grading.** Simulations start in the background as soon as you pick a Pokémon, so most reports come back in under a second.
- Save teams, open on pvpoke.com with your IVs, and copy a Pokémon GO search string for the team.

### Battle simulator (new)
- Any 1v1 with PvPoke's engine: exact IVs, max level, 0 to 2 shields per side, shield baiting on or off, and starting energy for switch scenarios.
- A visual timeline with fast moves, charged moves, shields and both HP lines, plus a turn-by-turn log.
- All nine shield scenarios in one grid.
- **IV matchup:** the same battle replayed with PvPoke's default IVs and with rank 1 IVs, so you see exactly when IVs flip the result.
- Fast move damage with the Attack needed for the next breakpoint, and charged move damage both ways.
- **Against the meta:** one Pokémon against the top 100 at 0, 1 and 2 shields.

### Daily updates (new)
- The app checks GitHub for new PvPoke data each time it opens and every few hours while it is open, and updates in the background while you keep working.
- **Update every day, even when the app is closed:** one checkbox registers a Windows scheduled task (default 6:00 AM) that runs the app with `--update`.
- An open window picks up data written by the scheduled update within a minute.
- Data and updates panel shows the data date, last check and live progress.

### Meta rankings (new)
- PvPoke's top 250 with overall score, moveset and all six role scores (lead, switch, closer, attacker, charger, consistency), sortable and searchable.
- After each update: who moved up, who fell, newcomers to the top 150, and changed recommended movesets, plus a change column in the table.
- A Battle button on every row jumps to that Pokémon against the meta.

### My teams (new)
- Saved teams are re-graded automatically after every data update. Arrows show which letters went up or down, and the overall change since the last update.

### Find teams
- **Only Pokémon I own** (now called Your box): paste your Pokémon names and the search uses only those.
- Full report button opens any result in the Team grader.

### Under the hood
- Simulations run on a pool of background workers (one per CPU core, up to six), so the app stays responsive during big jobs.
- The parity check against PvPoke's Team Builder still passes: every PvPoke letter matches on random teams, and threat scores are within ±1.

## 0.1.0 (October 19, 2026)
- First prototype as Great League Team Finder.
- Every team from PvPoke's top 150 (545,972 teams) graded with PvPoke's four Team Builder grades, computed exactly as PvPoke does.
- Five added team checks: Blind Spots, Two Answers, Shield Resilience, Shared Weakness and Pilot Ease.
- Filters, adjustable weights, threat breakdown, best swap, pvpoke.com links.
- Grade my team for any three Pokémon and movesets.
- Manual Update data button.
