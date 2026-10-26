# RelayDesk architecture

RelayDesk is one Next.js App Router application. Pages, route handlers, authentication callbacks, provider webhooks and Workflow entry points ship together. There is no separately hosted worker or Python service. Production uses Supabase Auth, PostgreSQL and private Storage; the explicit local demo uses a persistent single-host filesystem adapter.

## Domain boundaries

| Area                                          | Implementation                                                    |
| --------------------------------------------- | ----------------------------------------------------------------- |
| Authentication, tenant access and persistence | `src/lib/core/server.ts`, `local-store.ts`, auth/workspace routes |
| Validated commands and business records       | `src/lib/core/commands.ts`, `types.ts`                            |
| Entitlements, checkout and reply accounting   | `src/lib/core/billing.ts`, `plans.ts`                             |
| Private files and approved images             | `src/lib/core/assets.ts`, `asset-policy.ts`, assets routes        |
| Import review and data-source adapters        | `src/lib/integrations/imports.ts`, `service.ts`, `connectors.ts`  |
| Grounding and generation                      | `src/lib/integrations/retrieval.ts`, `ai.ts`                      |
| Provider authorization and messaging          | `src/lib/integrations/oauth.ts`, `channels.ts`, `pipeline.ts`     |
| Widget sessions and staff handover            | `src/lib/integrations/widget.ts`, widget routes                   |
| Durable orchestration and maintenance         | `src/workflows`, integrations jobs and cron routes                |

Client components consume public workspace snapshots and validated command endpoints. They never receive service-role keys or the private `integrations` namespace. Server-only provider modules load credentials only when needed. Invalid configuration fails closed; runtime selection does not silently fall back to simulated providers.

## Persistence and transactions

`business_states` stores one versioned JSONB aggregate per business. This deliberate consolidation makes catalog publication, configuration, conversations, mock entitlements and reply reservations atomic at this project’s scale. It is a small-business architecture, not a claim of unbounded throughput. Large tenants or high concurrent messaging volumes will require splitting hot records into dedicated tables and preserving the same transaction invariants.

The production adapter reads a revision, executes a side-effect-free mutation, then commits with a compare-and-swap PostgreSQL function. A lost revision retries up to eight times before returning a retryable conflict. Do not perform provider sends inside these callbacks: a mutation may execute again. SQL functions lock the aggregate row, recheck membership and enforce tenant-qualified record IDs. Membership changes update the relational membership table in the same database transaction.

Separate relational tables support authentication membership, globally unique channel-to-business routing, approved content/search projections, optional chunks/embeddings and global spend reservations. Approved catalog and knowledge projections are rebuilt transactionally. The optional embedding migration provides storage and tenant-qualified structure; no embedding provider is configured or required. Runtime retrieval currently uses bounded Unicode-aware lexical ranking of the authorized aggregate rather than relying on an external vector service.

The local adapter uses an exclusive cross-process lock and atomic file replacement under `DEMO_DATA_DIR`. It seeds two synthetic businesses and validates the same domain contracts. This adapter is for a private local instance; it is not a production multi-region database and must not be used on ephemeral Vercel storage.

## Tenant and role model

An authenticated user is resolved with Supabase `getUser`. The selected business cookie is only a preference: the server matches it against current membership and ignores unauthorized choices. Deleted businesses are excluded. A user with no active membership bootstraps a new empty business through a serialized server-only function.

Owners manage team membership and business deletion. Owners and admins manage catalog, sources, channels, assistant settings and simulated billing. Agents handle conversations but cannot change configuration, entitlements or credentials. New team members must already have a verified account; no invitation messages are sent. The local demo permits deterministic `@example.test` identities. Team seats are checked transactionally, owners cannot be removed through this flow, and removing a member clears their assignments. Membership switching checks the destination before updating its HTTP-only cookie. There is no merchant-accessible platform administrator role or self-promotion endpoint.

