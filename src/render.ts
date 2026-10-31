import { GLYPH_PX, setGlyphFont } from "./glyph";
import { kanji, sizeOf } from "./shared/kanji";

/** 塔の1字ぶん（通信・保存・画像にも使う） */
export interface Piece {
  ch: string;
  x: number;
  y: number;
  a: number;
}

export const DEFAULT_HALF = 2.6;
export const PLATFORM_H = 0.5;

// 字そのものを塗る色（墨の縁取りで、明るい背景でも読める濃さ）
const PALETTE = ["#e5735f", "#4f8fd0", "#4fae6c", "#d9a032", "#8f6fcf", "#2fa39a", "#d9679d"];

export function colorOf(ch: string): string {
  const k = kanji(ch);
  if (k.strokes >= 10) return "#f0b429";
  return PALETTE[ch.codePointAt(0)! % PALETTE.length];
}

export interface PieceStyle {
  alpha?: number;
  glow?: boolean;
  flash?: number; // 0..1 合体直後の白い光
  /** 鬼畜：色をぜんぶ同じにする */
  mono?: boolean;
}

const MONO = "#7d8a84";

/**
 * 字の形だけを描く（枠なし）。当たり判定と同じ置き方（glyph.ts）で描く。
 * ctx は「1単位 = 1m、y が上向き」に変換済みであること。
 */
export function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, style: PieceStyle = {}) {
  const k = sizeOf(p.ch) / GLYPH_PX;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.a);
  ctx.scale(k, -k);
  ctx.globalAlpha = style.alpha ?? 1;
  setGlyphFont(ctx);
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  if (style.glow) {
    ctx.shadowColor = "#ffb300";
    ctx.shadowBlur = 16;
    ctx.lineWidth = 14;
    ctx.strokeStyle = "#ffc93c";
    ctx.strokeText(p.ch, 0, 0);
    ctx.shadowBlur = 0;
  }
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#1d2321";
  ctx.strokeText(p.ch, 0, 0);
  ctx.fillStyle = style.mono ? MONO : colorOf(p.ch);
  ctx.fillText(p.ch, 0, 0);
  if (style.flash) {
    ctx.fillStyle = `rgba(255,255,255,${style.flash})`;
    ctx.fillText(p.ch, 0, 0);
  }
  ctx.restore();
}

export function drawPlatform(ctx: CanvasRenderingContext2D, PLATFORM_HALF = DEFAULT_HALF) {
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
  opts: { half?: number; mono?: boolean } = {},
) {
  const half = opts.half ?? DEFAULT_HALF;
  const top = Math.max(minHeight, ...pieces.map((p) => p.y + 1.2));
  const spanW = Math.max(half * 2 + 1.5, ...pieces.map((p) => Math.abs(p.x) * 2 + 2));
  const scale = Math.min(box.w / spanW, box.h / (top + 1));
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.translate(box.x + box.w / 2, box.y + box.h - scale * 1);
  ctx.scale(scale, -scale);
  drawPlatform(ctx, half);
  for (const p of pieces) drawPiece(ctx, p, { mono: opts.mono });
  ctx.restore();
}
