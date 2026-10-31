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
    await submitScore("たろう", { strokes: 40, height: 300, count: 8, ...base });
    const r = await submitScore("はなこ", { strokes: 50, height: 200, count: 6, ...base });
    expect(r).toEqual({ strokes: 1, height: 2, count: 2 });
    const rows = await getRanking("height", true);
    expect(rows.map((x) => x.name)).toEqual(["たろう", "はなこ"]);
    const rooms = fake.dump().rooms as Record<string, unknown>;
    expect(rooms["pref-ranking"]).toEqual({ normal: { x: { name: "県", score: 1 } } });
    expect((rooms["kanji-ranking"] as { created: number }).created).toBe(9e15);
  });

  it("ありえない記録は送らない", async () => {
    await expect(submitScore("ずる", { strokes: 999, height: 1, count: 1, playMs: 1, drops: 1 })).rejects.toThrow();
  });
});