Business state and service-only RPCs are unavailable to anonymous/authenticated direct database callers. Readable projections and membership tables use RLS. Provider processing derives the business from a verified channel mapping; jobs carry business/record references, never caller-supplied authorization or credential material. Private storage paths include the business ID; the browser cannot enumerate or read the bucket directly.

## Grounded replies and scheduled changes

Customer input is untrusted data. Retrieval excludes other businesses, archived catalog, draft knowledge and unapproved history. Current catalog values are authoritative for price and stock; imported prose and historical chat cannot override them. Stable identifiers, names, language normalization, variants, freshness, and ambiguity influence source selection. Missing evidence prompts clarification or handover. A numeric model confidence score is not used as proof of correctness.

Temporary changes have explicit ISO instants, an IANA business timezone, status, scope and priority. Effective intervals are checked when answering, including expiry; the playground can pass an explicit test time. Approved rules can explain a shop’s dispatch pause but do not imply courier closure or arrival guarantees. Assistant settings have separate draft and published values. Connecting a channel and enabling automated replies are separate operations.

DeepSeek receives bounded approved evidence and constrained instructions. Critical facts are checked/rendered against selected sources. The production provider requires explicit enablement, server credentials, verified operator pricing and independent spending budgets. Demo answers are deterministic and labeled. The multilingual evaluation is a fixture correctness test, not a live-model quality benchmark.

## Channels, jobs and delivery

Messenger, Instagram and WhatsApp have distinct adapters for normalized events, verification, eligibility and provider requests. HMAC verification precedes webhook acceptance. A provider event is persisted and deduplicated before a bounded Workflow is started. If startup fails, the pending record remains recoverable through the jobs UI/maintenance path. Every send rechecks activation, connection revision, messaging eligibility and human takeover.

The persistent outbox records prepared, sending, accepted/delivered/read, failed, cancelled and ambiguous states. Provider timeouts can mean a send succeeded; such sends are not automatically repeated. Staff review records the provider finding. Text bubbles/images share one logical reply identity and one usage reservation. A later delivery failure can adjust committed usage. This is deduplicated logical processing, not an impossible guarantee of exactly-once delivery to a non-idempotent external API.

The website widget uses an exact embedding-origin allowlist and short-lived, hashed, tenant-scoped session tokens. Each request has a client request ID for replay handling. Staff takeover stops queued AI replies, and the widget polls for inbox staff replies. Widget sessions are not a substitute for customer identity verification: account/order-specific requests go to staff.

## Files, imports and deletion

Inline imports are bounded below the hosting payload limit. Larger production files use server-authorized signed direct Storage uploads, then server verification and bounded parsing. Catalog publication is an explicit review step. Source identifiers and record hashes support replacement without duplicates; row errors block publication, and an incomplete snapshot cannot retire missing items. Imported history/documents remain drafts until approved.

Images are uploaded privately, checked for supported bytes/type/size, associated with tenant catalog records, and explicitly approved for customer delivery. Approved delivery uses a limited signed URL; private local-demo images are not published to social providers. Deletion first removes app access. Active signed-upload capabilities delay physical cleanup until expiry; whole-business deletion reports a retry time while such links are live. See [Security](SECURITY.md) for retention and backups.

## Operations and validation boundaries

Apply migrations in filename order to a separately backed-up/staged Supabase project. Schema changes and callback registrations remain manual; this implementation does not create cloud resources. The authenticated maintenance endpoint reconciles jobs, subscription periods, retention and expired file reservations. Configure and monitor that scheduler explicitly.

Unit/contract tests cover domain isolation, roles, billing concurrency and replay, file access, imports, grounding and provider fixtures. Browser tests exercise local user workflows. No Supabase project, live RLS execution, provider app review, live Meta/Google/DeepSeek call or remote database migration is established by those fixture results. Final executed evidence is recorded in [Build status](BUILD_STATUS.md).
