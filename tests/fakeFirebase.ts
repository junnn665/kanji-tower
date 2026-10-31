// テスト用：Firebase Realtime Database の、このゲームで使う部分だけをメモリー上でまねる
type Json = unknown;
type Cons = { kind: "orderByChild"; key: string } | { kind: "limitToLast" | "limitToFirst"; n: number } | { kind: "endAt"; v: number };
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
  const by = (r.cons.find((c) => c.kind === "orderByChild") as { key: string } | undefined)?.key;
  const val = (k: string) => {
    const c = (v as Record<string, Record<string, number>>)[k];
    return c && typeof c === "object" ? (c[by!] ?? null) : null;
  };
  let keys = Object.keys(v as object).sort((a, b) => ((val(a) ?? -Infinity) as number) - ((val(b) ?? -Infinity) as number));
  for (const c of r.cons) {
    if (c.kind === "endAt") keys = keys.filter((k) => (val(k) ?? -Infinity) <= c.v);
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
export const endAt = (v: number): Cons => ({ kind: "endAt", v });

export const get = async (r: Ref) => snapOf(r);
export const set = async (r: Ref, v: Json) => {
  write(r.path, v);
  notify();
};
export const update = async (r: Ref, v: Record<string, Json>) => {
  for (const [k, x] of Object.entries(v)) write(`${r.path}/${k}`, x);
  notify();
};
export const remove = async (r: Ref) => set(r, null);
export const push = (r: Ref) => ref(db, `${r.path}/k${String(++pushN).padStart(6, "0")}`);
export const runTransaction = async (r: Ref, fn: (cur: Json) => Json) => {
  const res = fn(read(r.path));
  if (res === undefined) return { committed: false, snapshot: snapOf(r) };
  await set(r, res);
  return { committed: true, snapshot: snapOf(r) };
};
export const onDisconnect = (_r: Ref) => ({ set: async () => {}, cancel: async () => {} });

export function onValue(r: Ref, cb: (s: Snap) => void) {
  let last = "\u0000";
  const l = {
    path: r.path,
    fire: () => {
      const s = snapOf(r);
      const j = JSON.stringify(s.val());
      if (j === last) return;
      last = j;
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
