// テスト用：Firebase Realtime Database の、このゲームで使う部分だけをメモリー上でまねる
type Json = unknown;
type Cons =
  | { kind: "orderByChild"; key: string }
  | { kind: "orderByKey" }
  | { kind: "limitToLast" | "limitToFirst"; n: number }
  | { kind: "endAt" | "startAt"; v: number | string };
interface Ref {
  path: string;
  key: string | null;
  cons?: Cons[];
}

let root: Record<string, Json> = {};
let pushN = 0;
const listeners = new Set<{ path: string; fire: () => void }>();

export const db = {};
export const reset = () => {
  root = {};
  listeners.clear();
};
export const dump = () => root;

const parts = (p: string) => p.split("/").filter(Boolean);
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function read(path: string): Json {
  let cur: Json = root;
  for (const k of parts(path)) {
    if (cur == null || typeof cur !== "object") return null;
    cur = (cur as Record<string, Json>)[k];
  }
  return cur === undefined ? null : clone(cur);
}

function write(path: string, v: Json) {
  const ks = parts(path);
  let cur = root as Record<string, Json>;
  for (const k of ks.slice(0, -1)) {
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k] as Record<string, Json>;
  }
  const last = ks[ks.length - 1];
  if (v === null || v === undefined) delete cur[last];
  else cur[last] = clone(v);
}

function notify() {
  queueMicrotask(() => [...listeners].forEach((l) => l.fire()));
}

// ブラウザーで画面を確かめるときは、同じブラウザーのタブどうしでデータを共有する（対戦を試すため）
const chan = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("fake-firebase") : null;
let synced: () => void = () => {};
const ready: Promise<void> = chan ? new Promise((r) => ((synced = r), setTimeout(r, 500))) : Promise.resolve();
if (chan) {
  chan.onmessage = (e) => {
    const m = e.data;
    if (m.type === "w") {
      for (const [path, v] of m.writes as [string, Json][]) write(path, v);
      notify();
    } else if (m.type === "sync?") chan.postMessage({ type: "sync", root });
    else if (m.type === "sync" && Object.keys(root).length === 0) {
      root = m.root;
      synced();
      notify();
    }
  };
  chan.postMessage({ type: "sync?" });
}
function commit(writes: [string, Json][]) {
  for (const [path, v] of writes) write(path, v);
  chan?.postMessage({ type: "w", writes: JSON.parse(JSON.stringify(writes.map(([p, v]) => [p, v ?? null]))) });
  notify();
}

class Snap {
  constructor(
    readonly key: string | null,
    private v: Json,
    readonly ref: Ref,
    private order?: string[],
  ) {}
  val() {
    return this.v;
  }
  get size() {
    return this.keys().length;
  }
  private keys() {
    return this.order ?? (this.v && typeof this.v === "object" ? Object.keys(this.v as object) : []);
  }
  forEach(cb: (c: Snap) => void) {
    for (const k of this.keys()) cb(new Snap(k, (this.v as Record<string, Json>)[k], ref(db, `${this.ref.path}/${k}`)));
  }
}

function snapOf(r: Ref): Snap {
  if (r.path === ".info/serverTimeOffset") return new Snap("serverTimeOffset", 0, r);
  if (r.path === ".info/connected") return new Snap("connected", true, r);
  let v = read(r.path);
  if (!r.cons?.length || !v || typeof v !== "object") return new Snap(r.key, v, r);
  const byKey = r.cons.some((c) => c.kind === "orderByKey");
  const by = (r.cons.find((c) => c.kind === "orderByChild") as { key: string } | undefined)?.key;
  const val = (k: string): number | string => {
    if (byKey) return k;
    const c = (v as Record<string, Record<string, number>>)[k];
    return c && typeof c === "object" ? (c[by!] ?? -Infinity) : -Infinity;
  };
  let keys = Object.keys(v as object).sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0));
  for (const c of r.cons) {
    if (c.kind === "endAt") keys = keys.filter((k) => val(k) <= c.v);
    if (c.kind === "startAt") keys = keys.filter((k) => val(k) >= c.v);
    if (c.kind === "limitToLast") keys = keys.slice(-c.n);
    if (c.kind === "limitToFirst") keys = keys.slice(0, c.n);
  }
  const out: Record<string, Json> = {};
  keys.forEach((k) => (out[k] = (v as Record<string, Json>)[k]));
  v = out;
  return new Snap(r.key, v, r, keys);
}

