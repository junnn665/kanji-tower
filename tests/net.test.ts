import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fake from "./fakeFirebase";

vi.mock("../src/firebase", () => import("./fakeFirebase"));

const { createRoom, RoomClient, submitScore, getRanking } = await import("../src/api");
type Msg = import("../src/api").ServerMsg;

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

function player(code: string, name: string, pid: string) {
  const msgs: Msg[] = [];
  const client = new RoomClient(code, name, (m) => msgs.push(m), () => {}, pid);
  const room = () => [...msgs].reverse().find((m) => m.t === "room") as Extract<Msg, { t: "room" }> | undefined;
  return { client, msgs, room };
}

beforeEach(() => fake.reset());

describe("対戦の部屋（Firebase）", () => {
  it("3人で始めて、終わったら総画数の順に並ぶ", async () => {
    const code = await createRoom("pA");
    expect(code).toMatch(/^\d{4}$/);
    expect(Object.keys(fake.dump().rooms as object)).toEqual([`kanji-${code}`]);

    const a = player(code, "あおい", "pA");
    const b = player(code, "けんた", "pB");
    const c = player(code, "さくら", "pC");
    await tick();
    const lobby = a.room()!.room;
    expect(lobby.phase).toBe("lobby");
    expect(lobby.players.map((p) => p.name)).toEqual(["あおい", "けんた", "さくら"]);
    expect(lobby.players.find((p) => p.host)?.id).toBe("pA");

    a.client.send({ t: "start" });
    await tick();
    for (const p of [a, b, c]) expect(p.room()!.room.phase).toBe("playing");
    expect(b.room()!.room.seed).toBe(a.room()!.room.seed);
    expect(b.room()!.room.players.every((p) => p.status === "playing")).toBe(true);

    // 塔が相手に届く
    b.client.sendTower({ strokes: 12, height: 150, count: 3 }, [{ ch: "林", x: 0, y: 0.4, a: 0 }], new Map([["林", 24]]));
    await tick();
    const towers = a.msgs.filter((m) => m.t === "towers") as Extract<Msg, { t: "towers" }>[];
    expect(towers.at(-1)!.list[0]).toMatchObject({ id: "pB", score: { strokes: 12 }, tower: [[24, 0, 0.4, 0]] });

    // A と B は終わり、C は通信が切れた → 部屋主が結果にする
    a.client.send({ t: "done", score: { strokes: 20, height: 200, count: 4 } });
    b.client.send({ t: "done", score: { strokes: 30, height: 180, count: 5 } });
    c.client.close();
    await tick(40);
    const res = a.room()!.room;
    expect(res.phase).toBe("result");
    expect(res.players.map((p) => p.name)).toEqual(["けんた", "あおい", "さくら"]);
    expect(res.players[2].status).toBe("left");

    // 再戦で待合室へ、退出した人は出ない
    a.client.send({ t: "rematch" });
    await tick();
    expect(b.room()!.room.phase).toBe("lobby");
    expect(b.room()!.room.players.map((p) => p.name)).toEqual(["あおい", "けんた"]);
  });

  it("観戦の人は対戦に入らず、おじゃま・スタンプは届く", async () => {
    const code = await createRoom("pA");
    const a = player(code, "あおい", "pA");
    const b = player(code, "けんた", "pB");
    const w = player(code, "みる", "pW");
    await tick();
    w.client.send({ t: "spec", on: true });
    a.client.send({ t: "spec", on: true }); // 部屋主は観戦にできない
    await tick();
    a.client.send({ t: "start" });
    await tick();
    const r = a.room()!.room;
    expect(r.players.find((p) => p.id === "pW")).toMatchObject({ spec: true, status: "lobby" });
    expect(r.players.find((p) => p.id === "pA")).toMatchObject({ spec: false, status: "playing" });
    b.client.sendEvent({ type: "jama", to: "pA", ch: "鬱", round: r.round });
    b.client.sendEvent({ type: "stamp", stamp: "👏", round: r.round });
    await tick();
    const evs = (x: typeof a) => x.msgs.filter((m) => m.t === "event").map((m) => (m as Extract<Msg, { t: "event" }>).ev);
    expect(evs(a).map((e) => e.type)).toEqual(["jama", "stamp"]);
    expect(evs(w)[0]).toMatchObject({ type: "jama", to: "pA", ch: "鬱", name: "けんた" });
    // 観戦の人を除いた2人が終われば結果
    a.client.send({ t: "done", score: { strokes: 5, height: 100, count: 1 } });
    b.client.send({ t: "done", score: { strokes: 9, height: 100, count: 2 } });
    await tick(40);
    expect(a.room()!.room.phase).toBe("result");
  });

  it("協力：1つの塔を代表が配り、操作は代表に届く。代表が終われば結果", async () => {
    const code = await createRoom("pA");
    const a = player(code, "あおい", "pA");
    const b = player(code, "けんた", "pB");
    await tick();
    a.client.send({ t: "play", play: "coop" });
    await tick();
    a.client.send({ t: "start" });
    await tick();
    const r = b.room()!.room;
    expect(r.play).toBe("coop");
    expect(r.teams).toHaveLength(1);
    expect(r.teams[0]).toMatchObject({ id: "C", host: "pA", status: "playing", members: ["pA", "pB"] });
    const seen: unknown[] = [];
    b.client.watchBox("C", (st) => seen.push(st));
    const cmds: unknown[] = [];
    a.client.watchCmds("C", (c) => cmds.push(c));
    await tick();
    a.client.pushBox("C", { p: [[0, 0.1, 0.5, 0, 0]], c: ["木"], s: 0, x: 0, a: 0, now: { strokes: 4, height: 50, count: 1 }, best: { strokes: 4, height: 50, count: 1 }, over: null, made: [], words: [], drops: 1, ready: true, r: r.round, turn: "pB", tn: "けんた" });
    b.client.sendCmd("C", { type: "drop", x: 0.5, a: 0, i: 0 });
    await tick(40);
    expect(seen.at(-1)).toMatchObject({ turn: "pB", p: [[0, 0.1, 0.5, 0, 0]] });
    expect(cmds).toEqual([expect.objectContaining({ type: "drop", x: 0.5, from: "pB" })]);
    a.client.setTeam("C", { strokes: 30, height: 300, count: 5 }, true);
    await tick(40);
    expect(b.room()!.room.phase).toBe("result");
    expect(b.room()!.room.teams[0].score.strokes).toBe(30);
  });

  it("チーム戦：赤・青に分かれ、点の高いチームが先に並ぶ", async () => {
    const code = await createRoom("pA");
    const ps = ["pA", "pB", "pC", "pD"].map((id, i) => player(code, `人${i}`, id));
    await tick();
    ps[1].client.send({ t: "team", team: "A" });
    ps[0].client.send({ t: "play", play: "team" });
    await tick();
    ps[0].client.send({ t: "start" });
    await tick();
    const r = ps[0].room()!.room;
    expect(r.teams.map((t) => t.id)).toEqual(["A", "B"]);
    expect(r.teams.map((t) => t.members.length)).toEqual([2, 2]);
    expect(r.players.find((p) => p.id === "pB")?.team).toBe("A");
    ps[0].client.setTeam(r.teams[0].host === "pA" ? "A" : "B", { strokes: 10, height: 100, count: 2 }, true);
    const other = r.teams.find((t) => t.host !== "pA")!;
    ps.find((p) => p.client.me === other.host)!.client.setTeam(other.id, { strokes: 40, height: 200, count: 5 }, true);
    await tick(40);
    const res = ps[0].room()!.room;
    expect(res.phase).toBe("result");
    expect(res.teams[0].id).toBe(other.id);
  });

  it("部屋主だけが待合室で難易度を変えられる", async () => {
    const code = await createRoom("pA");
    const a = player(code, "あおい", "pA");
    const b = player(code, "けんた", "pB");
    await tick();
    expect(a.room()!.room.mode).toBe("normal");
    b.client.send({ t: "mode", mode: "easy" });
    await tick();
    expect(a.room()!.room.mode).toBe("normal");
    a.client.send({ t: "mode", mode: "hard" });
    await tick();
    expect(b.room()!.room.mode).toBe("hard");
  });

  it("部屋主が抜けたら次に入った人が引き継ぐ", async () => {
    const code = await createRoom("pA");
    const a = player(code, "あおい", "pA");
    await tick();
    const b = player(code, "けんた", "pB");
    await tick();
    a.client.close();
    await tick(40);
    expect(b.room()!.room.players.find((p) => p.host)?.id).toBe("pB");
  });

  it("ない部屋には入れない", async () => {
    const x = player("0000", "だれか", "pX");
    await tick();
    expect(x.msgs.find((m) => m.t === "error")).toMatchObject({ error: "その部屋番号は見つかりません" });
  });
});

