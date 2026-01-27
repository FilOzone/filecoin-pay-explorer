# Project Structure

This document outlines the project structure and organization conventions for the Filecoin Pay Explorer monorepo.

## Monorepo Overview

```
filecoin-pay-explorer/
├── apps/
│   ├── explorer/          # Next.js App Router application
│   └── metrics/           # Vite + React application
├── packages/
│   ├── configs/           # Shared configurations (Biome, TypeScript, etc.)
│   ├── subgraph/          # The Graph Protocol subgraph
│   ├── types/             # Generated TypeScript types from subgraph schema
│   └── ui/                # Shared UI components library
└── docs/                  # Project documentation
```

## Explorer App (Next.js)

The explorer app uses Next.js App Router with the `src` directory pattern.

### Directory Structure

```
apps/explorer/
├── public/                # Static assets served at root
├── src/
│   ├── app/              # App Router - routes and layouts
│   │   ├── layout.tsx    # Root layout (wraps all pages)
│   │   ├── page.tsx      # Home page (/)
│   │   ├── accounts/     # /accounts route
│   │   ├── operators/    # /operators route
│   │   ├── rails/        # /rails route
│   │   └── console/      # /console route
│   ├── components/       # React components
│   │   ├── shared/       # Shared components across routes
│   │   ├── Home/         # Home page components
│   │   ├── Accounts/     # Accounts page components
│   │   ├── Account/      # Account detail components
│   │   ├── Operators/    # Operators page components
│   │   ├── Operator/     # Operator detail components
│   │   ├── Rails/        # Rails page components
│   │   ├── Rail/         # Rail detail components
│   │   └── UserConsole/  # User console components
│   ├── services/         # External service integrations
│   │   ├── graphql/      # GraphQL client and queries
│   │   └── wagmi/        # Wagmi/Web3 configuration
│   ├── hooks/            # Custom React hooks
│   ├── utils/            # Utility functions
│   ├── constants/        # Application constants
│   ├── abi/              # Smart contract ABIs
│   ├── fonts/            # Custom fonts
│   ├── assets/           # Images, icons, etc.
│   └── styles/           # Global styles
├── next.config.js        # Next.js configuration
├── tsconfig.json         # TypeScript configuration
└── package.json
```

### Next.js App Router Conventions

#### Special Files

These files have special meaning in the `app` directory:

| File | Purpose | Required |
|------|---------|----------|
| `layout.tsx` | Shared UI for a segment and its children | Yes (root) |
| `page.tsx` | Route UI - makes route publicly accessible | Yes (for routes) |
| `loading.tsx` | Loading UI (wraps in Suspense boundary) | No |
| `error.tsx` | Error UI (wraps in Error boundary) | No |
| `not-found.tsx` | 404 UI for the route segment | No |
| `route.ts` | API endpoint (server-side) | No |
| `template.tsx` | Re-rendered layout variant | No |
| `default.tsx` | Parallel route fallback | No |

#### Rendering Hierarchy

When a route is rendered, files are composed in this order:
1. `layout.tsx` - Persistent across navigations
2. `template.tsx` - New instance on each navigation
3. `error.tsx` - Error boundary wrapper
4. `loading.tsx` - Suspense boundary wrapper
5. `not-found.tsx` - Not found error boundary
6. `page.tsx` - Route content

#### Dynamic Routes

```
app/
├── blog/[slug]/page.tsx              # /blog/my-post (single dynamic segment)
├── shop/[...slug]/page.tsx           # /shop/a/b/c (catch-all segments)
└── docs/[[...slug]]/page.tsx         # /docs or /docs/a/b (optional catch-all)
```

### Organization Strategy

This project follows **Strategy A: Split by Feature with Global Shared**.

```
src/
├── app/                              # Routing only
├── components/
│   ├── shared/                       # Components used across multiple routes
│   └── [Feature]/                    # Feature-specific components
├── services/                         # External integrations (global)
├── hooks/                            # Custom hooks (global)
├── utils/                            # Utility functions (global)
└── constants/                        # Constants (global)
```

#### Component Organization

**Shared Components** (`components/shared/`):
- Used by multiple routes or features
- Generic, reusable UI components
- Built on `@filecoin-foundation/ui-filecoin` primitives

**Feature Components** (`components/[Feature]/`):
- Specific to a single feature or route
- Domain-specific business logic
- Can import from `shared/` but not from other features

**Example:**
```
components/
├── shared/
│   ├── Header/
│   ├── Footer/
│   ├── Card/
│   └── Table/
├── Accounts/
│   ├── AccountsList.tsx
│   ├── AccountsFilters.tsx
│   └── AccountsTable.tsx
└── Account/
    ├── AccountDetails.tsx
    └── AccountTransactions.tsx
```

### Private Folders (Optional)

Use the `_folder` convention to indicate implementation details that should not be routed:

