# FAINTR Brand Guide

> Use this file as the source of truth for all FAINTR naming, copy, design, UI, and code styling. Follow it whenever creating anything for the project.

## 1. Brand summary

- **Name:** FAINTR (always written in ALL CAPS, one word, in headings, body copy, UI, and the logo; never "Faintr", "FaintR", or "Fainter")
- **Pronunciation:** "FAIN-ter"
- **What it is:** A free-first set of competitive tools for Pokémon GO players, starting with a GO Battle League team finder (Great League first), built to be a faster, smarter, better-designed alternative to existing PvP tools.
- **Tagline:** Win the matchup. (Descriptor where context is needed: PvP team tools for Pokémon GO.)
- **Name meaning:** In Pokémon, a Pokémon "faints" when its HP hits zero, so FAINTR is about winning the matchup. It also plays on the *feint* (a fake-out, pronounced the same way), which is the heart of baiting an opponent into wasting a shield.
- **Previous working name:** GL Team Finder (now a product description, not the brand)

## 2. Product family naming

All products use the pattern **FAINTR + [function]**:

- FAINTR Teams: team finder / builder (first product)
- FAINTR Matchups: head-to-head simulator
- FAINTR Raids: raid counters and DPS tools
- FAINTR Dex: Pokémon and move data
- FAINTR Pro: optional paid tier (see section 8)

## 3. Voice and tone

- **Smart, sharp, friendly.** Talks like a good teammate who knows the meta, not a lecturer.
- Short sentences. Plain words. Explain jargon (CMP, breakpoints, bulkpoints) the first time it appears.
- Confident but honest: say when a pick is situational or data is uncertain.
- Light playfulness is fine ("Bait the shield."), never cringe or meme-heavy.
- No hype or pay-to-win language. The core tools are free; Pro sells convenience.

Example microcopy:
- Empty state: "No team yet. Pick a lead and we'll find the rest."
- Result header: "Best 3 for your box"
- Shield note: "Two shields each. Use them wisely."

## 4. Color palette

| Name | Hex | Use |
|---|---|---|
| Signal red | `#D7263D` | Primary brand color, primary buttons, key highlights, the "FAINT" in the wordmark |
| Charcoal | `#2B2F3A` | Text, dark surfaces, headers, app icon background |
| Steel | `#8A93A3` | Secondary text, borders, disabled states, icon-on-dark grey |
| Mist | `#F2F4F7` | Light backgrounds, cards, the logo orb |
| Amber | `#F5B800` | Accent only: Pro badges, highlights, focus moments, the logo's center dot |

Rules:
- Red and charcoal lead; steel and mist support. Amber is sparing (roughly 5% or less of any screen). Exception: the top grade and the top score tier use amber (see Grade scale), so a list of excellent teams can run above 5%.
- **Grade scale (product only):** A Amber with Charcoal text, B Signal red with white, C Charcoal with white (lifted to `#646C80` in dark mode), D Steel with dark text, F Mist with a Steel outline and muted text. Overall-score tiers reuse the same five steps: top 0.1%, top 1%, top 5%, top 25%, everything else. Red here means "very good", never "bad".
- Do not use blue as a brand color (it is associated with Great League and with the in-game shield visuals).
- League colors for data labels may be used inside the product, but not in the logo or brand chrome.
- Keep text contrast at WCAG AA or better (charcoal on mist, white on red).

## 5. Typography

