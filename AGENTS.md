# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Filecoin Pay Explorer is a TypeScript/React monorepo for the Filecoin Pay ecosystem:
- **apps/explorer**: Next.js 15 web app for exploring Rails, Accounts, and Operators
- **apps/metrics**: Vite + React dashboard for network statistics
- **packages/subgraph**: The Graph subgraph (AssemblyScript) indexing Filecoin Payments contract
- **packages/types**: Auto-generated TypeScript types from GraphQL schema
- **packages/ui**: Shared UI components (Tailwind v4, shadcn/Radix UI)
- **packages/configs**: Shared TypeScript and Biome configurations

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages (required before running apps)
pnpm build

# Build specific packages (types and ui required before explorer)
pnpm build --filter @filecoin-pay/types --filter @filecoin-pay/ui

# Development
pnpm dev                                    # Run all dev servers
pnpm dev --filter @filecoin-pay/explorer    # Explorer only (port 3000)
pnpm dev --filter @filecoin-pay/metrics     # Metrics only (port 5173)

# Code quality
pnpm lint           # Lint all packages
pnpm format         # Format all files
pnpm type-check     # Type check all packages

# Subgraph (from packages/subgraph)
pnpm codegen        # Generate types from schema
pnpm test           # Run Matchstick tests
pnpm test:coverage  # Run tests with coverage
pnpm build          # Build subgraph

# Run single subgraph test file
cd packages/subgraph && graph test <test-name>
```

## Architecture

### Data Flow
1. Filecoin Payments smart contract emits events
2. Subgraph indexes events into GraphQL entities (Rail, Account, Operator, Token)
3. `@filecoin-pay/types` package generates TypeScript types from subgraph schema via graphql-codegen
4. Frontend apps query subgraph via graphql-request with type-safe queries

### Build Dependencies
- Explorer and Metrics apps depend on `@filecoin-pay/types` and `@filecoin-pay/ui`
- Types package depends on subgraph schema (`packages/subgraph/schemas/schema.v1.graphql`)
- Always build types before ui, and both before running apps

### Environment Variables
- Explorer: `NEXT_PUBLIC_GRAPHQL_ENDPOINT` - subgraph GraphQL endpoint
- Metrics: `VITE_GRAPHQL_ENDPOINT` - subgraph GraphQL endpoint

### Tech Stack
- **Runtime**: Node.js >= 22, pnpm >= 9
- **Monorepo**: Turbo for task orchestration
- **Linting/Formatting**: Biome (not ESLint)
- **Frontend**: React 19, Tailwind CSS v4, @tanstack/react-query
- **Web3**: wagmi, viem, ethers, rainbowkit
- **Subgraph**: The Graph Protocol, AssemblyScript, Matchstick for testing

### Subgraph Structure
- `schemas/` - GraphQL schema definitions (versioned)
- `config/` - Network-specific configurations (mainnet, localhost)
- `templates/` - Mustache templates for subgraph.yaml generation
- `src/` - AssemblyScript event handlers
- `tests/` - Matchstick test files

## Code Quality

Pre-commit hooks run Biome automatically via lint-staged. Manual commands:
```bash
biome check --write .     # Lint and fix
biome format --write .    # Format only
```
