import "./style.css";
import { Game } from "./game";
import { glyphsReady } from "./glyph";
import { drawTowerFit, type Piece } from "./render";
import { ALL, BASE, INDEX, MERGED, NET_CHARS, WORDS, isJama, kanji, mergeOf, wordReading } from "./shared/kanji";
import { canRecord, playReplay, recordReplay, saveFile } from "./replay";
import {
  compareScore,
  KIND_LABEL,
  KINDS,
  MAX_PLAYERS,
  MODE,
  MODES,
  normalizeName,
  type Kind,
  type Mode,
  type Score,
} from "./shared/rules";
import qrcode from "qrcode-generator";
import { store } from "./storage";
import { sfx } from "./sound";
import {
  API,
  createRoom,
  getRanking,
  online,
  RoomClient,
  submitScore,
  type RoomState,
  type ServerMsg,
} from "./api";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const GAME_URL = (import.meta.env.VITE_PUBLIC_URL as string | undefined) || location.origin + location.pathname;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmtH = (cm: number) => (cm / 100).toFixed(1);

let game: Game | null = null;

// ---------- 画面 ----------
function show(id: "title" | "play") {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
}

function closeAll() {
  document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((d) => d.close());
}

document.querySelectorAll<HTMLButtonElement>("dialog .close").forEach((b) =>
  b.addEventListener("click", () => b.closest("dialog")!.close()),
);

function setSoundLabel() {
  $("btn-sound").textContent = `音：${store.get().sound ? "オン" : "オフ"}`;
}
$("btn-sound").onclick = () => {
  store.set({ sound: !store.get().sound });
  setSoundLabel();
function setVibeLabel() {
  $("btn-vibe").textContent = `振動：${store.get().vibrate ? "オン" : "オフ"}`;
}
$("btn-vibe").onclick = () => {
  store.set({ vibrate: !store.get().vibrate });
  setVibeLabel();
  if (store.get().vibrate) navigator.vibrate?.(30);
};
setVibeLabel();
// 振動に対応していない端末（iPhone など）ではボタンを出さない
if (!("vibrate" in navigator)) $("btn-vibe").hidden = true;

// ---------- 難易度 ----------
function renderModePick() {
  const cur = store.get().mode;
  const box = $("mode-pick");
  box.innerHTML = "";
  for (const m of MODES) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.mode = m;
    b.textContent = MODE[m].name;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(m === cur));
    b.onclick = () => {
      store.set({ mode: m });
      sfx("tick");
      renderModePick();
    };
    box.append(b);
  }
  $("mode-desc").textContent = MODE[cur].desc;
}
renderModePick();
  sfx("tick");
};
setSoundLabel();
function setVibeLabel() {
  $("btn-vibe").textContent = `振動：${store.get().vibrate ? "オン" : "オフ"}`;
}
$("btn-vibe").onclick = () => {
  store.set({ vibrate: !store.get().vibrate });
  setVibeLabel();
  if (store.get().vibrate) navigator.vibrate?.(30);
};
setVibeLabel();
// 振動に対応していない端末（iPhone など）ではボタンを出さない
if (!("vibrate" in navigator)) $("btn-vibe").hidden = true;

// ---------- 難易度 ----------
function renderModePick() {
  const cur = store.get().mode;
  const box = $("mode-pick");
  box.innerHTML = "";
  for (const m of MODES) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.mode = m;
    b.textContent = MODE[m].name;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(m === cur));
    b.onclick = () => {
      store.set({ mode: m });
      sfx("tick");
      renderModePick();
    };
    box.append(b);
  }
  $("mode-desc").textContent = MODE[cur].desc;
}
renderModePick();

// ---------- ゲームの表示 ----------
function renderHud(g: Game) {
  $("s-strokes").textContent = String(g.now.strokes);
  $("s-height").textContent = fmtH(g.now.height);
  $("s-count").textContent = String(g.now.count);
  const tower = g.pieces().map((p) => p.ch);
  const tray = $("tray");
  tray.innerHTML = "";
  g.candidates.forEach((ch, i) => {
    const b = document.createElement("button");
    const hints = g.def.hints;
    const fit = hints && tower.some((t) => mergeOf(ch, t));
    b.className = `cell${i === g.selected ? " sel" : ""}${fit ? " fit" : ""}`;
    b.innerHTML = `<span class="num">${i + 1}</span>${ch}${hints ? `<span class="st">${kanji(ch).strokes}画</span>` : ""}`;
    b.setAttribute("aria-label", `${ch}${hints ? `（${kanji(ch).strokes}画）` : ""}${fit ? "合体できる" : ""}`);
    b.onclick = () => g.select(i);
    tray.append(b);
  });
  $("btn-pause").textContent = g.paused ? "▶" : "Ⅱ";
  if (g.dropsLeft !== null) {
    $("timer").hidden = false;
    $("timer").textContent = `${g.dropsLeft}字`;
    $("timer").classList.toggle("hurry", g.dropsLeft <= 3);
  }
  const banner = $("banner");
  if (g.paused) {
    banner.hidden = false;
    banner.classList.remove("toast");
    banner.innerHTML = `休憩<small>Space または ▶ で再開</small>`;
  } else if (!battle) banner.hidden = true;
}