- **Primary:** Inter (fallbacks: Segoe UI, Helvetica, Arial, sans-serif)
- Wordmark: "FAINT" in semibold (600) Signal red, "R" in regular (400) Charcoal (or white on dark backgrounds), all caps with slightly open letter-spacing (about +2%).
- UI: sentence case for body text, buttons and headings. Navigation tabs and named features use Title Case (Team Grader, My Teams, What's New, Counter Finder). The brand name is always FAINTR in caps. Two weights (400 and 500/600).

## 6. Logo

**Concept:** A shield split into two halves (red and charcoal) with the left half offset slightly lower, which represents the feint, the fake-out that makes a shield get spent. A white orb with a band and amber dot sits in the center, a quiet nod to the Protect Shield bubble in Pokémon GO (each trainer gets two per battle).

Files in this folder:
- `faintr-mark.svg`: shield mark only
- `faintr-icon.svg`: app icon / favicon source (dark tile, steel right half)
- `faintr-lockup.svg`: mark plus wordmark (uses live text; convert text to outlines before final print or production use)

Usage rules:
- Keep clear space around the logo equal to the width of the orb.
- Minimum size: 16 px for the mark, 120 px wide for the lockup.
- On dark backgrounds, use the icon version, or switch the charcoal half to Steel and the wordmark's "R" to white.
- Do not recolor the shield, rotate it, add shadows or gradients, or change the offset.
- Do not place the mark inside a circle or on a red/white split background.

Inline SVG (mark):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="60 40 140 180" role="img" aria-label="FAINTR">
  <path d="M130 50 L70 68 V122 C70 165 100 192 130 208 Z" transform="translate(-2 4)" fill="#D7263D"/>
  <path d="M130 50 L190 68 V122 C190 165 160 192 130 208 Z" transform="translate(2 0)" fill="#2B2F3A"/>
  <circle cx="130" cy="120" r="27" fill="#F2F4F7"/>
  <line x1="103" y1="120" x2="157" y2="120" stroke="#2B2F3A" stroke-width="6"/>
  <circle cx="130" cy="120" r="9" fill="#F5B800" stroke="#2B2F3A" stroke-width="5"/>
</svg>
```

## 7. UI style notes

- Clean, flat, data-first. Generous spacing, rounded corners (8px controls, 12px cards).
- Primary button: Signal red with white text. Secondary: Charcoal outline. Destructive actions are not red (red is the brand), so use a distinct confirmation pattern instead.
- Cards on Mist (light) or Charcoal (dark). Support light and dark mode.
- Show Pokémon data compactly: name, types, moves, key stats, then expandable detail.
- Speed matters. Results should appear fast, with minimal clicks to a usable team.
- Shield motif: two small pips can represent shield count (filled = available).

## 8. Monetization principles

- Core tools stay free. Never paywall rankings, matchups, or the team finder basics.
- Pro (optional) sells convenience: cloud-saved teams and rosters, battle log and win-rate tracking, personalized recommendations from the user's own box, ad-free, shareable team pages.
- Other income: donations (Patreon, Ko-fi), light non-intrusive ads, sponsorships, API/Discord bot access.
- Never use dark patterns or pressure language.

## 9. Legal and IP guardrails

- FAINTR is an independent fan project. Always include: "FAINTR is not affiliated with, endorsed by, or sponsored by Niantic, Nintendo, Game Freak, or The Pokémon Company. Pokémon and Pokémon GO are trademarks of their respective owners."
- Do not use official logos, the Poké Ball design, or official artwork in the brand or any paid feature. Do not imitate the Poké Ball's red-over-white look.
- If reusing code or data from other projects (for example open-source PvP tools), check the license and give required attribution.
- Before monetizing, review Niantic's and The Pokémon Company's current terms and fan-content policies.
- Before launch, run a trademark search (USPTO and local equivalents, software and gaming classes) and confirm the domain and social handles for "FAINTR." Because the name sounds like "fainter," also check that sound-alike spellings (fainter.com and similar) aren't a confusing or competing brand.

## 10. Instructions for Claude when working on this project

- Always write the brand name as "FAINTR" in all caps and individual tools "FAINTR [Function]".
- Apply the palette, typography, and tone above to any copy, UI, code (CSS variables), or design you produce.
- Suggested CSS variables:

```css
:root {
  --fr-red: #D7263D;
  --fr-charcoal: #2B2F3A;
  --fr-steel: #8A93A3;
  --fr-mist: #F2F4F7;
  --fr-amber: #F5B800;
}
```

- Use sentence case for copy (Title Case for tab and feature names), plain language, and the free-first monetization approach.
- Include the unaffiliated disclaimer in site footers and about pages.
- If asked for something that conflicts with this guide, flag it and suggest an on-brand alternative.

## Pixel type icons (Roster)

- Roster cards show original 12×12 pixel icons for a Pokémon's type or types (flame, droplet, leaf, bolt and so on), drawn in the type's color with a dark outline. They are FAINTR's own drawings: never copy the game's type symbols, Pokémon sprites, official artwork, or the Poké Ball design.
- Shiny entries use an alternate palette, three amber sparkle pixels, and an amber frame.

## Anti-Meta mode

- The Anti-Meta button is the one control that turns Amber when on (Charcoal text on Amber), so the mode is unmistakable.
- In Anti-Meta mode the header inverts to Mist with Charcoal text, the mark's right half switches back to Charcoal, the league bar gets an Amber edge, and team cards get an Amber left rule. Everything else keeps the normal palette.
