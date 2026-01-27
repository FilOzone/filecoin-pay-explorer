# Development Workflow

## Build Dependencies

### Dependency Graph

```
Subgraph Schema (schema.v1.graphql)
    ↓
@filecoin-pay/types (generated TypeScript types) [NEEDS BUILD]
    ↓
@filecoin-pay/ui (shared UI components) [NO BUILD NEEDED - source exports]
    ↓
Apps (explorer, metrics)
```

### Build Order

**IMPORTANT:** Only `@filecoin-pay/types` requires building before running apps:

1. `@filecoin-pay/types` - generates types from subgraph schema (required)
2. Apps - build explorer or metrics apps

```bash
# Build required package
pnpm build --filter @filecoin-pay/types

# Or build everything (recommended)
pnpm build
```

**Note:** `@filecoin-pay/ui` exports source files directly (no build step needed).

## Data Flow

1. Filecoin Payments smart contract emits events
2. Subgraph indexes events into GraphQL entities (Rail, Account, Operator, Token)
3. `@filecoin-pay/types` generates TypeScript types from subgraph schema via graphql-codegen
4. Frontend apps query subgraph via graphql-request with type-safe queries

## Environment Variables

### Explorer (Next.js)
- `NEXT_PUBLIC_GRAPHQL_ENDPOINT` - subgraph GraphQL endpoint (required)

### Metrics (Vite)
- `VITE_GRAPHQL_ENDPOINT` - subgraph GraphQL endpoint (has fallback)

See [README](../README.md) for setup instructions.

## Code Quality Commands

### CRITICAL: Run Before Committing

After making any code changes, **ALWAYS** run these commands:

```bash
# 1. Lint and auto-fix issues
pnpm lint

# 2. Format code
pnpm format

# 3. Run tests
pnpm test
```

Pre-commit hooks will run Biome automatically, but it's best practice to run these commands manually during development.

### Individual Commands

```bash
# Lint only (reports issues without fixing)
biome check .

# Lint and fix
biome check --write .

# Format only
biome format --write .

# Type check
pnpm type-check

# Run tests for specific package
pnpm test --filter @filecoin-pay/subgraph
```

## Development Workflow

### 1. Starting Development

```bash
# Install dependencies
pnpm install

# Build types package (required)
pnpm build --filter @filecoin-pay/types

# Start development server
pnpm dev
# or specific app
pnpm dev --filter @filecoin-pay/explorer
```

### 2. Making Changes

1. Make your code changes
2. Run lint: `pnpm lint`
3. Run format: `pnpm format`
4. Run tests: `pnpm test`
5. Fix any issues
6. Commit changes (see [git-instructions.md](git-instructions.md))

### 3. Before Creating PR

```bash
# Ensure everything builds
pnpm build

# Run full test suite
pnpm test

# Check types
pnpm type-check

# Lint and format
pnpm lint
pnpm format
```

## Testing

### Subgraph Tests (Matchstick)

```bash
cd packages/subgraph
pnpm test
```

### Component Tests

Add tests for all new components:

```
ComponentName.tsx
ComponentName.test.tsx    # Required for new components
```

When editing existing components, add tests in a backwards compatible way.

## Common Issues

### "Cannot find module @filecoin-pay/types"

**Solution:** Build the types package first:
```bash
pnpm build --filter @filecoin-pay/types
```

### "Cannot find module @filecoin-pay/ui"

**Solution:** This shouldn't happen as `@filecoin-pay/ui` exports source directly. Check that:
```bash
# Ensure dependencies are installed
pnpm install

# Check if the ui package exists
ls packages/ui/src
```

### Changes to subgraph schema not reflected

**Solution:** Rebuild types package:
```bash
cd packages/types
pnpm build
cd ../..
```

### Linting errors

**Solution:** Run auto-fix:
```bash
pnpm lint
```

## Tech Stack Reference

- **Runtime**: Node.js >= 22, pnpm >= 9
- **Monorepo**: Turbo for task orchestration
- **Linting/Formatting**: Biome (not ESLint or Prettier)
- **Frontend**: React 19, Tailwind CSS v4, @tanstack/react-query
- **Web3**: wagmi, viem, ethers, rainbowkit
- **Subgraph**: The Graph Protocol, AssemblyScript, Matchstick testing

## Useful Turbo Filters

```bash
# Run command for specific package
pnpm <command> --filter @filecoin-pay/explorer

# Run command for multiple packages
pnpm <command> --filter @filecoin-pay/types --filter @filecoin-pay/ui

# Run command for all packages except one
pnpm <command> --filter=!@filecoin-pay/subgraph
```
