# Filecoin Pay Explorer

Web application for exploring Filecoin pay Rails, Accounts, Operators and their analytics.

## Setup

> **Note:** For complete setup instructions including dependency installation and building shared packages, see the [main README](../../README.md) in the repository root.

### Environment Variables

This app requires the following environment variables:

| Variable                               | Description                                   | Required |
| -------------------------------------- | --------------------------------------------- | -------- |
| `NEXT_PUBLIC_SUBGRAPH_URL_MAINNET`     | Subgraph URL for Filecoin Mainnet (chain 314) | Yes      |
| `NEXT_PUBLIC_SUBGRAPH_URL_CALIBRATION` | Subgraph URL for Calibration testnet (314159) | Yes      |

**Setup:**

1. Copy the example file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set your subgraph URLs:

   ```bash
   NEXT_PUBLIC_SUBGRAPH_URL_MAINNET=https://api.goldsky.com/api/public/project_xxx/subgraphs/filecoin-pay-mainnet/version/gn
   NEXT_PUBLIC_SUBGRAPH_URL_CALIBRATION=https://api.goldsky.com/api/public/project_xxx/subgraphs/filecoin-pay-calibration/version/gn
   ```

## Running Locally

**Prerequisites:**

- Dependencies installed (`pnpm install` from root)
- Shared packages built (`pnpm build --filter @filecoin-pay/types --filter @filecoin-pay/ui` from root)
- Environment variables configured (see above)

**Development:**

```bash
pnpm dev
```

App runs on [http://localhost:3000](http://localhost:3000)

**Production:**

```bash
pnpm build
pnpm start
```

## Available Scripts

| Command       | Description                                            |
| ------------- | ------------------------------------------------------ |
| `pnpm dev`    | Start development server with Turbopack and hot-reload |
| `pnpm build`  | Build the application for production                   |
| `pnpm start`  | Start the production server (requires build first)     |
| `pnpm lint`   | Run Biome linter and auto-fix issues                   |
| `pnpm format` | Format code with Biome                                 |

## Tech Stack

- Next.js 15
- React 19 with TypeScript

## Dependencies

This app depends on the following workspace packages:

- `@filecoin-pay/types` - Shared TypeScript types
- `@filecoin-pay/ui` - Shared UI components and theming
- `@filecoin-pay/configs` - Shared configurations
