# Battle calculation audit — October 23, 2026

## Calculation path

The published game-master data, cup definitions and rankings come from PvPoke. `engine.js` loads the native PvPoke Pokémon, damage, action and battle classes for desktop/tests; `web/src/enginehost.js` loads the same scripts into browser workers. `engine_glue.js` constructs the selected form, applies IVs and a level ceiling, chooses legal moves and finds the highest half-level that fits the league CP limit. `memberlib.js` sets shields, baiting and starting energy, runs the engine, then converts HP, energy and timeline events into the UI result. The browser renders the report and timeline from those outputs.

The local audit fixture uses PvPoke version `bdbb22c_2026-10-16`. The production release rebuilt all five currently published formats against `415436c_2026-10-21`; its mechanics/regression gate also passed against that newer build source. Live WebKit independently restored and graded an existing public shared team successfully under the production security policy. These checks do not independently establish every upstream mechanic.

## Confirmed errors fixed in application code

| Severity | Error and practical effect | Reproduction / fix |
| --- | --- | --- |
| Medium | Default IV builds ignored an explicit level-40 ceiling | Request Metagross default IVs with cap 40; the old helper could construct level 50. The ceiling now applies before stats/CP are reported. |
| Medium | Mega IV-rank alternatives used a higher ceiling than the selected build | Request perfect-IV Mega Mewtwo Y at 50/51. Initialization could reset the comparison ceiling to 52, understating its percentage. The comparison ceiling now matches the requested ceiling. |
| Medium | Damage reference cards inherited end-of-battle stat debuffs | Melmetal with Thunder Shock/Superpower against Registeel: old reference Attack was about 115.72 and fast damage 2 after a hidden battle; neutral Attack is about 202.51 and damage 3. Reference cards now use fresh starting stats. Actual simulated buffs remain in the battle. |
| Medium | A narrow timeout lead could display a draw after rounding to rating 500 | Remaining HP 167/334 versus 198/397 gives a small real lead but displayed rating 500. Winner selection now compares exact remaining HP fractions before rating rounding. Both fainted or equal fractions are a draw. |
| Low | IV enumeration did not use the same minimum/fixed HP rule as constructed stats | Shedinja perfect IVs showed 10 HP but a percentage below 100% against inconsistent enumerated HP. Rankings now normalize minimum HP to 10, fixed Shedinja HP to 10, recompute products and sort. This does not make Shedinja eligible for a league that excludes it. |

Team Grader also now rejects duplicate Pokédex species across forms/Shadow variants and multiple Megas, matching the search builder's existing team rules.

## What was tested

`tools/battle-mechanics.test.cjs` runs four explicit known-species matchup fixtures directly through native PvPoke setup and separately through FAINTR's wrapper:

- Garchomp / Metagross, including the reported Garchomp charged move Twister.
- Melmetal / Registeel, including guaranteed self-debuff Superpower.
- Shadow Dragonite / Gyarados.
- Origin Palkia / Origin Dialga.

Each fixture runs every 0/1/2 shield combination with both zero energy and a 100-versus-30 energy lead: 72 wrapper/reference comparisons. HP, remaining energy/shields, turn counts, ratings and complete timeline event values match. This verifies wrapper behavior against the trusted engine, **not independent correctness of the entire native engine**.

Separate arithmetic checks cover CP, Attack/Defense/HP scaling, flooring, STAB/type effectiveness, PvP damage bonus and Shadow effective stats. Timeline checks cover charged energy costs, the 100-energy ceiling, fast-energy accumulation, shield limits and fainting. Additional tests cover simultaneous fast-only mirror knockouts, a deliberately constructed low-damage timeout, level ceilings, minimum/fixed HP, team legality and narrow-timeout rounding. The originally reported custom/default/perfect-IV team is graded repeatedly in the same engine by `tools/reproduce-grading.cjs`.

## Mechanics and limits

The engine uses 500 ms turns; fast-move duration and energy gains and charged power/costs come from the loaded game data. Ordinary damage floors the multiplied power/Attack-to-Defense expression and adds one. CP and HP floor separately. Shadow effective Attack and Defense use the upstream modifiers. The audit's arithmetic expectations preserve upstream floating-point constants near 1.3/1.2/1.6 to avoid inventing changes at rounding boundaries.

The UI starts a 1v1 battle at full HP and neutral stat stages, accepts 0–100 starting energy and 0–2 shields, and uses the engine's automatic move decisions and fully charged minigames. Buffs, debuffs and supported form effects come from the native engine. Probabilistic effects follow its simulation settings; this is not a guarantee of real random rolls. Baiting and timing decisions can differ from a human opponent. The 3v3 chain is explicitly a heuristic with simple switching/replacement rules, not a live battle replay.

The interface does not offer arbitrary starting HP/stat stages, manual turn scripting, human switching inputs, network lag or every game-specific edge case. Rare changing forms, Mega additional moves, percent-max-HP moves, probabilistic effect frequencies, all CMP ties and every new upstream mechanic do **not** have exhaustive independent golden-matchup coverage. Keep these as testing limitations. No claim that every possible battle state is fully verified is justified.

## References

- [Niantic trainer-battle overview](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/2308-battling-other-trainers/) establishes the use of Fast Attacks, Charged Attacks and Protect Shields.
- [PvPoke battle documentation](https://pvpoke.com/battle/) explains ratings, timing assumptions and simultaneous actions. Its assumptions are a reference model, not a promise to reproduce every live-game outcome.
- [PvPoke damage source](https://github.com/pvpoke/pvpoke/blob/master/src/js/battle/DamageCalculator.js) and [Pokémon source](https://github.com/pvpoke/pvpoke/blob/master/src/js/pokemon/Pokemon.js) provide the implementation reference. Tests use the pinned local/build copy, not silently changing remote code.
- [Niantic known battle issues](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/5505-new-pvp-battle-system-known-issues/) make clear that the live game's behavior can have timing/interaction issues beyond a deterministic simulator.

Future mechanics changes should add an explicit fixture and independent expected result where available, fix one verified discrepancy, and rerun the whole mechanics and reported-team suite.
