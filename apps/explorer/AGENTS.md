# AGENTS.md — Explorer

These instructions apply to `apps/explorer/**`. They supplement the repository-root `AGENTS.md`; follow the root file when this file is silent.

## Package

- Workspace package: `@filecoin-pay/explorer`
- Framework: Next.js App Router with React and TypeScript
- Styling: Tailwind CSS 4
- Server state: TanStack Query
- Wallet and contracts: wagmi, viem, RainbowKit, and Synapse SDK
- Data source: GraphQL subgraphs and current chain data
- Tests: Vitest
- Formatting and linting: Biome

## Application Structure

The app has three distinct surfaces. A wallet chain, the network in the explorer URL, and a Squid source chain are separate state.

### Public explorer

Network-scoped pages live under `src/app/[network]/**`. They cover rails, accounts, operators, and aggregate metrics. Supported URL networks are `mainnet` and `calibration`.

The route network controls subgraph selection and navigation. Keep the URL network, network context, query network, and generated links aligned. `src/proxy.ts` handles root and invalid-network redirects; `/console` bypasses network-prefix handling.

### User console

Connected-wallet pages live under `src/app/console/(console)/**`. The shared layout owns:

- `ConsoleProviders`
- wallet connection and supported-chain access
- the console header, sidebar, and mobile navigation
- the beta warning and page container

Do not repeat those providers or access gates inside individual console pages.

`src/app/console/notifications/verify/page.tsx` deliberately sits outside the `(console)` route group. Verification links must work without a connected wallet or console-only providers.

### API routes

Next.js route handlers live under `src/app/api/**`. The Squid token-catalog proxy is server-side code even though most explorer data comes directly from public subgraphs.

Keep privileged service calls and non-public configuration on the server. Validate inputs and structured external data at the boundary. If a route intentionally proxies an opaque response, preserve its status and safe content headers instead of parsing it without need.

## Important Boundaries

Before editing, inspect the closest route, shared layout, component, hook, and co-located tests. Useful starting points are:

- `src/components/shared/SiteLayout.tsx` and `Providers.tsx` — application shell, network context, TanStack Query, tooltips, progress, and toasts
- `src/components/UserConsole/ConsoleProviders.tsx` — console-only wagmi, RainbowKit, Synapse, and top-up activity state
- `src/services/grapql/queries.ts` — shared GraphQL documents; keep the existing `grapql` spelling unless a task explicitly includes renaming it
- `src/hooks/useGraphQLQuery.ts` — network-aware query and infinite-query wrappers
- `src/constants/chains.ts`, `src/services/wagmi/config.tsx`, and `src/utils/network.ts` — Filecoin and wallet-chain definitions and checks
- `src/components/UserConsole/FundsSection/**` — guided funding and Squid acquisition logic
- `src/utils/**` — pure formatting, network, settlement, lockup, and permit helpers

Use the `@/*` alias for imports from `src`. Preserve the import style used by adjacent files.

## Providers

The root application shell supplies the shared `QueryClient` and network context. `ConsoleProviders` adds wallet and top-up state only for the console.

- Do not introduce a second application `QueryClient` or a page-local wallet provider unless changing that provider boundary is part of the request.
- Keep providers close to the state they own. Public explorer pages must not initialize wallet state without a product requirement.
- A component cannot consume a context provider that it mounts itself. Keep provider wrappers separate from components that read their context.
- Avoid module-level mutable state. The shared `QueryClient` is an established exception, not a pattern for more global clients or caches.

## Data Fetching and Types

Explorer data flows from Filecoin Pay contracts through the subgraph and GraphQL schema, then through `@filecoin-pay/types` into domain hooks and components.

Use TanStack Query for client-side asynchronous state:

- Reuse hooks in `src/hooks` before adding direct requests.
- Use `useGraphQLQuery` and `useGraphQLInfiniteQuery` for subgraph reads.
- Include every stable input that changes a result in the query key: address, filters, page size, and resource identifiers. The shared GraphQL wrappers append the selected network; do not append it again at call sites.
- For infinite queries, pass the current page through `pageParam`, not the query key.
- Preserve `enabled`, polling, stale-time, retry, selection, and invalidation behavior during UI-only work.
- Do not mirror query data into component state unless the user is editing a snapshot.
- Do not fetch server state through `useEffect`.

