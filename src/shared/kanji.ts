// 漢字データと合体表。合体の式はゲーム上のルールであり、字源の説明ではない。

export type Shape = "sq" | "tall" | "wide" | "tri";

export interface KanjiDef {
  ch: string;
  strokes: number;
  shape: Shape;
  /** 図鑑の短い説明 */
  note: string;
}

/** 落ちてくる基本の字 */
export const BASE: KanjiDef[] = [
  { ch: "木", strokes: 4, shape: "tri", note: "立ち木の形。" },
  { ch: "日", strokes: 4, shape: "tall", note: "お日さま。" },
  { ch: "月", strokes: 4, shape: "tall", note: "三日月の形。" },
  { ch: "人", strokes: 2, shape: "tri", note: "人が立つ姿。" },
  { ch: "女", strokes: 3, shape: "sq", note: "おんな。" },
  { ch: "子", strokes: 3, shape: "tall", note: "こども。" },
  { ch: "田", strokes: 5, shape: "sq", note: "区切られた田んぼ。" },
  { ch: "力", strokes: 2, shape: "sq", note: "ちから。" },
  { ch: "火", strokes: 4, shape: "tri", note: "燃える炎。" },
  { ch: "言", strokes: 7, shape: "tall", note: "ことば。" },
  { ch: "山", strokes: 3, shape: "wide", note: "連なる山。" },
  { ch: "石", strokes: 5, shape: "sq", note: "がけ下の石。" },
  { ch: "土", strokes: 3, shape: "wide", note: "つち。" },
  { ch: "生", strokes: 5, shape: "tall", note: "芽が生える。" },
  { ch: "白", strokes: 5, shape: "sq", note: "しろ。" },
  { ch: "水", strokes: 4, shape: "sq", note: "流れる水。" },
  { ch: "糸", strokes: 6, shape: "tall", note: "より合わせた糸。" },
  { ch: "心", strokes: 4, shape: "wide", note: "こころ。" },
  { ch: "立", strokes: 5, shape: "wide", note: "地面に立つ人。" },
  { ch: "目", strokes: 5, shape: "tall", note: "め。" },
  { ch: "口", strokes: 3, shape: "sq", note: "くち。" },
  { ch: "王", strokes: 4, shape: "wide", note: "おう。" },
  { ch: "耳", strokes: 6, shape: "tall", note: "みみ。" },
  { ch: "十", strokes: 2, shape: "sq", note: "じゅう。" },
];