function newGame(seed: number, mode: Mode, endsAt?: number, dropLimit?: number): Game {
  game?.destroy();
  const g = new Game($<HTMLCanvasElement>("canvas"), {
    seed,
    mode,
    dropLimit,
    endsAt,
    onChange: renderHud,
    onMerge: (ch) => {
      if (store.discover(ch)) toast(`新しい字「${ch}」を発見！`);
    },
    onWord: (w) => {
      if (store.discoverWord(w)) toast(`新しい熟語「${w}」（${wordReading(w)}）！`);
    },
    isWordKnown: (w) => store.get().words.includes(w),
    onOver: (g) => (battle ? battleOver(g) : soloOver(g)),
    isDiscovered: (ch) => store.get().discovered.includes(ch),
  });
  game = g;
  renderHud(g);
  return g;
}

function toast(text: string) {
  const b = $("banner");
  if (!b.hidden) return;
  b.hidden = false;
  b.classList.add("toast");
  b.innerHTML = `<small>${esc(text)}</small>`;
  setTimeout(() => {
    if (b.classList.contains("toast")) {
      b.hidden = true;
      b.classList.remove("toast");
    }
  }, 1600);
}

$("btn-rotate").onclick = () => game?.rotate();
$("btn-pause").onclick = () => game?.togglePause();
$("btn-quit").onclick = () => {
  if (battle) {
    if (!confirm("対戦をやめて部屋を出ますか？")) return;
    leaveRoom();
  }
  game?.destroy();
  game = null;
  show("title");
};

window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).closest("input")) return;
  if (e.key === "b" || e.key === "B") openDex();
  if (e.key === "l" || e.key === "L") openRank();
  if ((e.key === "r" || e.key === "R") && $<HTMLDialogElement>("dlg-result").open && !battle) $("r-again").click();
});

// ---------- ひとり用 ----------
async function startSolo() {
  await glyphsReady();
  dailyNow = null;
  closeAll();
  battle = null;
  $("timer").hidden = true;
  $("rivals").hidden = true;
  $("btn-pause").hidden = false;
  $("banner").hidden = true;
  show("play");
  newGame((Math.random() * 2 ** 32) >>> 0, store.get().mode);
}
$("btn-solo").onclick = startSolo;

