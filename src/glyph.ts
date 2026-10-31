// 漢字の字形から当たり判定を作る。
// 字を 120px 四方のキャンバスに描き、12×12 のマスのうち墨がのっているマスを
// 横・縦につないだ長方形の集まりにする。枠ではなく字の形そのものが積み木になる。
import { ALL, sizeOf } from "./shared/kanji";

export const GLYPH_FONT = '"Noto Serif JP", "Noto Serif CJK JP", "Hiragino Mincho ProN", "Yu Mincho", serif';
export const GLYPH_PX = 100; // 描くときの基準の大きさ（1字 = 100px）
const CANVAS = 120; // 字がはみ出しても切れないよう少し広めに読む
const GRID = 12;
const CELL = CANVAS / GRID;
const FILL = 0.2; // マスのうち墨がこの割合以上なら「ある」とする

/** 1字の当たり判定：中心を原点・y 上向き・m 単位の長方形（cx, cy, 半幅, 半高） */
export type Rect = [number, number, number, number];

const cache = new Map<string, Rect[]>();
let ready: Promise<void> | null = null;

/** 字形のフォントを読み込む（最大 3 秒待つ）。読み込めなければ端末の明朝体で続ける */
export function glyphsReady(): Promise<void> {
  ready ??= (async () => {
    const text = ALL.map((k) => k.ch).join("");
    try {
      await Promise.race([
        document.fonts.load(`900 ${GLYPH_PX}px "Noto Serif JP"`, text),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    } catch {
      /* 端末のフォントで続ける */
    }
    cache.clear();
  })();
  return ready;
}

/** 描画と当たり判定で共通の文字の置き方（原点が字の中心） */
export function setGlyphFont(ctx: CanvasRenderingContext2D) {
  ctx.font = `900 ${GLYPH_PX}px ${GLYPH_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
}

export function glyphRects(ch: string): Rect[] {
  const hit = cache.get(ch);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = cv.height = CANVAS;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  setGlyphFont(ctx);
  ctx.fillStyle = "#000";
  ctx.fillText(ch, CANVAS / 2, CANVAS / 2);
  const data = ctx.getImageData(0, 0, CANVAS, CANVAS).data;

  const on: boolean[][] = [];
  for (let gy = 0; gy < GRID; gy++) {
    on.push([]);
    for (let gx = 0; gx < GRID; gx++) {
      let ink = 0;
      for (let y = gy * CELL; y < (gy + 1) * CELL; y++)
        for (let x = gx * CELL; x < (gx + 1) * CELL; x++) if (data[(y * CANVAS + x) * 4 + 3] > 110) ink++;
      on[gy].push(ink / (CELL * CELL) >= FILL);
    }
  }

  // 横につながったマスを1本に、さらに同じ幅の段を縦につなぐ
  const runs: { x0: number; x1: number; y0: number; y1: number }[] = [];
  let open: typeof runs = [];
  for (let gy = 0; gy < GRID; gy++) {
    const row: { x0: number; x1: number }[] = [];
    for (let gx = 0; gx < GRID; gx++) {
      if (!on[gy][gx]) continue;
      const last = row[row.length - 1];
      if (last && last.x1 === gx) last.x1 = gx + 1;
      else row.push({ x0: gx, x1: gx + 1 });
    }
    const next: typeof runs = [];
    for (const r of row) {
      const prev = open.find((o) => o.x0 === r.x0 && o.x1 === r.x1);
      if (prev) {
        prev.y1 = gy + 1;
        next.push(prev);
      } else {
        const n = { ...r, y0: gy, y1: gy + 1 };
        runs.push(n);
        next.push(n);
      }
    }
    open = next;
  }

  const m = sizeOf(ch) / GLYPH_PX; // px → m
  const rects: Rect[] = runs.map((r) => {
    const cx = ((r.x0 + r.x1) / 2) * CELL - CANVAS / 2;
    const cy = ((r.y0 + r.y1) / 2) * CELL - CANVAS / 2;
    return [cx * m, -cy * m, ((r.x1 - r.x0) / 2) * CELL * m, ((r.y1 - r.y0) / 2) * CELL * m];
  });
  // 万一何も読めなかったときは四角1つ
  if (!rects.length) rects.push([0, 0, sizeOf(ch) * 0.45, sizeOf(ch) * 0.45]);
  cache.set(ch, rects);
  return rects;
}