```
app/
├── blog/
│   ├── _components/           # Blog-specific components (not routable)
│   ├── _lib/                  # Blog-specific utilities (not routable)
│   └── page.tsx
```

**Note:** This is optional since colocation is safe by default in Next.js App Router. Only `page.tsx` and `route.ts` files create routes.

### Route Groups (Optional)

Use `(folderName)` to organize routes without affecting the URL structure:

```
app/
├── (marketing)/
│   ├── layout.tsx             # Marketing-specific layout
│   ├── page.tsx               # Home (/)
│   └── about/page.tsx         # /about
└── (dashboard)/
    ├── layout.tsx             # Dashboard-specific layout
    ├── accounts/page.tsx      # /accounts
    └── operators/page.tsx     # /operators
```

## Metrics App (Vite + React)

The metrics app uses Vite with React and follows a simpler structure.

### Directory Structure

```
apps/metrics/
├── public/                # Static assets
├── src/
│   ├── components/        # React components
│   ├── services/
│   │   └── graphql/       # GraphQL client and queries
│   ├── hooks/             # Custom React hooks
│   ├── utils/             # Utility functions
│   ├── config/            # App configuration
│   ├── App.tsx            # Root component
│   └── main.tsx           # Entry point
├── index.html             # HTML template
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript configuration
└── package.json
```

### Component Organization

```
components/
├── layout/                # Layout components (Header, Sidebar, etc.)
├── charts/                # Chart components (using Recharts)
├── metrics/               # Metrics-specific components
└── shared/                # Shared/reusable components
```

## Packages Structure

### Subgraph (`packages/subgraph`)

```
subgraph/
├── schemas/               # GraphQL schema definitions (versioned)
│   └── schema.v1.graphql
├── config/                # Network configurations
│   ├── mainnet.json
│   └── localhost.json
├── templates/             # Mustache templates for subgraph.yaml
├── src/                   # AssemblyScript event handlers
│   ├── mapping.ts
│   └── utils.ts
└── tests/                 # Matchstick test files
```

### Types (`packages/types`)

```
types/
├── src/
│   └── index.ts           # Re-exports generated types
├── generated/             # Auto-generated from subgraph schema
└── codegen.yml            # GraphQL Code Generator config
```

### UI (`packages/ui`)

```
ui/
├── src/
│   ├── components/        # Shared React components
│   └── index.ts           # Exports
└── package.json
```

## Best Practices

### Do's ✅

1. **Choose one organization strategy and be consistent**
   - We use Strategy A (global shared + feature-specific)

2. **Colocate files with their usage**
   - Keep feature-specific components in `components/[Feature]/`
   - Keep shared components in `components/shared/`

3. **Use the `src` directory**
   - Separates source code from configuration files
   - Cleaner root directory

4. **Follow naming conventions**
   - PascalCase for component files and folders
   - camelCase for utilities and services
   - kebab-case for route segments in URLs

5. **Keep components focused**
   - Single responsibility principle
   - Compose from `@filecoin-foundation/ui-filecoin` primitives

### Don'ts ❌

1. **Don't mix organization strategies**
   - Stay consistent across the project

2. **Don't create deep nesting**
   - Max 2-3 levels in components folders
   - Use flatter structures when possible

3. **Don't add `page.tsx` unless you want a public route**
   - In Next.js, only files named `page.tsx` create routes

4. **Don't duplicate components**
   - Check `shared/` and `@filecoin-pay/ui` before creating new components
   - Check `@filecoin-foundation/ui-filecoin` for primitives

5. **Don't bypass the type system**
   - Always use generated types from `@filecoin-pay/types`
   - Don't use `any` unless absolutely necessary

## File Naming Conventions

### Components
```
ComponentName.tsx          # Component implementation
ComponentName.test.tsx     # Component tests
ComponentName.stories.tsx  # Storybook stories (optional)
index.ts                   # Re-exports (if needed)
```

### Utilities
```
utilityName.ts             # Utility implementation
utilityName.test.ts        # Utility tests
```

### Hooks
```
useHookName.ts             # Hook implementation
useHookName.test.ts        # Hook tests
```

### Services
```
serviceName.ts             # Service implementation
serviceName.types.ts       # Service type definitions
```

## Adding New Features

When adding a new feature to the explorer app:

1. **Create the route** in `src/app/feature-name/page.tsx`
2. **Add feature components** in `src/components/FeatureName/`
3. **Add shared components** (if reusable) in `src/components/shared/`
4. **Add feature-specific hooks** in `src/hooks/`
5. **Add utilities** (if needed) in `src/utils/`
6. **Add tests** alongside component files
7. **Update types** if new GraphQL queries are needed

## References

- [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- [Next.js Routing](https://nextjs.org/docs/app/building-your-application/routing)
- [Vite Guide](https://vitejs.dev/guide/)
