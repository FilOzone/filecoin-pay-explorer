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
      // Node environment — pure logic tests, no CF bindings needed
      defineProject({
        test: {
          name: "node",
          include: [
            "tests/api/auth.test.ts",
            "tests/api/email-validation.test.ts",
            "tests/alert-processor/account.test.ts",
            "tests/alert-processor/alert-content.test.ts",
          ],
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
          include: ["tests/api/kv.test.ts", "tests/api/queries.test.ts", "tests/api/routes.test.ts"],
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
      // Workers environment — alert-processor: D1 + KV + jsx-email (renderAlertEmail)
      defineProject({
        plugins: [
          cloudflareTest({
            wrangler: {
              configPath: "alert-processor/wrangler.jsonc",
              environment: "staging",
            },
            miniflare: {
              // Processor reads/writes notification_log, so migrations must be applied.
              // KV is the processor's own `KV` binding — no separate test namespace.
              bindings: { TEST_MIGRATIONS: migrations },
            },
          }),
        ],
        test: {
          name: "alert-processor",
          include: ["tests/alert-processor/dedup.test.ts", "tests/alert-processor/process-message.integration.test.ts"],
          setupFiles: ["tests/apply-migrations.ts"],
          clearMocks: true,
          restoreMocks: true,
          deps: {
            optimizer: {
              ssr: {
                enabled: true,
                // Same jsx-email nested-CJS handling as the api workers project.
                include: ["jsx-email > @dot/log", "jsx-email > postcss"],
              },
            },
          },
        },
      }),
      // Workers environment — alert-scheduler: D1 + ALERT_QUEUE only (no KV, no jsx-email)
      defineProject({
        plugins: [
          cloudflareTest({
            wrangler: {
              configPath: "alert-scheduler/wrangler.jsonc",
              environment: "staging",
            },
            miniflare: {
              // Scheduler reads subscriptions from D1, so migrations must be applied.
              // No KV: the scheduler has no KV binding.
              bindings: { TEST_MIGRATIONS: migrations },
            },
          }),
        ],
        test: {
          name: "alert-scheduler",
          include: ["tests/alert-scheduler/**/*.test.ts"],
          setupFiles: ["tests/apply-migrations.ts"],
          clearMocks: true,
          restoreMocks: true,
        },
      }),
    ],
  },
});
