import { defineConfig } from "vite";

// GitHub Pages のサブディレクトリーでも動くよう相対パスでビルドする
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  server: { host: "127.0.0.1" },
});
