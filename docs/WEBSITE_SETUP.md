# Putting FAINTR online

This guide takes you from nothing to a live FAINTR website with accounts, nightly data updates and backups. You don't install or run anything on your computer: everything happens in four websites (GitHub, Cloudflare, Supabase, and Discord or Google for sign-in). Plan on about an hour the first time, most of it waiting for the first data build.

Prices and limits were checked on October 20, 2026. They change, so glance at each pricing page before launch.

## How the pieces fit

| Piece | Job | Cost |
| --- | --- | --- |
| **GitHub** | Holds the code. Every night at midnight Central it downloads the latest PvPoke data, rebuilds the leagues and cups that changed, and publishes the site. Also makes a weekly encrypted database backup. | Free. Unlimited Actions minutes on a public repo; 2,000 minutes a month on a private one (FAINTR uses roughly 300 to 900). |
| **Cloudflare Pages** | Serves the website. | Free, with unlimited bandwidth. |
| **Supabase** | Accounts (email, Discord, Google), each trainer's Roster and saved teams, and bug reports. | Free up to 50,000 monthly users and 500 MB of data. |
| **A domain** (optional at first) | `faintr.gg` or similar instead of `faintr.pages.dev`. Needed for email sign-up at scale (see step 3). | About $10 to $15 a year. Cloudflare sells domains at cost. |

**Total to launch: $0.** The only cost that makes sense early is a domain, once you want email sign-ups.

### Why Cloudflare Pages instead of Netlify

Netlify's free plan now runs on credits: about 300 a month, shared by bandwidth and deploys (roughly 15 GB of traffic), and the site pauses when they run out. A first visit to FAINTR downloads about 5 MB, so a few thousand visitors could use up the month. Cloudflare Pages has no bandwidth limit on its free plan, allows files up to 25 MB, and FAINTR's nightly publish is a "direct upload", which doesn't count against Cloudflare's 500 builds a month.

### Why there's no D1 or database for the teams

The 544,492 graded teams per league or cup are never stored in a database. They're published as compact static files (about 4 MB per format) that the browser downloads once and caches. FAINTR's app logic then runs in the visitor's browser, which is what the desktop app does too. Filtering (Must include, Leave out, Minimum grades, Roster only, Anti-Meta) runs over every team in a fraction of a second.

That avoids D1's limits entirely:

- No read quota to hit when the site gets busy.
- No writes to spread over five or six days.
- No need to cut the list down to a top slice. Every team stays searchable, the same as in the desktop app.

The only database is Supabase, and it holds small things: accounts, Rosters, saved teams and bug reports.

### What happens when someone visits

1. Cloudflare serves the page and a small `manifest.json` that lists the current data files.
2. The browser starts PvPoke's battle engine in background workers and downloads the team data for the league or cup on screen. That's about 5 MB the first time; later visits use the browser's copy.
3. All grading, ranking and battles happen on the visitor's device. Results match the desktop app exactly.
4. Signed in, their Roster and saved teams load from Supabase (one small row per trainer, cached in the browser and only re-downloaded when it changes).

## Step 1: GitHub

