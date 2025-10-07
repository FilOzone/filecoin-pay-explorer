# Filecoin Pay Explorer

A production-ready monorepo for the Filecoin Payment Explorer ecosystem, including subgraph indexing, metrics dashboard, and payment explorer applications.

## 🏗️ Project Structure

```
filecoin-pay-explorer/
├── apps/
│   └── metrics/              # Metrics dashboard React app
├── packages/
│   ├── subgraph/             # The Graph subgraph for indexing payment data
│   ├── shared-types/         # Auto-generated TypeScript types from GraphQL schema
│   └── typescript-config/    # Shared TypeScript configurations
├── package.json              # Root workspace configuration
├── pnpm-workspace.yaml       # PNPM workspace definition
└── turbo.json                # Turborepo build pipeline
```

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

- **`packages/shared-types`** - Shared TypeScript types
  - Auto-generated from subgraph schema
  - Used across all frontend apps
  - Ensures type safety across the stack

- **`packages/typescript-config`** - Shared TypeScript configurations
  - Base config for all packages
  - React-specific config for apps
  - Node-specific config for tooling

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18.0.0
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
pnpm --filter @filoz/metrics dev

# Run subgraph development
pnpm --filter @filoz/filecoin-pay-subgraph dev
```

### Building

```bash
# Build all packages and apps
pnpm build

# Build specific package
pnpm --filter @filoz/shared-types build
```

### Type Generation

The monorepo automatically generates TypeScript types from the subgraph schema:

```bash
# Generate types from subgraph schema
pnpm --filter @filoz/shared-types generate

# This runs automatically during build
pnpm build
```

### Testing

```bash
# Run all tests
pnpm test

# Run subgraph tests
pnpm --filter @filoz/filecoin-pay-subgraph test

# Run with coverage
pnpm --filter @filoz/filecoin-pay-subgraph test:coverage
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

## 📦 Adding New Apps/Packages

### Adding a New App (e.g., Explorer)

```bash
# Create new app directory
mkdir apps/explorer

# Add package.json with workspace dependencies
cd apps/explorer
pnpm init
```

Then add to `package.json`:

```json
{
  "name": "@filoz/explorer",
  "dependencies": {
    "@filoz/shared-types": "workspace:*"
  }
}
```

### Adding a New Shared Package

```bash
# Create new package
mkdir packages/shared-ui

# Add package.json
cd packages/shared-ui
pnpm init
```

## 🔄 Workflow

### Making Schema Changes

1. Update schema in `packages/subgraph/schemas/schema.v1.graphql`
2. Build subgraph: `pnpm --filter @filoz/filecoin-pay-subgraph build`
3. Generate types: `pnpm --filter @filoz/shared-types generate`
4. Types are automatically available in all apps

### Deploying

Each component deploys independently:

```bash
# Deploy subgraph
pnpm --filter @filoz/filecoin-pay-subgraph deploy

# Build metrics app for deployment
pnpm --filter @filoz/metrics build
# Deploy dist/ to your hosting (Vercel, Netlify, etc.)
```

## 🛠️ Tech Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Subgraph**: The Graph Protocol, AssemblyScript
- **Frontend**: React, TypeScript, Vite
- **Styling**: TailwindCSS
- **Data Fetching**: TanStack Query, GraphQL Request
- **Type Generation**: GraphQL Code Generator

## 📝 Scripts Reference

| Command           | Description                    |
| ----------------- | ------------------------------ |
| `pnpm install`    | Install all dependencies       |
| `pnpm dev`        | Run all apps in dev mode       |
| `pnpm build`      | Build all packages and apps    |
| `pnpm test`       | Run all tests                  |
| `pnpm lint`       | Lint all packages              |
| `pnpm format`     | Format all files with Prettier |
| `pnpm clean`      | Clean all build artifacts      |
| `pnpm type-check` | Type check all TypeScript      |

## 🔗 Workspace Dependencies

Use `workspace:*` protocol for internal dependencies:

```json
{
  "dependencies": {
    "@filoz/shared-types": "workspace:*"
  }
}
```

This ensures monorepo packages always use the local version.

## 🚦 CI/CD Considerations

Turborepo provides intelligent caching and parallel execution:

```bash
# CI build command
turbo run build --cache-dir=.turbo

# CI test command
turbo run test --cache-dir=.turbo
```

Set up remote caching for faster CI builds:

- Vercel Remote Cache (recommended)
- Custom remote cache server

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
