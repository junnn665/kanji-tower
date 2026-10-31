import { kanji, sizeOf } from "./shared/kanji";

/** 塔の1字ぶん（通信・保存・画像にも使う） */
export interface Piece {
  ch: string;
  x: number;
  y: number;
  a: number;
}

export const PLATFORM_HALF = 2.6;
export const PLATFORM_H = 0.5;

const PALETTE = ["#f7d6d0", "#d8e8f6", "#dcefd8", "#f4e6c4", "#e6dcf3", "#d4efec", "#f6dce9"];

export function colorOf(ch: string): string {
  const k = kanji(ch);
  if (k.strokes >= 10) return "#f3c96b";
  return PALETTE[ch.codePointAt(0)! % PALETTE.length];
}

/** 形の頂点（体の中心が原点） */
export function outline(ch: string): [number, number][] {
  const { w, h } = sizeOf(ch);
  if (kanji(ch).shape === "tri") {
    // 重心を原点に合わせる
    return [
      [-w / 2, -h / 3],
      [w / 2, -h / 3],
      [0, (2 * h) / 3],
    ];
  }
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
}

export interface PieceStyle {
  alpha?: number;
  glow?: boolean;
  flash?: number; // 0..1 合体直後の白い光
}

/** ctx は「1単位 = 1m、y が上向き」に変換済みであること */
export function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, style: PieceStyle = {}) {
  const pts = outline(p.ch);
  const { w, h } = sizeOf(p.ch);
  const tri = kanji(p.ch).shape === "tri";
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.a);
  ctx.globalAlpha = style.alpha ?? 1;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  if (style.glow) {
    ctx.shadowColor = "#ffb300";
    ctx.shadowBlur = 18;
  }
  ctx.fillStyle = colorOf(p.ch);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineJoin = "round";
  ctx.lineWidth = style.glow ? 0.09 : 0.045;
  ctx.strokeStyle = style.glow ? "#ffb300" : "#3a2f2a";
  ctx.stroke();
  if (style.flash) {
    ctx.fillStyle = `rgba(255,255,255,${style.flash})`;
    ctx.fill();
  }
  // 文字（y を戻して描く）
  const size = Math.min(w, h) * (tri ? 0.62 : 0.8);
  ctx.scale(1, -1);
  ctx.fillStyle = "#231c18";
  ctx.font = `700 ${size}px "Noto Serif JP", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(p.ch, 0, tri ? -h * 0.02 : size * 0.04);
  ctx.restore();
}

export function drawPlatform(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#5b4636";
  ctx.beginPath();
  ctx.roundRect(-PLATFORM_HALF, -PLATFORM_H, PLATFORM_HALF * 2, PLATFORM_H, 0.08);
  ctx.fill();
  ctx.fillStyle = "#7a5f49";
  ctx.fillRect(-PLATFORM_HALF, -0.12, PLATFORM_HALF * 2, 0.12);
  // 支柱
  ctx.fillStyle = "#4a392c";
  ctx.fillRect(-0.6, -40, 1.2, 40 - PLATFORM_H);
}

/**
 * 塔を枠いっぱいに描く（相手の塔・結果画像用）。
 * minHeight は見える高さの最低値（m）。
 */
export function drawTowerFit(
  ctx: CanvasRenderingContext2D,
  pieces: Piece[],
  box: { x: number; y: number; w: number; h: number },
  minHeight = 6,
) {
  const top = Math.max(minHeight, ...pieces.map((p) => p.y + 1.2));
  const spanW = Math.max(PLATFORM_HALF * 2 + 1.5, ...pieces.map((p) => Math.abs(p.x) * 2 + 2));
  const scale = Math.min(box.w / spanW, box.h / (top + 1));
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.translate(box.x + box.w / 2, box.y + box.h - scale * 1);
  ctx.scale(scale, -scale);
  drawPlatform(ctx);
  for (const p of pieces) drawPiece(ctx, p);
  ctx.restore();
}
