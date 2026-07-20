# AGENTS.md — notification-service

Guidance for coding agents working in `apps/notification-service`. Read this before touching config or scripts. See [README.md](README.md) for the product overview.

## What this is

One pnpm/Turbo workspace package (`@filecoin-pay/notification-service`) that ships **three separate Cloudflare Workers**, each in its own subfolder with its own `wrangler.jsonc`:

| Folder | Worker name | Trigger | Handler |
| --- | --- | --- | --- |
| `api/` | `notification-api` | HTTP | Hono app, `export default app` |
| `alert-scheduler/` | `notification-alert-scheduler` | Cron (`0 */12 * * *`) | `scheduled` |
| `alert-processor/` | `notification-alert-processor` | Queue consumer | `queue` |

`shared/` holds in-package code imported by the workers (`chain.ts`, and later D1 schema, RPC, auth, email). `migrations/` holds D1 migrations. There is **no root `wrangler.jsonc`** — every wrangler command must pass `-c <worker>/wrangler.jsonc`.

Hono is only in `api/`. The scheduler and processor are plain `ExportedHandler`s — do not add Hono to them.

## The `--env` rule (most important thing here)

**Bindings are not inherited by named environments.** Every binding (`DB`, `KV`, `ALERT_QUEUE`), every `var` (`NETWORK`), and every cron lives *inside* `env.staging` and `env.production`. The top-level config has none. So any wrangler command run without `--env` operates on an empty, binding-less environment.

Because of this, **every script pins an env** — this was a deliberate fix, don't undo it:

- `types` uses `--env staging`. Without it, the generated `Env` has all bindings optional (`DB?`, `KV?`) and `NETWORK` widened to the full union — so TS won't catch a missing binding. With it, bindings are required and accurate. staging/production have identical binding *shapes*, so typing against staging is correct for both. (It does narrow the `NETWORK` literal to `"calibration"`; route network branching through the `Network` type in `shared/chain.ts`, not inline `env.NETWORK === "mainnet"` comparisons.)
- `dev:api` uses `--env staging`. Without it, `env.DB`/`env.KV`/`env.NETWORK` are all `undefined` at runtime. Local dev uses local storage simulation by default — it does not touch real calibration resources unless a binding sets `remote: true`.
- `build` dry-runs **both** envs (`build:staging` + `build:production`). A `--dry-run` validates only the env you pass, so staging-only validation would let a typo or bad resource ID in a `production` block slip through until a live `deploy:production`. Both halves are validated in CI; per-env `--outdir` (`dist/staging/*`, `dist/production/*`) keeps the bundles from clobbering each other.

When adding any new wrangler-invoking script, pass `--env`.

## TypeScript setup (two gotchas)

`tsconfig.json` (package base) extends `@filecoin-pay/configs/typescript/base`.

The base tsconfig overrides `lib: ["ES2022"]` to **exclude DOM**. Workers use the runtime types from the generated `worker-configuration.d.ts`; including DOM double-declares `Response`/`Request`/`WebSocket` and produces ~100 conflict errors.

Each worker's `tsconfig.json` extends the package base, sets `compilerOptions.types: ["./worker-configuration.d.ts"]`, and includes `index.ts` + `../shared/**/*.ts`. The generated `worker-configuration.d.ts` files are gitignored — run `pnpm run types` to produce them.

## Commands

```bash
pnpm run types          # generate each worker's Env (must run before type-check)
pnpm run type-check     # types + tsc for all three workers
pnpm run build          # dry-run bundle all three workers, both envs
pnpm run dev:api        # local dev for the api worker (staging bindings, local storage)
pnpm run deploy:staging | deploy:production
pnpm run db:migrate:staging | db:migrate:production
```

After changing any `wrangler.jsonc`, rerun `pnpm run types` — the `Env` type drifts otherwise.

## Config conventions

Network is bound at deploy time via Wrangler environments, never in runtime logic: `staging` = calibration, `production` = mainnet. Worker code reads `env.NETWORK` and derives everything else. The FilecoinPay contract address is **not** stored in config — it comes from `@filoz/synapse-sdk` via `shared/chain.ts` (`filecoinPayAddress(network)`), the same source the explorer uses. `NETWORK` is the only `var`.

**Secrets are per-worker**, not shared across the package. `RPC_URL` is read only by `alert-processor`, so it's set on that worker with `pnpm run secret:rpc-url:staging|production` (which pass `-c alert-processor/wrangler.jsonc`). Never hardcode a secret in config or source, and never pass a secret value as a CLI argument — use the interactive prompt. If a second worker later needs RPC, revisit Cloudflare Secrets Store rather than duplicating the secret.

Resource naming grammar: `filecoin-pay-<domain>-<type|purpose>-<env>` for account-global resources (e.g. `filecoin-pay-notification-db-staging`), generic stable names for in-code bindings (`DB`, `KV`, `ALERT_QUEUE`). Worker names follow `<domain>-[capability]-<role>`.

## Workers practices

`compatibility_date` is set and `nodejs_compat` is on. `observability` is enabled per worker. Use `crypto.randomUUID()` for tokens/IDs (never `Math.random()`). Await/`return`/`void`/`ctx.waitUntil()` every promise — no floating promises. Never store request-scoped state in module-level variables. Prefer in-process bindings over the Cloudflare REST API.
