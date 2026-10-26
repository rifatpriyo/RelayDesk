# Manual deployment and operator handoff

Source publication targets [rifatpriyo/RelayDesk](https://github.com/rifatpriyo/RelayDesk), as authorized by the owner on 26 October 2026. Hosting, cloud resources and remote migrations remain separate manual steps. Platform documentation was reviewed 22 October 2026; verify your account's current limits and provider permissions before launch.

## Local release checks

Use Node 22 LTS (or a compatible newer LTS), run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`. Review [BUILD_STATUS](BUILD_STATUS.md) for actual local results and unverified external behavior. Next.js is pinned by `package-lock.json`; Next 16 uses async route parameters/cookies. Installed framework guides are in `node_modules/next/dist/docs`.

The Workflow compiler is integrated through `withWorkflow` in `next.config.ts`. It discovers functions in `src/workflows`, emits durable route handlers, and compiles the `use workflow`/`use step` boundaries. Step arguments contain business/job/source identifiers, not access tokens. Workflow state and application job/outbox records serve different purposes; the application persists events before acknowledgment and records ambiguous sends rather than blindly retrying them.

## Your publication sequence

1. Review the source and `.gitignore`. Exclude `.env.local`, every other secret environment file, `.relaydesk`, `.data`, Workflow development state, logs, test screenshots and build artifacts. Include `.env.example`, source, lockfile, SQL migrations, fixtures and documentation. No real provider key belongs in Git history.
2. Use the reviewed source in `rifatpriyo/RelayDesk`, or your own fork. Keep credentials outside Git regardless of repository visibility. Future pushes should pass the same staged-file and secret checks.
3. Create a Supabase project in your account. Review and manually apply the SQL migrations in order, then use the seed instructions for a disposable development project only. Configure private Storage, email authentication and callback URLs. Back up any existing database before migration; never run a destructive reset on production.
4. Import your GitHub repository into one Vercel project. Select Next.js and a compatible Node LTS runtime. Use the repository root, the lockfile installation, and `npm run build`.
5. Add the environment values from `.env.example` to the intended environment scopes. Set `DEMO_MODE=false` on Vercel. The filesystem demo is unsupported on ephemeral hosted functions. `BILLING_PROVIDER=mock` remains explicit and independent from real database/AI/provider choices.
6. Set `NEXT_PUBLIC_APP_URL` to the stable HTTPS production origin. Add the exact Supabase and provider callback URLs. Register verified Meta webhooks. Use separate credentials/projects for preview and production; do not point arbitrary preview URLs at a production merchant account.
7. Configure a scheduler to invoke the authenticated reconciliation endpoint with `Authorization: Bearer <CRON_SECRET>`. Choose a schedule compatible with your plan, source entitlements and database capacity. The code does not create a cron/cloud resource on your behalf.
8. Deploy from your Vercel dashboard and perform the hosted checks below. Configure operator monitoring and backups before enabling customer replies.

## Stable URL map

| Purpose                               | Path                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| Supabase email/code callback          | `/auth/callback`                                                               |
| Password recovery UI                  | `/reset-password`                                                              |
| Messenger callback                    | `/api/integrations/oauth/messenger/callback`                                   |
| Instagram callback                    | `/api/integrations/oauth/instagram/callback`                                   |
| Google callback                       | `/api/integrations/oauth/google/callback`                                      |
| Meta inbound webhooks                 | `/api/webhooks/messenger`, `/api/webhooks/instagram`, `/api/webhooks/whatsapp` |
| WhatsApp signup completion            | `/api/integrations/channels` (authenticated POST)                              |
| Widget loader                         | `/api/widget/loader.js`                                                        |
| Reconciliation/sync scheduler         | `/api/integrations/cron`                                                       |
| Privacy, terms, deletion instructions | `/privacy`, `/terms`, `/deletion`                                              |

## Limits and operations

[Vercel Function limits](https://vercel.com/docs/functions/limitations) depend on the runtime, compute mode and plan. The documented request/response payload cap is 4.5 MB; duration limits also depend on plan/configuration. This app caps inline import files at 2 MB and webhook events at 1 MB. Larger production imports use signed direct private Storage uploads, up to 20 MiB, with bounded server verification/parsing. Images allow 5 MiB in production. Apply migration 003 for the private bucket and policies. Signed upload capabilities delay physical cleanup until expiry; see the integration/security guides. Do not raise inline limits to fit large imports.

[Vercel Workflows](https://vercel.com/docs/workflows) run bounded durable steps. Use the installed stable Workflow package, preserve its Next integration, and review Workflow access/usage in your project. External network calls have explicit timeouts. Durable retries cannot make a provider's non-idempotent send exactly once; uncertain sends require reconciliation. Keep function and Workflow logs redacted and correlate application job IDs.

Database connectors require TLS, a reachable public hostname, explicitly selected columns and a dedicated read-only account. Do not disable TLS or expose an unrestricted database port. Private networks without a secure connector are unsupported.

Commercial usage may require paid hosting/provider plans. Supabase capacity, Vercel Functions/Workflow use, DeepSeek token costs and Meta messaging charges are separate. No free-production or provider-price promise is made. Configure actual model prices and enforce cost ceilings separately from mock subscriptions.

## Hosted acceptance

Verify email confirmation/recovery, two tenants and every role, private file access, a catalog import/retry, published-only retrieval, a closure boundary, mock checkout replay, and widget origin/session limits. With approved test assets and explicit authorization, separately verify every provider's OAuth, selected asset, webhook signature, duplicate delivery, inbound message, eligible reply, handover and disconnect. Confirm an invalid signature is rejected and unconfigured credentials cannot show a connected state. Record live validation separately from fixture tests. Provider app approval is never implied by successful deployment.
