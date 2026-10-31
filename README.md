# 合体！漢字タワー

漢字を積んで、触れ合った字を合体させて新しい字を作る、スマホ向けの物理パズル。
ひとりで総画数・高さ・字数を伸ばすモードと、部屋番号で集まって何人でも（最大50人）同時に競うオンライン対戦がある。

- 基本の字 24、合体で作れる字 44（例：木＋木＝林、林＋木＝森、日＋月＝明、炎＋言＝談）
- 合体の式はゲーム上のルールであり、字源の説明ではない

## 遊び方

下の3文字から選び、盤面を指でなぞって離すと落ちる。「回転」で30度ずつ向きを変える。塔と合体できる字は金色に光る。台から字が落ちたら終了。

PC：←→ 移動、↑ 回転、↓ 落とす、1〜3 選択、Space 一時停止、R もう一度、B 図鑑、L ランキング

### みんなで対戦

1. 「みんなで対戦」→ 名前を入れて「部屋を作る」
2. 4桁の部屋番号を伝えるか、「招待リンクを送る」で共有する（リンクを開くと番号が入った状態になる）
3. 部屋主が「対戦を始める」。全員に同じ字が同じ順で出る
4. 90秒で総画数が一番多い人の勝ち。落とした人はその時点の記録で確定
5. 対戦中は上に相手の塔が総画数の順に並び、左に自分の今の順位が出る

## 構成

| 部分 | 置き場所 | 中身 |
| --- | --- | --- |
| ゲーム本体 | GitHub Pages | `src/`（TypeScript + Vite + Planck.js）。静的ファイルだけで動く |
| ランキング API | Cloudflare Workers | `server/worker.ts` の `/api/ranking`・`/api/scores` |
| 記録 | Cloudflare D1 | `server/migrations/` |
| 対戦の部屋 | Cloudflare Durable Objects | `server/worker.ts` の `Room`。WebSocket で部屋ごとに状態を持つ |

サーバーを設定しなくても、ひとり用・図鑑・自己ベスト・画像保存は使える（ランキングと対戦だけが無効になる）。

対戦の通信は、各自が0.5秒ごとに自分の塔を送り、サーバーが0.4秒ごとに変化分を1通にまとめて全員へ配る。人数が増えても1人が受け取る通数は一定。

## 手元で動かす

Node.js 22 以降。

```sh
npm ci
npm run dev            # http://127.0.0.1:5173 （ひとり用だけ）
```

ランキングと対戦も試す場合：

```sh
npm run db:migrate:local
npm run dev:api        # http://127.0.0.1:8787
# 別のターミナルで
echo "VITE_API_BASE=http://127.0.0.1:8787" > .env.development.local
npm run dev
```

同じ Wi-Fi のスマホで試すなら `npm run dev:lan`。

検証：

```sh
npm test
npm run typecheck
npm run build
```

## 公開する

### 1. Cloudflare（ランキング・対戦サーバー）

無料プランで動く（D1、SQLite 版 Durable Objects）。

```sh
npx wrangler login
npx wrangler d1 create kanji-tower      # 表示された database_id を wrangler.jsonc に書く
```

`wrangler.jsonc` の `ALLOWED_ORIGINS` を公開するオリジン（例：`https://your-name.github.io`、パスは含めない）に変えてから：

```sh
npm run db:migrate
npm run deploy:worker                   # 表示された Worker の URL を控える
curl https://<Worker の URL>/health     # {"ok":true} なら OK
```

### 2. GitHub Pages（ゲーム本体）

1. このフォルダーの中身をリポジトリのルートに push する
2. Settings → Pages → Source を「GitHub Actions」にする
3. Settings → Secrets and variables → Actions → Variables に次を追加する
   - `API_BASE`：Worker の URL（末尾のスラッシュなし）
   - `PUBLIC_URL`：ゲームの URL（例：`https://your-name.github.io/kanji-tower/`）
4. main に push すると、テスト・ビルド・公開が走る（`.github/workflows/deploy-pages.yml`）

### 更新

- ゲーム：main に push
- サーバー：`npm run deploy:worker`
- DB の変更：`server/migrations/` に番号を続けたファイルを足して `npm run db:migrate`

## ランキングと保存する情報

- 種目は総画数・高さ・字数。最近90日の上位100件を表示する
- 送信は結果画面で利用者が「ランキングに登録」を押したときだけ
- 公開するのは名前・3つの記録・日時。プレイ時間・落とした回数・端末識別子のハッシュは不正確認のためにだけ保存し、公開しない
- 1端末あたり1分に6件まで。明らかにありえない記録ははじくが、ブラウザーで動くゲームなので改ざんを完全には防げない
- 図鑑・自己ベスト・音の設定・ランダムな端末識別子は端末の localStorage に保存する

## ライセンス

- 物理演算：[Planck.js](https://github.com/piqnt/planck.js)（MIT）
- フォント：Noto Serif JP、Zen Maru Gothic（SIL Open Font License 1.1、Google Fonts から読み込み）

[sasa618/kanji-tower-battle-web](https://github.com/sasa618/kanji-tower-battle-web) と [prefpack](https://junnn665.github.io/prefpack/) を参考に、コードと合体表は独自に作成した。
