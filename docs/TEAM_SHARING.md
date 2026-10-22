# Team sharing

- Share buttons are available in the team list and grader. No onboarding layer was added.
- The versioned public URL includes only species, moves, resolved IVs, level caps, league and scoring weights. Labels, notes, saved-team IDs and authentication are omitted.
- Shared pages serve the regular app with team-specific Open Graph metadata. Opening a link loads the settings without starting expensive grading automatically.
- PNG cards use a bounded, indexed-color renderer and pre-rendered Inter glyphs (covered by the existing font license notices). They are generated on Cloudflare and cached, never uploaded to Supabase or saved as database rows. Ordinary pages remain static; only /share/* invokes the function.
- External apps decide whether and when to unfurl previews. Download image is available for manually attaching a card.
- Links preserve team settings rather than old simulation results; later game updates can change grades or make a cup/move unavailable. Invalid links fail safely.
- Existing Cloudflare analytics uses its automatic beacon; the CSP now allows the beacon and its endpoint. No second tracker, custom event collector or Supabase analytics table was added.

## Checks

Build with `node tools/build_web.js --only-built`, then run `node tools/test-sharing.cjs`. Optional site-directory argument supports a separate preview output.

Regenerate Inter glyphs with `python tools/make_share_fonts.py` (Pillow required). The generated JSON is committed so normal builds need no Python.
