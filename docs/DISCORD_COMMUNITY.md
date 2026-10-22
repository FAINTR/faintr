# FAINTR Discord

The community is for free FAINTR tools and Pokémon GO PvP discussion. Patreon is optional support; the Supporter role is honorary and has no moderation permissions or paid tool access. Recognition stays opt-in.

## Live layout

- START HERE: welcome, rules, announcements, support-faintr.
- COMMUNITY: general, pvp-hangout, introductions, team-building, battle-results, ideas-and-feedback, help-and-bugs.
- RANKINGS: top-10-meta-teams and top-10-anti-meta-teams. Members can read and react, but cannot post, create/reply in threads, or post through external apps.
- STAFF: dev-only and mod-alerts. @everyone is denied View Channel; existing ADMIN and CoFounder roles are allowed. Existing administrators retain Discord's normal permission bypass. Do not assign these roles through onboarding.
- Existing General voice channel is retained.

Native Community and Onboarding are enabled. Site-news alerts are opt-in through Channels & Roles; the Announcement Alerts role has no extra permissions. New members get a welcome sign and tasks to introduce themselves, share a team/question, and find help. The rules remain visible and public channels are available through defaults or customization. No third-party moderation bot is required.

Verified email, sensitive-media filtering for all members, native raid/DM protections, and restricted member pruning are enabled. AutoMod blocks mention spam (8 unique mentions), suspected spam, and the native Insults & Slurs / Sexual Content word lists. All three rules send private alerts to mod-alerts. Discord safety notices also go there; Discord's Community administration updates go to dev-only. Team-building and help templates are pinned. Existing messages and staff assignments were preserved.

## Daily Top 10 publisher

`.github/workflows/discord-rankings.yml` targets **9:00 a.m. America/Chicago every day** using separate UTC schedules and a daylight-saving gate. GitHub scheduled jobs can start late during service congestion; this is a scheduled target, not an exact-time delivery guarantee.

Two repository secrets are required:

- `DISCORD_META_WEBHOOK_URL`: incoming webhook in channel `1562327310076608512`.
- `DISCORD_ANTIMETA_WEBHOOK_URL`: incoming webhook in channel `1562327349704527932`.

These posting credentials are private. Never commit them, paste them into chat, include them in screenshots, or put them in website configuration. Each can post in its own public ranking channel; neither needs access to member accounts, private rosters, or dev-only.

The publisher reads the **deployed public** `https://faintr.com/manifest.json` and its hashed team datasets. It uses the same codec, default team scoring, and Anti-Meta query as the website. It posts all three built leagues plus currently active built cups; future cups are excluded. Full Pokémon and move names, role order, score, grade letters, and source-data timestamps are preserved. Simulation estimates are labeled. Off-rotation league datasets may be older; each post shows when its data was built.

The initial quiet delivery passed on October 22, 2026: Great, Ultra, Master, Mega Master, and Fantasy Cup were delivered to both feeds, without mass pings. [Successful verification run](https://github.com/FAINTR/faintr/actions/runs/39863558837). Eight publisher tests passed, and Discord's @everyone preview confirmed both feeds are read-only and staff channels are hidden.

As requested by the owner, each feed gets **one @everyone ping per daily digest**, on its first league message. The remaining league/cup messages permit no mentions. This is separate from optional site-news notifications. New ranking posts are added daily so discussions can refer back to a dated snapshot. A manual workflow run also publishes the day's digest and should only be used when a post is desired.

Before sending, both webhook destinations are checked against the expected server and channel IDs. All format payloads must render successfully before any send. The job saves a sent-message ledger after every confirmed post and reuses it on reruns. An uncertain network outcome leaves a `pending` entry and stops automatic retries; inspect the channel before an operator clears that entry. Because GitHub caches can be evicted, the ledger is best-effort deduplication rather than a permanent delivery database. Do not clear the state cache casually or rerun old attempts expecting historical dates.

Checks:

```
node --test tools/discord-rankings.test.cjs
node tools/discord-rankings.cjs
```

The second command creates a public-data preview in `../output/discord-rankings-preview.json`; it sends nothing. With saved secrets, `--verify` also checks both destinations without posting. Only `--send` posts to Discord; `--quiet` suppresses mass pings for an initial setup post. Manual workflow runs default to a dry run and quiet mode. No checkout, membership, or private trainer data is involved.

## Running the community

- Keep announcements useful and short. Mention Announcement Alerts for optional site news; reserve everyone pings for the approved daily ranking digest or a real service emergency.
- Welcome new trainers and ask about their current PvP goals. Use the team-building template, and keep long follow-ups in threads.
- Native spam and mention-spam rules block messages; avoid automatic bans for ambiguous content. Review reports and false positives.
- Only the owner should appoint staff. Support and activity do not confer staff powers.
- Review safety/audit logs, unresolved bug threads, and suggestions regularly. Do not promise automatic responses or unattended moderation.
- Moderator-action 2FA can only be enabled once the owner's Discord account has 2FA; account authentication changes remain the owner's responsibility.

Reference: [Discord Community Onboarding](https://support.discord.com/hc/en-us/articles/11074987197975-Community-Onboarding-FAQ), [community growth guidance](https://discord.com/community/using-insights-to-improve-community-growth-engagement), and [incoming webhooks](https://docs.discord.com/developers/resources/webhook).