// ---------- 今日のお題 ----------
const DAILY_DROPS = 20;
/** 日本時間の今日（YYYYMMDD） */
const todayKey = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
const dailyBoard = (d: string) => `daily-${d}` as const;
const dailyLabel = (d: string) => `${Number(d.slice(4, 6))}/${Number(d.slice(6, 8))}`;
function dailySeed(d: string) {
  let h = 2166136261;
  for (const c of `kanji-tower:${d}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
let dailyNow: { date: string; practice: boolean } | null = null;

function renderDailyButton() {
  const d = todayKey();
  const rec = store.get().daily[d];
  $("daily-sub").textContent = rec ? `${dailyLabel(d)} 本番 ${rec.strokes}画・練習できます` : `${dailyLabel(d)}・20字で勝負`;
}
renderDailyButton();

async function startDaily() {
  await glyphsReady();
  const date = todayKey();
  dailyNow = { date, practice: !!store.get().daily[date] };
  closeAll();
  battle = null;
  $("rivals").hidden = true;
  $("btn-pause").hidden = false;
  $("banner").hidden = true;
  show("play");
  newGame(dailySeed(date), "normal", undefined, DAILY_DROPS);
  toast(dailyNow.practice ? `今日のお題（${dailyLabel(date)}）練習` : `今日のお題（${dailyLabel(date)}）本番！ 20字で勝負`);
}
$("btn-daily").onclick = startDaily;

interface ResultInfo {
  mode: Mode;
  score: Score;
  tower: Piece[];
  made: string[];
  words: string[];
  playMs: number;
  drops: number;
  replay: Piece[][];
  /** 今日のお題の日付（本番のときだけ） */
  daily?: string;
  practice?: boolean;
}
let lastResult: ResultInfo | null = null;

function resultFrom(g: Game): ResultInfo {
  return {
    mode: g.opts.mode,
    score: { ...g.best },
    tower: g.bestTower,
    made: [...g.made],
    words: [...g.words],
    playMs: g.playMs,
    drops: g.drops,
    replay: g.replay.slice(),
  };
}

function soloOver(g: Game) {
  const score = { ...g.best };
  lastResult = resultFrom(g);
  if (dailyNow) {
    lastResult.daily = dailyNow.date;
    lastResult.practice = dailyNow.practice;
    if (!dailyNow.practice) {
      store.set({ daily: { ...store.get().daily, [dailyNow.date]: { ...score, words: g.words.length } } });
      dailyNow.practice = true;
    }
    renderDailyButton();
    setTimeout(() => openResult([]), 900);
    return;
  }
  const updated = store.submitBest(g.opts.mode, score, g.bestTower);
  setTimeout(() => openResult(updated), 900);
}

// ---------- 結果 ----------
function drawResultImage(
  canvas: HTMLCanvasElement,
  mode: Mode,
  score: Score,
  tower: Piece[],
  made: string[],
  words: string[] = [],
  title = "合体！漢字タワー",
) {
  const ctx = canvas.getContext("2d")!;
  const W = 1200;
  const H = 630;
  ctx.fillStyle = "#f6faf4";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#dcebdf";
  ctx.lineWidth = 2;
  for (let x = 0; x <= W; x += 70) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 70) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#e2412b";
  ctx.beginPath();
  ctx.roundRect(56, 48, 150, 56, 8);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = '900 32px "Zen Maru Gothic", sans-serif';
  ctx.textBaseline = "middle";
  ctx.fillText("合体！", 80, 78);
  ctx.fillStyle = "#1d2321";
  ctx.font = '900 54px "Noto Serif JP", serif';
  ctx.fillText(title.replace("合体！", ""), 220, 78);
  // 難易度のはんこ
  ctx.font = '900 26px "Zen Maru Gothic", sans-serif';
  const label = MODE[mode].name;
  const lw = ctx.measureText(label).width + 28;
  ctx.fillStyle = mode === "hard" ? "#e2412b" : "#1d2321";
  ctx.beginPath();
  ctx.roundRect(60, 118, lw, 44, 8);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(label, 74, 141);
  const rows: [string, string, string][] = [
    ["総画数", String(score.strokes), "画"],
    ["高さ", fmtH(score.height), "m"],
    ["字数", String(score.count), "字"],
  ];
  rows.forEach(([label, v, unit], i) => {
    const y = 200 + i * 110;
    ctx.font = '700 30px "Zen Maru Gothic", sans-serif';
    ctx.fillStyle = "#55625c";
    ctx.fillText(label, 60, y);
    ctx.font = '900 84px "Noto Serif JP", serif';
    ctx.fillStyle = "#1d2321";
    ctx.fillText(v, 200, y);
    const w = ctx.measureText(v).width;
    ctx.font = '700 32px "Zen Maru Gothic", sans-serif';
    ctx.fillText(unit, 210 + w, y + 14);
  });
  if (made.length) {
    ctx.font = '700 34px "Noto Serif JP", serif';
    ctx.fillStyle = "#23466e";
    const line = made.slice(0, 12).join(" ") + (made.length > 12 ? " …" : "");
    ctx.fillText(line, 60, 560);
  }
  if (words.length) {
    ctx.font = '900 34px "Noto Serif JP", serif';
    ctx.fillStyle = "#a06f00";
    ctx.fillText(`熟語 ${words.slice(0, 6).join("・")}${words.length > 6 ? " …" : ""}`, 60, 500);
  }
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#1d2321";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(700, 40, 460, 550, 16);
  ctx.fill();
  ctx.stroke();
  drawTowerFit(ctx, tower, { x: 710, y: 50, w: 440, h: 530 }, 6, { half: MODE[mode].platformHalf, mono: MODE[mode].mono });
}

function openResult(updated: Kind[] = []) {
  if (!lastResult) return;
  const { mode, score, tower, made } = lastResult;
  const over = game?.overReason === "fall" ? "落ちた！" : game?.overReason === "limit" ? "20字おわり！" : "記録";
  const tag = lastResult.daily
    ? `今日のお題 ${dailyLabel(lastResult.daily)}${lastResult.practice ? "（練習）" : "（本番）"}`
    : MODE[mode].name;
  $("r-title").innerHTML = `${over} <small>${tag}</small>`;
  $("r-battle").innerHTML = "";
  $("r-scores").innerHTML = KINDS.map(
    (k) =>
      `<div>${updated.includes(k) ? '<span class="new">自己ベスト！</span>' : ""}<b>${
        k === "height" ? fmtH(score[k]) : score[k]
      }</b><small>${KIND_LABEL[k]}${k === "height" ? " m" : ""}</small></div>`,
  ).join("");
  $("r-made").textContent = made.length ? `作った字：${made.join("")}` : "";
  $("r-words").textContent = lastResult.words.length ? `熟語：${lastResult.words.join("・")}` : "";
  stopReplay?.();
  stopReplay = null;
  $("r-replay").hidden = true;
  $("r-image").hidden = false;
  $("r-replay-btn").textContent = "リプレイ";
  $<HTMLButtonElement>("r-replay-btn").disabled = !lastResult.replay.length;
  $<HTMLButtonElement>("r-video").hidden = !canRecord() || !lastResult.replay.length;
  document.fonts.ready.then(() => drawResultImage($<HTMLCanvasElement>("r-image"), mode, score, tower, made, lastResult!.words));
  const canSubmit = online() && !battle && score.count > 0 && !lastResult.practice;
  $("r-submit").hidden = !canSubmit;
  $<HTMLInputElement>("r-name").value = store.get().name;
  setMsg("r-msg", lastResult.practice ? "練習の記録は今日のランキングに入りません（本番は1日1回）" : "");
  $("r-again").textContent = battle ? (battle.isHost() ? "もう一度対戦" : "部屋にもどる") : "もう一度";
  const dlg = $<HTMLDialogElement>("dlg-result");
  if (!dlg.open) dlg.showModal();
}

function setMsg(id: string, text: string, err = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle("err", err);
}

$("r-submit").onsubmit = async (e) => {
  e.preventDefault();
  if (!lastResult) return;
  const name = normalizeName($<HTMLInputElement>("r-name").value);
  if (!name) return setMsg("r-msg", "名前を入れてください", true);
  store.set({ name });
  const btn = $("r-submit").querySelector("button")!;
  btn.disabled = true;
  setMsg("r-msg", "送信中…");
  try {
    const board = lastResult.daily ? dailyBoard(lastResult.daily) : lastResult.mode;
    const ranks = await submitScore(board, name, { ...lastResult.score, playMs: lastResult.playMs, drops: lastResult.drops });
    setMsg("r-msg", `${lastResult.daily ? "今日のランキング" : MODE[lastResult.mode].name}に登録しました：${KINDS.map((k) => `${KIND_LABEL[k]} ${ranks[k] ? `${ranks[k]}位` : "ランク外"}`).join("／")}`);
    $("r-submit").hidden = true;
  } catch (err) {
    setMsg("r-msg", `${(err as Error).message}。画像の保存はできます`, true);
    btn.disabled = false;
  }
};

let stopReplay: (() => void) | null = null;
const replayOpts = (r: ResultInfo) => ({
  half: MODE[r.mode].platformHalf,
  mono: MODE[r.mode].mono,
  title: `合体！漢字タワー ${MODE[r.mode].name}`,
});
$("r-replay-btn").onclick = () => {
  if (!lastResult?.replay.length) return;
  const showing = !$("r-replay").hidden;
  stopReplay?.();
  stopReplay = null;
  $("r-replay").hidden = showing;
  $("r-image").hidden = !showing;
  $("r-replay-btn").textContent = showing ? "リプレイ" : "結果の画像";
  if (!showing) stopReplay = playReplay($<HTMLCanvasElement>("r-replay"), lastResult.replay, replayOpts(lastResult));
};
$("r-video").onclick = async () => {
  if (!lastResult?.replay.length) return;
  const btn = $<HTMLButtonElement>("r-video");
  btn.disabled = true;
  btn.textContent = "動画を作っています…";
  try {
    const file = await recordReplay(lastResult.replay, replayOpts(lastResult));
    await saveFile(file, "合体！漢字タワー #合体漢字タワー");
  } catch (e) {
    setMsg("r-msg", (e as Error).message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "動画を保存";
  }
};
$<HTMLDialogElement>("dlg-result").addEventListener("close", () => {
  stopReplay?.();
  stopReplay = null;
});

$("r-save").onclick = () => {
  $<HTMLCanvasElement>("r-image").toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kanji-tower-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, "image/png");
};

function shareX(text: string) {
  const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(GAME_URL)}`;
  window.open(url, "_blank", "noopener");
}

$("r-share").onclick = () => {
  if (!lastResult) return;
  const { mode, score, made } = lastResult;
  let madeText = made.join("");
  if (madeText.length > 20) madeText = madeText.slice(0, 20) + "…";
  const head = battle && battleRank ? `対戦で${battleRank}位！ ` : "";
  if (lastResult.daily) {
    shareX(
      `合体！漢字タワー 今日のお題 ${dailyLabel(lastResult.daily)}\n20字で 総画数${score.strokes}・高さ${fmtH(score.height)}m・熟語${lastResult.words.length}個${
        lastResult.words.length ? `\n${lastResult.words.join("・")}` : ""
      }\n#合体漢字タワー #今日のお題`,
    );
    return;
  }
  shareX(
    `${head}合体！漢字タワー（${MODE[mode].name}）で 総画数${score.strokes}・高さ${fmtH(score.height)}m・${score.count}字 積んだ！${
      madeText ? `\n作った字：${madeText}` : ""
    }${lastResult.words.length ? `\n熟語：${lastResult.words.slice(0, 5).join("・")}` : ""}\n#合体漢字タワー`,
  );
};

$("r-again").onclick = () => {
  $<HTMLDialogElement>("dlg-result").close();
  if (battle) {
    if (battle.isHost()) battle.client.send({ t: "rematch" });
    game?.destroy();
    game = null;
    show("title");
    openRoomLobby();
  } else if (lastResult?.daily) startDaily();
  else startSolo();
};
$("r-home").onclick = () => {
  $<HTMLDialogElement>("dlg-result").close();
  if (battle) leaveRoom();
  game?.destroy();
  game = null;
  show("title");
};

// ---------- 図鑑 ----------
let dexCur = "林";
function openDex() {
  const d = store.get().discovered;
  const wordsTab = $("dex-tabs").querySelector('[aria-selected="true"]')?.getAttribute("data-tab") === "words";
  const known = store.get().words;
  $("dex-count").textContent = wordsTab ? `${known.length} / ${WORDS.length}` : `${d.length} / ${MERGED.length}`;
  $("dex-grid").hidden = wordsTab;
  $("dex-detail").hidden = wordsTab;
  $("dex-words").hidden = !wordsTab;
  $("dex-words").innerHTML = WORDS.map(([w, r]) =>
    known.includes(w) ? `<li><b>${w}</b><small>${r}</small></li>` : `<li class="locked"><b>？？</b><small>${[...w].map((c) => kanji(c).strokes).join("画＋")}画</small></li>`,
  ).join("");
  const grid = $("dex-grid");
  grid.innerHTML = "";
  const section = (title: string, list: typeof ALL, lockable: boolean) => {
    const h = document.createElement("h3");
    h.textContent = title;
    grid.append(h);
    for (const k of list) {
      const b = document.createElement("button");
      const locked = lockable && !d.includes(k.ch);
      b.textContent = locked ? "？" : k.ch;
      b.className = (locked ? "locked" : "") + (k.ch === dexCur ? " cur" : "");
      b.setAttribute("aria-label", locked ? "まだ見つけていない字" : k.ch);
      b.onclick = () => {
        dexCur = k.ch;
        grid.querySelectorAll(".cur").forEach((x) => x.classList.remove("cur"));
        b.classList.add("cur");
        dexDetail();
      };
      grid.append(b);
    }
  };
  section("合体で作る字", MERGED, true);
  section("落ちてくる字", BASE, false);
  dexDetail();
  const dlg = $<HTMLDialogElement>("dlg-dex");
  if (!dlg.open) dlg.showModal();
}

function dexDetail() {
  const k = kanji(dexCur);
  const m = MERGED.find((x) => x.ch === dexCur);
  const locked = !!m && !store.get().discovered.includes(dexCur);
  const el = $("dex-detail");
  if (locked) {
    el.innerHTML = `<div class="big">？</div><div><p>まだ見つけていません。</p><p class="recipe">${k.strokes}画の字</p></div>`;
    return;
  }
  el.innerHTML = `<div class="big">${k.ch}</div><div>
    <p class="recipe">${m ? `${m.parts[0]} ＋ ${m.parts[1]}` : "落ちてくる字"}</p>
    <p>${k.strokes}画　${esc(k.note)}</p>
    ${m ? '<button class="btn share">Xでシェア</button>' : ""}</div>`;
  el.querySelector<HTMLButtonElement>(".share")?.addEventListener("click", () =>
    shareX(`「${m!.parts[0]}」と「${m!.parts[1]}」を合体させて「${k.ch}」を作った！\n#合体漢字タワー`),
  );
}
$("btn-dex").onclick = openDex;
$("dex-tabs").querySelectorAll<HTMLButtonElement>("button").forEach((b) =>
  b.addEventListener("click", () => {
    $("dex-tabs").querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    openDex();
  }),
);

// ---------- ランキング ----------
let rankKind: Kind = "strokes";
let rankMode: Mode | "daily" | null = null;
function openRank(prefer?: Mode | "daily") {
  const dlgOpen = $<HTMLDialogElement>("dlg-rank").open;
  if (prefer) rankMode = prefer;
  else if (!dlgOpen || !rankMode) rankMode = store.get().mode;
  const modes = $("rank-modes");
  modes.innerHTML = "";
  for (const m of [...MODES, "daily" as const]) {
    const b = document.createElement("button");
    b.textContent = m === "daily" ? "今日" : MODE[m].name;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(m === rankMode));
    b.onclick = () => {
      rankMode = m;
      openRank();
    };
    modes.append(b);
  }
  const tabs = $("rank-tabs");
  tabs.innerHTML = "";
  for (const k of KINDS) {
    const b = document.createElement("button");
    b.textContent = KIND_LABEL[k];
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(k === rankKind));
    b.onclick = () => {
      rankKind = k;
      openRank();
    };
    tabs.append(b);
  }
  if (rankMode === "daily") {
    const rec = store.get().daily[todayKey()];
    $("rank-mine").textContent = rec
      ? `今日のお題 ${dailyLabel(todayKey())} の本番：総画数${rec.strokes}・高さ${fmtH(rec.height)}m・${rec.count}字・熟語${rec.words}個`
      : `今日のお題 ${dailyLabel(todayKey())}：まだ遊んでいません`;
  } else {
    const best = store.get().best[rankMode]?.[rankKind];
    $("rank-mine").textContent = best
      ? `自己ベスト：${rankKind === "height" ? fmtH(best.height) + " m" : best[rankKind]}（総画数${best.strokes}・高さ${fmtH(best.height)}m・${best.count}字）`
      : "自己ベストはまだありません";
  }
  const list = $("rank-list");
  list.innerHTML = "";
  const dlg = $<HTMLDialogElement>("dlg-rank");
  if (!dlg.open) dlg.showModal();
  if (!online()) return setMsg("rank-msg", "全国ランキングはサーバー設定後に表示されます");
  setMsg("rank-msg", "読み込み中…");
  const kind = rankKind;
  const mode = rankMode;
  getRanking(mode === "daily" ? dailyBoard(todayKey()) : mode, kind)
    .then((rows) => {
      if (kind !== rankKind || mode !== rankMode) return;
      setMsg("rank-msg", rows.length ? "上位100件" : "まだ記録がありません。最初の1人になろう");
      list.innerHTML = rows
        .map((r, i) => {
          const v = kind === "height" ? `${fmtH(r.height)}<small>m</small>` : String(r[kind]);
          return `<li><span class="pos">${i + 1}</span><span>${esc(r.name)}<br><span class="sub">総画数${r.strokes}・高さ${fmtH(
            r.height,
          )}m・${r.count}字</span></span><span class="val">${v}</span></li>`;
        })
        .join("");
    })
    .catch((e) => setMsg("rank-msg", `${(e as Error).message}。ゲームはそのまま遊べます`, true));
}
$("btn-rank").onclick = () => openRank();

