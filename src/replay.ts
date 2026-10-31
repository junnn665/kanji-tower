// 崩れる瞬間のリプレイ：最後の約8秒（20コマ/秒）を結果画面で再生し、動画に保存する
import { drawPlatform, drawPiece, type Piece } from "./render";
import { sizeOf } from "./shared/kanji";

export interface ReplayOpts {
  half: number;
  mono: boolean;
  title: string;
}

const FPS = 20;

/** すべてのコマが収まる、動かないカメラ */
function camera(frames: Piece[][], w: number, h: number, half: number) {
  let top = 5;
  let span = half * 2 + 1.5;
  for (const f of frames)
    for (const p of f) {
      if (p.y > -2) top = Math.max(top, p.y + sizeOf(p.ch));
      span = Math.max(span, Math.min(16, Math.abs(p.x) * 2 + 2));
    }
  const scale = Math.min(w / span, (h - 60) / (top + 2.2));
  return { scale, ox: w / 2, oy: h - 1.6 * scale };
}

function drawFrame(ctx: CanvasRenderingContext2D, frame: Piece[], cam: ReturnType<typeof camera>, o: ReplayOpts, w: number, h: number, t: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#f6faf4";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#dcebdf";
  ctx.lineWidth = 1;
  const g = cam.scale;
  for (let x = (w / 2) % g; x < w; x += g) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = cam.oy % g; y < h; y += g) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(cam.ox, cam.oy);
  ctx.scale(g, -g);
  drawPlatform(ctx, o.half);
  for (const p of frame) drawPiece(ctx, p, { mono: o.mono });
  ctx.restore();
  // 見出しと進み具合
  ctx.fillStyle = "#1d2321";
  ctx.font = `900 ${Math.round(h * 0.045)}px "Zen Maru Gothic", sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(o.title, w * 0.04, h * 0.03);
  ctx.fillStyle = "#e2412b";
  ctx.fillRect(0, h - 6, w * t, 6);
}

/** canvas でくり返し再生する。止める関数を返す */
export function playReplay(canvas: HTMLCanvasElement, frames: Piece[][], o: ReplayOpts): () => void {
  if (!frames.length) return () => {};
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  const cam = camera(frames, w, h, o.half);
  let i = 0;
  let stop = false;
  let last = 0;
  const tick = (now: number) => {
    if (stop) return;
    requestAnimationFrame(tick);
    if (now - last < 1000 / FPS) return;
    last = now;
    // 最後のコマで1秒止めてから、はじめにもどる
    const k = Math.min(i, frames.length - 1);
    drawFrame(ctx, frames[k], cam, o, w, h, (k + 1) / frames.length);
    i = (i + 1) % (frames.length + FPS);
  };
  requestAnimationFrame(tick);
  return () => {
    stop = true;
  };
}

export const canRecord = () => typeof MediaRecorder !== "undefined" && !!HTMLCanvasElement.prototype.captureStream;

/** リプレイを1回分録画して動画にする（再生と同じ長さだけ時間がかかる） */
export async function recordReplay(frames: Piece[][], o: ReplayOpts): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 960;
  const ctx = canvas.getContext("2d")!;
  const cam = camera(frames, canvas.width, canvas.height, o.half);
  const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error("この端末では動画を作れません");
  const stream = canvas.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  drawFrame(ctx, frames[0], cam, o, canvas.width, canvas.height, 0);
  rec.start();
  const all = [...frames, ...Array(FPS).fill(frames[frames.length - 1])];
  for (let i = 0; i < all.length; i++) {
    drawFrame(ctx, all[i], cam, o, canvas.width, canvas.height, Math.min(1, (i + 1) / frames.length));
    await new Promise((r) => setTimeout(r, 1000 / FPS));
  }
  rec.stop();
  await done;
  const ext = type.startsWith("video/mp4") ? "mp4" : "webm";
  return new File(chunks, `kanji-tower-${Date.now()}.${ext}`, { type: type.split(";")[0] });
}

/** 共有シートで渡す。できなければダウンロード */
export async function saveFile(file: File, text: string) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
