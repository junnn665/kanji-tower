// ランキングと対戦の通信（Firebase Realtime Database）
//
// データの置き場所（prefpack と同じデータベース。キーに kanji- を付けて区別）
//   rooms/kanji-<4桁>        部屋：game, created, host, state, round, seed, startAt, endAt
//     players/<pid>          name, joined, online, round, status("playing"|"done"), score, doneAt
//   rooms/kanji-<4桁>-live   対戦中の塔：<pid> = { s: 記録, t: 塔(JSON) }。部屋本体と分けて通信を軽くする
//   rooms/kanji-<4桁>-ev     おじゃま・スタンプ：<id> = { type, from, name, to, toTeam, ch, stamp, round, t }
//   rooms/kanji-<4桁>-box-<A|B|C>  協力・チーム戦の塔：st（代表の端末が配る盤面）, cmd/<id>（番の人の操作）
//   rooms/kanji-ranking      ランキング：created(=9e15、自動おそうじ対象外), <難易度 または daily-YYYYMMDD>/<種目>/<id> = 記録
//
// Firebase は使うときに読み込む（ひとり用は Firebase なしですぐ遊べる）。
import type { BoxState, Command } from "./game";
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
const EV = (code: string) => `rooms/kanji-${code}-ev`;
const BOX = (code: string, team: TeamId) => `rooms/kanji-${code}-box-${team}`;
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

// ---------- 対戦・協力・チーム戦 ----------

/** vs：各自の塔で競う。coop：みんなで1つの塔を順番に。team：赤と青のチームで1つずつ */
export type Play = "vs" | "coop" | "team";
export const PLAYS: Play[] = ["vs", "coop", "team"];
export const PLAY_LABEL: Record<Play, string> = { vs: "対戦", coop: "協力（みんなで1つの塔）", team: "チーム戦（赤・青）" };
/** A・B：チーム戦の赤・青。C：協力の1つの塔 */
export type TeamId = "A" | "B" | "C";
export const TEAM_LABEL: Record<TeamId, string> = { A: "赤チーム", B: "青チーム", C: "みんな" };

export interface RoomPlayer {
  id: string;
  name: string;
  host: boolean;
  status: "lobby" | "playing" | "done" | "left";
  score: Score;
  spec: boolean;
  team?: "A" | "B";
}

export interface TeamState {
  id: TeamId;
  host: string;
  status: "playing" | "done";
  score: Score;
  members: string[];
}

export interface RoomState {
  code: string;
  mode: Mode;
  play: Play;
  jama: boolean;
  phase: "lobby" | "playing" | "result";
  round: number;
  players: RoomPlayer[];
  teams: TeamState[];
  seed: number;
  startsAt: number;
  endsAt: number;
}

export interface RoomEvent {
  id: string;
  type: "jama" | "stamp";
  from: string;
  name: string;
  to?: string;
  toTeam?: TeamId;
  ch?: string;
  stamp?: string;
  round: number;
  t: number;
}

/** 協力の盤面に、番の人と回を足したもの */
export type SharedBox = BoxState & { r: number; turn: string; tn: string };

export type ServerMsg =
  | { t: "you"; id: string }
  | { t: "room"; room: RoomState; now: number }
  | { t: "towers"; list: { id: string; score: Score; tower: [number, number, number, number][] }[] }
  | { t: "event"; ev: RoomEvent }
  | { t: "error"; error: string; fatal?: boolean };

interface FbPlayer {
  name: string;
  joined: number;
  online?: boolean;
  round?: number;
  status?: "playing" | "done";
  score?: Score;
  spec?: boolean;
  team?: "A" | "B";
}

interface FbTeam {
  host: string;
  status: "playing" | "done";
  score?: Score;
}

interface FbRoom {
  game: "kanji";
  created: number;
  host: string;
  state: "lobby" | "playing" | "result";
  mode?: Mode;
  play?: Play;
  jama?: boolean;
  round: number;
  seed: number;
  startAt: number;
  endAt: number;
  players?: Record<string, FbPlayer>;
  teams?: Record<string, FbTeam>;
}

