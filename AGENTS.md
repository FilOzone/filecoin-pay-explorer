# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Quick Reference

- **Project setup and commands**: See [README.md](README.md)
- **Tech stack**: React 19, Next.js 15, Vite, Tailwind CSS v4, @tanstack/react-query, wagmi, The Graph
- **Package manager**: pnpm >= 9
- **Linting/Formatting**: Biome (not ESLint or Prettier)

## Essential Workflow

### 1. Build Dependencies

Before running apps, build the types package:

```bash
pnpm build --filter @filecoin-pay/types
```

**Note:** `@filecoin-pay/ui` exports source directly (no build needed).

See [development-workflow.md](docs/development-workflow.md) for details.

### 2. After Making Changes

**CRITICAL:** Always run these commands after code changes:

```bash
pnpm lint      # Auto-fix linting issues
pnpm format    # Format code with Biome
pnpm test      # Run test suite
```

Pre-commit hooks enforce this, but run manually during development.

### 3. Before Committing

Ensure all checks pass:

```bash
pnpm build && pnpm test && pnpm type-check && pnpm lint && pnpm format
```

## Documentation

- **Architecture & build process**: [docs/development-workflow.md](docs/development-workflow.md)
- **Project structure**: [docs/project-structure.md](docs/project-structure.md)
- **Component development**: [docs/component-guidelines.md](docs/component-guidelines.md)
- **Git workflow**: [docs/git-instructions.md](docs/git-instructions.md)

## Key Conventions

### UI Development

- **Primary UI library**: `@filecoin-foundation/ui-filecoin`
- **Build complex components** from library primitives
- **Framework**: Follow Next.js App Router best practices for explorer and metrics apps
- **Testing**: Always add tests for new components

### Code Quality

- Use Biome (configured via `biome.json`)
- No ESLint or Prettier
- Pre-commit hooks run automatically via husky + lint-staged

### Subgraph

- **Location**: `packages/subgraph/`
- **Schema**: `schemas/schema.v1.graphql`
- **Testing**: Matchstick framework
- **After schema changes**: Rebuild `@filecoin-pay/types` package

## Common Commands

```bash
# Development
pnpm dev                                    # Run all apps
pnpm dev --filter @filecoin-pay/explorer   # Run specific app

# Building
pnpm build                                  # Build everything

# Code quality (run after changes)
pnpm lint                                   # Lint and fix
pnpm format                                 # Format code
pnpm test                                   # Run tests
pnpm type-check                             # TypeScript check

# Cleanup
pnpm clean                                  # Remove build artifacts
```

## Important Notes

- **Data flow**: Smart contract → Subgraph → Frontend (via GraphQL)
- **Types package**: Auto-generated from subgraph schema via graphql-codegen
- **Environment variables**: See [README.md](README.md#2-configure-environment-variables)
- **Monorepo**: Uses Turbo for task orchestration

For detailed information, refer to the documentation files linked above.
