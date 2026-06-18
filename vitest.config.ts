import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/.next/**",
      "**/dist/**",
      "**/e2e/**",
      "**/node_modules/**",
    ],
  },
});
