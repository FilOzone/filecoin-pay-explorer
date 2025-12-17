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

Set up environment variables for the apps you want to run:

**For Explorer app:**

```sh
cd apps/explorer
cp .env.example .env
```

Edit `apps/explorer/.env` and configure:

```bash
NEXT_PUBLIC_GRAPHQL_ENDPOINT=https://api.thegraph.com/subgraphs/name/your-username/filecoin-payments
```

**For Metrics app:**

```sh
cd apps/metrics
cp .env.example .env
```

Edit `apps/metrics/.env` and configure:

```bash
VITE_GRAPHQL_ENDPOINT=https://api.thegraph.com/subgraphs/name/your-username/filecoin-payments
```

### 3. Build Shared Packages

**⚠️ Important:** Both Explorer and Metrics apps depend on `@filecoin-pay/types` and `@filecoin-pay/ui` packages. You must build these packages before running any app:

```sh
pnpm build --filter @filecoin-pay/types --filter @filecoin-pay/ui
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
```

## Common Scripts

- **Build all:** `pnpm build`
- **Build specific app:** `pnpm build --filter @filecoin-pay/explorer` or `pnpm build --filter @filecoin-pay/metrics`
- **Lint:** `pnpm lint`
- **Format:** `pnpm format`
- **Type check:** `pnpm type-check`
- **Test:** `pnpm test`
- **Clean:** `pnpm clean` (removes build artifacts and node_modules)

## Contributing

- Use Node/pnpm versions from root `package.json` engines.
- Run `pnpm lint`, `pnpm format`, and `pnpm type-check` before committing.
- See per-package READMEs for details.

## Related repositories

- Contracts: https://github.com/FilOzone/filecoin-pay
- Explorer: https://github.com/FilOzone/filecoin-pay-explorer

## License

Dual-licensed: [MIT](https://github.com/FilOzone/synapse-sdk/blob/master/LICENSE.md), [Apache Software License v2](https://github.com/FilOzone/synapse-sdk/blob/master/LICENSE.md) by way of the [Permissive License Stack](https://protocol.ai/blog/announcing-the-permissive-license-stack/).
