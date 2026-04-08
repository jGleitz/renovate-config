import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    isolate: false,
    pool: "threads",
    testTimeout: 30_000,
    slowTestThreshold: 5_000,
    silent: "passed-only",
  },
})