1. Make an account at [github.com](https://github.com) if you don't have one.
2. Create a new repository named `faintr` (**+** at the top right, **New repository**). Leave it empty: no README or license.
   - **Public** gives unlimited free build minutes and is fine, because nothing secret lives in the code. Keys go in GitHub's encrypted settings (step 4).
   - **Private** works too, within 2,000 free minutes a month.
3. Send Claude the repository's address (like `github.com/yourname/faintr`). Claude pushes the code for you. Uploading through GitHub's website doesn't work for this project: it has files over the 25 MB browser upload limit.

## Step 2: Supabase

1. Make an account at [supabase.com](https://supabase.com) and create a project:
   - **Region:** Americas (East US is closest to most US players).
   - **Database password:** generate one and save it in a password manager. The backup needs it.
   - **Enable Data API:** on. **Automatically expose new tables:** off. **Automatic RLS:** on. **Postgres type:** standard Postgres.
2. Open **SQL Editor**, click **New query**, paste all of `supabase/migrations/001_init.sql`, and click **Run**. It should finish with "Success. No rows returned." It's safe to run again later.
   - This creates the tables, locks each Roster to its owner, lets anyone send a bug report but only admins read them, and caps each account at 2,000 Pokémon and 300 teams.
3. Open **Project Settings > API Keys** (on some projects, **Data API**). Copy the **Project URL** and the **publishable key** (older projects call it the `anon` `public` key). Both are meant to be public, because security comes from the database rules. Never copy the `secret` or `service_role` key anywhere.
4. Open **Authentication > URL Configuration**:
   - **Site URL:** `https://faintr.pages.dev` (or your domain later).
   - **Redirect URLs:** add `https://faintr.pages.dev/**`. Add your custom domain the same way when you have one.
5. Open **Authentication > Sign In / Providers** and check two settings that stop people from making throwaway accounts in bulk:
   - **Allow anonymous sign-ins:** off.
   - **Confirm email:** on.

## Step 3: How people sign in

Pick at least one. You can add the others any time.

### Discord (recommended to start: free, no email setup, fits a Pokémon GO crowd)

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications), click **New Application**, and name it FAINTR.
2. Under **OAuth2**, add the redirect `https://<your-project>.supabase.co/auth/v1/callback`. Your project URL is in Supabase, step 2.3.
3. Copy the **Client ID**, then **Reset Secret** and copy the **Client Secret**.
4. In Supabase, open **Authentication > Sign In / Providers > Discord**. Turn it on and paste both.

### Google (optional)

1. In the [Google Cloud Console](https://console.cloud.google.com), create a project.
2. Set up the **OAuth consent screen** (External, app name FAINTR).
3. Under **Credentials > Create credentials > OAuth client ID** (Web application), add the same Supabase callback URL as an authorized redirect URI.
4. In Supabase, turn on **Google** under providers and paste the client ID and secret.

### Email and password

Works out of the box only for you. Supabase's built-in mailer sends at most 2 emails an hour, and only to members of your Supabase team. To let the public sign up with email:

1. Buy a domain (Cloudflare Registrar sells them at cost).
2. Make a free [Resend](https://resend.com) account (3,000 emails a month, 100 a day) and verify your domain there.
3. In Supabase, open **Authentication > Emails > SMTP Settings** and enter Resend's SMTP details.

Until then, people can still sign in with Discord or Google.

### Make yourself an admin

Sign in on the site once (after step 5). Then in Supabase's **SQL Editor**, run this with your email:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

Admins see the bug report inbox in the Report a Bug tab, and **Dev tools** under **Data and updates**. Nobody can make themselves an admin from the website.

## Step 4: Cloudflare and GitHub settings

1. Make an account at [cloudflare.com](https://dash.cloudflare.com).
2. Find your **Account ID**: **Workers & Pages**, in the right-hand column (it's also in the dashboard address after `dash.cloudflare.com/`).
3. Make an API token: profile icon, **My Profile > API Tokens > Create Token > Create Custom Token**. Give it one permission: **Account > Cloudflare Pages > Edit**. Copy the token; it's shown once.
4. In your GitHub repository, open **Settings > Secrets and variables > Actions**.

**Secrets** tab (encrypted; nobody can read them back):

| Name | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | the token from step 4.3 |
| `CLOUDFLARE_ACCOUNT_ID` | the ID from step 4.2 |
| `SUPABASE_DB_URL` | for backups. The **Session pooler** URI without a password (for example `postgresql://postgres.PROJECT@HOST:5432/postgres?sslmode=require`). An existing URI with a password still works. |
| `SUPABASE_DB_PASSWORD` | your database password, entered directly as a secret. No URI encoding is needed when the password is stored separately. |
| `BACKUP_PASSPHRASE` | a long random phrase you save in your password manager. Backups can't be opened without it |

**Variables** tab (not secret; they end up in the public page):

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Project URL from step 2.3 |
| `SUPABASE_ANON_KEY` | publishable (anon) key from step 2.3 |
| `FAINTR_DISCORD_URL` | your Discord invite, like `https://discord.gg/abc123` (set it to never expire) |
| `FAINTR_PATREON_URL` | your Patreon page |
| `FAINTR_LOGIN_PROVIDERS` | the sign-in buttons to show: `discord`, `google`, or `discord,google` |
| `CF_PAGES_PROJECT` | optional: the site name. Defaults to `faintr` (`faintr.pages.dev`); pick another if that's taken |

## Step 5: First publish

1. In GitHub, open the **Actions** tab. If asked, click **I understand my workflows, go ahead and enable them**.
2. Click **FAINTR site update**, then **Run workflow** (leave the options as they are).
3. The first run builds every league and cup PvPoke ranks (15 right now). That takes about 30 to 75 minutes. Later nights rebuild only what changed, often in a few minutes.
4. When it turns green, open `https://faintr.pages.dev` (or your `CF_PAGES_PROJECT` name).

## Step 6: The "Update data now" button

The nightly update is automatic. The admin button under **Data and updates > Dev tools** starts the same update on demand, and shows recent runs.

1. **A GitHub token for Supabase:** on GitHub, profile icon, **Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token**.
   - **Repository access:** only `faintr`.
   - **Permissions > Actions:** Read and write.
   - Pick the longest expiry offered and put a calendar reminder to renew it.
2. **The function:** in Supabase, open **Edge Functions > Deploy a new function > Via Editor**. Name it exactly `trigger-update`, paste all of `supabase/functions/trigger-update/index.ts`, and deploy. Leave **Verify JWT** on.
3. **Its secrets:** under **Edge Functions > Secrets**, add:
   - `GITHUB_TOKEN`: the token from step 6.1
   - `GITHUB_REPO`: like `yourname/faintr`

Only admins can use it. It refuses to start a second update while one is running. **Rebuild everything** forces a full rebuild even if PvPoke didn't change.

## Running it day to day

- **Every night at midnight Central:**
  - The workflow downloads PvPoke's latest data.
  - It rebuilds only the leagues and cups whose rankings, meta group or game master changed, and publishes them.
  - Visitors get the new data on their next page load. Files that didn't change stay cached in their browsers.
  - GitHub's scheduled runs sometimes start 5 to 30 minutes late at busy times.
- **Each GO Battle League season:**
  - Update `schedule.json` (the live formats and dates shown up front). You can edit it right on GitHub: open the file, click the pencil, commit.
  - Every commit to `main` republishes the site.
- **Changing links or sign-in buttons:** edit the GitHub Variables, then run **FAINTR site update** once.
- **Bug reports:** they arrive in the Report a Bug tab when you're signed in as an admin. Mark them seen, fixed or won't fix. They're also in Supabase under **Table Editor > bug_reports**.
- **The desktop app:** run **Actions > FAINTR desktop app > Run workflow**, then download `FAINTR.exe` from the run's **Artifacts**. It gets your Discord and Patreon links and sends bug reports to the same inbox.

## Free-plan limits, and what happens if you hit one

| Limit | FAINTR's use | If exceeded |
| --- | --- | --- |
| Cloudflare Pages bandwidth | unlimited | n/a |
| Cloudflare Pages file size: 25 MB; files per site: 20,000 | largest file about 7 MB; about 100 files | The build stops with a clear message before publishing |
| Supabase database: 500 MB | about 1 KB per Roster Pokémon, so 1,000 trainers with 100 Pokémon each is about 100 MB | Writes are refused until you upgrade (Pro is $25 a month) or trim data |
| Supabase egress: 5 GB a month | Rosters download only when they change on another device; a typical sign-in is a few KB | Supabase emails you; overage needs Pro |
| Supabase monthly active users: 50,000 | one per signed-in trainer | Pro |
| Supabase pausing after a week idle | the nightly job pings it | If it ever pauses, click **Restore** in the Supabase dashboard |
| GitHub Actions (private repo): 2,000 min a month | quiet nights about 2 minutes; a full rebuild about 45 to 75 minutes; PvPoke usually updates a few times a month | Runs stop until next month. A public repo removes this limit |
| GitHub cache: 10 GB; artifacts: 500 MB | about 0.6 GB cache; backups a few MB each | Old entries are removed automatically |

## Backups

Supabase's free plan has no backups, so **FAINTR database backup** runs every Sunday:

- It saves an encrypted copy of accounts, Rosters, saved teams, battle history, bug reports and public short links as a GitHub artifact. Application schema, functions, constraints and privacy policies are included. Auth schema definitions are included for recovery dependencies; only `auth.users` and `auth.identities` contain backed-up auth data (not sessions or audit logs).
- Each copy is kept for 35 days.
- It needs the `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD` and `BACKUP_PASSPHRASE` secrets (the separate password is optional for an existing URI that already contains it).
- Run it by hand any time from the Actions tab. Missing credentials fail visibly instead of silently skipping.
- A second job downloads the encrypted artifact, decrypts it and restores it into a fresh, temporary PostgreSQL 17 service. Every archived table is compared byte-for-byte after sorting COPY rows; constraints, RLS and sharing functions are checked. No customer rows or hashes are printed. Plaintext files and the database disappear with the runner.

To rehearse recovery safely:

1. Download the artifact.
2. Run **FAINTR database backup** to make and rehearse a new encrypted archive. Its recovery job has no production database credentials and can only target the empty loopback database `faintr_restore`.
3. Actual disaster recovery should start in a separate Supabase project, with a reviewed plan for schema, platform-managed auth objects, roles/ownership, grants and current migrations. The offline drill proves application data and SQL recovery; it does not test Google/Discord OAuth, outbound email, platform configuration or the ability to restore into an existing project. Never point the rehearsal at production.

Archives made before this change are **data only**, omit `faintr_private`, and need the matching schema/migrations separately. Keep your backup passphrase in your password manager; it is required even when moving to a new project.

Trainers can also download their own Roster any time from the Roster tab (**Export**).

## A custom domain

1. In Cloudflare, open **Domain Registration > Register Domains** and buy one.
2. Open **Workers & Pages > faintr > Custom domains > Set up a custom domain** and pick it. HTTPS is set up for you.
3. Add the new address to Supabase's **Site URL** and **Redirect URLs** (step 2.4).
4. For Discord and Google sign-in, nothing changes: the callback stays the Supabase one.

## Security notes

- The Supabase publishable (anon) key in the page is meant to be public. Row level security means each trainer can only read and change their own row.
- Bug reports can be sent by anyone but read only by admins. Guests are limited to 10 reports a minute site-wide; signed-in trainers to 20 an hour.
- Admin status can only be set from the Supabase dashboard.
- Saving from two devices at once is handled: each save carries a version number. If another device saved first, FAINTR reloads and re-applies the change, so no Pokémon is lost.
- Trainers can delete their account and everything in it from the account panel. Try it once with a test account after launch.
- Bug reports record who sent them and when on the server, so a report can't pretend to come from someone else.
- The site sends a strict Content-Security-Policy: it only loads its own files and talks only to your Supabase project.
- Keep these out of the code and out of chat: the Supabase `secret`/`service_role` key, your database password, the Cloudflare token, the GitHub token and the backup passphrase. They only go in GitHub Secrets or Supabase secrets.

## If something goes wrong

**FAINTR operations alerts** opens one GitHub issue assigned to the repository owner when the site update, database backup/recovery or Discord rankings fail. It links to the run, includes no logs or customer data, updates the existing issue on repeated failures, and closes it after a successful real run (the unused daylight-saving schedule does not count as recovery). GitHub delivers notifications according to the owner's notification/email settings. Cancellations and completely missing/disabled scheduled runs do not create an issue.

Every site publication now passes the built-site browser checks in `tests/release/` plus sharing checks first. Chrome desktop, Android-sized screens, a 320px screen and Safari's WebKit engine cover scores, names/moves, visible grades, sections, dialogs, Anti-Meta, sharing and failed startup. These isolated browsers use synthetic/local storage only and block external account writes; actual OAuth sign-in is outside this gate.

| What you see | What to check |
| --- | --- |
| The site says "FAINTR's data isn't published yet" | The first **FAINTR site update** run hasn't finished, or it failed. Open the run in Actions to see the red step. |
| The run fails at "Publish to Cloudflare Pages" | The token needs **Cloudflare Pages: Edit** on the right account, and `CLOUDFLARE_ACCOUNT_ID` must match. |
| "Sign in" isn't shown at the top | `SUPABASE_URL` or `SUPABASE_ANON_KEY` is missing in GitHub Variables; set them and rerun the update. |
| Sign-up emails never arrive | Expected without custom SMTP (step 3). Use Discord or Google, or set up Resend. |
| Discord sign-in returns an error | The Discord redirect must be exactly `https://<project>.supabase.co/auth/v1/callback`, and the site must be in Supabase's Redirect URLs. |
| "Update data now" says the token or repository isn't set | Add `GITHUB_TOKEN` and `GITHUB_REPO` under Supabase **Edge Functions > Secrets**. If it worked before, the GitHub token may have expired. |
| A league shows "teams are on their way" | PvPoke just added it; the next nightly run builds it (or press Update data now). |
| Supabase says the project is paused | Click **Restore project**. The nightly job normally prevents this. |
