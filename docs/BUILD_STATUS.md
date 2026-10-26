# RelayDesk build status

Last updated: 26 October 2026. Local implementation and verification completed on 25 October. The owner subsequently authorized GitHub source publication to `rifatpriyo/RelayDesk`; hosting and remote migrations remain manual.

## Implemented

- Next.js application with persistent, explicitly simulated retail and service demos, Supabase authentication/production persistence, tenant authorization, roles, migrations, and private storage.
- Overview, catalog and variants, knowledge publication, assistant draft/published settings, date-aware temporary changes, onboarding, inbox handover/staff replies, and grounded playground.
- CSV/XLSX mapping review/replacement; document/history drafts; Google Sheets and read-only TLS PostgreSQL/MySQL adapters.
- Messenger, Instagram, WhatsApp connection/adapters, verified webhooks, persistent jobs/outbox, bounded Workflow steps, delivery reconciliation, and website widget.
- Mock checkout/subscription lifecycle, transactional entitlements, concurrency/replay protection, usage reservations, independent real-inference cost limits.
- Existing-account team membership, workspace switching, private images with explicit customer delivery approval, export/deletion, source disconnect, and currency settings before catalog creation.
- Self-hosted fonts/sample assets, deployment and integration guides. Installed Taste and Context7 skills used.
- Adapted ThreeUI Community marketing page, local licensed reference source, five native-scroll chapters, interactive multilingual sample, reduced-motion/mobile layouts, and original WebGL fallback.
- Architecture, mock billing, integration, design, security/backup, and manual deployment documentation. CSV/XLSX, chat, channel and SQL fixtures included.

## Validation evidence

- `npm test`: **150/150 tests passed across seven files**. Includes the approximately 30-question multilingual evaluation, tenant/role/file isolation, billing replay/concurrency/period changes, imports and manual overrides, stale/ambiguous facts, variants, three channel contracts, reply groups/images, widget replay, handover, maintenance and independent cost limits.
- `npm run test:browser`: **19 passed, one intentionally skipped**. The viewport-independent HTTP authorization test runs once on desktop. Browser coverage includes imports/publication, persistent catalog, team add/remove, private image upload/access, grounded replies, widget-to-inbox staff replies, scheduled rules, saved/published assistant settings, onboarding progress, mock checkout, navigation, keyboard dialogs and honest provider errors.
- `npm run build`: **passed**, including Next.js TypeScript validation, optimized pages, and compilation of **22 durable steps / three workflows**. Local runtime: Node 22.11.0, Next.js 16.4.2. Exact dependencies are in the lockfile.
- `npm run typecheck`: **passed** after the production build. `npm run start` launched the built application at `http://127.0.0.1:3000`; an HTTP smoke check returned **200** with the expected hero and demo link.
- Dependency installation audit reported zero vulnerabilities with the ExcelJS UUID override.
- Desktop workspace and desktop/tablet/mobile marketing screenshots reviewed. Normal desktop WebGL rendered; forced WebGL failure, reduced motion, native scrolling, chapter navigation, teardown and narrow layouts passed. Physical low-end devices and field Core Web Vitals are unmeasured.
- Source formatted. Generated Workflow routes, local data, credentials, logs and test artifacts are excluded from source control.

## External setup and limits

No live provider tests performed. Supabase credentials and operator-applied migrations, DeepSeek credentials/rates/spend limits, Meta apps/permissions/review and business assets, Google OAuth credentials, reachable read-only database accounts, and stable production callback URLs are required. No cloud resources created, real customer messages sent, payments charged, or deployment performed.

Supabase RLS/storage policies have not been exercised against a live/disposable PostgreSQL instance here. Fixture and local persistence checks are separate from live validation. Legal pages require owner details and review.

The dashboard has an English/Bangla localization foundation (navigation and overview); detailed administration copy is currently English. Conversation grounding and sample replies cover Bangla, English and Banglish. Optional embeddings have a schema/interface path; the implemented retrieval uses bounded lexical ranking. Source databases must be publicly reachable through TLS; private-network tunnels, OCR and antivirus scanning are not included. Production uses a per-business transactional aggregate suited to this project's small-business scope; large/high-throughput tenants require further partitioning.

The local demo and mock billing remain explicitly simulated. Real-provider credentials do not enable replies automatically: assistant publication, merchant connection, and channel activation remain explicit actions. No live-verification or production-readiness certification is claimed.