// ---------- 対戦 ----------
interface Battle {
  client: RoomClient;
  me: string;
  room: RoomState | null;
  offset: number; // サーバー時刻 - 端末時刻
  startedFor: number;
  rivals: Map<string, { canvas: HTMLCanvasElement; score: Score; tower: Piece[] }>;
  sendTimer: number;
  isHost(): boolean;
}
let battle: Battle | null = null;
let battleRank = 0;

function openRoomDialog(code = "") {
  const dlg = $<HTMLDialogElement>("dlg-room");
  $("room-entry").hidden = !!battle;
  $("room-lobby").hidden = !battle;
  $<HTMLInputElement>("room-name").value = store.get().name;
  $<HTMLInputElement>("room-code").value = code;
  setMsg("room-msg", online() ? "" : "対戦はサーバー設定後に使えます（README 参照）", !online());
  if (!dlg.open) dlg.showModal();
}
$("btn-battle").onclick = () => (battle ? openRoomLobby() : openRoomDialog());

function roomName(): string | null {
  const name = normalizeName($<HTMLInputElement>("room-name").value);
  if (!name) {
    setMsg("room-msg", "名前を入れてください", true);
    return null;
  }
  store.set({ name });
  return name;
}

$("room-create").onclick = async () => {
  if (!online()) return;
  const name = roomName();
  if (!name) return;
  setMsg("room-msg", "部屋を作っています…");
  try {
    joinRoom(await createRoom(), name);
  } catch (e) {
    setMsg("room-msg", (e as Error).message, true);
  }
};

