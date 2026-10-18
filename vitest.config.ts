import { defineConfig } from "vitest/config";

export default defineConfig({
  // רכיבי React של האתר נבדקים בלי Next.js
  esbuild: { jsx: "automatic" },
});
