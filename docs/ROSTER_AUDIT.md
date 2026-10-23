# Roster persistence and data-management review

Reviewed October 23, 2026. No existing account data was migrated, deleted or inspected as a test.

## Where data lives

On the live website, rosters require sign-in. Supabase holds one `user_storage` row per account containing roster entries, saved teams, battle history and preferences as JSON. The browser also caches an account-scoped copy. Reviewed row-level policies and grants restrict account storage to its owner; display-name updates do not grant admin privileges.

The guest website can save teams in that browser's local storage, but its roster is empty until sign-in. A preview without configured accounts and the desktop program use local storage instead. Signing in offers an explicit merge of earlier local data; it is not a silent migration. The desktop program stores files on that computer and does not gain cloud sync merely by reopening it.

| Situation | Expected behavior and limit |
| --- | --- |
| Refresh or reopen, same browser | Cloud data reloads after authentication; local-only data survives if browser storage remains available. Local persistence was tested with synthetic entries. |
| Another device | Sign into the same Supabase account to access its cloud roster/teams. Guest local teams do not follow you. Real-device sign-in was not used as a destructive test. |
| Clear site data/private browsing ends | Local-only teams and cached copies can disappear, and sign-in may be lost. Cloud account data remains. Export local-only data first. |
| Sign out/session expires | Private account tools require authentication again. Published changes terminate old account workers and clear the old account cache, preventing delayed jobs crossing into another account. |
| Server or network failure | A save is not reported as successful unless acknowledged. Forms/pending imports remain available on failure. Offline editing and a durable offline write queue are not supported. |
| Multiple tabs/devices | Saves use row version checks. A losing write reloads and reapplies its change up to four attempts; exhausted conflicts show an error. Prepared entry-level checks reject stale explicit edits rather than silently overwriting newer content. |
| Storage limits | Up to 2,000 roster entries, 300 teams and about 3 MB of total saved JSON, subject to database constraints. Large Unicode content can reach the byte limit before the client character estimate. Failures must remain visible. |

## Confirmed defects and smallest fixes

| Severity | Defect / impact | Verification and change |
| --- | --- | --- |
| High | Background evaluation refresh sent whole stale entries and could overwrite metadata or restore a deletion | Pure patch and simulated cloud version-conflict tests. Refreshes now update only evaluation/history for still-existing entries whose calculation inputs match. New nickname/notes/league choices survive. |
| Medium | Two edits of the same roster entry could silently replace each other after version retry | Simulated two-device conflict. The form carries a canonical content basis; a stale write is rejected and its draft remains available for copying/reopening. JSON key ordering does not create false conflicts. |
| Medium | Imports could silently drop entries beyond a processing limit | A 1,001-row regression checks every unprocessed index is returned. UI imports preview first in batches and retains unsuccessful entries. |
| Medium | Retrying after a committed import's lost acknowledgement could duplicate copies | Replay regression. Each preview entry gets a stable import key; storage inserts only missing IDs and cannot overwrite a later edit of a previously imported entry. New deliberate imports of normal exports still create separate copies. |
| Medium | Incorrect/unknown CSV forms could fall back to a different species; unknown move text could silently become defaults | Invalid-form test and validation trace. Explicit unrecognized forms/moves are reported; CP, IVs and move pools are validated. Pending entries can be downloaded for correction. |
| Medium | Open tabs could keep serving stale cached lists | Roster/My Teams view loads now check the cloud row version. Evaluation refresh and explicit edits still use conflict checks. This is view refresh, not live collaborative editing. |
| Low | Delete, undo, quick-add checking and export failures could leave no useful feedback | Added error handling and retained drafts. The local browser import/export/delete/undo test verifies a failed row stays pending and successful entries survive refresh. |
| Low | Additional Mega charged moves could disappear from roster editing | The roster catalog, display and form now retain the additional move pool and fourth move. Invalid move placements are rejected rather than passed to the engine. |

## Duplicates, forms, IVs, moves and leagues

Multiple copies of a species are valid roster entries with different IDs and can retain different IVs, notes, moves or league choices. There is no dedicated Duplicate button; add another copy or deliberately import one. No automatic deduplication merges apparently similar Pokémon, because that could discard real separate builds.

Forms and Shadow species use distinct catalog identifiers. A team still permits one Pokédex species across those variants. Imported IVs must be integers 0–15; CP must be a valid whole number when provided. Empty move selection means use the current recommendation; explicit moves must belong to that form's pools. Changing recommendations can change a future calculation that used empty moves.

League choices express where the trainer wants a copy considered. They never override a known current CP above a league cap. Great League cups use the Great League choice, Ultra cups use Ultra, and Master uses Master; cup eligibility is checked separately. A Great-only Mimikyu is therefore not proposed as an Ultra build merely because the species could be powered up. Older entries infer the nearest standard league from current CP without rewriting stored data. Unknown-CP entries still require the trainer to make sensible choices.

## Tests and remaining limits

Follow-up: `tools/storage-stress.test.cjs` adds five synthetic-device tests for 2,000-entry sync, separate-account isolation, simultaneous imports, session expiry, interrupted writes, lost acknowledgement and repeated conflicts. The browser release suite now verifies 2,000 entries with pagination, global search, editing, refresh and full export. Rendering 50 at a time changes only the view, not storage or export. See `FOLLOWUP_AUDIT.md` for evidence and limits. Physical-phone testing is deferred by the owner; two disposable live-account availability remains pending.

The isolated browser suite covers local add/edit/persistence, league checkboxes across pickers, partial JSON import/retry, pending download, export, deletion and undo. Pure tests cover invalid CSV forms, processing limits, import replay, metadata preservation, deletion preservation, account switching and actual compare-and-swap retry behavior using a fake database.

The database suite also executes actual migration SQL in disposable PostgreSQL with two synthetic accounts. It verifies private-table access denial, account isolation for reads/exports/updates/deletes, protected admin fields and deletion cascades. These tests emulate Supabase identity functions and do not substitute for two-real-device end-to-end testing of live JWT processing/policies. That should use explicitly designated disposable accounts and data. No customer's roster was opened to do it. There is no promise of offline sync, automatic field merging of conflicting explicit edits, or recovery of local-only data after clearing browser storage. The new conflict message deliberately asks the trainer to copy changes and reopen the latest entry.

The privacy policy describes account retention, deletion and encrypted backup retention up to 35 days. The prepared roster notice explains local versus cloud storage directly in the tool. Export remains available without a paid membership. Backup existence and restore behavior must continue to be checked through the backup workflow; no production restore was attempted in this audit.