/** 合体でだけ作れる字。parts は合体する2字（順不同）。 */
export const MERGED: (KanjiDef & { parts: [string, string] })[] = [
  { ch: "林", strokes: 8, shape: "wide", parts: ["木", "木"], note: "木が並ぶとはやし。" },
  { ch: "森", strokes: 12, shape: "tri", parts: ["林", "木"], note: "さらに木が増えてもり。" },
  { ch: "明", strokes: 8, shape: "wide", parts: ["日", "月"], note: "日と月であかるい。" },
  { ch: "昌", strokes: 8, shape: "tall", parts: ["日", "日"], note: "さかんな様子。" },
  { ch: "晶", strokes: 12, shape: "tri", parts: ["昌", "日"], note: "きらめく結晶。" },
  { ch: "休", strokes: 6, shape: "wide", parts: ["人", "木"], note: "人が木陰でやすむ。" },
  { ch: "好", strokes: 6, shape: "wide", parts: ["女", "子"], note: "すき。" },
  { ch: "男", strokes: 7, shape: "tall", parts: ["田", "力"], note: "田で力を出す。" },
  { ch: "炎", strokes: 8, shape: "tall", parts: ["火", "火"], note: "燃えさかるほのお。" },
  { ch: "談", strokes: 15, shape: "wide", parts: ["炎", "言"], note: "語り合う。" },
  { ch: "焚", strokes: 12, shape: "tall", parts: ["林", "火"], note: "たき火をたく。" },
  { ch: "岩", strokes: 8, shape: "tall", parts: ["山", "石"], note: "大きな石、いわ。" },
  { ch: "圭", strokes: 6, shape: "tall", parts: ["土", "土"], note: "かどのある玉。" },
  { ch: "星", strokes: 9, shape: "tall", parts: ["日", "生"], note: "夜空のほし。" },
  { ch: "泉", strokes: 9, shape: "tall", parts: ["白", "水"], note: "わき出るいずみ。" },
  { ch: "細", strokes: 11, shape: "wide", parts: ["糸", "田"], note: "ほそい。" },
  { ch: "思", strokes: 9, shape: "tall", parts: ["田", "心"], note: "おもう。" },
  { ch: "李", strokes: 7, shape: "tall", parts: ["木", "子"], note: "すもも。" },
  { ch: "音", strokes: 9, shape: "tall", parts: ["立", "日"], note: "おと。" },
  { ch: "意", strokes: 13, shape: "tall", parts: ["音", "心"], note: "こころのおもい。" },
  { ch: "出", strokes: 5, shape: "tall", parts: ["山", "山"], note: "でる。" },
  { ch: "相", strokes: 9, shape: "wide", parts: ["木", "目"], note: "あい、すがた。" },
  { ch: "想", strokes: 13, shape: "tall", parts: ["相", "心"], note: "おもいえがく。" },
  { ch: "信", strokes: 9, shape: "wide", parts: ["人", "言"], note: "しんじる。" },
  { ch: "畑", strokes: 9, shape: "wide", parts: ["火", "田"], note: "はたけ（国字）。" },
  { ch: "東", strokes: 8, shape: "sq", parts: ["木", "日"], note: "日がのぼるひがし。" },
  { ch: "朋", strokes: 8, shape: "wide", parts: ["月", "月"], note: "なかま。" },
  { ch: "呆", strokes: 7, shape: "tall", parts: ["口", "木"], note: "あきれる。" },
  { ch: "加", strokes: 5, shape: "wide", parts: ["力", "口"], note: "くわえる。" },
  { ch: "皇", strokes: 9, shape: "tall", parts: ["白", "王"], note: "きみ、すめらぎ。" },
  { ch: "姓", strokes: 8, shape: "wide", parts: ["女", "生"], note: "みょうじ。" },
  { ch: "性", strokes: 8, shape: "wide", parts: ["心", "生"], note: "うまれつき。" },
  { ch: "吉", strokes: 6, shape: "tall", parts: ["土", "口"], note: "めでたい。" },
  { ch: "仙", strokes: 5, shape: "wide", parts: ["人", "山"], note: "山にすむ仙人。" },
  { ch: "里", strokes: 7, shape: "tall", parts: ["田", "土"], note: "さと。" },
  { ch: "如", strokes: 6, shape: "wide", parts: ["女", "口"], note: "ごとし。" },
  { ch: "恥", strokes: 10, shape: "wide", parts: ["耳", "心"], note: "はじる。" },
  { ch: "柏", strokes: 9, shape: "wide", parts: ["白", "木"], note: "かしわ。" },
  { ch: "伯", strokes: 7, shape: "wide", parts: ["人", "白"], note: "おじ、かしら。" },
  { ch: "古", strokes: 5, shape: "tall", parts: ["十", "口"], note: "ふるい。" },
  { ch: "枯", strokes: 9, shape: "wide", parts: ["古", "木"], note: "かれる。" },
  { ch: "早", strokes: 6, shape: "tall", parts: ["十", "日"], note: "はやい。" },
  { ch: "旺", strokes: 8, shape: "wide", parts: ["王", "日"], note: "さかん。" },
  { ch: "計", strokes: 9, shape: "wide", parts: ["言", "十"], note: "はかる。" },
];

export const ALL: KanjiDef[] = [...BASE, ...MERGED];
const BY_CH = new Map(ALL.map((k) => [k.ch, k]));

export function kanji(ch: string): KanjiDef {
  const k = BY_CH.get(ch);
  if (!k) throw new Error(`unknown kanji ${ch}`);
  return k;
}

const pairKey = (a: string, b: string) => (a < b ? a + b : b + a);
const RECIPES = new Map(MERGED.map((m) => [pairKey(m.parts[0], m.parts[1]), m.ch]));

/** 2字が合体できれば結果の字を返す */
export function mergeOf(a: string, b: string): string | undefined {
  return RECIPES.get(pairKey(a, b));
}

/** 字の数字ID（通信を小さくするため） */
export const INDEX = new Map(ALL.map((k, i) => [k.ch, i]));

/** 字の大きさ（m）。画数が多いほど大きい */
export function sizeOf(ch: string): { w: number; h: number } {
  const k = kanji(ch);
  const s = 0.9 + k.strokes * 0.035;
  switch (k.shape) {
    case "tall":
      return { w: s * 0.72, h: s * 1.12 };
    case "wide":
      return { w: s * 1.3, h: s * 0.74 };
    case "tri":
      return { w: s * 1.25, h: s * 1.0 };
    default:
      return { w: s, h: s };
  }
}
