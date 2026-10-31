import { BASE, mergeOf } from "./kanji";

export const BATTLE_SECONDS = 90;
/** 1部屋の上限。塔はサーバーがまとめて配るので人数が増えても通信量は一定 */
export const MAX_PLAYERS = 50;
export const NAME_MAX = 12;

export type Mode = "easy" | "normal" | "hard";
export const MODES: Mode[] = ["easy", "normal", "hard"];

export interface ModeDef {
  name: string;
  desc: string;
  /** 台の半分の幅（m） */
  platformHalf: number;
  friction: number;
  angularDamping: number;
  /** 候補3つのうち塔と合体できる字が 0/1/2 個になる割合 */
  fitWeights: [number, number, number];
  /** 合体できる字を金色に光らせ、画数も見せる */
  hints: boolean;
  /** 字の色をぜんぶ同じにする（形だけで見分ける） */
  mono: boolean;
}

export const MODE: Record<Mode, ModeDef> = {
  easy: {
    name: "かんたん",
    desc: "台が広くてすべりにくい。合体できる字が多めに出る",
    platformHalf: 3.3,
    friction: 1.2,
    angularDamping: 1.2,
    fitWeights: [0, 0.5, 0.5],
    hints: true,
    mono: false,
  },
  normal: {
    name: "ふつう",
    desc: "合体できる字は金色に光る",
    platformHalf: 2.6,
    friction: 1.0,
    angularDamping: 0.6,
    fitWeights: [0.25, 0.5, 0.25],
    hints: true,
    mono: false,
  },
  hard: {
    name: "鬼畜",
    desc: "台がせまくてすべりやすい。光るヒント・画数・色なし",
    platformHalf: 2.0,
    friction: 0.7,
    angularDamping: 0.3,
    fitWeights: [0.4, 0.45, 0.15],
    hints: false,
    mono: true,
  },
};

export const isMode = (v: unknown): v is Mode => MODES.includes(v as Mode);

export type Kind = "strokes" | "height" | "count";
export const KINDS: Kind[] = ["strokes", "height", "count"];
export const KIND_LABEL: Record<Kind, string> = {
  strokes: "総画数",
  height: "高さ",
  count: "字数",
};

export interface Score {
  strokes: number;
  /** 高さ（cm、整数） */
  height: number;
  count: number;
}

/** 種目の値、次に他の2つの値で比べる（大きいほど上） */
export function compareScore(kind: Kind, a: Score, b: Score): number {
  const order = [kind, ...KINDS.filter((k) => k !== kind)];
  for (const k of order) if (a[k] !== b[k]) return b[k] - a[k];
  return 0;
}

/** 決まった種から同じ並びを出す乱数（対戦で全員同じ候補にするため） */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

/**
 * 3つの候補を選ぶ。塔と合体できる字が 0/1/2 個になる割合は難易度で変える（ふつうは 25/50/25%）。
 * 出た回数の少ない字を優先する。
 */
export function pickCandidates(
  rand: () => number,
  tower: string[],
  seen: Map<string, number>,
  n = 3,
  weights: [number, number, number] = MODE.normal.fitWeights,
): string[] {
  const bases = BASE.map((b) => b.ch);
  const towerSet = new Set(tower);
  const fits = bases.filter((b) => [...towerSet].some((t) => mergeOf(b, t)));
  const misses = bases.filter((b) => !fits.includes(b));
  const r = rand();
  let want = r < weights[0] ? 0 : r < weights[0] + weights[1] ? 1 : 2;
  want = Math.min(want, fits.length);
  const take = (pool: string[], k: number, out: string[]) => {
    const p = pool.filter((c) => !out.includes(c));
    for (let i = 0; i < k && p.length; i++) {
      const min = Math.min(...p.map((c) => seen.get(c) ?? 0));
      const least = p.filter((c) => (seen.get(c) ?? 0) === min);
      const c = least[Math.floor(rand() * least.length)];
      out.push(c);
      p.splice(p.indexOf(c), 1);
    }
  };
  const out: string[] = [];
  take(fits, want, out);
  take(misses, n - out.length, out);
  if (out.length < n) take(bases, n - out.length, out);
  // 並びもランダムに
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.normalize("NFKC").replace(/[\u0000-\u001f\u007f<>]/g, "").trim();
  const chars = [...s].slice(0, NAME_MAX).join("");
  return chars.length ? chars : null;
}

/** 明らかにおかしい記録をはじく（完全な不正対策ではない） */
export function plausible(s: Score & { playMs: number; drops: number }): boolean {
  const ints = [s.strokes, s.height, s.count, s.playMs, s.drops];
  if (!ints.every((v) => Number.isInteger(v) && v >= 0)) return false;
  if (s.count < 1 || s.count > 200 || s.drops < s.count) return false;
  // 熟語ボーナスがあるので上限はゆるめ
  if (s.strokes > s.count * 80 || s.strokes < s.count * 2) return false;
  if (s.height > s.count * 180 + 200) return false;
  if (s.playMs < s.drops * 250) return false;
  return true;
}