$("room-join").onsubmit = (e) => {
  e.preventDefault();
  if (!online()) return;
  const code = $<HTMLInputElement>("room-code").value.trim();
  if (!/^\d{4}$/.test(code)) return setMsg("room-msg", "部屋番号は4桁の数字です", true);
  const name = roomName();
  if (name) joinRoom(code, name);
};

function joinRoom(code: string, name: string) {
  battle?.client.close();
  setMsg("room-msg", "接続中…");
  const b: Battle = {
    me: "",
    room: null,
    offset: 0,
    startedFor: 0,
    rivals: new Map(),
    sendTimer: 0,
    isHost() {
      return !!this.room?.players.find((p) => p.id === this.me)?.host;
    },
    client: new RoomClient(code, name, (m) => onServer(m), (s) => {
      if (s === "retry") setMsg("room-msg", "再接続中…");
      if (s === "closed") {
        setMsg("room-msg", "部屋との接続が切れました", true);
        if (battle === b) endBattleLocal();
      }
    }),
  };
  battle = b;
  history.replaceState(null, "", `?room=${code}`);
}

function leaveRoom() {
  battle?.client.close();
  endBattleLocal();
}

function endBattleLocal() {
  if (battle) clearInterval(battle.sendTimer);
  battle = null;
  history.replaceState(null, "", location.pathname);
  $("room-entry").hidden = false;
  $("room-lobby").hidden = true;
}

