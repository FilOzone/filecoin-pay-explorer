import { readdirSync } from "node:fs";
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig, defineProject } from "vitest/config";

const migrationsDir = path.join(import.meta.dirname, "migrations");
const migrations = (
  await Promise.all(
    readdirSync(migrationsDir)
      .sort()
      .map((d) => readD1Migrations(path.join(migrationsDir, d))),
  )
).flat();

export default defineConfig({
  test: {
    projects: [
      // Node environment — auth tests only (no CF bindings needed)
      defineProject({
        test: {
          name: "node",
          include: ["tests/shared/auth.test.ts", "tests/shared/email-validation.test.ts"],
          environment: "node",
          clearMocks: true,
          restoreMocks: true,
        },
      }),
      // Workers environment — real D1 and KV via miniflare
      defineProject({
        plugins: [
          cloudflareTest({
            wrangler: {
              configPath: "api/wrangler.jsonc",
              environment: "staging",
            },
            miniflare: {
              // Test-only bindings; not declared in the wrangler config
              kvNamespaces: ["TEST_KV"],
              bindings: { TEST_MIGRATIONS: migrations },
            },
          }),
        ],
        test: {
          name: "workers",
          include: ["tests/api/**/*.test.ts", "tests/shared/db/**/*.test.ts", "tests/shared/kv.test.ts"],
          setupFiles: ["tests/apply-migrations.ts"],
          clearMocks: true,
          restoreMocks: true,
          deps: {
            optimizer: {
              ssr: {
                enabled: true,
                // Pre-bundle @dot/log as a nested CJS dep of jsx-email.
                // jsx-email > @dot/log tells Vite to convert only @dot/log (the
                // CJS package that does `class extends EventEmitter`) without
                // trying to bundle jsx-email itself (which uses Node.js built-ins
                // and would fail to resolve in a workers context).
                include: ["jsx-email > @dot/log", "jsx-email > postcss"],
              },
            },
          },
        },
      }),
    ],
  },
});