Keep pagination bounded. Existing infinite lists use explicit page sizes and `skip`; do not fetch an unbounded collection into memory.

Put reusable GraphQL documents in `src/services/grapql/queries.ts`. Import schema-backed entities from `@filecoin-pay/types`; do not duplicate them locally or edit generated output by hand. A schema change belongs in `packages/subgraph/schemas/schema.v1.graphql`, followed by type generation and build work outside this app.

Render loading, empty, and error states explicitly. Follow the matching list or detail view instead of inventing another state pattern.

## Network, Wallet, and Transactions

- Keep supported Filecoin chains centralized in `src/constants/chains.ts` and `src/services/wagmi/config.tsx`. Use `src/utils/network.ts` instead of recreating chain checks.
- `supportedChains` controls explorer networks. The broader wagmi chain list contains Squid source chains used during top-up; do not expose those chains as normal Filecoin console networks.
- Preserve the URL-to-context synchronization under `src/app/[network]`. Network-sensitive data must not reuse cache entries from another network.
- Keep token amounts, epochs, rates, allowances, and transaction values exact. Use `bigint` and the established viem and formatting helpers; do not pass exact values through JavaScript `number` when precision can be lost.
- Reuse `useContractTransaction` and existing domain flows before creating another write lifecycle.

Contract dialogs and transaction hooks own behavior such as wallet signature progress, duplicate-submission guards, receipt tracking, pending and success toasts, query invalidation, and close restrictions while work is pending. UI refactors must preserve handlers, disabled states, callback timing, and mount lifetime.

Do not unmount a transaction controller immediately after submission when it still owns receipt tracking or recovery state. Snapshot user selections when a dialog opens if changing the live selection could alter the transaction being prepared.

Treat guided top-up as a stateful workflow. Keep transition, locking, quote, execution, and recovery logic in the pure modules under `FundsSection/data/**`, not embedded in the large dialog components. Add regression tests for changed transitions, persistence, recovery, quotes, or chain switching.

## Notification Behavior

Notifications are split across this app and `apps/notification-service`:

- Explorer owns registration, verification, settings UI, signing, and API calls.
- The notification service owns subscription persistence, scheduling, processing, and email delivery.

Do not move service responsibilities into a Next.js route without an explicit architecture change.

Notification support is deployment-scoped:

- Production is supported only at `https://pay.filecoin.cloud` while the selected Filecoin network is `mainnet`.
- Staging is supported only at `https://filecoin-pay-explorer-staging.vercel.app` using the staging deployment and its notification configuration.

Local Explorer development can use a locally running notification service. Follow the [notification-service agent instructions](../notification-service/AGENTS.md) for its setup, environment selection, commands, and safety rules. Do not point localhost at the production or staging notification API.

Treat branch previews, other Vercel URLs, and custom origins as unsupported for notifications. A change to either supported origin, its SIWE domain or URI, the eligible Filecoin network, or the notification API target requires a coordinated deployment and notification-service change.

Notification settings contain signing, API mutations, polling, cooldown timers, session storage, cancellation phases, and query invalidation. Treat these as behavior even when they live inside a page component. A visual change must not alter:

- SIWE statements, domains, URIs, nonces, or message fields
- polling, cooldown, timeout, or delayed-message intervals
- storage keys, stored values, or recovery behavior
- wallet-rejection handling
- unsubscribe cancellation phases
- notification-status query keys or invalidation
- verification behavior without a wallet

## Next.js and React

- Follow the repository convention of using Client Components for interactive UI. Use a Server Component or route handler when a task calls for server execution or an existing boundary already does so.
- Add `"use client"` only where client APIs, hooks, context, or interactive state require it. Do not push it into otherwise server-capable layouts because a leaf needs hooks.
- Do not convert server/client boundaries as part of unrelated UI work.
- In Next.js 16 route files, dynamic `params` may be promises. Match nearby route signatures.
- Use `next/image` for raster content when applicable and provide dimensions. Existing SVG imports are handled by SVGR.

## Components and Styling

Start with primitives from `@filecoin-foundation/ui-filecoin`. Use `@filecoin-pay/ui` when the primary library lacks a suitable primitive. Compose those libraries before adding app-local abstractions or custom CSS.

