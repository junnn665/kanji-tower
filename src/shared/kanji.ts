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
  { ch: "大", strokes: 3, note: "手足を広げた人、おおきい。" },
  { ch: "小", strokes: 3, note: "ちいさい。" },
  { ch: "中", strokes: 4, note: "まんなか。" },
  { ch: "上", strokes: 3, note: "うえ。" },
  { ch: "下", strokes: 3, note: "した。" },
  { ch: "手", strokes: 4, note: "て。" },
  { ch: "足", strokes: 7, note: "あし。" },
  { ch: "車", strokes: 7, note: "くるま。" },
  { ch: "馬", strokes: 10, note: "うま。" },
  { ch: "魚", strokes: 11, note: "さかな。" },
  { ch: "鳥", strokes: 11, note: "とり。" },
  { ch: "虫", strokes: 6, note: "むし。" },
  { ch: "夕", strokes: 3, note: "ゆうがた。" },
  { ch: "川", strokes: 3, note: "流れるかわ。" },
  { ch: "本", strokes: 5, note: "木の根もと、ほん。" },
  { ch: "文", strokes: 4, note: "もよう、ぶん。" },
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
  { ch: "体", strokes: 7, parts: ["人", "本"], note: "からだ。" },
  { ch: "鳴", strokes: 14, parts: ["口", "鳥"], note: "鳥がなく。" },
  { ch: "尖", strokes: 6, parts: ["小", "大"], note: "下が大きく上が小さい、とがる。" },
  { ch: "看", strokes: 9, parts: ["手", "目"], note: "手をかざして見る。" },
  { ch: "多", strokes: 6, parts: ["夕", "夕"], note: "おおい。" },
  { ch: "名", strokes: 6, parts: ["夕", "口"], note: "なまえ。" },
  { ch: "忠", strokes: 8, parts: ["中", "心"], note: "まごころ。" },
  { ch: "紋", strokes: 10, parts: ["文", "糸"], note: "もよう、家のしるし。" },
  { ch: "鉢", strokes: 13, parts: ["金", "本"], note: "はち。" },
  { ch: "嶋", strokes: 14, parts: ["山", "鳥"], note: "しま（島の古い形）。" },
];

export const ALL: KanjiDef[] = [...BASE, ...MERGED];

/** 対戦のおじゃま字：重くて形が悪い。合体せず、記録（画数・字数）にも数えない */
export const JAMA: KanjiDef[] = [
  { ch: "鬱", strokes: 29, note: "おじゃま。" },
  { ch: "龍", strokes: 16, note: "おじゃま。" },
  { ch: "轟", strokes: 21, note: "おじゃま。" },
  { ch: "鷹", strokes: 24, note: "おじゃま。" },
  { ch: "驚", strokes: 22, note: "おじゃま。" },
  { ch: "麗", strokes: 19, note: "おじゃま。" },
];
const JAMA_SET = new Set(JAMA.map((k) => k.ch));
export const isJama = (ch: string) => JAMA_SET.has(ch);

/**
 * 熟語ボーナス：塔の中で、上の字→下の字、または左の字→右の字の順に読んで
 * この熟語になるとボーナス。[熟語, 読み]
 */
export const WORDS: [string, string][] = [
  ["木目", "もくめ"], ["土木", "どぼく"], ["木立", "こだち"], ["日月", "じつげつ"], ["月日", "つきひ"],
  ["明日", "あした"], ["日直", "にっちょく"], ["休日", "きゅうじつ"], ["白日", "はくじつ"], ["日米", "にちべい"],
  ["明月", "めいげつ"], ["人口", "じんこう"], ["人間", "にんげん"], ["人生", "じんせい"], ["人力", "じんりき"],
  ["人心", "じんしん"], ["仙人", "せんにん"], ["男女", "だんじょ"], ["女子", "じょし"], ["男子", "だんし"],
  ["王子", "おうじ"], ["女王", "じょおう"], ["女性", "じょせい"], ["男性", "だんせい"], ["田畑", "たはた"],
  ["水田", "すいでん"], ["火力", "かりょく"], ["水力", "すいりょく"], ["火山", "かざん"], ["火口", "かこう"],
  ["火星", "かせい"], ["火炎", "かえん"], ["山林", "さんりん"], ["山水", "さんすい"], ["岩石", "がんせき"],
  ["生糸", "きいと"], ["白米", "はくまい"], ["白金", "はっきん"], ["明白", "めいはく"], ["告白", "こくはく"],
  ["水星", "すいせい"], ["泉水", "せんすい"], ["雨水", "あまみず"], ["耳目", "じもく"], ["目力", "めぢから"],
  ["金星", "きんせい"], ["雷雨", "らいう"], ["竹林", "ちくりん"], ["森林", "しんりん"], ["林立", "りんりつ"],
  ["明星", "みょうじょう"], ["相談", "そうだん"], ["思想", "しそう"], ["意思", "いし"], ["理想", "りそう"],
  ["出口", "でぐち"], ["出力", "しゅつりょく"], ["吉日", "きちじつ"], ["古米", "こまい"], ["早口", "はやくち"],
  ["十日", "とおか"],
  ["日本", "にほん"], ["本日", "ほんじつ"], ["大人", "おとな"], ["大木", "たいぼく"], ["上下", "じょうげ"],
  ["上手", "じょうず"], ["下手", "へた"], ["中心", "ちゅうしん"], ["大小", "だいしょう"], ["本音", "ほんね"],
  ["手足", "てあし"], ["水中", "すいちゅう"], ["日中", "にっちゅう"], ["夕日", "ゆうひ"], ["大雨", "おおあめ"],
  ["小雨", "こさめ"], ["大金", "たいきん"], ["金魚", "きんぎょ"], ["馬車", "ばしゃ"], ["下車", "げしゃ"],
  ["水車", "すいしゃ"], ["白鳥", "はくちょう"], ["小鳥", "ことり"], ["竹馬", "たけうま"], ["名人", "めいじん"],
  ["本名", "ほんみょう"], ["多大", "ただい"], ["大名", "だいみょう"], ["人体", "じんたい"], ["体力", "たいりょく"],
  ["中間", "ちゅうかん"], ["山川", "さんせん"], ["小川", "おがわ"], ["文中", "ぶんちゅう"], ["本文", "ほんぶん"],
  ["名文", "めいぶん"], ["足下", "あしもと"], ["月下", "げっか"], ["火中", "かちゅう"], ["牛馬", "ぎゅうば"],
  ["中古", "ちゅうこ"], ["古本", "ふるほん"], ["大意", "たいい"], ["中立", "ちゅうりつ"], ["目下", "もっか"],
  ["下水", "げすい"], ["上水", "じょうすい"],
];
const WORD_SET = new Map(WORDS.map(([w, r]) => [w, r]));
export const wordReading = (w: string) => WORD_SET.get(w);

const BY_CH = new Map([...ALL, ...JAMA].map((k) => [k.ch, k]));

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
export const NET_CHARS = [...ALL, ...JAMA].map((k) => k.ch);
export const INDEX = new Map(NET_CHARS.map((ch, i) => [ch, i]));

/** 字の大きさ（1字ぶんの一辺、m）。画数が多いほど大きい */
export function sizeOf(ch: string): number {
  return Math.min(1.75, 1.0 + kanji(ch).strokes * 0.04);
}
