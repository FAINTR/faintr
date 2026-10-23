# Proposed privacy wording — not yet published

Add to the privacy policy before optional product analytics are enabled:

## Optional usage analytics

FAINTR offers optional usage analytics to understand which tools people use, where workflows stop, and whether changes improve the website. These analytics stay off unless you choose “Allow usage analytics.” You can use all tools without agreeing and change your choice through “Analytics choices” at any time. Browser Global Privacy Control and Do Not Track signals keep this optional tracking off.

If you agree, FAINTR stores a randomly generated browser identifier for up to 30 days and a session identifier that starts again after 30 minutes without a tracked action. Your analytics choice lasts up to 180 days, after which permission must be given again. These identifiers count browsers and sessions; they do not establish how many individual people use the service.

We record the tool/page category, the type of completed action or failed calculation, a broad acquisition-source category, whether the browser has returned for another session, and when the event was received. We do not send account identifiers, email addresses, searches, Pokémon selections, IVs, CP, moves, rosters, team links, notes, passwords or error text to this analytics collector.

Cloudflare receives the requests and replaces the random browser/session identifiers with keyed hashes before storage in a separate private Supabase analytics database. These records can distinguish one participating browser from another and are treated as pseudonymous information, not promised to be completely anonymous. The collector also uses a daily keyed hash of the network address for short-lived abuse limits; it does not save the raw address in its analytics tables. Cloudflare and Supabase process technical request information to operate and secure their services.

Analytics events are deleted after 30 days by the next hourly retention run. The network rate counters expire after 10 minutes and are removed during collection or the next hourly cleanup. Operational/provider logs and encrypted database backups may retain information according to their separate disclosed retention periods, including the existing recovery-backup period of up to 35 days.

Choosing “Keep analytics off” removes the local analytics identifiers and stops future optional events. It does not automatically identify or erase events already stored with hashed identifiers; those expire under the retention schedule above. Contact support about privacy requests. Existing Cloudflare Web Analytics for aggregate traffic and page performance remains described separately.

## Conditions before publication

- Approve and test the private schema, collector, separate credential and retention job.
- Confirm the hourly job runs successfully even when collection is disabled; monitor failures.
- Ensure backup/provider retention language remains accurate and obtain qualified advice where required.
- Enable the build-time flag through the deployment workflow and the runtime flag only after the policy and consent interface are in place. The current workflow does not enable optional tracking.
