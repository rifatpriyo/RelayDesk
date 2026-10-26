# Security and operations

This is a locally validated implementation, not a security certification. Production Supabase policies, Storage configuration, provider app review and live integrations require operator verification in a separate staging environment. No remote migration or live provider test was performed by the build workflow.

## Access boundaries

Production authentication uses Supabase’s verified user lookup. HTTP-only, same-site cookies hold authentication and the selected workspace preference. Membership is checked against the current database on each request. The selected business cookie, catalog ID, file ID or conversation ID never grants access by itself. Tenant-qualified state validation runs before reads/mutations; production commit functions recheck membership and revision. Deleted memberships are filtered from selection/bootstrap.

RLS protects membership and approved-content projections. Raw business aggregates and service RPCs are revoked from anonymous/authenticated direct callers. Service-role credentials remain server-only. Tenant-qualified constraints and channel mappings guard privileged/background paths. Owner/admin/agent are business roles; there is no public endpoint for assigning platform administration. Only an owner can add/remove members, change roles or delete the business. A target team account must already exist and be verified, and adding it must fit the seat allowance.

Mutation routes require the exact configured application Origin. The local demo additionally validates its signed session and any supplied session CSRF header. Never deploy with an arbitrary request-derived production origin. OAuth state/PKCE, webhook HMAC verification and credential binding are implemented in integration modules. Widget sessions require a scoped token and exact allowed origin; possession of a widget session does not establish a customer’s identity.

## Files and approved customer images

The `business-files` bucket is private. Migration 003 removes direct authenticated bucket read/write access. Authorized server routes verify the business, ready state, MIME and bytes before returning a private file. The production browser uploads to a narrowly scoped signed URL; it does not receive a service key. Supported images are PNG/JPEG/WebP, up to 5 MiB in production; imports are bounded to 20 MiB via direct upload. The local adapter limits uploads to 2 MiB. Inline imports have a smaller 2,000,000-byte limit. Parser-specific row, text, archive and PDF limits still apply.

Files use generated tenant-prefixed paths, not user filenames. Only validated private image references and bundled sample paths can be saved as catalog images. Arbitrary remote image URLs are not fetched. Customer delivery requires a current approved, non-archived product and a fresh limited signed URL (five minutes). Previously issued URLs may remain usable until expiry; provider-side cached copies are outside the app’s revocation boundary. Local private demo files are never exposed to social providers.

Supabase signed upload URLs remain valid for two hours. The application conservatively tracks a three-hour capability window. Before completion, a production upload reserves the bucket’s full 20 MiB maximum because an untrusted client header cannot enforce a smaller upload. Completion verifies the actual size and bytes. Individual deletion immediately removes app access, but physical deletion is deferred while an upload capability could recreate the object. Expired pending/deleted records are reclaimed by maintenance or the next upload. Whole-business deletion reports a retry time while any upload capability is active. This avoids declaring cleanup complete while an upload can still write into the tenant prefix.

Content checks do not provide antivirus scanning or OCR. Imported content remains untrusted. PDFs must have extractable text; macros/formulas/oversized archives are rejected by supported parsing rules. Add malware scanning and operational quarantine before expanding supported file types or accepting large untrusted documents at scale.

## Secrets and key rotation

Keep `.env.local`, `.env*` secrets, local data, logs and provider exports out of source control. Only the documented publishable Supabase configuration and application origin belong in `NEXT_PUBLIC_` values. DeepSeek, Supabase service-role, Meta/Instagram/Google secrets, webhook tokens, `CRON_SECRET` and the encryption key are server-only.

Per-business credentials use authenticated AES-256-GCM encryption with business/connection context. Back up the key in a separate managed secret store; a database restore without the correct key cannot decrypt those credentials. The current envelope uses one configured key, so replacing it alone makes existing credentials unusable. For planned rotation, pause automation/sync, back up state and the current key, re-encrypt each saved envelope in a controlled offline operator migration using both keys, verify staging reads, then atomically deploy the new key and migrated data. If re-encryption tooling is not available, disconnect/reconnect every source/channel after changing the key. Never log plaintext during rotation. Revoke leaked provider credentials at their provider as well as replacing local encryption material.

