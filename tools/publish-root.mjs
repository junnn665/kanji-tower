// dist/ のビルド結果をリポジトリの一番上にもコピーする。
// GitHub Pages が「Deploy from a branch」のままでも、ビルド済みのゲームが公開されるようにするため。
// （「GitHub Actions」に設定していれば、Actions がビルドした dist/ がそのまま公開される）
import { cpSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
if (!existsSync(join(dist, "index.html"))) throw new Error("dist/index.html がありません。先に npm run build してください");

// 前回コピーした assets/ を消してから入れ直す（古いファイルを残さない）
rmSync(join(root, "assets"), { recursive: true, force: true });
for (const name of readdirSync(dist)) cpSync(join(dist, name), join(root, name), { recursive: true });
// Jekyll を通さずにそのまま配信させる
writeFileSync(join(root, ".nojekyll"), "");
console.log("published:", readdirSync(dist).join(", "));
