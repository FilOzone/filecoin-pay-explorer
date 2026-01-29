# Code Best Practices

## Core Principles

- Write straightforward code; avoid over-engineering. Favor simple solutions over complex ones.
- Prioritize clarity and readability over brevity.
- Throw descriptive errors; validate inputs early; no silent failures.
- Follow single responsibility principle. Functions and components should do one thing well.
- Keep components and functions small and focused.
- Abstract repeated logic into reusable functions/hooks.
- Avoid premature optimization or features.
- Write correct code first, then measure and optimize if needed.

## Naming

- **Functions**: Verbs (`getUserById`, `formatDate`)
- **Booleans**: Prefixes (`isActive`, `hasPermission`)
- **Constants**: `UPPER_SNAKE_CASE`
- **Components**: `PascalCase`

## Comments

Only comment to explain **why**, not **what**. Prefer self-documenting code with descriptive names.

## TypeScript

- Avoid `any` — use `unknown` if type is truly unknown
- Define interfaces for data structures
- Enable strict mode

## Testing

**Always write tests for new code.** Co-locate: `Component.tsx` → `Component.test.tsx`

- **Test whole values** — Assert complete arrays/objects, not individual items/properties
- **Test behavior, not implementation** — Focus on output, not internal state
- **Preserve existing tests** — Only modify if requirements changed

Use `expect.any()` for non-deterministic values (dates, IDs).