const ZERO: Score = { strokes: 0, height: 0, count: 0 };
const cleanScore = (s: unknown): Score => {
  const v = s as Score;
  const ok = (n: unknown) => (Number.isInteger(n) && (n as number) >= 0 && (n as number) < 100_000 ? (n as number) : 0);
  return v ? { strokes: ok(v.strokes), height: ok(v.height), count: ok(v.count) } : { ...ZERO };
};
const isPlay = (v: unknown): v is Play => PLAYS.includes(v as Play);

export async function createRoom(host = PID()): Promise<string> {
  try {
    const m = await fb();
    // 古い漢字タワーの部屋を少しずつ片づける（ほかのゲームの部屋とランキングには触れない）
    m.get(m.query(m.ref(m.db, "rooms"), m.orderByChild("created"), m.endAt(now() - ROOM_TTL), m.limitToFirst(30)))
      .then((snap) => {
        snap.forEach((c) => {
          const v = c.val();
          if (/^kanji-\d{4}(-live|-ev|-box-[ABC])?$/.test(c.key!) && v && typeof v.created === "number" && v.created <= now() - ROOM_TTL)
            void m.remove(c.ref);
        });
      })
      .catch(() => {});
    for (let i = 0; i < 12; i++) {
      const code = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
      const t = now();
      const room: FbRoom = { game: "kanji", created: t, host, state: "lobby", play: "vs", jama: true, round: 0, seed: 0, startAt: 0, endAt: 0 };
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
  private joinedAt = 0;

  constructor(
    readonly code: string,
    private name: string,
    private onMsg: (m: ServerMsg) => void,
    private onStatus: (s: "open" | "closed" | "retry") => void,
    readonly me = PID(),
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
    this.joinedAt = now();
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
    // おじゃま・スタンプ（入る前のものは無視）
    this.unsubs.push(
      m.onChildAdded(m.ref(m.db, EV(this.code)), (s) => {
        const v = s.val();
        if (!v || s.key === "created" || typeof v.t !== "number" || v.t < this.joinedAt - 3000) return;
        this.onMsg({ t: "event", ev: { ...v, id: s.key! } });
      }),
    );
  }

  /** 部屋に入れない・部屋がなくなった（理由を出してから部屋を出る） */
  private fail(error: string) {
    this.onMsg({ t: "error", error, fatal: true });
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
        return {
          id,
          name: String(p.name ?? "名なし").slice(0, 12),
          host: id === v.host,
          status,
          score: cleanScore(p.score),
          spec: !!p.spec,
          team: p.team === "A" || p.team === "B" ? p.team : undefined,
        };
      });
    if (v.state === "lobby") players = players.filter((p) => p.status !== "left");
    if (v.state === "result") {
      const inRound = new Set(Object.entries(v.players ?? {}).filter(([, p]) => p.round === v.round).map(([id]) => id));
      players = players
        .filter((p) => inRound.has(p.id) || p.spec)
        .sort((a, b) => Number(a.spec) - Number(b.spec) || compareScore("strokes", a.score, b.score));
    }
    const teams: TeamState[] = Object.entries(v.teams ?? {})
      .filter(([id]) => id === "A" || id === "B" || id === "C")
      .map(([id, t]) => ({
        id: id as TeamId,
        host: t.host,
        status: t.status,
        score: cleanScore(t.score),
        members: Object.entries(v.players ?? {})
          .filter(([, p]) => p.round === v.round && !p.spec && (id === "C" || p.team === id))
          .sort((a, b) => a[1].joined - b[1].joined)
          .map(([pid]) => pid),
      }))
      .sort((a, b) => (v.state === "result" ? compareScore("strokes", a.score, b.score) : a.id.localeCompare(b.id)));
    return {
      code: this.code,
      mode: isMode(v.mode) ? v.mode : "normal",
      play: isPlay(v.play) ? v.play : "vs",
      jama: v.jama !== false,
      phase: v.state,
      round: v.round,
      players,
      teams,
      seed: v.seed,
      startsAt: v.startAt,
      endsAt: v.endAt,
    };
  }

  /** 部屋主がいなくなったら、いちばん早く入った人（観戦でない人を優先）が引き継ぐ */
  private maybeTakeHost(m: FB, v: FbRoom) {
    const ps = v.players ?? {};
    const h = ps[v.host];
    if (h && h.online !== false) return;
    const cands = Object.entries(ps)
      .filter(([, p]) => p.online !== false)
      .sort((a, b) => Number(!!a[1].spec) - Number(!!b[1].spec) || a[1].joined - b[1].joined);
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
    const play = isPlay(v.play) ? v.play : "vs";
    let allDone: boolean;
    if (play === "vs") {
      const parts = Object.entries(v.players ?? {}).filter(([, p]) => p.round === v.round && !p.spec);
      allDone = parts.length > 0 && parts.every(([, p]) => p.status === "done" || p.online === false);
    } else {
      // 塔の代表が抜けたら、そのチームはそこまで
      const teams = Object.entries(v.teams ?? {});
      allDone = teams.length > 0 && teams.every(([, t]) => t.status === "done" || v.players?.[t.host]?.online === false);
    }
    if (allDone) return void this.finish(m, v.round);
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
      if (p.round !== round || p.status === "done" || p.spec) continue;
      up[`players/${id}/status`] = "done";
      up[`players/${id}/score`] = this.liveScores.get(id) ?? cleanScore(p.score);
    }
    for (const [id, t] of Object.entries(v.teams ?? {})) if (t.status !== "done") up[`teams/${id}/status`] = "done";
    await m.update(m.ref(m.db, ROOM(this.code)), up).catch(() => {});
  }

  private async start(m: FB) {
    const v = this.room;
    if (!v || v.host !== this.me || v.state === "playing") return;
    const round = (v.round || 0) + 1;
    const startAt = now() + 3500;
    const play = isPlay(v.play) ? v.play : "vs";
    const up: Record<string, unknown> = {
      state: "playing",
      round,
      seed: (Math.random() * 2 ** 32) >>> 0,
      startAt,
      endAt: startAt + BATTLE_SECONDS * 1000,
    };
    // teams は丸ごと書く（Firebase は同じ更新で親と子のパスを両方は書けない）
    const teams: Record<string, FbTeam> = {};
    const parts = Object.entries(v.players ?? {})
      .filter(([, p]) => p.online !== false && !p.spec)
      .sort((a, b) => a[1].joined - b[1].joined);
    for (const [id] of parts) {
      up[`players/${id}/round`] = round;
      up[`players/${id}/status`] = "playing";
      up[`players/${id}/score`] = { ...ZERO };
    }
    const boxes: TeamId[] = [];
    if (play === "coop" && parts.length) {
      const host = parts.find(([id]) => id === this.me)?.[0] ?? parts[0][0];
      teams.C = { host, status: "playing", score: { ...ZERO } };
      boxes.push("C");
    }
    if (play === "team" && parts.length) {
      // 決めていない人は少ないほうへ。片方が空なら1人移す
      const teamOf: Record<string, "A" | "B"> = {};
      const cnt = { A: 0, B: 0 };
      for (const [id, p] of parts)
        if (p.team === "A" || p.team === "B") {
          teamOf[id] = p.team;
          cnt[p.team]++;
        }
      for (const [id] of parts)
        if (!teamOf[id]) {
          const t = cnt.A <= cnt.B ? "A" : "B";
          teamOf[id] = t;
          cnt[t]++;
        }
      for (const [t, o] of [["A", "B"], ["B", "A"]] as const)
        if (!cnt[t] && cnt[o] >= 2) {
          const mv = parts.filter(([id]) => teamOf[id] === o).pop()![0];
          teamOf[mv] = t;
          cnt[t]++;
          cnt[o]--;
        }
      for (const [id] of parts) up[`players/${id}/team`] = teamOf[id];
      for (const t of ["A", "B"] as const) {
        const host = parts.find(([id]) => teamOf[id] === t)?.[0];
        if (!host) continue;
        teams[t] = { host, status: "playing", score: { ...ZERO } };
        boxes.push(t);
      }
    }
    up.teams = boxes.length ? teams : null;
    this.liveScores.clear();
    try {
      await m.set(m.ref(m.db, LIVE(this.code)), { created: now() });
      await m.set(m.ref(m.db, EV(this.code)), { created: now() });
      for (const t of boxes) await m.set(m.ref(m.db, BOX(this.code, t)), { created: now() });
      await m.update(m.ref(m.db, ROOM(this.code)), up);
    } catch (e) {
      this.onMsg({ t: "error", error: netError(e).message });
    }
  }

  send(msg: { t: string; score?: Score; mode?: Mode; play?: Play; on?: boolean; team?: "A" | "B" }) {
    void fb().then(async (m) => {
      const base = `${ROOM(this.code)}/players/${this.me}`;
      const v = this.room;
      const hostInLobby = v?.host === this.me && v.state !== "playing";
      switch (msg.t) {
        case "start":
          return this.start(m);
        case "done":
          return m.update(m.ref(m.db, base), { status: "done", score: cleanScore(msg.score), doneAt: now() }).catch(() => {});
        case "mode":
          if (hostInLobby && isMode(msg.mode)) return m.update(m.ref(m.db, ROOM(this.code)), { mode: msg.mode }).catch(() => {});
          return;
        case "play":
          if (hostInLobby && isPlay(msg.play)) return m.update(m.ref(m.db, ROOM(this.code)), { play: msg.play }).catch(() => {});
          return;
        case "jama":
          if (hostInLobby) return m.update(m.ref(m.db, ROOM(this.code)), { jama: !!msg.on }).catch(() => {});
          return;
        case "spec":
          // 部屋主は観戦にできない（始める人がいなくなるため）
          if (v?.host !== this.me) return m.update(m.ref(m.db, base), { spec: msg.on ? true : null }).catch(() => {});
          return;
        case "team":
          if (v?.state !== "playing") return m.update(m.ref(m.db, base), { team: msg.team ?? null }).catch(() => {});
          return;
        case "rematch":
          if (v?.host === this.me) return m.update(m.ref(m.db, ROOM(this.code)), { state: "lobby" }).catch(() => {});
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

  /** おじゃま・スタンプを送る */
  sendEvent(ev: Omit<RoomEvent, "id" | "from" | "name" | "t">) {
    void fb().then((m) =>
      m.set(m.push(m.ref(m.db, EV(this.code))), { ...ev, from: this.me, name: this.name, t: now() }).catch(() => {}),
    );
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

  // ---------- 協力・チーム戦の塔 ----------

  /** 塔の盤面を受け取る。止める関数を返す */
  watchBox(team: TeamId, cb: (st: SharedBox) => void): () => void {
    let un = () => {};
    let stopped = false;
    void fb().then((m) => {
      if (stopped) return;
      un = m.onValue(m.ref(m.db, `${BOX(this.code, team)}/st`), (s) => {
        const v = s.val();
        if (!v) return;
        try {
          cb({ ...v, p: typeof v.p === "string" ? JSON.parse(v.p) : v.p ?? [] });
        } catch {
          /* 壊れた盤面は無視 */
        }
      });
    });
    const stop = () => {
      stopped = true;
      un();
    };
    this.unsubs.push(stop);
    return stop;
  }

  /** 代表の端末が盤面を配る（字の並びは文字列にして軽くする） */
  pushBox(team: TeamId, st: SharedBox) {
    void fb().then((m) => m.set(m.ref(m.db, `${BOX(this.code, team)}/st`), { ...st, p: JSON.stringify(st.p) }).catch(() => {}));
  }

  /** 番の人が操作を送る */
  sendCmd(team: TeamId, cmd: Command) {
    void fb().then((m) =>
      m.set(m.push(m.ref(m.db, `${BOX(this.code, team)}/cmd`)), { ...cmd, from: this.me, r: this.room?.round ?? 0 }).catch(() => {}),
    );
  }

  /** 代表の端末が操作を受け取る（受け取ったものは消す） */
  watchCmds(team: TeamId, cb: (cmd: Command & { from: string; r: number }) => void): () => void {
    let un = () => {};
    let stopped = false;
    void fb().then((m) => {
      if (stopped) return;
      un = m.onChildAdded(m.ref(m.db, `${BOX(this.code, team)}/cmd`), (s) => {
        const v = s.val();
        void m.remove(s.ref).catch(() => {});
        if (v && typeof v.type === "string") cb(v);
      });
    });
    const stop = () => {
      stopped = true;
      un();
    };
    this.unsubs.push(stop);
    return stop;
  }

  /** 代表の端末がチームの記録を部屋に書く */
  setTeam(team: TeamId, score: Score, done: boolean) {
    void fb().then((m) =>
      m
        .update(m.ref(m.db, `${ROOM(this.code)}/teams/${team}`), { score: cleanScore(score), ...(done ? { status: "done" } : {}) })
        .catch(() => {}),
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
