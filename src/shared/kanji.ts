// 漢字データと合体表。合体の式はゲーム上のルールであり、字源の説明ではない。

export interface KanjiDef {
  ch: string;
  strokes: number;
  /** 図鑑の短い説明 */
  note: string;
}

/** 落ちてくる基本の字 */
export const BASE: KanjiDef[] = [
  { ch: "木", strokes: 4, note: "立ち木の形。" },
  { ch: "日", strokes: 4, note: "お日さま。" },
  { ch: "月", strokes: 4, note: "三日月の形。" },
  { ch: "人", strokes: 2, note: "人が立つ姿。" },
  { ch: "女", strokes: 3, note: "おんな。" },
  { ch: "子", strokes: 3, note: "こども。" },
  { ch: "田", strokes: 5, note: "区切られた田んぼ。" },
  { ch: "力", strokes: 2, note: "ちから。" },
  { ch: "火", strokes: 4, note: "燃える炎。" },
  { ch: "言", strokes: 7, note: "ことば。" },
  { ch: "山", strokes: 3, note: "連なる山。" },
  { ch: "石", strokes: 5, note: "がけ下の石。" },
  { ch: "土", strokes: 3, note: "つち。" },
  { ch: "生", strokes: 5, note: "芽が生える。" },
  { ch: "白", strokes: 5, note: "しろ。" },
  { ch: "水", strokes: 4, note: "流れる水。" },
  { ch: "糸", strokes: 6, note: "より合わせた糸。" },
  { ch: "心", strokes: 4, note: "こころ。" },
  { ch: "立", strokes: 5, note: "地面に立つ人。" },
  { ch: "目", strokes: 5, note: "め。" },
  { ch: "口", strokes: 3, note: "くち。" },
  { ch: "王", strokes: 4, note: "おう。" },
  { ch: "耳", strokes: 6, note: "みみ。" },
  { ch: "十", strokes: 2, note: "じゅう。" },
  { ch: "金", strokes: 8, note: "かね、こがね。" },
  { ch: "門", strokes: 8, note: "両開きのもん。" },
  { ch: "雨", strokes: 8, note: "空から降るあめ。" },
  { ch: "竹", strokes: 6, note: "まっすぐなたけ。" },
  { ch: "牛", strokes: 4, note: "うし。" },
  { ch: "貝", strokes: 7, note: "かい。昔はお金だった。" },
  { ch: "米", strokes: 6, note: "こめ。" },
];

