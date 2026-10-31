import type { Piece } from "./render";
import type { Kind, Score } from "./shared/rules";
import { store } from "./storage";

/** ランキング・対戦サーバー（ビルド時に埋め込む公開値） */
export const API = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";
export const online = () => !!API;

export interface RankRow extends Score {
  name: string;
  at: number;
}

const cache = new Map<Kind, { t: number; rows: RankRow[] }>();

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(API + path, {
      ...init,
      signal: ctl.signal,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || messageFor(res.status));
    return body as T;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("通信がタイムアウトしました");
    if (e instanceof TypeError) throw new Error("サーバーにつながりません");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function messageFor(status: number) {
  if (status === 429) return "送信が多すぎます。少し待ってください";
  if (status === 503) return "サーバーが一時的に使えません";
  return `エラー（${status}）`;
}

export async function getRanking(kind: Kind, force = false): Promise<RankRow[]> {
  const c = cache.get(kind);
  if (!force && c && Date.now() - c.t < 5 * 60_000) return c.rows;
  const { rows } = await call<{ rows: RankRow[] }>(`/api/ranking?kind=${kind}`);
  cache.set(kind, { t: Date.now(), rows });
  return rows;
}

export async function submitScore(
  name: string,
  s: Score & { playMs: number; drops: number },
): Promise<Record<Kind, number>> {
  const { ranks } = await call<{ ranks: Record<Kind, number> }>("/api/scores", {
    method: "POST",
    body: JSON.stringify({ name, ...s, device: store.get().device }),
  });
  cache.clear();
  return ranks;
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

export async function createRoom(): Promise<string> {
  const { code } = await call<{ code: string }>("/api/rooms", { method: "POST", body: "{}" });
  return code;
}

export class RoomClient {
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private retries = 0;
  constructor(
    readonly code: string,
    private name: string,
    private onMsg: (m: ServerMsg) => void,
    private onStatus: (s: "open" | "closed" | "retry") => void,
  ) {
    this.open();
  }

  private open() {
    const url = API.replace(/^http/, "ws") + `/api/rooms/${this.code}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      this.onStatus("open");
      this.send({ t: "hello", name: this.name, device: store.get().device });
    };
    ws.onmessage = (e) => {
      try {
        this.onMsg(JSON.parse(e.data));
      } catch {
        /* 壊れたメッセージは無視 */
      }
    };
    ws.onclose = () => {
      if (this.closedByUser) return;
      if (this.retries++ < 4) {
        this.onStatus("retry");
        setTimeout(() => this.open(), 800 * this.retries);
      } else this.onStatus("closed");
    };
  }

  send(m: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  sendTower(score: Score, pieces: Piece[], index: Map<string, number>) {
    const tower = pieces.map((p) => [index.get(p.ch)!, +p.x.toFixed(2), +p.y.toFixed(2), +p.a.toFixed(2)]);
    this.send({ t: "tower", score, tower });
  }

  close() {
    this.closedByUser = true;
    this.send({ t: "leave" });
    this.ws?.close();
  }
}
