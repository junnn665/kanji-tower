import type { Piece } from "./render";
import { isMode, type Kind, type Mode, type Score } from "./shared/rules";

export interface BestRecord extends Score {
  at: number;
  tower: Piece[];
}

type Bests = Partial<Record<Kind, BestRecord>>;

interface Data {
  discovered: string[];
  /** 難易度ごとの自己ベスト */
  best: Partial<Record<Mode, Bests>>;
  mode: Mode;
  sound: boolean;
  name: string;
  device: string;
}

const KEY = "kanji-tower-v1";

function load(): Data {
  const base: Data = { discovered: [], best: {}, mode: "normal", sound: true, name: "", device: "" };
  try {
    Object.assign(base, JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {
    /* 保存できない環境でも遊べる */
  }
  // 難易度ができる前の自己ベストは「ふつう」に移す
  const old = base.best as Record<string, unknown>;
  if (old.strokes || old.height || old.count) {
    base.best = { normal: { strokes: old.strokes, height: old.height, count: old.count } as Bests };
  }
  if (!isMode(base.mode)) base.mode = "normal";
  if (!base.device) base.device = crypto.randomUUID();
  return base;
}

let data = load();

export const store = {
  get: () => data,
  set(patch: Partial<Data>) {
    data = { ...data, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* noop */
    }
  },
  discover(ch: string): boolean {
    if (data.discovered.includes(ch)) return false;
    store.set({ discovered: [...data.discovered, ch] });
    return true;
  },
  /** 自己ベストを更新した種目を返す */
  submitBest(mode: Mode, s: Score, tower: Piece[]): Kind[] {
    const updated: Kind[] = [];
    const best: Bests = { ...data.best[mode] };
    for (const k of ["strokes", "height", "count"] as Kind[]) {
      if (s[k] > 0 && s[k] > (best[k]?.[k] ?? 0)) {
        best[k] = { ...s, at: Date.now(), tower };
        updated.push(k);
      }
    }
    if (updated.length) store.set({ best: { ...data.best, [mode]: best } });
    return updated;
  },
};