$("room-leave").onclick = () => {
  leaveRoom();
  setMsg("room-msg", "部屋を出ました");
};
$("room-start").onclick = () => battle?.client.send({ t: "start" });
$("room-mode").onclick = () => {
  const r = battle?.room;
  if (!r || !battle!.isHost() || r.phase !== "lobby") return;
  const next = MODES[(MODES.indexOf(r.mode) + 1) % MODES.length];
  battle!.client.send({ t: "mode", mode: next });
  sfx("tick");
};
$("room-invite").onclick = async () => {
  if (!battle?.room) return;
  const url = inviteUrl(battle.room.code);
  const text = `合体！漢字タワーで対戦しよう。部屋番号 ${battle.room.code}`;
  try {
    if (navigator.share) await navigator.share({ title: "合体！漢字タワー", text, url });
    else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setMsg("room-wait", "招待リンクをコピーしました");
    }
  } catch {
    /* 共有をやめた */
  }
};

let qrFor = "";
const inviteUrl = (code: string) => `${GAME_URL.split("?")[0]}?room=${code}`;

function openRoomLobby() {
  if (!battle?.room) return openRoomDialog();
  const r = battle.room;
  $("room-entry").hidden = true;
  $("room-lobby").hidden = false;
  $("room-tiles").innerHTML = [...r.code].map((d) => `<span class="tile">${d}</span>`).join("");
  if (qrFor !== r.code) {
    qrFor = r.code;
    try {
      const q = qrcode(0, "M");
      q.addData(inviteUrl(r.code));
      q.make();
      $("room-qr").innerHTML = q.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
    } catch {
      $("room-qr").innerHTML = "";
    }
  }
  const host0 = battle.isHost();
  const modeBtn = $<HTMLButtonElement>("room-mode");
  const canEdit = host0 && r.phase === "lobby";
  modeBtn.textContent = `難易度：${MODE[r.mode].name}${canEdit ? "（タップで切りかえ）" : ""}`;
  modeBtn.disabled = !canEdit;
  const active = r.players.filter((p) => p.status !== "left");
  $("room-count").textContent = `参加者 ${active.length}人（${MAX_PLAYERS}人まで）`;
  const statusTag: Record<string, string> = { playing: "対戦中", done: "終了", left: "通信切れ", lobby: "" };
  $("room-players").innerHTML = r.players
    .map((p) => {
      const tags = [p.host ? "部屋主" : "", r.phase === "playing" ? statusTag[p.status] : p.status === "left" ? "通信切れ" : ""]
        .filter(Boolean)
        .join("・");
      return `<li class="${p.status === "left" ? "off" : ""}"><span class="dot"></span><span class="nm">${esc(p.name)}${
        p.id === battle!.me ? "（あなた）" : ""
      }</span>${tags ? `<span class="tag">${esc(tags)}</span>` : ""}</li>`;
    })
    .join("");
  const host = battle.isHost();
  $<HTMLButtonElement>("room-start").hidden = !host || r.phase !== "lobby";
  $<HTMLButtonElement>("room-start").disabled = r.phase !== "lobby";
  setMsg(
    "room-wait",
    r.phase === "playing"
      ? "いま対戦中です。次の回から参加できます"
      : host
        ? active.length < 2
          ? "相手が入ってくるのを待とう（ひとりでも始められます）"
          : `${active.length}人そろったら始めよう`
        : "部屋主が始めるのを待っています…",
  );
  setMsg("room-msg", "");
  const dlg = $<HTMLDialogElement>("dlg-room");
  if (!dlg.open && !$<HTMLDialogElement>("dlg-result").open && !(game && !game.over)) dlg.showModal();
}

