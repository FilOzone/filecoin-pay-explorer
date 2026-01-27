# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Stack & Tools

- **Tech**: React 19, Next.js 15 (App Router), Vite, Tailwind CSS v4, @tanstack/react-query, wagmi, Subgraphs
- **Package manager**: pnpm >= 9
- **Linting/Formatting**: Biome only (no ESLint/Prettier)
- **UI library**: `@filecoin-foundation/ui-filecoin`

## Commands

```bash
# Build types first (required before running apps)
pnpm build --filter @filecoin-pay/types

# Development
pnpm dev                                    # All apps
pnpm dev --filter @filecoin-pay/explorer   # Specific app

# After changes (ALWAYS run these)
pnpm lint && pnpm format && pnpm test

# Before committing
pnpm build && pnpm test && pnpm type-check && pnpm lint && pnpm format

# Cleanup
pnpm clean
```

## Architecture

- **Data flow**: Smart contract → Subgraph → Frontend (GraphQL)
- **Types**: Auto-generated from subgraph schema via graphql-codegen
- **Subgraph**: `packages/subgraph/`, schema at `schemas/schema.v1.graphql`, tested with Matchstick
- **Monorepo**: Turbo for task orchestration

**Note**: `@filecoin-pay/ui` exports source directly (no build needed). Rebuild types after schema changes.

## Docs

- [README.md](README.md) — Project setup, commands & environment variables
- [docs/code-best-practices.md](docs/code-best-practices.md) — Code quality & testing standards
- [docs/component-guidelines.md](docs/component-guidelines.md) — Component development
- [docs/git-instructions.md](docs/git-instructions.md) — Git workflow