Rotate the demo session secret to invalidate demo cookies; demo and production identities/data must stay separate. The demo is a private local review tool and must not be hosted with real merchant credentials. `BILLING_PROVIDER=mock` may coexist with genuine hosted Supabase/AI/Meta connections, but the simulation label must remain visible.

## Untrusted content and outbound calls

Catalog, history, documents and customer messages are data, not system instructions. Retrieval is restricted to the authorized business and approved records; private drafts are excluded. Customer input cannot execute arbitrary tools, change membership or reveal credentials. Critical prices and stock come from current catalog evidence. History-derived answers require explicit privacy/accuracy review.

Database sources use bounded read-only queries over allowlisted identifiers/columns and TLS. Host validation rejects private/link-local/loopback destinations and protects against arbitrary remote image/file fetching. Use a dedicated read-only view/account and network controls; do not grant database write permission or disable TLS. Provider network clients use explicit timeouts and safe error mapping.

Some request throttles are process-local defense in depth; important integration/customer/import rate counters and cost reservations are persisted. At public scale, configure platform/WAF rate controls for auth, upload preparation and expensive endpoints. Limits should complement, not replace, the transactional quota/spend checks. Do not use an untrusted proxy header as proof of customer identity.

## Retention, export and deletion

An owner/admin can export the public workspace aggregate. Export excludes encrypted provider credentials and private runtime metadata; it is a portable business-data export, not a complete disaster-recovery backup. Private files are managed separately. Retention removes old conversations and associated inbox/outbox/widget-session records, according to the configured number of days. Approved knowledge is managed explicitly rather than silently removed with historical chat.

Disconnect stops future use of a stored connection and removes its credential; it does not erase messages already stored by Meta/Google or copies held by a source provider. Business deletion removes active catalog, knowledge, rules, conversations, source/runtime credentials, channel mappings and private Storage objects after capability expiry. The database retains a deleted-business tombstone, redacted membership records and billing/audit identifiers for integrity; it is not an immediate erasure of every database row. The user’s Supabase authentication account and other businesses remain. Operator backup/provider retention policies must be communicated in the legal pages.

Database backups, Storage backups and third-party records follow their own retention. PostgreSQL backup alone does not restore Storage file bytes. Document the selected provider plan’s actual backup retention and deletion process before launch. The shipped privacy/terms/deletion pages require business identity, contact and policy details; no legal approval is claimed.

## Backup and restore runbook

1. Record the deployed source/lockfile revision, migration version, environment names and provider callback configuration. Keep secrets in the operator secret store, separately from the public repository.
2. Back up PostgreSQL using the selected Supabase backup/export capability. Back up the private Storage bucket separately, preserving object paths, and back up credential-encryption keys separately. Encrypt exports and restrict access.
3. Restore into a new isolated staging project first. Keep automation, schedulers and real inference disabled. Apply only missing migrations in order; never reset an existing production database automatically.
4. Restore Storage bytes and verify tenant paths. Run membership/role, cross-tenant catalog/file, publication, billing and restore-integrity checks. Confirm the restored key can decrypt a test connection without exposing it.
5. Treat historical `sending` jobs as ambiguous. Reconcile with the provider before resuming; replaying a backup blindly can duplicate customer messages. Review outstanding usage reservations, checkout period IDs, webhook deduplication records and provider connection revisions.
6. When operator-approved, point the intended production environment to the validated state, configure the stable callbacks and resume one integration at a time. Keep a rollback copy and a written record of the cutover window. Delete temporary exports according to the operator’s retention policy.

For a local demo backup, stop the dev server and copy the entire configured data directory with its session/encryption configuration into a private location. Restore only to a local isolated demo. Do not mix local fixtures into production.

## Incident and monitoring checklist

Pause affected channel automation and source sync first. Revoke exposed provider tokens at their origin, rotate relevant keys, and preserve redacted audit/job IDs. Review membership changes, recent publications, import failures, ambiguous sends, global inference budgets and storage reservations. Logs should contain correlation IDs and safe error codes, never raw credentials or unnecessary customer message bodies. Verify recovery in a separate tenant before resuming.

Monitor the authenticated maintenance scheduler, queue age, failed/ambiguous delivery, connection expiry, source freshness, storage reservation age and budget exhaustion. The source includes bounded jobs and retry controls; hosting and provider monitoring must be configured by the operator. Final test evidence and unverified external boundaries are in [Build status](BUILD_STATUS.md).