export const ref = (_db: unknown, path = ""): Ref => ({ path, key: parts(path).pop() ?? null });
export const query = (r: Ref, ...cons: Cons[]): Ref => ({ ...r, cons });
export const orderByChild = (key: string): Cons => ({ kind: "orderByChild", key });
export const limitToLast = (n: number): Cons => ({ kind: "limitToLast", n });
export const limitToFirst = (n: number): Cons => ({ kind: "limitToFirst", n });
export const endAt = (v: number | string): Cons => ({ kind: "endAt", v });
export const startAt = (v: number | string): Cons => ({ kind: "startAt", v });
export const orderByKey = (): Cons => ({ kind: "orderByKey" });

export const get = async (r: Ref) => {
  await ready;
  // 本物と同じく、索引のない子での並べかえは get() では断られる（索引は rooms の created だけ）
  const by = (r.cons?.find((c) => c.kind === "orderByChild") as { key: string } | undefined)?.key;
  if (by && !(r.path === "rooms" && by === "created")) throw new Error(`Index not defined, add ".indexOn": "${by}", for path "/${r.path}", to the rules`);
  return snapOf(r);
};
export const set = async (r: Ref, v: Json) => commit([[r.path, v]]);
export const update = async (r: Ref, v: Record<string, Json>) => {
  const ks = Object.keys(v);
  for (const k of ks)
    if (ks.some((o) => o !== k && o.startsWith(k + "/")))
      throw new Error(`Reference.update failed: ${k} is an ancestor of another path`);
  commit(Object.entries(v).map(([k, x]) => [`${r.path}/${k}`, x]));
};
export const remove = async (r: Ref) => set(r, null);
export const push = (r: Ref) => ref(db, `${r.path}/k${Date.now().toString(36)}${String(++pushN).padStart(4, "0")}${Math.random().toString(36).slice(2, 6)}`);
export const runTransaction = async (r: Ref, fn: (cur: Json) => Json) => {
  await ready;
  const res = fn(read(r.path));
  if (res === undefined) return { committed: false, snapshot: snapOf(r) };
  await set(r, res);
  return { committed: true, snapshot: snapOf(r) };
};
export const onDisconnect = (_r: Ref) => ({ set: async () => {}, cancel: async () => {} });

export function onValue(r: Ref, cb: (s: Snap) => void, _err?: (e: Error) => void, opts?: { onlyOnce?: boolean }) {
  let last = "\u0000";
  const l = {
    path: r.path,
    fire: () => {
      const s = snapOf(r);
      const j = JSON.stringify(s.val());
      if (j === last) return;
      last = j;
      if (opts?.onlyOnce) listeners.delete(l);
      cb(s);
    },
  };
  listeners.add(l);
  queueMicrotask(l.fire);
  return () => listeners.delete(l);
}

function childListener(r: Ref, cb: (s: Snap) => void, mode: "added" | "changed") {
  const seen = new Map<string, string>(Object.entries((read(r.path) as object) ?? {}).map(([k, v]) => [k, JSON.stringify(v)]));
  if (mode === "added") queueMicrotask(() => seen.forEach((_, k) => cb(new Snap(k, read(`${r.path}/${k}`), ref(db, `${r.path}/${k}`)))));
  const l = {
    path: r.path,
    fire: () => {
      const cur = (read(r.path) as Record<string, Json>) ?? {};
      for (const [k, v] of Object.entries(cur)) {
        const j = JSON.stringify(v);
        const prev = seen.get(k);
        if (prev === j) continue;
        seen.set(k, j);
        if ((prev === undefined) === (mode === "added")) cb(new Snap(k, clone(v), ref(db, `${r.path}/${k}`)));
      }
      for (const k of [...seen.keys()]) if (!(k in cur)) seen.delete(k);
    },
  };
  listeners.add(l);
  return () => listeners.delete(l);
}
export const onChildAdded = (r: Ref, cb: (s: Snap) => void) => childListener(r, cb, "added");
export const onChildChanged = (r: Ref, cb: (s: Snap) => void) => childListener(r, cb, "changed");
export type DataSnapshot = Snap;