/** 合体でだけ作れる字。parts は合体する2字（順不同）。 */
export const MERGED: (KanjiDef & { parts: [string, string] })[] = [
  { ch: "林", strokes: 8, parts: ["木", "木"], note: "木が並ぶとはやし。" },
  { ch: "森", strokes: 12, parts: ["林", "木"], note: "さらに木が増えてもり。" },
  { ch: "明", strokes: 8, parts: ["日", "月"], note: "日と月であかるい。" },
  { ch: "昌", strokes: 8, parts: ["日", "日"], note: "さかんな様子。" },
  { ch: "晶", strokes: 12, parts: ["昌", "日"], note: "きらめく結晶。" },
  { ch: "休", strokes: 6, parts: ["人", "木"], note: "人が木陰でやすむ。" },
  { ch: "好", strokes: 6, parts: ["女", "子"], note: "すき。" },
  { ch: "男", strokes: 7, parts: ["田", "力"], note: "田で力を出す。" },
  { ch: "炎", strokes: 8, parts: ["火", "火"], note: "燃えさかるほのお。" },
  { ch: "談", strokes: 15, parts: ["炎", "言"], note: "語り合う。" },
  { ch: "焚", strokes: 12, parts: ["林", "火"], note: "たき火をたく。" },
  { ch: "岩", strokes: 8, parts: ["山", "石"], note: "大きな石、いわ。" },
  { ch: "圭", strokes: 6, parts: ["土", "土"], note: "かどのある玉。" },
  { ch: "星", strokes: 9, parts: ["日", "生"], note: "夜空のほし。" },
  { ch: "泉", strokes: 9, parts: ["白", "水"], note: "わき出るいずみ。" },
  { ch: "細", strokes: 11, parts: ["糸", "田"], note: "ほそい。" },
  { ch: "思", strokes: 9, parts: ["田", "心"], note: "おもう。" },
  { ch: "李", strokes: 7, parts: ["木", "子"], note: "すもも。" },
  { ch: "音", strokes: 9, parts: ["立", "日"], note: "おと。" },
  { ch: "意", strokes: 13, parts: ["音", "心"], note: "こころのおもい。" },
  { ch: "出", strokes: 5, parts: ["山", "山"], note: "でる。" },
  { ch: "相", strokes: 9, parts: ["木", "目"], note: "あい、すがた。" },
  { ch: "想", strokes: 13, parts: ["相", "心"], note: "おもいえがく。" },
  { ch: "信", strokes: 9, parts: ["人", "言"], note: "しんじる。" },
  { ch: "畑", strokes: 9, parts: ["火", "田"], note: "はたけ（国字）。" },
  { ch: "東", strokes: 8, parts: ["木", "日"], note: "日がのぼるひがし。" },
  { ch: "朋", strokes: 8, parts: ["月", "月"], note: "なかま。" },
  { ch: "呆", strokes: 7, parts: ["口", "木"], note: "あきれる。" },
  { ch: "加", strokes: 5, parts: ["力", "口"], note: "くわえる。" },
  { ch: "皇", strokes: 9, parts: ["白", "王"], note: "きみ、すめらぎ。" },
  { ch: "姓", strokes: 8, parts: ["女", "生"], note: "みょうじ。" },
  { ch: "性", strokes: 8, parts: ["心", "生"], note: "うまれつき。" },
  { ch: "吉", strokes: 6, parts: ["土", "口"], note: "めでたい。" },
  { ch: "仙", strokes: 5, parts: ["人", "山"], note: "山にすむ仙人。" },
  { ch: "里", strokes: 7, parts: ["田", "土"], note: "さと。" },
  { ch: "如", strokes: 6, parts: ["女", "口"], note: "ごとし。" },
  { ch: "恥", strokes: 10, parts: ["耳", "心"], note: "はじる。" },
  { ch: "柏", strokes: 9, parts: ["白", "木"], note: "かしわ。" },
  { ch: "伯", strokes: 7, parts: ["人", "白"], note: "おじ、かしら。" },
  { ch: "古", strokes: 5, parts: ["十", "口"], note: "ふるい。" },
  { ch: "枯", strokes: 9, parts: ["古", "木"], note: "かれる。" },
  { ch: "早", strokes: 6, parts: ["十", "日"], note: "はやい。" },
  { ch: "旺", strokes: 8, parts: ["王", "日"], note: "さかん。" },
  { ch: "計", strokes: 9, parts: ["言", "十"], note: "はかる。" },
  { ch: "杜", strokes: 7, parts: ["木", "土"], note: "もり、やしろの森。" },
  { ch: "呈", strokes: 7, parts: ["口", "王"], note: "さしだす。" },
  { ch: "聖", strokes: 13, parts: ["耳", "呈"], note: "ひじり、きよらか。" },
  { ch: "位", strokes: 7, parts: ["人", "立"], note: "くらい、立つ場所。" },
  { ch: "理", strokes: 11, parts: ["王", "里"], note: "すじみち。" },
  { ch: "直", strokes: 8, parts: ["十", "目"], note: "まっすぐ。" },
  { ch: "針", strokes: 10, parts: ["金", "十"], note: "はり。" },
  { ch: "間", strokes: 12, parts: ["門", "日"], note: "門のすきまから日が差す、あいだ。" },
  { ch: "問", strokes: 11, parts: ["門", "口"], note: "とう。" },
  { ch: "聞", strokes: 14, parts: ["門", "耳"], note: "きく。" },
  { ch: "閑", strokes: 12, parts: ["門", "木"], note: "しずか、ひま。" },
  { ch: "雷", strokes: 13, parts: ["雨", "田"], note: "かみなり。" },
  { ch: "霜", strokes: 17, parts: ["雨", "相"], note: "しも。" },
  { ch: "箱", strokes: 15, parts: ["竹", "相"], note: "はこ。" },
  { ch: "笠", strokes: 11, parts: ["竹", "立"], note: "かさ。" },
  { ch: "告", strokes: 7, parts: ["牛", "口"], note: "つげる。" },
  { ch: "牲", strokes: 9, parts: ["牛", "生"], note: "いけにえ。" },
  { ch: "賀", strokes: 12, parts: ["貝", "加"], note: "いわう。" },
  { ch: "粒", strokes: 11, parts: ["米", "立"], note: "つぶ。" },
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

/** 字の大きさ（1字ぶんの一辺、m）。画数が多いほど大きい */
export function sizeOf(ch: string): number {
  return 1.0 + kanji(ch).strokes * 0.04;
}