function onServer(m: ServerMsg) {
  const b = battle;
  if (!b) return;
  switch (m.t) {
    case "you":
      b.me = m.id;
      break;
    case "error":
      setMsg("room-msg", m.error, true);
      if (!b.room) {
        b.client.close();
        endBattleLocal();
      }
      break;
    case "room": {
      const prev = b.room?.phase;
      b.room = m.room;
      b.offset = m.now - Date.now();
      if (m.room.phase === "lobby") openRoomLobby();
      if (m.room.phase === "playing" && b.startedFor !== m.room.startsAt) {
        const me = m.room.players.find((p) => p.id === b.me);
        if (me?.status === "playing") startBattleGame(m.room);
        else openRoomLobby();
      }
      if (m.room.phase === "playing") updateRivalMeta();
      if (m.room.phase === "result" && prev !== "result") showBattleResult();
      break;
    }
    case "towers": {
      for (const t of m.list) {
        const r = b.rivals.get(t.id);
        if (!r) continue;
        r.score = t.score;
        r.tower = t.tower.map(([i, x, y, a]) => ({ ch: ALL[i]?.ch ?? "口", x, y, a }));
        drawRival(t.id);
      }
      sortRivals();
      break;
    }
  }
}

function startBattleGame(room: RoomState) {
  const b = battle!;
  b.startedFor = room.startsAt;
  closeAll();
  show("play");
  $("btn-pause").hidden = true;
  $("timer").hidden = false;
  game?.destroy();
  game = null;
  // 相手の塔
  const rivalsEl = $("rivals");
  rivalsEl.hidden = false;
  rivalsEl.innerHTML = `<div class="myrank" id="myrank">-<small>/${room.players.filter((p) => p.status === "playing").length}人</small></div>`;
  b.rivals.clear();
  for (const p of room.players) {
    if (p.id === b.me) continue;
    const div = document.createElement("div");
    div.className = "rival";
    div.dataset.id = p.id;
    div.innerHTML = `<div class="nm"><span>${esc(p.name)}</span><span class="sc">0画</span></div><canvas width="240" height="140"></canvas>`;
    rivalsEl.append(div);
    b.rivals.set(p.id, { canvas: div.querySelector("canvas")!, score: { strokes: 0, height: 0, count: 0 }, tower: [] });
    drawRival(p.id);
  }
  // カウントダウン
  const banner = $("banner");
  banner.hidden = false;
  const startLocal = room.startsAt - b.offset;
  const endLocal = room.endsAt - b.offset;
  const tick = () => {
    if (battle !== b) return;
    const left = Math.ceil((startLocal - Date.now()) / 1000);
    if (left > 0) {
      banner.classList.remove("toast");
      banner.innerHTML = `${left}<small>${MODE[room.mode].name}・同じ字が同じ順で出ます</small>`;
      setTimeout(tick, 200);
      return;
    }
    banner.classList.remove("toast");
    banner.innerHTML = "始め！";
    sfx("win");
    setTimeout(() => (banner.hidden = true), 700);
    void glyphsReady().then(() => {
      if (battle === b) newGame(room.seed, room.mode, endLocal);
    });
    clearInterval(b.sendTimer);
    let n = 0;
    b.sendTimer = window.setInterval(() => {
      if (!game || battle !== b) return;
      // 塔は0.5秒ごと（サーバーがまとめて全員に配る）
      if (n++ % 2 === 0) b.client.sendTower(game.best, game.pieces(), INDEX);
      const secs = Math.max(0, Math.ceil((endLocal - Date.now()) / 1000));
      $("timer").textContent = String(secs);
      $("timer").classList.toggle("hurry", secs <= 10);
      sortRivals();
    }, 250);
  };
  tick();
}

