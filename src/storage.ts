import type { Piece } from "./render";
import type { Kind, Score } from "./shared/rules";

export interface BestRecord extends Score {
  at: number;
  tower: Piece[];
}

interface Data {
  discovered: string[];
  best: Partial<Record<Kind, BestRecord>>;
  sound: boolean;
  name: string;
  device: string;
}

const KEY = "kanji-tower-v1";

function load(): Data {
  const base: Data = { discovered: [], best: {}, sound: true, name: "", device: "" };
  try {
    Object.assign(base, JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {
    /* 保存できない環境でも遊べる */
  }
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
  submitBest(s: Score, tower: Piece[]): Kind[] {
    const updated: Kind[] = [];
    const best = { ...data.best };
    for (const k of ["strokes", "height", "count"] as Kind[]) {
      if (s[k] > 0 && s[k] > (best[k]?.[k] ?? 0)) {
        best[k] = { ...s, at: Date.now(), tower };
        updated.push(k);
      }
    }
    if (updated.length) store.set({ best });
    return updated;
  },
};
