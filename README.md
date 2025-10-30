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

## Install

```sh
pnpm install
```

## Quick start

- Run all apps:
```sh
pnpm dev
```
- Explorer only:
```sh
pnpm dev --filter @filecoin-pay/explorer
```
- Metrics only:
```sh
pnpm dev --filter @filecoin-pay/metrics
```

## Common scripts

- Build: `pnpm build`
- Lint: `pnpm lint`
- Type check: `pnpm type-check`
- Test: `pnpm test`

## Contributing

- Use Node/pnpm versions from root `package.json` engines.
- Run `pnpm lint`, `pnpm format`, and `pnpm type-check` before committing.
- See per-package READMEs for details.

## Related repositories

- Contracts: https://github.com/FilOzone/filecoin-pay
- Explorer: https://github.com/FilOzone/filecoin-pay-explorer

## License

Dual-licensed: [MIT](https://github.com/FilOzone/synapse-sdk/blob/master/LICENSE.md), [Apache Software License v2](https://github.com/FilOzone/synapse-sdk/blob/master/LICENSE.md) by way of the [Permissive License Stack](https://protocol.ai/blog/announcing-the-permissive-license-stack/).