// ランキングと対戦の通信（Firebase Realtime Database）
//
// データの置き場所（prefpack と同じデータベース。キーに kanji- を付けて区別）
//   rooms/kanji-<4桁>        部屋：game, created, host, state, round, seed, startAt, endAt
//     players/<pid>          name, joined, online, round, status("playing"|"done"), score, doneAt
//   rooms/kanji-<4桁>-live   対戦中の塔：<pid> = { s: 記録, t: 塔(JSON) }。部屋本体と分けて通信を軽くする
//   rooms/kanji-ranking      ランキング：created(=9e15、自動おそうじ対象外), <難易度 または daily-YYYYMMDD>/<種目>/<id> = 記録
//
// Firebase は使うときに読み込む（ひとり用は Firebase なしですぐ遊べる）。
import type { Piece } from "./render";
import { BATTLE_SECONDS, compareScore, isMode, KINDS, MAX_PLAYERS, plausible, type Kind, type Mode, type Score } from "./shared/rules";
import { store } from "./storage";

type FB = typeof import("./firebase");
let fbPromise: Promise<FB> | null = null;
let offset = 0;

function fb(): Promise<FB> {
  if (!fbPromise) {
    const timeout = new Promise<never>((_, ng) => setTimeout(() => ng(new Error("サーバーにつながりません")), 10_000));
    fbPromise = Promise.race([import("./firebase"), timeout])
      .then((m) => {
        m.onValue(m.ref(m.db, ".info/serverTimeOffset"), (s) => (offset = s.val() || 0));
        return m;
      })
      .catch((e) => {
        fbPromise = null;
        throw e;
      });
  }
  return fbPromise;
}

const now = () => Date.now() + offset;
const PID = () => store.get().device.replace(/-/g, "").slice(0, 16);
const ROOM = (code: string) => `rooms/kanji-${code}`;
const LIVE = (code: string) => `rooms/kanji-${code}-live`;
const RANK = "rooms/kanji-ranking";
const ROOM_TTL = 24 * 60 * 60_000;

export const API = "firebase:odeko-ddb38";
export const online = () => true;

function netError(e: unknown): Error {
  const msg = String((e as { code?: string; message?: string })?.code || (e as Error)?.message || e);
  if (/permission/i.test(msg)) return new Error("データベースに書きこめませんでした（Firebase のルールを確認してください）");
  if (/つながりません/.test(msg)) return new Error(msg);
  return new Error("通信できませんでした。電波のよい所でもう一度試してください");
}

// ---------- ランキング ----------

export interface RankRow extends Score {
  name: string;
  at: number;
}

const cache = new Map<string, { t: number; rows: (RankRow & { id: string })[] }>();

/** board：難易度（easy/normal/hard）か、今日のお題（daily-YYYYMMDD） */
export type Board = Mode | `daily-${string}`;

async function fetchKind(mode: Board, kind: Kind) {
  const m = await fb();
  const snap = await m.get(m.query(m.ref(m.db, `${RANK}/${mode}/${kind}`), m.orderByChild(kind), m.limitToLast(100)));
  const rows: (RankRow & { id: string })[] = [];
  snap.forEach((c) => {
    const v = c.val();
    if (v && typeof v.name === "string") rows.push({ id: c.key!, name: v.name, strokes: v.strokes | 0, height: v.height | 0, count: v.count | 0, at: v.at | 0 });
  });
  rows.sort((a, b) => compareScore(kind, a, b) || a.at - b.at);
  cache.set(`${mode}/${kind}`, { t: Date.now(), rows });
  return rows;
}

export async function getRanking(mode: Board, kind: Kind, force = false): Promise<RankRow[]> {
  const c = cache.get(`${mode}/${kind}`);
  if (!force && c && Date.now() - c.t < 60_000) return c.rows;
  try {
    return await fetchKind(mode, kind);
  } catch (e) {
    throw netError(e);
  }
}

const sentAt: number[] = [];

/** 送ったあとの各種目の順位（100位より下は null） */
export async function submitScore(
  mode: Board,
  name: string,
  s: Score & { playMs: number; drops: number },
): Promise<Record<Kind, number | null>> {
  if (!plausible(s)) throw new Error("記録を受け付けられませんでした");
  const t = Date.now();
  while (sentAt.length && t - sentAt[0] > 60_000) sentAt.shift();
  if (sentAt.length >= 6) throw new Error("送信が多すぎます。少し待ってください");
  sentAt.push(t);
  try {
    const m = await fb();
    const id = m.push(m.ref(m.db, `${RANK}/${mode}/strokes`)).key!;
    const row = { name, strokes: s.strokes, height: s.height, count: s.count, at: now() };
    const up: Record<string, unknown> = { created: 9e15 };
    for (const k of KINDS) up[`${mode}/${k}/${id}`] = row;
    await m.update(m.ref(m.db, RANK), up);
    const ranks = {} as Record<Kind, number | null>;
    for (const k of KINDS) {
      const rows = await fetchKind(mode, k);
      const i = rows.findIndex((r) => r.id === id);
      ranks[k] = i < 0 ? null : i + 1;
    }
    void prune(mode);
    return ranks;
  } catch (e) {
    throw netError(e);
  }
}

