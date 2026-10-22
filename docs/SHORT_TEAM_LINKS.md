# Short public team links

New shares use `https://faintr.com/s/` plus a 12-character ID (33 characters total). The ID resolves the same sanitized team setup as the old encoded link. Existing `/share/<token>` links, branded images, exact IVs/moves, weights, and the ordinary shared-team workflow are preserved.

Only deliberate public shares are stored. No account IDs, trainer names, nicknames, private rosters or notes are attached. The private lookup schema exposes no table privileges to website users. A bounded read-by-ID RPC returns the public setup; creation requires a separate server-only credential held by Cloudflare Pages. That credential cannot read account data. Requests are size-limited, validated against the game catalog, and limited to 30 creations per minute per daily keyed network hash. Identical setups reuse their ID. Collision handling never overwrites an existing setup.

## Deployment order

1. Run **Configure short team links** after the owner approves the new lookup and server credential. It applies migration 006, securely generates the creation credential, stores only its hash in Supabase, and saves the secret in Cloudflare Pages using the existing deployment access. Role checks use rolled-back synthetic data.
2. Deploy the frontend/worker update after setup passes. The regular site workflow also verifies short and legacy links, exact setup roundtrips, preview images, invalid/unknown IDs, cross-origin creation rejection, private-field stripping, and clear storage/rate failures.
3. Verify a real UI share produces a 33-character link, opens the exact team without signing in, and serves its preview image. Keep old links working.

The setup workflow can rotate this narrowly scoped server credential if needed. Re-run it before the next site deployment. No database password or service-role key is exposed to visitors or the worker.
