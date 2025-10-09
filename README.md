# Filecoin Pay Explorer

A monorepo for the Filecoin Payment Explorer ecosystem, including subgraph indexing, metrics dashboard, and payment explorer applications.

### Apps

- **`apps/metrics`** - Metrics dashboard for visualizing payment network statistics
  - React + Vite + TypeScript
  - TailwindCSS for styling
  - Recharts for data visualization
  - Consumes subgraph GraphQL API

### Packages

- **`packages/subgraph`** - The Graph protocol subgraph

  - Indexes Filecoin payment contract events
  - Publishes GraphQL schema
  - Deployable to The Graph network

- **`packages/types`** - Shared TypeScript types

  - Auto-generated from subgraph schema
  - Used across all frontend apps
  - Ensures type safety across the stack

- **`packages/configs`** - Shared TypeScript configurations
  - Base config for all packages
  - React-specific config for apps
  - Node-specific config for tooling

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 22.0.0
- **pnpm** >= 9.0.0

Install pnpm if you haven't:

```bash
npm install -g pnpm@9.15.2
```

### Installation

```bash
# Install all dependencies across the monorepo
pnpm install
```

This will install dependencies for all packages and set up workspace links.

### Development

```bash
# Run all apps in development mode
pnpm dev

# Run specific app
pnpm --filter @filecoin-pay/metrics dev
```

### Building

```bash
# Build all packages and apps
pnpm build

# Build specific package
pnpm --filter @filecoin-pay/types build
```

### Type Generation

The monorepo automatically generates TypeScript types from the subgraph schema:

```bash
# Generate types from subgraph schema
pnpm --filter @filecoin-pay/types generate

# This runs automatically during build
pnpm build
```

### Testing

```bash
# Run all tests
pnpm test

# Run subgraph tests
pnpm --filter @filecoin-pay/subgraph test

# Run with coverage
pnpm --filter @filecoin-pay/subgraph test:coverage
```

### Linting & Formatting

```bash
# Lint all packages
pnpm lint

# Format all files
pnpm format

# Check formatting
pnpm format:check
```

## 🔄 Workflow

### Making Schema Changes

1. Update schema in `packages/subgraph/schemas/schema.v1.graphql`
2. Build subgraph: `pnpm --filter @filecoin-pay/subgraph build`
3. Generate types: `pnpm --filter @filecoin-pay/types generate`
4. Types are automatically available in all apps

### Deploying

Each component deploys independently:

```bash
# Deploy subgraph
pnpm --filter @filecoin-pay/subgraph deploy

# Build metrics app for deployment
pnpm --filter @filecoin-pay/metrics build
# Deploy dist/ to your hosting (Vercel, Netlify, etc.)
```

## 📝 Scripts Reference

| Command           | Description                 |
| ----------------- | --------------------------- |
| `pnpm install`    | Install all dependencies    |
| `pnpm dev`        | Run all apps in dev mode    |
| `pnpm build`      | Build all packages and apps |
| `pnpm test`       | Run all tests               |
| `pnpm lint`       | Lint all packages           |
| `pnpm format`     | Format all files with Biome |
| `pnpm clean`      | Clean all build artifacts   |
| `pnpm type-check` | Type check all TypeScript   |

## 📚 Additional Resources

- [Turborepo Documentation](https://turbo.build/repo/docs)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [The Graph Documentation](https://thegraph.com/docs/)
- [GraphQL Code Generator](https://the-guild.dev/graphql/codegen)

## 🤝 Contributing

1. Create a feature branch
2. Make changes in relevant packages/apps
3. Run `pnpm build` to ensure everything builds
4. Run `pnpm test` to ensure tests pass
5. Run `pnpm format` to format code
6. Submit PR

## 📄 License

[Add your license here]
