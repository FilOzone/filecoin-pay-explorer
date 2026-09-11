# AGENTS.md

Guidance for coding agents working in this repository. User instructions take precedence, followed by the nearest `AGENTS.md`, then this file.

Only read a package's AGENTS.md when the current task involves that package or changes that could affect it. Do not read package-specific instructions for unrelated work.

## Before Changing Code

1. Inspect the target package's `package.json`, nearby code, tests, and documentation.
2. Check `git status` and preserve unrelated or user-owned changes.
3. Identify whether the task crosses a package boundary, changes generated code, or affects a deployment.
4. Reuse existing utilities, types, components, and scripts before adding dependencies or abstractions.
5. Keep unrelated cleanup outside the change.

Use the installed package versions and current source as truth when prose documentation has drifted.

## Workspace

This is a pnpm workspace orchestrated by Turbo. It requires Node.js 22 or newer and pnpm 9 or newer; the root package pins pnpm 9.15.2. Biome is the only formatter and linter.

| Path | Package | Role |
| --- | --- | --- |
| `apps/explorer` | `@filecoin-pay/explorer` | Primary Next.js 16 and React 19 application: public explorer, wallet console, and small server-route boundary |
| `apps/metrics` | `@filecoin-pay/metrics` | Secondary Vite and React metrics dashboard |
| `apps/notification-service` | `@filecoin-pay/notification-service` | Three Cloudflare Workers: Hono API, scheduled subscription scanner, and queue consumer |
| `packages/subgraph` | `@filecoin-pay/subgraph` | AssemblyScript event indexer, GraphQL schema, network manifests, and Matchstick tests |
| `packages/types` | `@filecoin-pay/types` | TypeScript types generated from the subgraph schema and compiled to `dist` |
| `packages/ui` | `@filecoin-pay/ui` | Shared source-exported React primitives; it has no build step |
| `packages/configs` | `@filecoin-pay/configs` | Shared Biome and TypeScript configuration |

The main read path is:

```text
Filecoin Pay contract events
  → packages/subgraph
  → GraphQL schema and hosted subgraphs
  → packages/types
  → Explorer and Metrics query hooks
```

The notification path is:

```text
Explorer registration and settings
  → notification API Worker
  → D1 subscription
  → scheduled Worker
  → bounded queue batches
  → processor RPC checks
  → email and D1 audit record
```

## Safety

- Never open or print `.env`, `.dev.vars`, secret files, credentials, tokens, or private keys. Inspect example files and environment-variable names only.
- Ask before destructive or irreversible commands. Prefer dry runs and local emulation where available.
- Do not log secrets or sensitive payloads. Keep logs structured and include useful identifiers and failure context.
- Do not deploy, publish, create a release, unless the user explicitly asks.
- Treat generated files and build artifacts as reproducible output. Do not hand-edit them.

## Commands

Run commands from the repository root unless package instructions say otherwise.

Build generated types before running a consumer directly:

```bash
pnpm build --filter @filecoin-pay/types
```

Common development and package checks:

```bash
pnpm dev --filter @filecoin-pay/explorer
pnpm --filter @filecoin-pay/explorer test
pnpm --filter @filecoin-pay/explorer type-check

pnpm --filter @filecoin-pay/notification-service type-check
pnpm --filter @filecoin-pay/notification-service test
pnpm --filter @filecoin-pay/notification-service build

pnpm --filter @filecoin-pay/subgraph test
```

Root verification:

```bash
pnpm build
pnpm test
pnpm type-check
pnpm lint
pnpm format
```

`lint` and `format` run in write mode. Do not run them during a read-only review. Use non-mutating checks while reviewing:

```bash
pnpm format:check
pnpm exec biome check path/to/file.ts
```

During implementation, run the narrowest relevant checks first. Before handoff, run the root-required checks that cover the changed behavior and inspect the diff after write-mode commands. Report every skipped, blocked, or failed check.

Turbo only runs scripts a package declares. `apps/metrics` and `packages/ui` currently have no test script, so a successful root `pnpm test` does not test them.

## Cross-Package Rules

### Explorer

When working in `apps/explorer/`, or making changes that affect the Explorer, read [apps/explorer/AGENTS.md](apps/explorer/AGENTS.md) before editing it.

### Notification service

When working in `apps/notification-service/`, or making changes that affect the notification service, read [apps/notification-service/AGENTS.md](apps/notification-service/AGENTS.md) before editing it.

### Subgraph and generated types

- The source schema is `packages/subgraph/schemas/schema.v1.graphql`.
- Event handlers live under `packages/subgraph/src`; Matchstick tests live under `packages/subgraph/tests`.
- Network manifests are generated from `packages/subgraph/templates/subgraph.template.yaml` and `packages/subgraph/config/*.json`.
- `packages/types` generates TypeScript from the subgraph schema with GraphQL Code Generator.

After a schema change, regenerate and build `@filecoin-pay/types`, update affected queries and consumers, and run subgraph plus consumer checks. Never patch `packages/types/src/generated`, `packages/subgraph/generated`, `schema.graphql`, or `subgraph.yaml` by hand.

### Shared UI and Metrics

`@filecoin-pay/ui` exports files directly from `src`; consumers do not build it first. Keep shared primitives generic and preserve existing exports.

`apps/metrics` is a separate Vite application. Do not assume Next.js, wallet-console, or Explorer route conventions apply to it.

## Git, CI, and Releases

- Use Conventional Commit titles such as `feat: ...`, `fix: ...`, and `chore: ...`.
- Target feature pull requests at `staging`. Production promotion is `staging → main`; direct `main` pull requests are reserved for deliberate hotfixes and must be back-merged.
- Keep commits focused and reviewable.
- Explorer deployment is handled by Vercel. Notification Workers deploy from their environment-gated workflow.
- Subgraph releases use Release Please on `staging`, deploy calibration and mainnet to Goldsky, then receive the production tag after promotion to `main`. Do not create release tags manually.

## Documentation

- [README.md](README.md) — workspace setup, environment-variable names, architecture, and releases
- [docs/code-best-practices.md](docs/code-best-practices.md) — code and testing standards
- [docs/component-guidelines.md](docs/component-guidelines.md) — UI and component guidance; defer to installed versions and local app instructions when version text is stale
- [docs/git-instructions.md](docs/git-instructions.md) — commit policy
