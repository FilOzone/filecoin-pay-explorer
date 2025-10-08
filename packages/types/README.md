# @filecoin-pay/types

Shared TypeScript types for the Filecoin Pay Explorer monorepo, auto-generated from the subgraph GraphQL schema.

## Usage

```typescript
import { PaymentsMetric, Token, Rail } from "@filecoin-pay/types";
```

## Generation

Types are automatically generated from the subgraph schema during build:

```bash
pnpm generate  # Generate types from GraphQL schema
pnpm build     # Generate types and compile TypeScript
```

## Dependencies

This package depends on the subgraph schema at `packages/subgraph/schemas/schema.v1.graphql`.
Types are regenerated whenever the schema changes.
