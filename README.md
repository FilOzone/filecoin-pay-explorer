# Filecoin Pay Explorer

Monorepo for the Filecoin Pay ecosystem: subgraph, shared types/configs, UI library, and frontend apps.

## Monorepo layout

- **apps/**
  - `explorer/` — Explorer app ([README](apps/explorer/README.md))
  - `metrics/` — Metrics dashboard ([README](apps/metrics/README.md))
- **packages/**
  - `ui/` — Shared UI library (Tailwind v4, shadcn, theming) ([README](packages/ui/README.md))
  - `subgraph/` — The Graph subgraph ([README](packages/subgraph/README.md))
  - `types/` — Shared TypeScript types ([README](packages/types/README.md))
  - `configs/` — Shared TS/base configs

## Prerequisites

- Node >= 22
- pnpm >= 9

## Getting Started

Follow these steps to set up and run the applications:

### 1. Install Dependencies

Install all dependencies for the monorepo:

```sh
pnpm install
```

### 2. Configure Environment Variables

Set up environment variables for the apps you want to run. You'll need the subgraph URLs for your **Filecoin Payments Subgraph**. If you need to deploy your own subgraph, see the [subgraph deployment guide](packages/subgraph/README.md).

**For Explorer app:**

```sh
cd apps/explorer
cp .env.example .env
```

Edit `apps/explorer/.env` and configure:

```bash
NEXT_PUBLIC_SUBGRAPH_URL_MAINNET=https://api.goldsky.com/api/public/project_xxx/subgraphs/filecoin-pay-mainnet/version/gn
NEXT_PUBLIC_SUBGRAPH_URL_CALIBRATION=https://api.goldsky.com/api/public/project_xxx/subgraphs/filecoin-pay-calibration/version/gn
```

Replace the placeholder URL with your actual **Filecoin Payments Subgraph** endpoint.

**⚠️ Note:** Both `NEXT_PUBLIC_SUBGRAPH_URL_MAINNET` and `NEXT_PUBLIC_SUBGRAPH_URL_CALIBRATION` are required for the Explorer app to function.

**For Metrics app:**

```sh
cd apps/metrics
cp .env.example .env
```

Edit `apps/metrics/.env` and configure:

```bash
VITE_GRAPHQL_ENDPOINT=https://api.thegraph.com/subgraphs/name/your-username/filecoin-payments
```

Replace the placeholder URL with your actual **Filecoin Payments Subgraph** endpoint.

**Note:** `VITE_GRAPHQL_ENDPOINT` has a default fallback (`http://localhost:8000/subgraphs/name/filecoin-payments`) but should be configured for production use.

**Return to root directory:**

```sh
cd ../..
```

### 3. Build Shared Packages

**⚠️ Important:** You must build the required shared packages before running any app:

- **Explorer app** depends on: `@filecoin-pay/types` and `@filecoin-pay/ui`
- **Metrics app** depends on: `@filecoin-pay/types`

Build all shared packages (recommended):

```sh
pnpm build --filter @filecoin-pay/types --filter @filecoin-pay/ui
```

Or build only what you need:

```sh
# For Explorer only
pnpm build --filter @filecoin-pay/types --filter @filecoin-pay/ui

# For Metrics only
pnpm build --filter @filecoin-pay/types
```

This step is **required for both development and production** environments.

### 4. Run the Applications

#### Development Mode

**Run all apps:**

```sh
pnpm dev
```

**Run Explorer only:**

```sh
pnpm dev --filter @filecoin-pay/explorer
```

**Run Metrics only:**

```sh
pnpm dev --filter @filecoin-pay/metrics
```

#### Production Mode

**1. Build the application(s):**

```sh
# Build everything (recommended)
pnpm build

# Or build specific apps
pnpm build --filter @filecoin-pay/explorer
pnpm build --filter @filecoin-pay/metrics
```

**2. Start the production server(s):**

```sh
# Start Explorer (runs on http://localhost:3000)
pnpm start --filter @filecoin-pay/explorer

# Start Metrics (runs on http://localhost:4173)
cd apps/metrics
pnpm preview
cd ../..
```

## Common Scripts

- **Build all:** `pnpm build`
- **Build specific app:** `pnpm build --filter @filecoin-pay/explorer` or `pnpm build --filter @filecoin-pay/metrics`
- **Lint:** `pnpm lint`
- **Format:** `pnpm format`
- **Type check:** `pnpm type-check`
- **Test:** `pnpm test`
- **Clean:** `pnpm clean` (removes build artifacts and node_modules)

## Architecture

### Components

- **[`apps/explorer/`](apps/explorer/)** — The Explorer app: a statically-built Next.js frontend for browsing Filecoin Pay rails, accounts, and deal activity. This is the primary focus of the repo.
- **[`apps/metrics/`](apps/metrics/)** — A Vite-based metrics dashboard. Not a current focus.
- **[`packages/subgraph/`](packages/subgraph/)** — A [The Graph](https://thegraph.com/) subgraph hosted on [Goldsky](https://goldsky.com/) that indexes Filecoin Pay contract events on mainnet and Filecoin calibration testnet.
- **[`packages/ui/`](packages/ui/), [`packages/types/`](packages/types/), [`packages/configs/`](packages/configs/)** — Shared libraries consumed by the apps.

### Hosting

- **Static site** — The Explorer is statically built and deployed to [Vercel](https://vercel.com/). Vercel is used for convenience; there is no server-side logic that requires it.
- **Subgraph** — Hosted publicly on Goldsky with no proxy layer. It is intended to be consumed only by the deployed static frontend.

### Deployments

Static site and subgraph deployments are decoupled. See the [release process](.github/ISSUE_TEMPLATE/release.md) for the full checklist and more details.

- Static site changes deploy automatically via the Vercel GitHub App on merge to `main`.
- Subgraph changes are triggered by creating a GitHub release with a `vX.Y.Z` tag (see [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

### Monitoring

Uptime monitoring for the static site and subgraph is managed via [FilOzone/infra](https://github.com/FilOzone/infra) and visible at [status.filoz.org](https://status.filoz.org).

## Contributing

- Use Node/pnpm versions from root `package.json` engines.
- Run `pnpm lint`, `pnpm format`, and `pnpm type-check` before committing.
- See per-package READMEs for details.

## Related repositories

- Contracts: https://github.com/FilOzone/filecoin-pay
- Explorer: https://github.com/FilOzone/filecoin-pay-explorer

## License

Dual-licensed: [MIT](https://github.com/FilOzone/synapse-sdk/blob/master/LICENSE.md), [Apache Software License v2](https://github.com/FilOzone/synapse-sdk/blob/master/LICENSE.md) by way of the [Permissive License Stack](https://protocol.ai/blog/announcing-the-permissive-license-stack/).