describe("ランキング（Firebase）", () => {
  it("登録すると種目ごとの順位が返り、ほかのゲームのデータに触れない", async () => {
    await fake.set(fake.ref(fake.db, "rooms/pref-ranking/normal/x"), { name: "県", score: 1 });
    const base = { playMs: 60_000, drops: 10 };
    await submitScore("normal", "たろう", { strokes: 40, height: 300, count: 8, ...base });
    const r = await submitScore("normal", "はなこ", { strokes: 50, height: 200, count: 6, ...base });
    expect(r).toEqual({ strokes: 1, height: 2, count: 2 });
    const rows = await getRanking("normal", "height", true);
    expect(rows.map((x) => x.name)).toEqual(["たろう", "はなこ"]);
    // 難易度ごとに別のランキング
    await submitScore("hard", "おに", { strokes: 10, height: 100, count: 2, ...base });
    expect((await getRanking("hard", "strokes", true)).map((x) => x.name)).toEqual(["おに"]);
    expect((await getRanking("easy", "strokes", true)).length).toBe(0);
    const rooms = fake.dump().rooms as Record<string, unknown>;
    expect(rooms["pref-ranking"]).toEqual({ normal: { x: { name: "県", score: 1 } } });
    expect((rooms["kanji-ranking"] as { created: number }).created).toBe(9e15);
  });

  it("今日のお題は日付ごとで、1週間より前の日は消える", async () => {
    const base = { playMs: 60_000, drops: 20 };
    await fake.set(fake.ref(fake.db, "rooms/kanji-ranking/daily-20200101/strokes/x"), { name: "昔", strokes: 9, height: 1, count: 1 });
    const today = `daily-${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "")}` as const;
    await submitScore(today, "きょう", { strokes: 30, height: 200, count: 5, ...base });
    await tick(30);
    const rk = fake.dump().rooms as Record<string, Record<string, unknown>>;
    expect(Object.keys(rk["kanji-ranking"]).sort()).toEqual(["created", today]);
    expect((await getRanking(today, "strokes", true))[0].name).toBe("きょう");
  });

  it("ありえない記録は送らない", async () => {
    await expect(submitScore("normal", "ずる", { strokes: 999, height: 1, count: 1, playMs: 1, drops: 1 })).rejects.toThrow();
  });
});