- Keep Tailwind utilities next to the JSX and use existing theme tokens.
- Do not introduce another styling system.
- Preserve semantic HTML, keyboard behavior, focus states, labels, and live regions.
- Do not replace a suitable native element solely for visual consistency.
- Keep components focused. Extract calculations and workflow rules to `data/` or `utils/`, and reusable stateful behavior to hooks.
- Comments should explain constraints or non-obvious reasons, especially around wallet and top-up behavior. Do not narrate the code.

## UI-Only Work

When a request says behavior must not change, preserve:

- render and access gates
- query keys, options, polling, and invalidation
- pagination and filtering rules
- token and network selection
- dialog mount conditions and close restrictions
- callback arguments and timing
- loading, empty, error, disconnected, and unsupported-network states
- timer, storage, signing, transaction, and recovery flows

Review the full state matrix around an edited component, not only its loaded state.

## Server Routes and Environment

Server routes must validate input, bound upstream calls with timeouts, preserve useful upstream status codes, and return safe errors. Cache only successful responses when the data is safe to share. Never return credentials or sensitive upstream details.

Never read `.env` files. Use documented variable names and inspect code references only. Current public configuration includes:

- `NEXT_PUBLIC_SUBGRAPH_URL_MAINNET`
- `NEXT_PUBLIC_SUBGRAPH_URL_CALIBRATION`
- `NEXT_PUBLIC_SQUID_INTEGRATOR_ID`
- `NEXT_PUBLIC_NOTIFICATIONS_API_URL`
- `NEXT_PUBLIC_NOTIFICATIONS_ELIGIBLE_NETWORKS`

Do not hardcode deployment endpoints, credentials, private keys, or new environment-specific values in source. Validate required configuration at its boundary and name a missing variable without printing its value.

## Testing

Vitest runs in the Node environment and discovers `src/**/*.test.ts` and `src/**/*.test.tsx`. Co-locate tests with source files:

```text
Component.tsx
Component.test.tsx
```

Follow existing `react-test-renderer` and module-mocking patterns for component tests unless intentionally changing the test environment.

- Add regression coverage for bug fixes and tests for new behavior.
- Test observable outputs and state transitions, not component internals.
- Assert complete arrays and objects when practical.
- Extract pure calculations and workflow transitions and test their boundary cases.
- Cover mainnet and calibration differences and wallet states when they affect the change.
- Mock GraphQL, `fetch`, RPC, and wallet boundaries. Tests must not depend on live networks or hosted services.
- For server routes, test validation, success, upstream failure, thrown or timeout failure, status propagation, and cache headers as relevant.

During development, run the narrowest useful checks from the repository root:

```bash
pnpm build --filter @filecoin-pay/types
pnpm --filter @filecoin-pay/explorer test
pnpm --filter @filecoin-pay/explorer type-check
pnpm --filter @filecoin-pay/explorer build
```

Run one test file with:

```bash
pnpm --filter @filecoin-pay/explorer exec vitest run src/path/to/file.test.ts
```

Use a non-mutating Biome check during review:

```bash
pnpm --filter @filecoin-pay/explorer exec biome check src/path/to/file.tsx
```

The package `lint` and `format` scripts write changes. Do not run them during a read-only review. After implementation work, run the repository-required checks from the root and inspect the diff for unrelated changes:

```bash
pnpm lint && pnpm format && pnpm test
```

Run `pnpm type-check --filter @filecoin-pay/explorer` for TypeScript changes and `pnpm build --filter @filecoin-pay/explorer` when routing, server/client boundaries, configuration, or production bundling may be affected. Report any check that was skipped, blocked, or failed.

## Before Changing Code

1. Read the page, its shared layout, the hooks it uses, and co-located tests.
2. Identify loading, empty, error, disconnected, and unsupported-network states.
3. Trace transaction or notification callbacks before changing component lifetime.
4. Check for existing utilities, primitives, GraphQL documents, and tests.
5. Keep unrelated cleanup outside the change.

Keep edits local to `apps/explorer` unless behavior truly crosses a workspace boundary. Avoid opportunistic rewrites of the large console dialogs or query catalog. If a task changes subgraph entities, generated types, shared UI, or notification-service behavior, state the expanded scope before editing those packages and follow their local instructions.
