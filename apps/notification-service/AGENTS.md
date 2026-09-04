# AGENTS.md — notification-service

Guidance for coding agents working in `apps/notification-service`. Read this before touching config or scripts. See [README.md](README.md) for the product overview.

## What this is

One pnpm/Turbo workspace package (`@filecoin-pay/notification-service`) that ships **three separate Cloudflare Workers**, each in its own subfolder with its own `wrangler.jsonc`:

| Folder | Worker name | Trigger | Handler |
| --- | --- | --- | --- |
| `api/` | `notification-api` | HTTP | Hono app, `export default app` |
| `alert-scheduler/` | `notification-alert-scheduler` | Cron (`0 */12 * * *`) | `scheduled` |
| `alert-processor/` | `notification-alert-processor` | Queue consumer | `queue` |

`shared/` holds in-package code imported by the workers — `chain.ts`, `db/` (schema + client), `emails/`, `messages.ts`, `alert-levels.ts`. `migrations/` holds D1 migrations. There is **no root `wrangler.jsonc`** — every wrangler command must pass `-c <worker>/wrangler.jsonc`.

Hono is only in `api/`. The scheduler and processor are plain `ExportedHandler`s — do not add Hono to them.

## The alert pipeline

`alert-scheduler` (cron) fans out one queue message per subscribed wallet to `ALERT_QUEUE`; `alert-processor` (queue consumer) evaluates each. Two things here aren't visible from a single file:

**Dedup is KV + D1, never the queue.** Cloudflare Queues is at-least-once with no infra-level dedup. The processor is what absorbs re-enqueued wallets, via KV plus `notification_log` (D1 is ground truth; KV is a cache backfilled from it). Send-first is deliberate: `recordSent` runs *after* the email, so a crash in that gap yields a rare duplicate email rather than a missed solvency alert.

**The queue handler must never throw out of the batch.** `processMessage` maps every outcome to `ack`/`retry`, so one wallet's failure can't fail the batch. The exception is the batch-level setup at the top of `queue()` (the read client and the D1 client) — it runs *outside* the per-message try/catch, so a throw there fails all messages. Keep it dependency-light.

## The `--env` rule (most important thing here)

**Bindings are not inherited by named environments.** Every binding, every `var`, and every cron lives *inside* `env.staging` and `env.production` — those blocks are the authoritative list. The top-level config has none. So any wrangler command run without `--env` operates on an empty, binding-less environment.

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
pnpm run type-check     # types + tsc across all projects (3 workers, shared/emails, tests)
pnpm run build          # dry-run bundle all three workers, both envs
pnpm run dev:api        # local dev for the api worker (staging bindings, local storage)
pnpm run deploy:staging | deploy:production
pnpm run db:migrate:staging | db:migrate:production
```

After changing any `wrangler.jsonc`, rerun `pnpm run types` — the `Env` type drifts otherwise.

## Config conventions

Network is bound at deploy time via Wrangler environments, never in runtime logic: `staging` = calibration, `production` = mainnet. Worker code reads `env.NETWORK` and derives everything else. The FilecoinPay contract address is **not** stored in config — it comes from `@filoz/synapse-sdk` via `shared/chain.ts` (`filecoinPayAddress(network)`), the same source the explorer uses. The `vars` are `NETWORK` and `FRONTEND_ORIGIN` (per env); everything else is a binding or secret.

**`FRONTEND_ORIGIN` is exact-match critical.** The `api` CORS middleware only emits `Access-Control-Allow-Origin` when the request origin matches `env.FRONTEND_ORIGIN` byte-for-byte, and SIWE derives its expected `domain` from that same value. staging must be the staging Vercel URL (`https://filecoin-pay-explorer-staging.vercel.app`), production the canonical domain (`https://pay.filecoin.cloud`). A mismatch surfaces as a browser CORS error, not a server log. `alert-processor` also reads `FRONTEND_ORIGIN` (for the top-up link in emails); keep the two in sync per env.

**`wrangler deploy` overwrites live `vars` from config** unless you pass `--keep-vars`. A dashboard-edited var is silently reverted on the next deploy — change vars in `wrangler.jsonc`, not the dashboard.

**Secrets are per-worker**, not shared across the package. `RPC_URL` is read only by `alert-processor`, so it's set on that worker with `pnpm run secret:rpc-url:staging|production` (which pass `-c alert-processor/wrangler.jsonc`). Never hardcode a secret in config or source, and never pass a secret value as a CLI argument — use the interactive prompt. If a second worker later needs RPC, revisit Cloudflare Secrets Store rather than duplicating the secret.

