import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    // النواة + منطق lib الخالص (format/csv) — لا اختبارات UI (SPEC §16)
    include: ["src/core/**/*.test.ts", "src/lib/**/*.test.ts"],
    passWithNoTests: true,
  },
});
