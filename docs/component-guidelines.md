# Component Guidelines

**Build components using `@filecoin-foundation/ui-filecoin` primitives.**

- Use library primitives (buttons, inputs, cards, etc.) as building blocks for complex components
- Check the library first — don't reinvent what already exists
- Follow the library's theming and styling system
- Avoid custom CSS when library primitives can be composed

**Start with primitives, compose up.**

## Testing

Co-locate tests: `Component.tsx` → `Component.test.tsx`. Test user behavior, not implementation. See [code-best-practices.md](code-best-practices.md#testing).

## Explorer App (Next.js 15)

**Server vs Client Components:**
- Default to use of Client Components
- Use Server Components only if explicitly stated

**Data Fetching:**
- Server Components: Fetch directly with native `fetch`
- Client Components: Use `@tanstack/react-query` with proper `staleTime`/`refetchInterval`

**Routing:** File-based in `app/` with `layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`

**Performance:**
- Use `next/image` with width/height specified
- Use `next/dynamic` for heavy components; `ssr: false` for client-only

## Metrics App (Vite + React 19)

- Use `@tanstack/react-query` for all data fetching
- Extract complex logic into custom hooks
- Use `React.lazy` + `Suspense` for code splitting
- Use `memo` to cache the result of an expensive calculations
