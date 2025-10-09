# @filecoin-pay/ui

Shared UI library for the Filecoin Pay monorepo.

- Tailwind CSS v4 (via `@tailwindcss/postcss`)
- shadcn components (Radix UI + class-variance-authority)
- Theming with `next-themes`
- Exports via package.json `exports` map

## Usage

Import global styles in your app entry (already done in Explorer):
```ts
import "@filecoin-pay/ui/globals.css";
```

Consume components and utilities:
```tsx
import { Button } from "@filecoin-pay/ui/components/button";
import { ThemeProvider } from "@filecoin-pay/ui/components/theme-provider";
import { cn } from "@filecoin-pay/ui/lib/utils";
```

## Adding shadcn components
From this package directory:
```sh
pnpm dlx shadcn@latest add button
```
Components will be generated under `src/components/` and are exported through the `exports` map.

## Development
This package is consumed via pnpm workspaces. Build or type-check from the repo root:
```sh
pnpm build
pnpm type-check
```

## Notes
- Apps re-use PostCSS settings by re-exporting `@filecoin-pay/ui/postcss.config`.
- Design tokens and CSS variables live in `src/styles/globals.css`.