/** 各種目、下位を消して200件ほどに保つ（データベースを大きくしないため） */
async function prune(mode: Board) {
  try {
    const m = await fb();
    // 1週間より前の今日のお題を消す
    if (mode.startsWith("daily-")) {
      const old = new Date(Date.now() + 9 * 3600_000 - 7 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
      const snap = await m.get(m.query(m.ref(m.db, RANK), m.orderByKey(), m.startAt("daily-"), m.endAt(`daily-${old}`), m.limitToFirst(5)));
      const jobs: Promise<void>[] = [];
      snap.forEach((c) => {
        if (/^daily-\d{8}$/.test(c.key!) && c.key! <= `daily-${old}`) jobs.push(m.remove(c.ref));
      });
      await Promise.all(jobs);
    }
    for (const k of KINDS) {
      const snap = await m.get(m.query(m.ref(m.db, `${RANK}/${mode}/${k}`), m.orderByChild(k)));
      const n = snap.size;
      if (n <= 300) continue;
      const jobs: Promise<void>[] = [];
      let i = 0;
      snap.forEach((c) => {
        if (i++ < n - 200) jobs.push(m.remove(c.ref));
      });
      await Promise.all(jobs);
    }
  } catch {
    /* 次の機会に */
  }
}

// ---------- 対戦 ----------

export interface RoomPlayer {
  id: string;
  name: string;
  host: boolean;
  status: "lobby" | "playing" | "done" | "left";
  score: Score;
}

export interface RoomState {
  code: string;
  mode: Mode;
  phase: "lobby" | "playing" | "result";
  players: RoomPlayer[];
  seed: number;
  startsAt: number;
  endsAt: number;
}

export type ServerMsg =
  | { t: "you"; id: string }
  | { t: "room"; room: RoomState; now: number }
  | { t: "towers"; list: { id: string; score: Score; tower: [number, number, number, number][] }[] }
  | { t: "error"; error: string };

interface FbPlayer {
  name: string;
  joined: number;
  online?: boolean;
  round?: number;
  status?: "playing" | "done";
  score?: Score;
}

interface FbRoom {
  game: "kanji";
  created: number;
  host: string;
  state: "lobby" | "playing" | "result";
  mode?: Mode;
  round: number;
  seed: number;
  startAt: number;
  endAt: number;
  players?: Record<string, FbPlayer>;
}

const ZERO: Score = { strokes: 0, height: 0, count: 0 };
const cleanScore = (s: unknown): Score => {
  const v = s as Score;
  const ok = (n: unknown) => (Number.isInteger(n) && (n as number) >= 0 && (n as number) < 100_000 ? (n as number) : 0);
  return v ? { strokes: ok(v.strokes), height: ok(v.height), count: ok(v.count) } : { ...ZERO };
};

export async function createRoom(host = PID()): Promise<string> {
  try {
    const m = await fb();
    // 古い漢字タワーの部屋を少しずつ片づける（ほかのゲームの部屋とランキングには触れない）
    m.get(m.query(m.ref(m.db, "rooms"), m.orderByChild("created"), m.endAt(now() - ROOM_TTL), m.limitToFirst(30)))
      .then((snap) => {
        snap.forEach((c) => {
          const v = c.val();
          if (/^kanji-\d{4}(-live)?$/.test(c.key!) && v && typeof v.created === "number" && v.created <= now() - ROOM_TTL)
            void m.remove(c.ref);
        });
      })
      .catch(() => {});
    for (let i = 0; i < 12; i++) {
      const code = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
      const t = now();
      const room: FbRoom = { game: "kanji", created: t, host, state: "lobby", round: 0, seed: 0, startAt: 0, endAt: 0 };
      const r = await m.runTransaction(m.ref(m.db, ROOM(code)), (cur) => (cur ? undefined : room));
      if (r.committed) return code;
    }
  } catch (e) {
    throw netError(e);
  }
  throw new Error("部屋を作れませんでした。もう一度試してください");
}

export class RoomClient {
  private unsubs: (() => void)[] = [];
  private room: FbRoom | null = null;
  private lastTower = 0;
  private liveScores = new Map<string, Score>();
  private finishTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    readonly code: string,
    private name: string,
    private onMsg: (m: ServerMsg) => void,
    private onStatus: (s: "open" | "closed" | "retry") => void,
    private me = PID(),
  ) {
    void this.join();
  }

  private async join() {
    let m: FB;
    try {
      m = await fb();
      const cur = (await m.get(m.ref(m.db, ROOM(this.code)))).val() as FbRoom | null;
      if (!cur || cur.game !== "kanji") return this.fail("その部屋番号は見つかりません");
      const ps = cur.players ?? {};
      const mine = ps[this.me];
      const onlineCount = Object.entries(ps).filter(([id, p]) => id !== this.me && p.online !== false).length;
      if (!mine && onlineCount >= MAX_PLAYERS) return this.fail(`この部屋は満員です（${MAX_PLAYERS}人まで）`);
      await m.update(m.ref(m.db, `${ROOM(this.code)}/players/${this.me}`), {
        name: this.name,
        joined: mine?.joined ?? now(),
        online: true,
      });
    } catch (e) {
      return this.fail(netError(e).message);
    }
    if (this.closed) return;
    const onlineRef = m.ref(m.db, `${ROOM(this.code)}/players/${this.me}/online`);
    void m.onDisconnect(onlineRef).set(false);
    // つながり直したら戻る
    this.unsubs.push(
      m.onValue(m.ref(m.db, ".info/connected"), (s) => {
        if (this.closed) return;
        if (s.val()) {
          void m.set(onlineRef, true);
          void m.onDisconnect(onlineRef).set(false);
          this.onStatus("open");
        } else this.onStatus("retry");
      }),
    );
    this.onMsg({ t: "you", id: this.me });
    this.unsubs.push(m.onValue(m.ref(m.db, ROOM(this.code)), (s) => this.onRoom(m, s.val())));
    const liveRef = m.ref(m.db, LIVE(this.code));
    const onLive = (s: import("firebase/database").DataSnapshot) => {
      const v = s.val();
      if (!v || typeof v !== "object" || s.key === "created") return;
      const score = cleanScore(v.s);
      this.liveScores.set(s.key!, score);
      if (s.key === this.me) return;
      let tower: [number, number, number, number][] = [];
      try {
        tower = JSON.parse(v.t || "[]");
      } catch {
        /* 壊れた塔は無視 */
      }
      this.onMsg({ t: "towers", list: [{ id: s.key!, score, tower }] });
    };
    this.unsubs.push(m.onChildAdded(liveRef, onLive), m.onChildChanged(liveRef, onLive));
  }

  private fail(error: string) {
    this.onMsg({ t: "error", error });
    this.onStatus("closed");
  }

  private onRoom(m: FB, v: FbRoom | null) {
    if (this.closed) return;
    if (!v || v.game !== "kanji") {
      this.fail("部屋がなくなりました");
      this.close();
      return;
    }
    this.room = v;
    const ps = v.players ?? {};
    if (!ps[this.me]) {
      // 消えていたら入り直す
      void m.update(m.ref(m.db, `${ROOM(this.code)}/players/${this.me}`), { name: this.name, joined: now(), online: true });
      return;
    }
    this.maybeTakeHost(m, v);
    if (v.host === this.me) this.hostDuties(m, v);
    this.onMsg({ t: "room", room: this.toState(v), now: now() });
  }

  private toState(v: FbRoom): RoomState {
    let players: RoomPlayer[] = Object.entries(v.players ?? {})
      .sort((a, b) => a[1].joined - b[1].joined)
      .map(([id, p]) => {
        const inRound = v.state !== "lobby" && p.round === v.round;
        const status: RoomPlayer["status"] =
          p.online === false ? "left" : inRound ? (p.status ?? "playing") : "lobby";
        return { id, name: String(p.name ?? "名なし").slice(0, 12), host: id === v.host, status, score: cleanScore(p.score) };
      });
    if (v.state === "lobby") players = players.filter((p) => p.status !== "left");
    if (v.state === "result") {
      const inRound = new Set(Object.entries(v.players ?? {}).filter(([, p]) => p.round === v.round).map(([id]) => id));
      players = players
        .filter((p) => inRound.has(p.id))
        .sort((a, b) => compareScore("strokes", a.score, b.score));
    }
    return { code: this.code, mode: isMode(v.mode) ? v.mode : "normal", phase: v.state, players, seed: v.seed, startsAt: v.startAt, endsAt: v.endAt };
  }

  /** 部屋主がいなくなったら、いちばん早く入った人が引き継ぐ */
  private maybeTakeHost(m: FB, v: FbRoom) {
    const ps = v.players ?? {};
    const h = ps[v.host];
    if (h && h.online !== false) return;
    const cands = Object.entries(ps)
      .filter(([, p]) => p.online !== false)
      .sort((a, b) => a[1].joined - b[1].joined);
    if (cands[0]?.[0] !== this.me) return;
    const old = v.host;
    void m.runTransaction(m.ref(m.db, `${ROOM(this.code)}/host`), (cur) => (cur === old || cur == null ? this.me : undefined));
  }

  /** 対戦の終わりを決めるのは部屋主の端末 */
  private hostDuties(m: FB, v: FbRoom) {
    if (v.state !== "playing") {
      if (this.finishTimer) clearTimeout(this.finishTimer);
      this.finishTimer = null;
      return;
    }
    const parts = Object.entries(v.players ?? {}).filter(([, p]) => p.round === v.round);
    const allDone = parts.every(([, p]) => p.status === "done" || p.online === false);
    if (allDone && parts.length) return void this.finish(m, v.round);
    if (!this.finishTimer) {
      const wait = Math.max(0, v.endAt + 4000 - now());
      this.finishTimer = setTimeout(() => {
        this.finishTimer = null;
        if (this.room?.state === "playing" && this.room.round === v.round) void this.finish(m, v.round);
      }, wait);
    }
  }

  private async finish(m: FB, round: number) {
    const v = this.room;
    if (!v || v.state !== "playing" || v.round !== round) return;
    const up: Record<string, unknown> = { state: "result" };
    // 終わりを送れなかった人は、最後に届いた記録で確定する
    for (const [id, p] of Object.entries(v.players ?? {})) {
      if (p.round !== round || p.status === "done") continue;
      up[`players/${id}/status`] = "done";
      up[`players/${id}/score`] = this.liveScores.get(id) ?? cleanScore(p.score);
    }
    await m.update(m.ref(m.db, ROOM(this.code)), up).catch(() => {});
  }

  private async start(m: FB) {
    const v = this.room;
    if (!v || v.host !== this.me || v.state === "playing") return;
    const round = (v.round || 0) + 1;
    const startAt = now() + 3500;
    const up: Record<string, unknown> = {
      state: "playing",
      round,
      seed: (Math.random() * 2 ** 32) >>> 0,
      startAt,
      endAt: startAt + BATTLE_SECONDS * 1000,
    };
    for (const [id, p] of Object.entries(v.players ?? {})) {
      if (p.online === false) continue;
      up[`players/${id}/round`] = round;
      up[`players/${id}/status`] = "playing";
      up[`players/${id}/score`] = { ...ZERO };
    }
    this.liveScores.clear();
    try {
      await m.set(m.ref(m.db, LIVE(this.code)), { created: now() });
      await m.update(m.ref(m.db, ROOM(this.code)), up);
    } catch (e) {
      this.onMsg({ t: "error", error: netError(e).message });
    }
  }

  send(msg: { t: string; score?: Score; mode?: Mode }) {
    void fb().then(async (m) => {
      const base = `${ROOM(this.code)}/players/${this.me}`;
      switch (msg.t) {
        case "start":
          return this.start(m);
        case "done":
          return m.update(m.ref(m.db, base), { status: "done", score: cleanScore(msg.score), doneAt: now() }).catch(() => {});
        case "mode":
          if (this.room?.host === this.me && this.room.state === "lobby" && isMode(msg.mode))
            return m.update(m.ref(m.db, ROOM(this.code)), { mode: msg.mode }).catch(() => {});
          return;
        case "rematch":
          if (this.room?.host === this.me) return m.update(m.ref(m.db, ROOM(this.code)), { state: "lobby" }).catch(() => {});
          return;
        case "leave": {
          const onlineRef = m.ref(m.db, `${base}/online`);
          await m.onDisconnect(onlineRef).cancel().catch(() => {});
          await m.set(onlineRef, false).catch(() => {});
          return;
        }
      }
    });
  }

  /** 人数が多いほど送る間隔をあけ、1人が受け取る通信量をおさえる */
  sendTower(score: Score, pieces: Piece[], index: Map<string, number>) {
    const n = Object.values(this.room?.players ?? {}).filter((p) => p.online !== false).length;
    const every = Math.max(500, n * 60);
    const t = Date.now();
    if (t - this.lastTower < every - 50) return;
    this.lastTower = t;
    const tower = pieces.map((p) => [index.get(p.ch)!, +p.x.toFixed(2), +p.y.toFixed(2), +p.a.toFixed(2)]);
    void fb().then((m) =>
      m.set(m.ref(m.db, `${LIVE(this.code)}/${this.me}`), { s: cleanScore(score), t: JSON.stringify(tower) }).catch(() => {}),
    );
  }

  close() {
    if (this.closed) return;
    this.send({ t: "leave" });
    this.closed = true;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    if (this.finishTimer) clearTimeout(this.finishTimer);
  }
}
