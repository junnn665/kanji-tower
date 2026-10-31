import { store } from "./storage";

let ac: AudioContext | null = null;

type Kind = "tick" | "drop" | "land" | "merge" | "fall" | "end" | "win" | "word" | "jama";

const TONES: Record<Kind, [number, number, number, OscillatorType][]> = {
  // [周波数, 開始秒, 長さ, 波形]
  tick: [[880, 0, 0.04, "square"]],
  drop: [[520, 0, 0.06, "triangle"]],
  land: [[180, 0, 0.08, "sine"]],
  merge: [
    [660, 0, 0.09, "triangle"],
    [990, 0.08, 0.14, "triangle"],
  ],
  fall: [
    [300, 0, 0.15, "sawtooth"],
    [180, 0.12, 0.3, "sawtooth"],
  ],
  end: [[440, 0, 0.25, "sine"]],
  word: [
    [784, 0, 0.1, "triangle"],
    [988, 0.09, 0.1, "triangle"],
    [1319, 0.18, 0.22, "triangle"],
  ],
  jama: [
    [140, 0, 0.18, "square"],
    [110, 0.14, 0.25, "square"],
  ],
  win: [
    [523, 0, 0.12, "triangle"],
    [659, 0.12, 0.12, "triangle"],
    [784, 0.24, 0.3, "triangle"],
  ],
};

export function sfx(kind: Kind) {
  if (!store.get().sound) return;
  try {
    ac ??= new AudioContext();
    if (ac.state === "suspended") void ac.resume();
    const t0 = ac.currentTime;
    for (const [f, start, len, type] of TONES[kind]) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + start);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + len);
      o.connect(g).connect(ac.destination);
      o.start(t0 + start);
      o.stop(t0 + start + len + 0.02);
    }
  } catch {
    /* 音が出せない環境では何もしない */
  }
}

/** スマホを震わせる（対応している端末だけ。iPhone の Safari は未対応） */
export function buzz(pattern: number | number[]) {
  if (!store.get().vibrate) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 震えない端末では何もしない */
  }
}
