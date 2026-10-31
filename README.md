# 合体！漢字タワー

漢字を積んで、触れ合った字を合体させて新しい字を作る、スマホ向けの物理パズル。
ひとりで総画数・高さ・字数を伸ばすモードと、部屋番号で集まって何人でも（最大50人）同時に競うオンライン対戦がある。

- 基本の字 24、合体で作れる字 44（例：木＋木＝林、林＋木＝森、日＋月＝明、炎＋言＝談）
- 字は枠で囲まず、字の形そのものが積み木になる。当たり判定は字形を 12×12 のマスで読み取って作る（`src/glyph.ts`）
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
| 対戦・ランキング | Firebase Realtime Database | prefpack・おでこでお題当て と同じ `odeko-ddb38`。通信は `src/api.ts`、設定は `src/firebase.ts` |

Firebase はランキングか対戦を開いたときに読み込むので、ひとり用はすぐ始まる。つながらなくても、ひとり用・図鑑・自己ベスト・画像保存は使える。

### データの置き場所

ほかのゲームとぶつからないよう、すべて `rooms/kanji-` で始まるキーに置く。

| キー | 中身 |
| --- | --- |
| `rooms/kanji-<部屋番号>` | 部屋（部屋主、状態、回、種、開始・終了時刻）と `players/<id>`（名前、接続中か、状態、記録） |
| `rooms/kanji-<部屋番号>-live` | 対戦中の各自の塔。部屋本体と分けて通信を軽くしている |
| `rooms/kanji-ranking` | 種目ごとの記録。`created` を 9e15 にして、部屋の自動おそうじの対象から外している |

- 作ってから24時間たった `kanji-` の部屋は、次に部屋を作ったときに自動で消える（prefpack の `pref-` やお題当ての部屋には触れない）
- 対戦の終了（時間切れ・全員終了）は部屋主の端末が決める。部屋主が抜けると、いちばん早く入った人が引き継ぐ
- 対戦中の塔は、人数が多いほど送る間隔をあける（0.5秒、50人なら3秒）。1人が受け取る通信量がおさえられる

Firebase のルールは prefpack と同じで、変更は不要：

```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".indexOn": ["created"],
      "$room": { ".write": true }
    }
  }
}
```

## 手元で動かす

Node.js 22 以降。

```sh
npm ci
npm run dev            # http://127.0.0.1:5173
```

同じ Wi-Fi のスマホで試すなら `npm run dev:lan`。対戦・ランキングは本番と同じ Firebase につながる。

検証（対戦とランキングのテストは、Firebase をまねたメモリー上のデータベース `tests/fakeFirebase.ts` で動く）：

```sh
npm test
npm run typecheck
npm run build
```

## 公開する（GitHub Pages）

1. Settings → Pages → Source を「GitHub Actions」にする
2. main に push すると、テスト・ビルド・公開が走る（`.github/workflows/deploy-pages.yml`）
3. `https://junnn665.github.io/kanji-tower/` で遊べる

iPhone は Safari の共有ボタン →「ホーム画面に追加」、Android は Chrome のメニュー →「ホーム画面に追加」で、アイコン付きの全画面アプリとして開ける。

## ホーム画面のアイコン

元絵は `tools/icon.svg`。`public/` の `icon-192.png`・`icon-512.png`（Android 用、丸く切り抜かれても欠けない）と `apple-touch-icon.png`（iPhone 用）は次で作り直せる（Playwright と日本語フォント Noto Serif CJK JP が必要）。

```sh
python3 tools/build-icons.py
```

ホーム画面に追加すると、ブラウザーの枠なしで全画面で開く（`public/manifest.webmanifest`）。

## ランキングと保存する情報

- 種目は総画数・高さ・字数。上位100件を表示し、データベースには各種目200件ほどを残す
- 送信は結果画面で利用者が「ランキングに登録」を押したときだけ。保存するのは名前・3つの記録・日時
- 明らかにありえない記録や連続送信は端末側ではじくが、データベースのルールで制限していないので、改ざんは防げない
- 図鑑・自己ベスト・音の設定・ランダムな端末識別子は端末の localStorage に保存する

## ライセンス

- 物理演算：[Planck.js](https://github.com/piqnt/planck.js)（MIT）
- フォント：Noto Serif JP、Zen Maru Gothic（SIL Open Font License 1.1、Google Fonts から読み込み）

[sasa618/kanji-tower-battle-web](https://github.com/sasa618/kanji-tower-battle-web) と [prefpack](https://junnn665.github.io/prefpack/) を参考に、コードと合体表は独自に作成した。
