# Filecoin Pay Metrics

Metrics dashboard for visualizing Filecoin Pay network statistics.

- React + Vite + TypeScript
- Tailwind CSS
- Graph data source (Subgraph)

## Prerequisites
- Node >= 22
- pnpm >= 9

## Install
From the repo root:
```sh
pnpm install
```

## Develop
```sh
pnpm dev --filter @filecoin-pay/metrics
```
The app will start on the port configured by Vite.

## Build
```sh
pnpm --filter @filecoin-pay/metrics build
```

## Lint and type-check
```sh
pnpm --filter @filecoin-pay/metrics lint
pnpm --filter @filecoin-pay/metrics type-check
```

## Configuration
- This app may require a subgraph endpoint or other API configuration. Refer to the source for configuration details and add a README update here if/when an `.env.example` is introduced.

## Notes
- UI components and theming can be shared via the `@filecoin-pay/ui` package when needed.
