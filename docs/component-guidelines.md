# Component Development Guidelines

## UI Library

### Primary UI Library: `@filecoin-foundation/ui-filecoin`

- Use `@filecoin-foundation/ui-filecoin` as the primary UI component library
- Build complex components using primitives from this library
- Avoid creating custom implementations of components that exist in the library
- Follow the library's composition patterns

### Component Composition

When building new components:
1. Start with `@filecoin-foundation/ui-filecoin` primitives
2. Compose them into more complex, domain-specific components
3. Keep components focused and reusable
4. Use the library's theming and styling system

## Testing Requirements

### New Components

- Always add tests for new components
- Test files should be co-located with components (e.g., `Button.tsx` → `Button.test.tsx`)
- Cover key functionality, user interactions, and edge cases

### Existing Components

When modifying existing components:
- Add tests in a backwards compatible way
- Do not break existing test suites
- Add new tests to cover new functionality
- Preserve existing test coverage

## Framework Best Practices

### Explorer App (Next.js)

Follow Next.js best practices:

#### App Router
- Use App Router (app directory) for new routes
- Implement Server Components by default
- Use Client Components ('use client') only when needed for interactivity

#### Data Fetching
- Use native `fetch` with automatic caching
- Implement Server Components for data fetching when possible
- Use `@tanstack/react-query` for client-side data fetching and cache management

#### Performance
- Implement code splitting and lazy loading where appropriate
- Use Next.js Image component for optimized images
- Leverage automatic static optimization

#### Routing
- Use file-based routing in the app directory
- Implement dynamic routes with proper typing
- Use route groups for organization

### Metrics App (Vite + React)

Follow React and Vite best practices:

#### Component Structure
- Use functional components with hooks
- Keep components small and focused
- Separate business logic from presentation

#### Data Fetching
- Use `@tanstack/react-query` for data fetching
- Implement proper loading and error states
- Cache queries appropriately

#### Performance
- Use React.memo for expensive components when needed
- Implement code splitting with React.lazy
- Optimize bundle size with Vite's automatic chunking
