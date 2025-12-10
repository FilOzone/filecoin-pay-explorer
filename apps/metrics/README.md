# Filecoin Pay Metrics

Metrics dashboard for visualizing Filecoin Pay network statistics.

## Setup

> **Note:** For complete setup instructions including dependency installation and building shared packages, see the [main README](../../README.md) in the repository root.

### Environment Variables

This app requires the following environment variables:

| Variable                | Description                                         | Required | Default |
| ----------------------- | --------------------------------------------------- | -------- | ------- |
| `VITE_GRAPHQL_ENDPOINT` | GraphQL endpoint for the Filecoin Payments subgraph | Yes      | -       |

**Setup:**

1. Copy the example file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and configure:
   ```bash
   VITE_GRAPHQL_ENDPOINT=https://api.thegraph.com/subgraphs/name/your-username/filecoin-payments
   ```

**Environment Details:**

- **`VITE_GRAPHQL_ENDPOINT`**: Replace with your actual subgraph URL

## Running Locally

**Prerequisites:**

- Dependencies installed (`pnpm install` from root)
- Shared packages built (`pnpm build --filter @filecoin-pay/types` from root)
- Environment variables configured (see above)

**Development:**

```bash
pnpm dev
```

App runs on [http://localhost:5173](http://localhost:5173)

**Production:**

```bash
pnpm build
pnpm preview  # For local testing
```

## Available Scripts

| Command           | Description                              |
| ----------------- | ---------------------------------------- |
| `pnpm dev`        | Start development server with hot-reload |
| `pnpm build`      | Build the application for production     |
| `pnpm preview`    | Preview the production build locally     |
| `pnpm lint`       | Run Biome linter and auto-fix issues     |
| `pnpm type-check` | Run TypeScript type checking             |
| `pnpm clean`      | Remove build artifacts (dist folder)     |

## Tech Stack

- React + Vite + TypeScript
- Tailwind CSS
- Graph data source (Subgraph)

## Dependencies

This app depends on the following workspace packages:

- `@filecoin-pay/types` - Shared TypeScript types
- `@filecoin-pay/configs` - Shared configurations

## Features

- Real-time metrics visualization
- Mock data mode for development
- Responsive dashboard layout
- Interactive charts and graphs
