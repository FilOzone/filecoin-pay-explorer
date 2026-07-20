# `@filecoin-pay/notification-service`

Cloudflare Workers backend for Filecoin Pay solvency alerts. It detects accounts nearing insolvency and emails tiered warnings with enough lead time to top up before service termination.

Three role-based workers share this package:

| Folder | Worker | Trigger | Responsibility |
| --- | --- | --- | --- |
| `api/` | `notification-api` | HTTP (Hono) | Registration, email verification, status, unsubscribe |
| `alert-scheduler/` | `notification-alert-scheduler` | Cron (every 12h) | Read subscribed wallets from D1, fan out to the queue |
| `alert-processor/` | `notification-alert-processor` | Queue consumer | Derive funded-until via RPC, apply tiers, dedupe, send email, log |

- `shared/` holds in-package code (D1 schema, RPC, auth, email); 
- `migrations/` holds the D1 migrations.

## Environments

Each worker deploys to two Wrangler environments with fully isolated resources: `production` (mainnet) and `staging` (calibration).

## Commands

```bash
pnpm run types        # generate each worker's Env types
pnpm run type-check   # types + tsc for all three workers
pnpm run build        # dry-run bundle all three workers
pnpm run deploy:staging
pnpm run deploy:production
```

- `RPC_URL` is a secret. Only `alert-processor` reads on-chain state, so it's set on that worker per environment:

  ```bash
  pnpm run secret:rpc-url:staging
  pnpm run secret:rpc-url:production
  ```

- `NETWORK` is the only per-environment var in each `wrangler.jsonc`.
