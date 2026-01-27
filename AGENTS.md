# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Project Overview

See @README for project overview and @package.json for available npm commands for this project.

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

## Additional Instructions

- Project structure and organization @docs/project-structure.md
- Component development and testing guidelines @docs/component-guidelines.md
- Git workflow @docs/git-instructions.md
