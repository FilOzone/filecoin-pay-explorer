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
| `NEXT_PUBLIC_SQUID_INTEGRATOR_ID`      | Optional Squid integrator ID override          | No       |
| `NEXT_PUBLIC_PRIVY_APP_ID`             | Privy app ID used by the console login        | Yes      |
| `NEXT_PUBLIC_PRIVY_CLIENT_ID`          | Optional Privy client ID                      | No       |
| `NEXT_PUBLIC_PRIVY_ONRAMP_SANDBOX`     | `true` sends card purchases to test sandboxes | No       |

Squid route quotes use the public `filecoin-testing-94a4a25a-d40b-41cb-b148-e96098862` integrator ID by default.

The console signs in through [Privy](https://www.privy.io/): email or Google login creates an embedded wallet, and external wallets connect as before. "Pay from another network" in the console pays USDC (or ETH, USDT, DAI and a few other tokens the wallet holds on Ethereum, Base, Arbitrum and other Squid source networks) from any connected wallet, swaps it to USDFC through Squid, and deposits it into the Filecoin Pay account. Nothing is signed on Filecoin and no FIL is needed; on the source network a first purchase signs a token approval and then the swap. The dialog can also keep about 0.1 FIL of the deposit aside as gas for the account wallet, on by default while the wallet holds less than that, and the user can switch it off.

In the [Privy dashboard](https://dashboard.privy.io) the app needs:

- Login methods: email, Google, and wallet (Configuration > Login methods).
- Allowed origins for every domain the explorer runs on.
- Funding enabled on the Funding page for the wallet menu's "Buy USDC with card" and the dialog's top-up buttons. Card onramps use Stripe and MoonPay by default; a Coinbase Developer Platform key adds exchange transfers.

Card purchases, gas top-ups and Privy's transfer picker all need a Privy login: a wallet that only connected is asked to log in first, and the purchase continues after login. Paying tokens that a connected wallet already holds needs no login. Adding a service is a Filecoin transaction, so a wallet without FIL is pointed to Add funds first.

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
