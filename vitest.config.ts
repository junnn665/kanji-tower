import { defineConfig } from "vitest/config";

// テストはリポジトリの一番上から探す（vite.config.ts の root: "app" を使わない）
export default defineConfig({
  test: { root: ".", include: ["tests/**/*.test.ts"] },
});
