import { describe, expect, it } from "vitest";
import { ALL, BASE, JAMA, MERGED, WORDS, isJama, mergeOf, kanji, sizeOf } from "../src/shared/kanji";
import { compareScore, normalizeName, pickCandidates, plausible, rng } from "../src/shared/rules";

describe("合体表", () => {
  it("字が重複しない", () => {
    expect(new Set(ALL.map((k) => k.ch)).size).toBe(ALL.length);
  });
  it("材料の組が重複しない", () => {
    const keys = MERGED.map((m) => [...m.parts].sort().join(""));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("材料はすべて存在し、順不同で合体する", () => {
    for (const m of MERGED) {
      m.parts.forEach((p) => expect(() => kanji(p)).not.toThrow());
      expect(mergeOf(m.parts[0], m.parts[1])).toBe(m.ch);
      expect(mergeOf(m.parts[1], m.parts[0])).toBe(m.ch);
    }
  });
  it("合体した字は基本の字から作れる", () => {
    const made = new Set(BASE.map((b) => b.ch));
    let grew = true;
    while (grew) {
      grew = false;
      for (const m of MERGED)
        if (!made.has(m.ch) && m.parts.every((p) => made.has(p))) {
          made.add(m.ch);
          grew = true;
        }
    }
    expect(made.size).toBe(ALL.length);
  });
});

describe("熟語とおじゃま字", () => {
  it("熟語は2字で、どの字もゲームに出てくる", () => {
    const chars = new Set(ALL.map((k) => k.ch));
    for (const [w, r] of WORDS) {
      expect([...w]).toHaveLength(2);
      [...w].forEach((c) => expect(chars.has(c), `${w} の ${c}`).toBe(true));
      expect(r.length).toBeGreaterThan(0);
    }
    expect(new Set(WORDS.map(([w]) => w)).size).toBe(WORDS.length);
  });
  it("おじゃま字は合体せず、大きさに上限がある", () => {
    for (const j of JAMA) {
      expect(isJama(j.ch)).toBe(true);
      expect(sizeOf(j.ch)).toBeLessThanOrEqual(1.75);
      for (const k of ALL) expect(mergeOf(j.ch, k.ch)).toBeUndefined();
    }
  });
});

describe("候補", () => {
  it("同じ種なら同じ候補", () => {
    const a = pickCandidates(rng(42), ["木"], new Map());
    const b = pickCandidates(rng(42), ["木"], new Map());
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
  });
  it("合体できる字は最大2個", () => {
    const r = rng(7);
    for (let i = 0; i < 200; i++) {
      const c = pickCandidates(r, ["木", "日"], new Map());
      expect(c.filter((x) => mergeOf(x, "木") || mergeOf(x, "日")).length).toBeLessThanOrEqual(2);
    }
  });
});

describe("記録", () => {
  it("種目順に並ぶ", () => {
    const a = { strokes: 30, height: 100, count: 5 };
    const b = { strokes: 30, height: 120, count: 4 };
    expect(compareScore("strokes", a, b)).toBeGreaterThan(0);
    expect(compareScore("count", a, b)).toBeLessThan(0);
  });
  it("名前を正規化", () => {
    expect(normalizeName("  ＡＢＣ<script>  ")).toBe("ABCscript");
    expect(normalizeName("あ".repeat(20))).toHaveLength(12);
    expect(normalizeName("   ")).toBeNull();
  });
  it("ありえない記録をはじく", () => {
    const ok = { strokes: 40, height: 300, count: 8, playMs: 60000, drops: 12 };
    expect(plausible(ok)).toBe(true);
    expect(plausible({ ...ok, strokes: 999 })).toBe(false);
    expect(plausible({ ...ok, playMs: 100 })).toBe(false);
  });
});