Resource naming grammar: `filecoin-pay-<domain>-<type|purpose>-<env>` for account-global resources (e.g. `filecoin-pay-notification-db-staging`), generic stable names for in-code bindings (`DB`, `KV`, `ALERT_QUEUE`). Worker names follow `<domain>-[capability]-<role>`.

## Deploying

Order for a **first-time** deploy of an environment:

1. Create resources (D1, KV, queue + DLQ) if not auto-provisioned, and apply D1 migrations (`pnpm run db:migrate:<env>`).
2. Deploy `alert-processor` **with the secret supplied inline**, because both `alert-processor` wranglers set `secrets: { required: ["RPC_URL"] }` and that check runs against the deploy. On a first deploy the worker has no secret store yet, so `wrangler secret put` first, then `deploy` does **not** work — the deploy fails the required-secret check. Supply it in the same command instead:

   ```bash
   wrangler deploy -c alert-processor/wrangler.jsonc --env <env> --secrets-file path/to/rpc.env
   ```

   `--secrets-file` (JSON or `.env` format) uploads the secret with that version. Secrets apply additively and are never deleted by later deploys, so subsequent deploys don't need the file, and you rotate `RPC_URL` afterward with `pnpm run secret:rpc-url:<env>`. Keep the secrets file out of git — it holds a live secret; delete it once the deploy succeeds.

CI (`.github/workflows/notification-service.yml`) runs `ci` (type-check + test, no secrets) then env-gated deploy jobs: `staging` on push to `staging`, `production` on push to `main`. Each deploy job runs the D1 migration step *before* the worker deploys, and a migration failure fails the job. Fork PRs get a read-only token and no secrets, so they cannot deploy. **All wrangler calls in this workflow go through `cloudflare/wrangler-action@v4`** (deploys and migrations alike) — do not swap them for `run: pnpm ...` steps.

A wrong `RPC_URL` (e.g. an endpoint that rejects the request) is not a deploy error — every processor read fails at runtime, logs *"Failed to read account state from chain"*, and returns `retry`, so the batch reports `outcome: ok` while silently making no progress. When production alerts stop, check the RPC endpoint first.

## Observability & debugging

`observability` is applied **at deploy time**. If you enable or change it in config, the running worker keeps the old setting until the next `deploy` — a stale deploy shows only Cloudflare's synthetic invocation events, never your `console.log`/evlog output. When one env shows structured logs and another doesn't with identical config, the quiet one is behind on deploys; redeploy it.

Reading logs:

- **Events view (dashboard):** each row is an invocation. Cloudflare's own error markers (`type: cf-worker`, `origin: queue`, contentless `"error": "error"`) always appear regardless of observability — they are *not* your logs. Your evlog lines (`message`, `why`, `internal`, `log.set` fields) appear only when observability is live on that deploy.
- **`wrangler tail -c <worker>/wrangler.jsonc --env <env>`:** streams the real console output live, bypassing dashboard sampling and the deploy-time gate. Fastest way to read an error's actual `message`/`why`. Drop `--status error` while debugging — a per-message failure can ride on an invocation whose overall `outcome` is `ok`.

**Logging serialization trap** (evlog stringifies with `JSON.stringify`): `JSON.stringify(Infinity)` is `null`, so `runwayDays: null` in a `healthy` log is `Number.POSITIVE_INFINITY` — an account with no active spend, not a missing value. (The account summary is bigint-heavy, so convert bigints to `Number`/`String` before logging.)

## D1 transactions

D1 does not support `BEGIN TRANSACTION` / `COMMIT` SQL. Drizzle's `db.transaction()` generates these and will fail at runtime (including in miniflare). Use `db.batch([...])` instead — D1 batch is atomic: if any statement fails, the whole batch rolls back.

`db.batch()` requires all statements to be known upfront, so it only works when no statement depends on the result of a previous one. When there's a data dependency (e.g. you need a returned ID to construct the next query), do a pre-read first to resolve the unknown, then batch the writes.

## Workers practices

`compatibility_date` is set and `nodejs_compat` is on. `observability` is enabled per worker. Use `crypto.randomUUID()` for tokens/IDs (never `Math.random()`). Await/`return`/`void`/`ctx.waitUntil()` every promise — no floating promises. Never store request-scoped state in module-level variables. Prefer in-process bindings over the Cloudflare REST API.
