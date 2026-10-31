import "./style.css";
import { Game } from "./game";
import { drawTowerFit, type Piece } from "./render";
import { ALL, BASE, INDEX, MERGED, kanji, mergeOf } from "./shared/kanji";
import { compareScore, KIND_LABEL, KINDS, MAX_PLAYERS, normalizeName, type Kind, type Score } from "./shared/rules";
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
  sfx("tick");
};
setSoundLabel();

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
    const fit = tower.some((t) => mergeOf(ch, t));
    b.className = `cell${i === g.selected ? " sel" : ""}${fit ? " fit" : ""}`;
    b.innerHTML = `<span class="num">${i + 1}</span>${ch}<span class="st">${kanji(ch).strokes}画</span>`;
    b.setAttribute("aria-label", `${ch}（${kanji(ch).strokes}画）${fit ? "合体できる" : ""}`);
    b.onclick = () => g.select(i);
    tray.append(b);
  });
  $("btn-pause").textContent = g.paused ? "▶" : "Ⅱ";
  const banner = $("banner");
  if (g.paused) {
    banner.hidden = false;
    banner.classList.remove("toast");
    banner.innerHTML = `休憩<small>Space または ▶ で再開</small>`;
  } else if (!battle) banner.hidden = true;
}

function newGame(seed: number, endsAt?: number): Game {
  game?.destroy();
  const g = new Game($<HTMLCanvasElement>("canvas"), {
    seed,
    endsAt,
    onChange: renderHud,
    onMerge: (ch) => {
      if (store.discover(ch)) toast(`新しい字「${ch}」を発見！`);
    },
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
function startSolo() {
  closeAll();
  battle = null;
  $("timer").hidden = true;
  $("rivals").hidden = true;
  $("btn-pause").hidden = false;
  $("banner").hidden = true;
  show("play");
  newGame((Math.random() * 2 ** 32) >>> 0);
}
$("btn-solo").onclick = startSolo;

let lastResult: { score: Score; tower: Piece[]; made: string[]; playMs: number; drops: number } | null = null;

function soloOver(g: Game) {
  const score = { ...g.best };
  const updated = store.submitBest(score, g.bestTower);
  lastResult = { score, tower: g.bestTower, made: [...g.made], playMs: g.playMs, drops: g.drops };
  setTimeout(() => openResult(updated), 900);
}

// ---------- 結果 ----------
function drawResultImage(canvas: HTMLCanvasElement, score: Score, tower: Piece[], made: string[], title = "合体！漢字タワー") {
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
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#1d2321";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(700, 40, 460, 550, 16);
  ctx.fill();
  ctx.stroke();
  drawTowerFit(ctx, tower, { x: 710, y: 50, w: 440, h: 530 });
}

function openResult(updated: Kind[] = []) {
  if (!lastResult) return;
  const { score, tower, made } = lastResult;
  $("r-title").textContent = game?.overReason === "fall" ? "落ちた！" : "記録";
  $("r-battle").innerHTML = "";
  $("r-scores").innerHTML = KINDS.map(
    (k) =>
      `<div>${updated.includes(k) ? '<span class="new">自己ベスト！</span>' : ""}<b>${
        k === "height" ? fmtH(score[k]) : score[k]
      }</b><small>${KIND_LABEL[k]}${k === "height" ? " m" : ""}</small></div>`,
  ).join("");
  $("r-made").textContent = made.length ? `作った字：${made.join("")}` : "";
  document.fonts.ready.then(() => drawResultImage($<HTMLCanvasElement>("r-image"), score, tower, made));
  const canSubmit = online() && !battle && score.count > 0;
  $("r-submit").hidden = !canSubmit;
  $<HTMLInputElement>("r-name").value = store.get().name;
  setMsg("r-msg", online() || battle ? "" : "ランキングはサーバー設定後に使えます");
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
    const ranks = await submitScore(name, { ...lastResult.score, playMs: lastResult.playMs, drops: lastResult.drops });
    setMsg("r-msg", `登録しました：${KINDS.map((k) => `${KIND_LABEL[k]} ${ranks[k]}位`).join("／")}`);
    $("r-submit").hidden = true;
  } catch (err) {
    setMsg("r-msg", `${(err as Error).message}。画像の保存はできます`, true);
    btn.disabled = false;
  }
};

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
  const { score, made } = lastResult;
  let madeText = made.join("");
  if (madeText.length > 20) madeText = madeText.slice(0, 20) + "…";
  const head = battle && battleRank ? `対戦で${battleRank}位！ ` : "";
  shareX(
    `${head}合体！漢字タワーで 総画数${score.strokes}・高さ${fmtH(score.height)}m・${score.count}字 積んだ！${
      madeText ? `\n作った字：${madeText}` : ""
    }\n#合体漢字タワー`,
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
  } else startSolo();
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
  $("dex-count").textContent = `${d.length} / ${MERGED.length}`;
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

// ---------- ランキング ----------
let rankKind: Kind = "strokes";
function openRank() {
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
  const best = store.get().best[rankKind];
  $("rank-mine").textContent = best
    ? `自己ベスト：${rankKind === "height" ? fmtH(best.height) + " m" : best[rankKind]}（総画数${best.strokes}・高さ${fmtH(best.height)}m・${best.count}字）`
    : "自己ベストはまだありません";
  const list = $("rank-list");
  list.innerHTML = "";
  const dlg = $<HTMLDialogElement>("dlg-rank");
  if (!dlg.open) dlg.showModal();
  if (!online()) return setMsg("rank-msg", "全国ランキングはサーバー設定後に表示されます");
  setMsg("rank-msg", "読み込み中…");
  const kind = rankKind;
  getRanking(kind)
    .then((rows) => {
      if (kind !== rankKind) return;
      setMsg("rank-msg", rows.length ? "最近90日の上位100件" : "まだ記録がありません。最初の1人になろう");
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
$("btn-rank").onclick = openRank;

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
$("room-invite").onclick = async () => {
  if (!battle?.room) return;
  const url = `${GAME_URL}?room=${battle.room.code}`;
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

function openRoomLobby() {
  if (!battle?.room) return openRoomDialog();
  const r = battle.room;
  $("room-entry").hidden = true;
  $("room-lobby").hidden = false;
  $("room-code-big").textContent = r.code;
  $("room-count").textContent = `参加者 ${r.players.length}人（${MAX_PLAYERS}人まで）`;
  $("room-players").innerHTML = r.players
    .map(
      (p) =>
        `<li><span>${esc(p.name)}${p.id === battle!.me ? "（あなた）" : ""}</span>${p.host ? '<span class="tag">部屋主</span>' : ""}</li>`,
    )
    .join("");
  const host = battle.isHost();
  const enough = r.players.length >= 2;
  $<HTMLButtonElement>("room-start").hidden = !host;
  $<HTMLButtonElement>("room-start").disabled = !enough || r.phase !== "lobby";
  setMsg(
    "room-wait",
    r.phase === "playing"
      ? "対戦中です。終わるまで待ってください"
      : host
        ? enough
          ? "全員そろったら始めましょう"
          : "あと1人以上の参加を待っています"
        : "部屋主が始めるのを待っています",
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
      banner.innerHTML = `${left}<small>同じ字が同じ順で出ます</small>`;
      setTimeout(tick, 200);
      return;
    }
    banner.classList.remove("toast");
    banner.innerHTML = "始め！";
    sfx("win");
    setTimeout(() => (banner.hidden = true), 700);
    newGame(room.seed, endLocal);
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
  drawTowerFit(ctx, r.tower, { x: 0, y: 0, w: r.canvas.width, h: r.canvas.height }, 4);
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
  lastResult = { score: { ...g.best }, tower: g.bestTower, made: [...g.made], playMs: g.playMs, drops: g.drops };
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
  if (!lastResult) lastResult = { score: { strokes: 0, height: 0, count: 0 }, tower: [], made: [], playMs: 0, drops: 0 };
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

// 招待リンクから来た
const roomParam = new URLSearchParams(location.search).get("room");
if (roomParam && /^\d{4}$/.test(roomParam)) openRoomDialog(roomParam);

// 開発時の確認用
if (import.meta.env.DEV) Object.assign(window, { __game: () => game, __api: API });
