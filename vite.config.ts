import { defineConfig } from "vite";

// 画面の元は app/index.html。ビルド結果は dist/ に出る。
// GitHub Pages のサブディレクトリーでも動くよう相対パスでビルドする
export default defineConfig({
  root: "app",
  publicDir: "../public",
  envDir: "..",
  base: "./",
  build: { target: "es2022", outDir: "../dist", emptyOutDir: true },
  server: { host: "127.0.0.1", fs: { allow: [".."] } },
});
