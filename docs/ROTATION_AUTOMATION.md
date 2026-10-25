# Automatic league and cup rotations

FAINTR checks the official Pokémon GO Battle League news schedule during each website data update. This covers Great, Ultra and Master League, their cups, Mega editions and non-Tuesday changeovers. The reader uses the official visible dates and stated 1 p.m. Pacific start/end time, including daylight saving time, and discovers new season articles from a bounded scan of the official news index. It executes no third-party code.

The latest validated schedule is cached with the existing build data and included in the public manifest. A failed or changed source format retains the last validated schedule, records fallback status and adds a build warning. It does not erase the schedule or invent dates, rules or rankings. The checked-in schedule remains a bootstrap fallback.

The normal midnight Central update continues. Two additional UTC slots (20:00 and 21:00) run only on official rotation dates across all three leagues: they cover 1 p.m. Pacific under both daylight-saving offsets, with a prewarm or one-hour retry. GitHub scheduled jobs can start late and builds/browser checks take time, so this is not an exact-second publication guarantee.

Data preparation now includes standard leagues, currently active cups and the immediate next rotation (within eight days), instead of preparing only active cups. Explicit manual format requests still work. A scheduled but hidden PvPoke cup is usable only when its actual cup definition and ranking files exist. Mega names are not silently matched to a regular cup's rules.

An upcoming cup without upstream rules/rankings is listed in the dropdown with a clear awaiting-PvPoke label and a short visible explanation. That pending entry is disabled to prevent an invalid calculation. When PvPoke provides the corresponding data, a subsequent scheduled update prepares it and the normal menu option becomes usable before rotation. At changeover it becomes a live button and the default on a fresh visit; an already-open page may need refreshing to see a newly published build.

On October 25, the official schedule reader verified Mega Halloween Cup / Master League beginning October 27 at 20:00 UTC (3 p.m. Central), and the November 3 daylight-saving transition. PvPoke revision 38f7032 currently contains no Halloween format or cup definition, so the initial publication can list the upcoming cup but cannot truthfully offer its team calculations yet. The official source also lists the later November rotation on Wednesday the 18th; the reader uses the visible date and 1 p.m. rule rather than a stray time in its underlying timestamp.

Verification: five new Node cases cover official parsing, GL/UL/ML and cross-year/DST date handling, next-rotation preparation, hidden-data safety, regular-versus-Mega name matching, future season discovery, source failure preservation, and workflow timing. The existing audit/operations suites passed locally (35 cases). A new browser case checks pending-menu labeling and safe disabled behavior across all five desktop/phone/Safari profiles. Publication and live verification are pending.

Sources: https://pokemongo.com/news/go-battle-league-twilight-trails and https://pokemongo.com/news . No user data, credentials, billing, analytics or production database/security configuration is changed.
