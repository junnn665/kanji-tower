/// <reference types="@cloudflare/workers-types" />
// ランキング API と対戦の部屋（Durable Object）
import { DurableObject } from "cloudflare:workers";
import {
  BATTLE_SECONDS,
  compareScore,
  KINDS,
  MAX_PLAYERS,
  normalizeName,
  plausible,
  type Kind,
  type Score,
} from "../src/shared/rules";

export interface Env {
  DB: D1Database;
  ROOMS: DurableObjectNamespace<Room>;
  /** カンマ区切りの許可オリジン（例：https://you.github.io） */
  ALLOWED_ORIGINS: string;
}

const KEEP_DAYS = 90;
const DAY = 86_400_000;

// ---------- 共通 ----------
function allowed(env: Env, origin: string | null) {
  if (!origin) return false;
  return env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).includes(origin);
}

function cors(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  return allowed(env, origin)
    ? {
        "access-control-allow-origin": origin!,
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
        vary: "origin",
      }
    : { vary: "origin" };
}

function json(env: Env, req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cors(env, req) },
  });
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ORDER: Record<Kind, string> = {
  strokes: "strokes DESC, height DESC, count DESC, created_at ASC",
  height: "height DESC, strokes DESC, count DESC, created_at ASC",
  count: "count DESC, strokes DESC, height DESC, created_at ASC",
};

// ---------- ランキング ----------
async function getRanking(env: Env, req: Request, url: URL) {
  const kind = url.searchParams.get("kind") as Kind;
  if (!KINDS.includes(kind)) return json(env, req, { error: "種目が正しくありません" }, 400);
  const since = Date.now() - KEEP_DAYS * DAY;
  const { results } = await env.DB.prepare(
    `SELECT name, strokes, height, count, created_at AS at FROM scores WHERE created_at >= ? ORDER BY ${ORDER[kind]} LIMIT 100`,
  )
    .bind(since)
    .all();
  return json(env, req, { rows: results });
}

