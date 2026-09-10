# Filecoin Pay Explorer

This repository contains the user-facing tools and data services for [Filecoin Pay](https://github.com/FilOzone/filecoin-pay). Its primary product is the Explorer at [pay.filecoin.cloud](https://pay.filecoin.cloud): a web application for inspecting payment activity and managing a Filecoin Pay account.

The monorepo also contains the subgraph that turns contract events into queryable data, a Cloudflare Workers service for solvency notifications, shared generated types and UI code, and a separate Metrics dashboard used only for local development.

## What Runs Here

### Explorer

[`apps/explorer`](apps/explorer/README.md) is the main Next.js and React application. It has two user-facing areas:

- The public explorer shows Filecoin Pay rails, accounts, operators, tokens, settlements, and network statistics on mainnet and calibration.
- The wallet-connected console lets a user inspect funds and runway, deposit or withdraw tokens, manage operator approvals and rails, top up through Squid, and configure email alerts.

Most public data comes from the hosted GraphQL subgraphs. Wallet actions and live account operations use wagmi, viem, and the Synapse SDK. A small Next.js server route proxies Squid’s token catalog.

Production runs at [pay.filecoin.cloud](https://pay.filecoin.cloud).

### Notification service

[`apps/notification-service`](apps/notification-service/README.md) is the backend for Filecoin Pay solvency alerts. Users register and verify an email from the Explorer; the service watches subscribed accounts and sends tiered warnings when their funded runway falls below configured thresholds.

It is split into three Cloudflare Workers:

| Worker | Trigger | Responsibility |
| --- | --- | --- |
| API | HTTP via Hono | Registration, email verification, subscription status, and unsubscribe |
| Alert scheduler | Cron every 12 hours | Page through subscribed wallets and publish bounded queue batches |
| Alert processor | Queue consumer | Read account state through Filecoin RPC, derive alert tiers, deduplicate, send email, and record the result |

The service uses D1 for subscriptions and the durable notification log, KV for fast deduplication checks, Cloudflare Queues for fan-out and retries, and an email binding for delivery. Staging is isolated on Filecoin calibration; production uses Filecoin mainnet.

### Subgraph

[`packages/subgraph`](packages/subgraph/README.md) is the Explorer’s indexed read model. Its AssemblyScript handlers process Filecoin Pay contract events and maintain GraphQL entities for rails, accounts, operators, tokens, settlements, and aggregate metrics.

Goldsky hosts separate mainnet and calibration deployments. The Explorer queries those GraphQL endpoints instead of scanning chain history in the browser. The schema at `packages/subgraph/schemas/schema.v1.graphql` also generates [`@filecoin-pay/types`](packages/types/README.md), which keeps frontend query results aligned with the indexed data model.

A schema change normally spans three layers:

```text
subgraph schema and handlers
  → generated @filecoin-pay/types
  → Explorer GraphQL queries, hooks, and UI
```

### Metrics

[`apps/metrics`](apps/metrics/README.md) is a separate Vite dashboard for visualizing Filecoin Pay statistics. It consumes the generated types and a GraphQL endpoint, but it is not deployed and is not part of the staging-to-production promotion flow. Run it locally when working on that dashboard.

## Architecture

### Indexed data and wallet operations

```text
Filecoin Pay contracts
  │
  ├── events ──> Subgraph handlers ──> Goldsky GraphQL ──> Explorer public views
  │                                      │
  │                                      └──────────────> Metrics (local only)
  │
  └── reads and writes <── Filecoin RPC / Synapse / wagmi <── Explorer console

Subgraph schema ──> GraphQL Code Generator ──> @filecoin-pay/types ──> Explorer + Metrics
```

The subgraph is optimized for historical and aggregate reads. It is not in the transaction path: wallet writes go to Filecoin contracts, and the resulting events are indexed afterward.

### Notification pipeline

```text
Explorer notification UI
  → API Worker
  → D1 subscription + verification email

Scheduled Worker
  → paged D1 subscriptions
  → Cloudflare Queue
  → Processor Worker
  → Filecoin RPC account check
  → tier and deduplication rules
  → alert email + D1 audit record
```

## Workspace Map

| Path | Package | Used by |
| --- | --- | --- |
| `apps/explorer` | `@filecoin-pay/explorer` | Primary deployed web application |
| `apps/notification-service` | `@filecoin-pay/notification-service` | Explorer notification UI and operational alert pipeline |
| `apps/metrics` | `@filecoin-pay/metrics` | Local-only metrics dashboard |
| `packages/subgraph` | `@filecoin-pay/subgraph` | Goldsky deployments and generated types |
| `packages/types` | `@filecoin-pay/types` | Explorer and Metrics |
| `packages/ui` | `@filecoin-pay/ui` | Explorer; exports source directly and has no build step |
| `packages/configs` | `@filecoin-pay/configs` | Shared Biome and TypeScript configuration |

pnpm workspaces manage package dependencies, and Turbo orchestrates builds, tests, type checks, linting, and development tasks.

## Run the Explorer

### Prerequisites

- Node.js 22 or newer
- pnpm 9 or newer; the repository pins pnpm 9.15.2

Install dependencies from the repository root:

```bash
pnpm install
```

### Configure the Explorer

Copy the example configuration:

```bash
cp apps/explorer/.env.example apps/explorer/.env
```

Set the two required GraphQL endpoints in `apps/explorer/.env`:

```bash
NEXT_PUBLIC_SUBGRAPH_URL_MAINNET=<mainnet Goldsky GraphQL URL>
NEXT_PUBLIC_SUBGRAPH_URL_CALIBRATION=<calibration Goldsky GraphQL URL>
```

Optional Explorer configuration:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SQUID_INTEGRATOR_ID` | Overrides the default public Squid integrator ID |
| `NEXT_PUBLIC_NOTIFICATIONS_API_URL` | Enables notification registration and settings against a matching notification API |
| `NEXT_PUBLIC_NOTIFICATIONS_ELIGIBLE_NETWORKS` | Selects the Filecoin network where notification UI is available; defaults to `mainnet` |

Build the generated types, then start the Explorer:

```bash
pnpm build --filter @filecoin-pay/types
pnpm dev --filter @filecoin-pay/explorer
```

Open [http://localhost:3000](http://localhost:3000). A local subgraph is not required when the environment variables point to hosted Goldsky endpoints.

### Run notifications locally

For local notification development, run the API Worker with local D1 and KV storage rather than pointing localhost at a deployed notification API:

```bash
pnpm --filter @filecoin-pay/notification-service run db:migrate:local
pnpm --filter @filecoin-pay/notification-service run dev:api
```

Use the API URL printed by Wrangler as `NEXT_PUBLIC_NOTIFICATIONS_API_URL`. The API checks `FRONTEND_ORIGIN` exactly, so its local value must match the Explorer origin, normally `http://localhost:3000`.

The local service uses the staging binding shape and Filecoin calibration. Configure the Explorer accordingly:

```bash
NEXT_PUBLIC_NOTIFICATIONS_API_URL=<URL printed by Wrangler>
NEXT_PUBLIC_NOTIFICATIONS_ELIGIBLE_NETWORKS=calibration
```

Override the local Worker's `FRONTEND_ORIGIN` in `apps/notification-service/api/.dev.vars` (beside the api worker's `wrangler.jsonc`; `dev:api` loads it automatically and it is gitignored):

```bash
FRONTEND_ORIGIN=http://localhost:3000
```

Do not change the checked-in staging or production origin for local development. Connect the Explorer wallet to calibration when testing the notification flow.

The scheduler and processor have separate local commands:

```bash
pnpm --filter @filecoin-pay/notification-service run dev:scheduler
pnpm --filter @filecoin-pay/notification-service run dev:processor
```

See the [notification-service README](apps/notification-service/README.md) and [agent/developer notes](apps/notification-service/AGENTS.md) before changing bindings, environments, migrations, or Worker commands. Every Wrangler command must select a worker config and an environment.

### Run Metrics locally

Metrics is not deployed. To run it:

```bash
cp apps/metrics/.env.example apps/metrics/.env
pnpm build --filter @filecoin-pay/types
pnpm dev --filter @filecoin-pay/metrics
```

Set `VITE_GRAPHQL_ENDPOINT` in `apps/metrics/.env`, then open [http://localhost:5173](http://localhost:5173).

### Work on the subgraph

The package build generates its network manifest and AssemblyScript types before compiling:

```bash
pnpm build --filter @filecoin-pay/subgraph
pnpm --filter @filecoin-pay/subgraph test
```

See the [subgraph guide](packages/subgraph/README.md) for local Graph Node and Goldsky deployment details. Remote deployment requires credentials and should follow the repository release process.

## Checks

Run focused checks while developing:

```bash
pnpm --filter @filecoin-pay/explorer test
pnpm --filter @filecoin-pay/explorer type-check

pnpm --filter @filecoin-pay/notification-service type-check
pnpm --filter @filecoin-pay/notification-service test
```

Run repository checks before opening or updating a pull request:

```bash
pnpm build
pnpm test
pnpm type-check
pnpm lint
pnpm format
```

`pnpm lint` and `pnpm format` write changes. Inspect the diff after running them. Metrics and `packages/ui` currently have no test script, so the root test command does not cover them.

## Release and Promotion

All feature pull requests target `staging`. Production is promoted through a reviewed `staging → main` pull request:

```text
feature branch → staging → main
                   │          │
                   │          ├── production Explorer on Vercel
                   │          └── production notification Workers
                   │
                   ├── staging Explorer on Vercel
                   └── staging notification Workers
```

Subgraph changes add a release step: Release Please creates a release PR on `staging`, then Goldsky deploys and indexes both networks before the promotion PR is merged. Metrics has no deployment.

Read [docs/RELEASE.md](docs/RELEASE.md) before preparing or reviewing a promotion. It explains branch roles, CI, merge strategy, hotfix back-merges, notification Worker deployments, subgraph versioning, Goldsky indexing, and the production tag switch.

## Developer Documentation

- [Explorer README](apps/explorer/README.md)
- [Notification service README](apps/notification-service/README.md)
- [Subgraph guide](packages/subgraph/README.md)
- [Release and promotion](docs/RELEASE.md)
- [Code practices](docs/code-best-practices.md)
- [Component guidelines](docs/component-guidelines.md)
- [Git instructions](docs/git-instructions.md)

Coding agents should read the nearest `AGENTS.md` before changing a package.

## Related Repository

- [Filecoin Pay contracts](https://github.com/FilOzone/filecoin-pay)

## License

Dual-licensed under MIT and Apache License 2.0 through the [Permissive License Stack](https://protocol.ai/blog/announcing-the-permissive-license-stack/).
