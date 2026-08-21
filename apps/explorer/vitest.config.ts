import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(import.meta.dirname, "src"),
    },
  },
  test: {
    name: "explorer",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
  },
});