async function postScore(env: Env, req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(env, req, { error: "送信内容が読めません" }, 400);
  }
  const name = normalizeName(body.name);
  const s = {
    strokes: body.strokes as number,
    height: body.height as number,
    count: body.count as number,
    playMs: body.playMs as number,
    drops: body.drops as number,
  };
  if (!name) return json(env, req, { error: "名前を入れてください" }, 400);
  if (typeof body.device !== "string" || body.device.length < 8 || body.device.length > 64)
    return json(env, req, { error: "端末の情報がありません" }, 400);
  if (!plausible(s)) return json(env, req, { error: "記録を受け付けられませんでした" }, 400);

  const device = await sha256(`kanji-tower:${body.device}`);
  const now = Date.now();
  // 1端末あたり1分に6件まで（INSERT の条件で判定するので同時送信でもすり抜けない）
  const res = await env.DB.prepare(
    `INSERT INTO scores (name, strokes, height, count, play_ms, drops, device_hash, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
     WHERE (SELECT COUNT(*) FROM scores WHERE device_hash = ?7 AND created_at > ?8 - 60000) < 6`,
  )
    .bind(name, s.strokes, s.height, s.count, s.playMs, s.drops, device, now)
    .run();
  if (!res.meta.changes) return json(env, req, { error: "送信が多すぎます。少し待ってください" }, 429);

  // 古い記録を少しずつ消す
  await env.DB.prepare(`DELETE FROM scores WHERE id IN (SELECT id FROM scores WHERE created_at < ? LIMIT 200)`)
    .bind(now - KEEP_DAYS * DAY)
    .run();

  // 表示と同じ並びで順位を数える
  const since = now - KEEP_DAYS * DAY;
  const id = res.meta.last_row_id;
  const ranks = {} as Record<Kind, number>;
  for (const kind of KINDS) {
    const [a, b, c] = [kind, ...KINDS.filter((k) => k !== kind)];
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM scores WHERE created_at >= ?1 AND (
        ${a} > ?2 OR (${a} = ?2 AND ${b} > ?3) OR (${a} = ?2 AND ${b} = ?3 AND ${c} > ?4)
        OR (${a} = ?2 AND ${b} = ?3 AND ${c} = ?4 AND id < ?5))`,
    )
      .bind(since, s[a], s[b], s[c], id)
      .first<{ n: number }>();
    ranks[kind] = (row?.n ?? 0) + 1;
  }
  return json(env, req, { ok: true, ranks });
}

// ---------- 部屋 ----------
async function createRoom(env: Env, req: Request) {
  for (let i = 0; i < 8; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    if (await stub.claim(code)) return json(env, req, { code });
  }
  return json(env, req, { error: "部屋がいっぱいです。少し待ってください" }, 503);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env, req) });
    if (url.pathname === "/health") return json(env, req, { ok: true });

    const origin = req.headers.get("origin");
    if (url.pathname.startsWith("/api/") && !allowed(env, origin))
      return new Response("forbidden origin", { status: 403 });

    try {
      if (url.pathname === "/api/ranking" && req.method === "GET") return await getRanking(env, req, url);
      if (url.pathname === "/api/scores" && req.method === "POST") return await postScore(env, req);
      if (url.pathname === "/api/rooms" && req.method === "POST") return await createRoom(env, req);
      const m = url.pathname.match(/^\/api\/rooms\/(\d{4})\/ws$/);
      if (m) {
        if (req.headers.get("upgrade") !== "websocket") return new Response("websocket only", { status: 426 });
        return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
      }
    } catch (e) {
      console.error(e);
      return json(env, req, { error: "サーバーが一時的に使えません" }, 503);
    }
    return json(env, req, { error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

// ---------- Durable Object：1部屋 ----------
interface Player {
  id: string;
  name: string;
  host: boolean;
  status: "lobby" | "playing" | "done" | "left";
  score: Score;
  joinedAt: number;
}

interface RoomData {
  code: string;
  phase: "lobby" | "playing" | "result";
  players: Player[];
  seed: number;
  startsAt: number;
  endsAt: number;
  touchedAt: number;
}

const ZERO: Score = { strokes: 0, height: 0, count: 0 };
const IDLE_MS = 30 * 60_000;

export class Room extends DurableObject<Env> {
  private data: RoomData | null = null;

  private async load(): Promise<RoomData | null> {
    this.data ??= (await this.ctx.storage.get<RoomData>("room")) ?? null;
    return this.data;
  }

  /** 前回配ってから変わった塔。まとめて1通で全員に配る */
  private latest = new Map<string, { id: string; score: Score; tower: unknown[] }>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  private flushSoon() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (!this.latest.size) return;
      this.broadcast({ t: "towers", list: [...this.latest.values()] });
      this.latest.clear();
    }, 400);
  }

  private async save() {
    if (!this.data) return;
    this.data.touchedAt = Date.now();
    await this.ctx.storage.put("room", this.data);
  }

  /** 新しい部屋として使えるなら確保する */
  async claim(code: string): Promise<boolean> {
    const d = await this.load();
    const live = this.ctx.getWebSockets().length > 0;
    if (d && (live || Date.now() - d.touchedAt < IDLE_MS)) return false;
    this.data = { code, phase: "lobby", players: [], seed: 0, startsAt: 0, endsAt: 0, touchedAt: Date.now() };
    await this.save();
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    return true;
  }

  async fetch(req: Request): Promise<Response> {
    const d = await this.load();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    if (!d) {
      server.send(JSON.stringify({ t: "error", error: "その部屋番号は見つかりません" }));
      server.close(4004, "no room");
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  private send(ws: WebSocket, msg: unknown) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* 切れている */
    }
  }

  private broadcast(msg: unknown, except?: WebSocket) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(s);
      } catch {
        /* 切れている */
      }
    }
  }

  private publish() {
    const d = this.data!;
    const players = [...d.players];
    if (d.phase === "result") players.sort((a, b) => compareScore("strokes", a.score, b.score));
    this.broadcast({ t: "room", now: Date.now(), room: { ...d, players } });
  }

  private ensureHost() {
    const d = this.data!;
    const active = d.players.filter((p) => p.status !== "left");
    if (active.length && !active.some((p) => p.host)) {
      d.players.forEach((p) => (p.host = false));
      active[0].host = true;
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const d = await this.load();
    if (!d || typeof raw !== "string" || raw.length > 20_000) return;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const me = ws.deserializeAttachment() as { id: string } | null;
    const player = me ? d.players.find((p) => p.id === me.id) : undefined;

    switch (m.t) {
      case "hello": {
        const name = normalizeName(m.name) ?? "名なし";
        const device = typeof m.device === "string" ? m.device.slice(0, 64) : crypto.randomUUID();
        const id = (await sha256(`${d.code}:${device}`)).slice(0, 12);
        let p = d.players.find((x) => x.id === id);
        if (!p) {
          // ロビーでは退出した人の枠をあける
          if (d.phase === "lobby") d.players = d.players.filter((x) => x.status !== "left");
          if (d.players.filter((x) => x.status !== "left").length >= MAX_PLAYERS) {
            this.send(ws, { t: "error", error: `この部屋は満員です（${MAX_PLAYERS}人まで）` });
            ws.close(4003, "full");
            return;
          }
          p = { id, name, host: false, status: "lobby", score: { ...ZERO }, joinedAt: Date.now() };
          d.players.push(p);
        } else {
          p.name = name;
          if (p.status === "left") p.status = d.phase === "playing" ? "done" : "lobby";
        }
        ws.serializeAttachment({ id });
        this.ensureHost();
        await this.save();
        this.send(ws, { t: "you", id });
        this.publish();
        break;
      }
      case "start": {
        if (!player?.host || d.phase !== "lobby") return;
        const active = d.players.filter((p) => p.status !== "left");
        if (active.length < 2) return;
        d.phase = "playing";
        d.seed = (Math.random() * 2 ** 32) >>> 0;
        d.startsAt = Date.now() + 3500;
        d.endsAt = d.startsAt + BATTLE_SECONDS * 1000;
        for (const p of active) {
          p.status = "playing";
          p.score = { ...ZERO };
        }
        await this.save();
        await this.ctx.storage.setAlarm(d.endsAt + 4000);
        this.publish();
        break;
      }
      case "tower": {
        if (!player || player.status !== "playing" || d.phase !== "playing") return;
        const s = m.score as Score;
        if (s && [s.strokes, s.height, s.count].every((v) => Number.isInteger(v) && v >= 0 && v < 100_000))
          player.score = { strokes: s.strokes, height: s.height, count: s.count };
        const tower = Array.isArray(m.tower) ? (m.tower as unknown[]).slice(0, 200) : [];
        this.latest.set(player.id, { id: player.id, score: player.score, tower });
        this.flushSoon();
        break;
      }
      case "done": {
        if (!player || d.phase !== "playing" || player.status !== "playing") return;
        const s = m.score as Score;
        if (s && [s.strokes, s.height, s.count].every((v) => Number.isInteger(v) && v >= 0 && v < 100_000))
          player.score = { strokes: s.strokes, height: s.height, count: s.count };
        player.status = "done";
        await this.finishIfAllDone();
        break;
      }
      case "rematch": {
        if (!player?.host || d.phase !== "result") return;
        d.phase = "lobby";
        d.players = d.players.filter((p) => p.status !== "left");
        for (const p of d.players) {
          p.status = "lobby";
          p.score = { ...ZERO };
        }
        await this.save();
        this.publish();
        break;
      }
      case "leave": {
        if (player) await this.markLeft(player);
        ws.close(1000, "bye");
        break;
      }
    }
  }

  private async markLeft(p: Player) {
    const d = this.data!;
    p.status = "left";
    p.host = false;
    if (d.phase === "lobby") d.players = d.players.filter((x) => x !== p);
    this.ensureHost();
    if (d.phase === "playing") await this.finishIfAllDone();
    else {
      await this.save();
      this.publish();
    }
  }

  private async finishIfAllDone() {
    const d = this.data!;
    if (d.players.some((p) => p.status === "playing")) {
      await this.save();
      this.publish();
      return;
    }
    d.phase = "result";
    await this.save();
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    this.publish();
  }

  async webSocketClose(ws: WebSocket) {
    const d = await this.load();
    const me = ws.deserializeAttachment() as { id: string } | null;
    if (!d || !me) return;
    // 同じ人が別の接続でつながっていれば退出にしない
    const still = this.ctx
      .getWebSockets()
      .some((w) => w !== ws && (w.deserializeAttachment() as { id: string } | null)?.id === me.id);
    const p = d.players.find((x) => x.id === me.id);
    if (p && !still && p.status !== "left") await this.markLeft(p);
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    const d = await this.load();
    if (!d) return;
    if (d.phase === "playing" && Date.now() >= d.endsAt) {
      // 時間切れ：まだ終わっていない人もその時点の記録で確定
      for (const p of d.players) if (p.status === "playing") p.status = "done";
      await this.finishIfAllDone();
      return;
    }
    if (this.ctx.getWebSockets().length === 0 && Date.now() - d.touchedAt >= IDLE_MS) {
      await this.ctx.storage.deleteAll();
      this.data = null;
      return;
    }
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
  }
}
