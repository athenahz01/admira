import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next sets jsx:"preserve" in tsconfig; the React plugin provides the JSX
  // transform so component (.tsx) tests render via react-dom/server. Test infra only.
  plugins: [react()],
  test: {
    exclude: [
      "**/.next/**",
      "**/dist/**",
      "**/e2e/**",
      "**/node_modules/**",
    ],
  },
});