function drawRival(id: string) {
  const r = battle?.rivals.get(id);
  if (!r) return;
  const ctx = r.canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, r.canvas.width, r.canvas.height);
  const def = MODE[battle?.room?.mode ?? "normal"];
  drawTowerFit(ctx, r.tower, { x: 0, y: 0, w: r.canvas.width, h: r.canvas.height }, 4, { half: def.platformHalf, mono: def.mono });
  const el = document.querySelector<HTMLElement>(`.rival[data-id="${id}"] .sc`);
  if (el) el.textContent = `${r.score.strokes}画`;
}

/** 相手を総画数の多い順に並べ、自分の今の順位を出す */
function sortRivals() {
  const b = battle;
  if (!b || !game) return;
  const mine = game.best;
  const list = [...b.rivals.entries()].sort((x, y) => compareScore("strokes", x[1].score, y[1].score));
  const strip = $("rivals");
  for (const [id] of list) {
    const el = strip.querySelector(`.rival[data-id="${id}"]`);
    if (el) strip.append(el);
  }
  const ahead = list.filter(([, r]) => compareScore("strokes", r.score, mine) < 0).length;
  const el = document.getElementById("myrank");
  if (el) el.firstChild!.textContent = `${ahead + 1}位`;
}

function updateRivalMeta() {
  for (const p of battle?.room?.players ?? []) {
    const el = document.querySelector(`.rival[data-id="${p.id}"]`);
    el?.classList.toggle("done", p.status !== "playing");
  }
}

function battleOver(g: Game) {
  const b = battle;
  if (!b) return;
  clearInterval(b.sendTimer);
  b.client.sendTower(g.best, g.pieces(), INDEX);
  b.client.send({ t: "done", score: g.best });
  lastResult = resultFrom(g);
  const banner = $("banner");
  banner.hidden = false;
  banner.classList.remove("toast");
  banner.innerHTML = `${g.overReason === "time" ? "終了！" : "落ちた！"}<small>ほかの人を待っています…</small>`;
}

function showBattleResult() {
  const b = battle!;
  const r = b.room!;
  clearInterval(b.sendTimer);
  if (game && !game.over) game.end("time");
  const order = [...r.players].filter((p) => p.status !== "left" || p.score.count > 0);
  const me = order.findIndex((p) => p.id === b.me);
  battleRank = me + 1;
  if (!lastResult)
    lastResult = { mode: r.mode, score: { strokes: 0, height: 0, count: 0 }, tower: [], made: [], words: [], playMs: 0, drops: 0, replay: [] };
  $("banner").hidden = true;
  openResult();
  $("r-title").textContent = battleRank === 1 ? "勝ち！" : `${battleRank}位`;
  if (battleRank === 1) sfx("win");
  $("r-battle").innerHTML = `<div class="battle-wrap"><table class="battle-table">${order
    .map(
      (p, i) =>
        `<tr class="${p.id === b.me ? "me" : ""}"><td>${i + 1}位</td><td>${esc(p.name)}${
          p.status === "left" ? "（退出）" : ""
        }</td><td class="n">${p.score.strokes}画</td><td class="n">${fmtH(p.score.height)}m</td></tr>`,
    )
    .join("")}</table></div>`;
  document.querySelector(".battle-wrap tr.me")?.scrollIntoView({ block: "nearest" });
}

// 字形のフォントを先に読み込んでおく
void glyphsReady();

// 招待リンクから来た
const roomParam = new URLSearchParams(location.search).get("room");
if (roomParam && /^\d{4}$/.test(roomParam)) openRoomDialog(roomParam);

// 開発時の確認用
if (import.meta.env.DEV) Object.assign(window, { __game: () => game, __api: API });
