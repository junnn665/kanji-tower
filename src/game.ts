import { Body, Box, Vec2, World } from "planck";
import { INDEX, NET_CHARS, isJama, kanji, mergeOf, sizeOf, wordReading } from "./shared/kanji";
import { MODE, pickCandidates, rng, type Mode, type ModeDef, type Score } from "./shared/rules";
import { glyphRects } from "./glyph";
import { drawPiece, drawPlatform, PLATFORM_H, type Piece } from "./render";
import { buzz, sfx } from "./sound";

interface Meta {
  ch: string;
  landed: boolean;
  alive: boolean;
  flash: number;
  gold: number; // 熟語ができたときの金色の光
  jama: boolean;
}

/** 協力プレイで、操作する人の端末から物理を計算する端末へ送る操作 */
export type Command =
  | { type: "aim"; x: number; a: number }
  | { type: "select"; i: number }
  | { type: "drop"; x: number; a: number; i: number };

/** 協力プレイで配る盤面（物理を計算する端末 → ほかの端末） */
export interface BoxState {
  p: [number, number, number, number, number][]; // 字ID, x, y, 角度, 光(0..1)
  c: string[];
  s: number;
  x: number;
  a: number;
  now: Score;
  best: Score;
  over: string | null;
  made: string[];
  words: string[];
  drops: number;
  ready: boolean;
}

export interface GameOptions {
  seed: number;
  mode: Mode;
  /** 対戦の終了時刻（Date.now() 基準）。ひとり用は undefined */
  endsAt?: number;
  /** 落とせる回数（今日のお題） */
  dropLimit?: number;
  /**
   * local：ふつう。
   * host：協力の代表。物理を計算し、操作は自分の番のときだけ受け付ける（ほかの人の操作は applyCommand）。
   * mirror：協力の参加者。物理は計算せず setMirror で受け取った盤面を描く。操作は onCommand で送る。
   */
  control?: "local" | "host" | "mirror";
  /** 自分が操作してよいか（協力で自分の番か） */
  canControl?: () => boolean;
  onCommand?: (cmd: Command) => void;
  onChange?: (g: Game) => void;
  onMerge?: (ch: string, isNew: boolean) => void;
  onWord?: (word: string, bonus: number, isNew: boolean) => void;
  onLand?: () => void;
  onOver?: (g: Game) => void;
  isDiscovered?: (ch: string) => boolean;
  isWordKnown?: (w: string) => boolean;
}

interface Popup {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
}

const VIEW_W = 8; // 画面の横幅（m）
const STEP = 1 / 60;
const REPLAY_FRAMES = 160; // 約8秒（20コマ/秒）

export type OverReason = "fall" | "time" | "quit" | "limit" | "win";

export class Game {
  readonly world = new World({ gravity: Vec2(0, -10) });
  readonly canvas: HTMLCanvasElement;
  readonly def: ModeDef;
  private ctx: CanvasRenderingContext2D;
  private rand: () => number;
  private seen = new Map<string, number>();
  private pending: [Body, Body][] = [];
  private popups: Popup[] = [];
  private acc = 0;
  private last = 0;
  private raf = 0;
  private camTop = 8;
  private lastDropAt = -1e9;
  private dropBody: Body | null = null;
  private dragging = false;
  private startedAt = 0;
  private frame = 0;
  private lastAimSent = 0;
  private limitAt = 0;
  private mirror: BoxState | null = null;

  candidates: string[] = [];
  selected = 0;
  aimX = 0;
  aimAngle = 0;
  paused = false;
  over = false;
  overReason: OverReason | null = null;
  drops = 0;
  made: string[] = [];
  words: string[] = [];
  bonus = 0;
  best: Score = { strokes: 0, height: 0, count: 0 };
  now: Score = { strokes: 0, height: 0, count: 0 };
  /** 最高記録を出したときの塔 */
  bestTower: Piece[] = [];
  /** 最後の約8秒の動き（リプレイ用） */
  replay: Piece[][] = [];
  /** 割り込んでくるおじゃま字 */
  jamaQueue: string[] = [];

  constructor(canvas: HTMLCanvasElement, readonly opts: GameOptions) {
    this.def = MODE[opts.mode];
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.rand = rng(opts.seed);
    const ground = this.world.createBody({ type: "static", position: Vec2(0, -PLATFORM_H / 2) });
    // 台も字と同じくらいすべりにくくする（難易度で変わる）
    ground.createFixture(new Box(this.def.platformHalf, PLATFORM_H / 2), { friction: this.def.friction });
    ground.setUserData({ ch: "", landed: true, alive: true, flash: 0, gold: 0, jama: false } satisfies Meta);
    this.world.on("begin-contact", (c) => {
      const a = c.getFixtureA().getBody();
      const b = c.getFixtureB().getBody();
      const ma = a.getUserData() as Meta;
      const mb = b.getUserData() as Meta;
      if (ma.landed || mb.landed) {
        if (!ma.landed || !mb.landed) {
          sfx("land");
          buzz(12);
          this.opts.onLand?.();
        }
        ma.landed = mb.landed = true;
      }
      if (ma.ch && mb.ch && !ma.jama && !mb.jama && mergeOf(ma.ch, mb.ch)) this.pending.push([a, b]);
    });
    if (this.control !== "mirror") this.reroll();
    this.bindInput();
    this.startedAt = performance.now();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  get control() {
    return this.opts.control ?? "local";
  }

  private get mine() {
    return this.opts.canControl ? this.opts.canControl() : true;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.unbind?.();
  }

  get playMs() {
    return Math.round(performance.now() - this.startedAt);
  }

  get dropsLeft(): number | null {
    return this.opts.dropLimit ? Math.max(0, this.opts.dropLimit - this.drops) : null;
  }

  /** 塔に乗っている字 */
  private towerBodies(): Body[] {
    const out: Body[] = [];
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      const m = b.getUserData() as Meta;
      if (m.ch && m.alive && m.landed) out.push(b);
    }
    return out;
  }

  pieces(all = false): Piece[] {
    if (this.mirror) return this.mirror.p.map(([i, x, y, a]) => ({ ch: NET_CHARS[i] ?? "口", x, y, a }));
    const out: Piece[] = [];
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      const m = b.getUserData() as Meta;
      if (!m.ch || !m.alive || (!all && !m.landed)) continue;
      const p = b.getPosition();
      out.push({ ch: m.ch, x: p.x, y: p.y, a: b.getAngle() });
    }
    return out;
  }

  /** 塔の上端（m） */
  private towerTop(): number {
    let top = 0;
    if (this.mirror) {
      for (const [i, , y] of this.mirror.p) top = Math.max(top, y + sizeOf(NET_CHARS[i] ?? "口") * 0.5);
      return top;
    }
    for (const b of this.towerBodies()) {
      for (let f = b.getFixtureList(); f; f = f.getNext()) top = Math.max(top, f.getAABB(0).upperBound.y);
    }
    return top;
  }

  private reroll() {
    if (this.jamaQueue.length) {
      this.candidates = [this.jamaQueue[0]];
      this.selected = 0;
    } else {
      const tower = this.towerBodies()
        .map((b) => b.getUserData() as Meta)
        .filter((m) => !m.jama)
        .map((m) => m.ch);
      this.candidates = pickCandidates(this.rand, tower, this.seen, 3, this.def.fitWeights);
      this.selected = Math.min(this.selected, this.candidates.length - 1);
    }
    this.aimAngle = 0;
    this.opts.onChange?.(this);
  }

  /** 相手から飛んできたおじゃま字を割り込ませる（最大3つまでためる） */
  pushJama(ch: string) {
    // ためるのは1つまで（続けて飛んできても積み重ならない）
    if (this.over || this.jamaQueue.length >= 1) return;
    this.jamaQueue.push(ch);
    sfx("jama");
    buzz([30, 40, 30]);
    if (this.jamaQueue.length === 1) this.reroll();
  }

  get canDrop() {
    if (this.over || this.paused) return false;
    if (this.mirror) return this.mirror.ready;
    if (this.dropsLeft === 0) return false;
    const t = performance.now() - this.lastDropAt;
    const meta = this.dropBody?.getUserData() as Meta | undefined;
    const landed = !meta || meta.landed || !meta.alive;
    return t > 350 && (landed || t > 1800);
  }

  private spawnY() {
    return this.towerTop() + 2.6;
  }

  private makeBody(ch: string, x: number, y: number, angle: number, landed: boolean): Body {
    // 少し回りにくく・すべりにくくして、字の形でも積みやすくする
    const body = this.world.createBody({
      type: "dynamic",
      position: Vec2(x, y),
      angle,
      angularDamping: this.def.angularDamping,
      linearDamping: this.def.linearDamping,
    });
    // 字の形をなぞった長方形の集まり。おじゃま字は重い
    const density = isJama(ch) ? 2.2 : 1;
    for (const [cx, cy, hw, hh] of glyphRects(ch))
      body.createFixture(new Box(hw, hh, Vec2(cx, cy)), { density, friction: this.def.friction, restitution: 0 });
    body.setUserData({ ch, landed, alive: true, flash: 0, gold: 0, jama: isJama(ch) } satisfies Meta);
    return body;
  }

  // ---------- 操作 ----------

  select(i: number) {
    if (i < 0 || i >= this.candidates.length || !this.mine) return;
    if (this.control === "mirror") return this.opts.onCommand?.({ type: "select", i });
    this.selected = i;
    this.aimAngle = 0;
    sfx("tick");
    this.opts.onChange?.(this);
  }

  rotate() {
    if (!this.mine) return;
    this.aimAngle = (this.aimAngle + Math.PI / 6) % (Math.PI * 2);
    sfx("tick");
    this.sendAim(true);
  }

  move(dx: number) {
    if (!this.mine) return;
    this.aimX = Math.max(-VIEW_W / 2 + 0.6, Math.min(VIEW_W / 2 - 0.6, this.aimX + dx));
    this.sendAim();
  }

  private sendAim(force = false) {
    if (this.control !== "mirror") return;
    const t = performance.now();
    if (!force && t - this.lastAimSent < 100) return;
    this.lastAimSent = t;
    this.opts.onCommand?.({ type: "aim", x: +this.aimX.toFixed(2), a: +this.aimAngle.toFixed(3) });
  }

  drop() {
    if (!this.canDrop || !this.mine) return;
    if (this.control === "mirror") {
      this.opts.onCommand?.({ type: "drop", x: +this.aimX.toFixed(2), a: +this.aimAngle.toFixed(3), i: this.selected });
      return;
    }
    this.doDrop();
  }

  private doDrop() {
    const ch = this.candidates[this.selected];
    if (!ch) return;
    this.dropBody = this.makeBody(ch, this.aimX, this.spawnY(), this.aimAngle, false);
    if (isJama(ch)) this.jamaQueue.shift();
    else this.seen.set(ch, (this.seen.get(ch) ?? 0) + 1);
    this.lastDropAt = performance.now();
    this.drops++;
    sfx("drop");
    if (this.dropsLeft === 0) this.limitAt = performance.now();
    this.reroll();
  }

  /** 協力の代表が、ほかの人の操作を受け取る */
  applyCommand(cmd: Command) {
    if (this.control !== "host" || this.over) return;
    if (cmd.type === "aim") {
      this.aimX = cmd.x;
      this.aimAngle = cmd.a;
    } else if (cmd.type === "select") {
      if (cmd.i >= 0 && cmd.i < this.candidates.length) this.selected = cmd.i;
      this.aimAngle = 0;
      this.opts.onChange?.(this);
    } else if (cmd.type === "drop" && this.canDrop) {
      this.aimX = cmd.x;
      this.aimAngle = cmd.a;
      if (cmd.i >= 0 && cmd.i < this.candidates.length) this.selected = cmd.i;
      this.doDrop();
    }
  }

  /** 協力の代表が配る盤面 */
  exportState(): BoxState {
    const p: BoxState["p"] = [];
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      const m = b.getUserData() as Meta;
      if (!m.ch || !m.alive) continue;
      const pos = b.getPosition();
      p.push([INDEX.get(m.ch)!, +pos.x.toFixed(2), +pos.y.toFixed(2), +b.getAngle().toFixed(3), +Math.max(m.flash, m.gold).toFixed(1)]);
    }
    return {
      p,
      c: this.candidates,
      s: this.selected,
      x: +this.aimX.toFixed(2),
      a: +this.aimAngle.toFixed(3),
      now: this.now,
      best: this.best,
      over: this.over ? this.overReason : null,
      made: this.made,
      words: this.words,
      drops: this.drops,
      ready: this.canDrop,
    };
  }

  /** 協力の参加者が、配られた盤面を受け取る */
  setMirror(st: BoxState, myTurn: boolean) {
    const prevWords = this.mirror?.words.length ?? 0;
    const prevMade = this.mirror?.made.length ?? 0;
    this.mirror = st;
    this.candidates = st.c ?? [];
    this.selected = st.s ?? 0;
    if (!myTurn || !this.dragging) {
      this.aimX = st.x ?? 0;
      if (!myTurn) this.aimAngle = st.a ?? 0;
    }
    this.now = st.now;
    this.best = st.best;
    this.made = st.made ?? [];
    this.words = st.words ?? [];
    this.drops = st.drops ?? 0;
    if ((st.made?.length ?? 0) > prevMade) {
      sfx("merge");
      buzz(25);
    }
    if ((st.words?.length ?? 0) > prevWords) {
      sfx("word");
      buzz([20, 30, 20]);
      const w = st.words[st.words.length - 1];
      this.popups.push({ text: `${w}！`, x: 0, y: this.towerTop() + 0.8, t: 0, color: "#c98a00" });
    }
    if (st.over && !this.over) {
      this.over = true;
      this.overReason = st.over as OverReason;
      this.opts.onOver?.(this);
    }
    this.opts.onChange?.(this);
  }

  togglePause() {
    if (this.over || this.opts.endsAt || this.control !== "local") return;
    this.paused = !this.paused;
    this.opts.onChange?.(this);
  }

  end(reason: OverReason) {
    if (this.over) return;
    this.over = true;
    this.overReason = reason;
    sfx(reason === "fall" ? "fall" : reason === "win" ? "win" : "end");
    if (reason === "fall") buzz([60, 40, 120]);
    if (reason === "win") buzz([40, 40, 40, 40, 120]);
    this.opts.onChange?.(this);
    this.opts.onOver?.(this);
  }

  // ---------- 物理の結果 ----------

  private doMerges() {
    for (const [a, b] of this.pending) {
      const ma = a.getUserData() as Meta;
      const mb = b.getUserData() as Meta;
      if (!ma.alive || !mb.alive) continue;
      const ch = mergeOf(ma.ch, mb.ch);
      if (!ch) continue;
      const pa = a.getPosition();
      const pb = b.getPosition();
      const lower = pa.y < pb.y ? a : b;
      const va = a.getLinearVelocity();
      const vb = b.getLinearVelocity();
      ma.alive = mb.alive = false;
      this.world.destroyBody(a);
      this.world.destroyBody(b);
      const x = (pa.x + pb.x) / 2;
      const y = Math.min(pa.y, pb.y) + 0.15;
      const nb = this.makeBody(ch, x, y, lower.getAngle(), true);
      nb.setLinearVelocity(Vec2((va.x + vb.x) / 2, Math.max(0, (va.y + vb.y) / 2)));
      (nb.getUserData() as Meta).flash = 1;
      if (this.dropBody === a || this.dropBody === b) this.dropBody = nb;
      const isNew = !this.opts.isDiscovered?.(ch);
      if (!this.made.includes(ch)) this.made.push(ch);
      this.popups.push({ text: `${ch}！`, x, y: y + 0.8, t: 0, color: "#d14a2f" });
      sfx("merge");
      buzz(25);
      this.opts.onMerge?.(ch, isNew);
    }
    this.pending = [];
  }

  /** 上の字→下の字、左の字→右の字で熟語になっていればボーナス（同じ熟語は1回まで） */
  private checkWords() {
    const bodies = this.towerBodies().filter((b) => {
      const m = b.getUserData() as Meta;
      if (m.jama) return false;
      // 字が読める向き（±35度くらいまで）で、止まっているものだけ
      const a = Math.atan2(Math.sin(b.getAngle()), Math.cos(b.getAngle()));
      return Math.abs(a) < 0.6 && b.getLinearVelocity().length() < 0.6;
    });
    for (let i = 0; i < bodies.length; i++) {
      for (let j = 0; j < bodies.length; j++) {
        if (i === j) continue;
        const A = bodies[i];
        const B = bodies[j];
        const ca = (A.getUserData() as Meta).ch;
        const cb = (B.getUserData() as Meta).ch;
        const pa = A.getPosition();
        const pb = B.getPosition();
        const avg = (sizeOf(ca) + sizeOf(cb)) / 2;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        if (Math.hypot(dx, dy) > avg * 1.25) continue;
        let word = "";
        if (Math.abs(dx) < avg * 0.45 && dy > avg * 0.5) word = cb + ca; // B が上
        else if (Math.abs(dy) < avg * 0.45 && dx > avg * 0.5) word = ca + cb; // A が左
        if (!word || this.words.includes(word) || !wordReading(word)) continue;
        const bonus = (kanji(ca).strokes + kanji(cb).strokes) * 2;
        this.words.push(word);
        this.bonus += bonus;
        (A.getUserData() as Meta).gold = 1;
        (B.getUserData() as Meta).gold = 1;
        this.popups.push({ text: `${word}！ +${bonus}`, x: (pa.x + pb.x) / 2, y: Math.max(pa.y, pb.y) + 0.9, t: 0, color: "#c98a00" });
        sfx("word");
        buzz([20, 30, 20]);
        this.opts.onWord?.(word, bonus, !this.opts.isWordKnown?.(word));
      }
    }
  }

  private updateScore() {
    const bodies = this.towerBodies().filter((b) => !(b.getUserData() as Meta).jama);
    const all = this.towerBodies();
    const settled = all.every((b) => b.getLinearVelocity().length() < 0.8);
    const strokes = bodies.reduce((s, b) => s + kanji((b.getUserData() as Meta).ch).strokes, 0) + this.bonus;
    const height = Math.round(this.towerTop() * 100);
    this.now = { strokes, height, count: bodies.length };
    if (!settled) return;
    let improved = false;
    for (const k of ["strokes", "height", "count"] as const) {
      if (this.now[k] > this.best[k]) {
        this.best[k] = this.now[k];
        improved = true;
      }
    }
    if (improved) {
      this.bestTower = this.pieces();
      this.opts.onChange?.(this);
    }
    // 今日のお題：最後の字が落ちて塔が落ち着いたら終わり
    if (this.limitAt && performance.now() - this.limitAt > 2500) this.end("limit");
  }

  private checkFall() {
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      const m = b.getUserData() as Meta;
      if (!m.ch || !m.alive) continue;
      const p = b.getPosition();
      if (p.y < -1.5 || Math.abs(p.x) > VIEW_W) {
        this.end("fall");
        return;
      }
    }
  }

  private record() {
    this.replay.push(this.pieces(true));
    if (this.replay.length > REPLAY_FRAMES) this.replay.shift();
  }

  private loop = (t: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.frame++;
    if (this.control === "mirror") {
      // 物理は代表の端末が計算する
    } else if (!this.paused && !this.over) {
      this.acc += dt;
      while (this.acc >= STEP) {
        this.world.step(STEP);
        this.doMerges();
        this.acc -= STEP;
      }
      this.checkFall();
      if (this.frame % 6 === 0) this.checkWords();
      this.updateScore();
      if (this.opts.endsAt && Date.now() >= this.opts.endsAt) this.end("time");
      if (this.frame % 3 === 0) this.record();
    } else if (this.over) {
      // 終了後も崩れていく様子は見せる（リプレイにも少し残す）
      this.world.step(STEP);
      if (this.frame % 3 === 0 && this.replay.length && performance.now() - this.lastOverRec < 2000) this.record();
    }
    if (this.over && !this.lastOverRec) this.lastOverRec = performance.now();
    this.draw(dt);
  };
  private lastOverRec = 0;

  // ---------- 描画 ----------

  private draw(dt: number) {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const chh = canvas.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(chh * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(chh * dpr);
    }
    const scale = canvas.width / VIEW_W;
    const visH = canvas.height / scale;
    const spawnY = this.spawnY();
    const targetTop = Math.max(visH - 1.4, spawnY + 1.4);
    this.camTop += (targetTop - this.camTop) * Math.min(1, dt * 3);
    const camBottom = this.camTop - visH;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 高さの目盛り
    ctx.setTransform(scale, 0, 0, -scale, canvas.width / 2, canvas.height + camBottom * scale);
    ctx.strokeStyle = "rgba(90,70,55,0.12)";
    ctx.lineWidth = 0.02;
    ctx.fillStyle = "rgba(90,70,55,0.35)";
    for (let m = 1; m < this.camTop + 1; m++) {
      if (m < camBottom) continue;
      ctx.beginPath();
      ctx.moveTo(-VIEW_W / 2, m);
      ctx.lineTo(VIEW_W / 2, m);
      ctx.stroke();
      ctx.save();
      ctx.scale(1, -1);
      ctx.font = `0.28px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(`${m}m`, -VIEW_W / 2 + 0.1, -m - 0.06);
      ctx.restore();
    }
    // 最高到達ライン
    if (this.best.height > 0) {
      const y = this.best.height / 100;
      ctx.strokeStyle = "rgba(214,72,52,0.55)";
      ctx.setLineDash([0.15, 0.12]);
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(-VIEW_W / 2, y);
      ctx.lineTo(VIEW_W / 2, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawPlatform(ctx, this.def.platformHalf);

    const sel = this.candidates[this.selected];
    const hintFor = (ch: string) => this.def.hints && !this.over && !!sel && !isJama(sel) && !isJama(ch) && !!mergeOf(sel, ch);
    if (this.mirror) {
      for (const [i, x, y, a, f] of this.mirror.p) {
        const ch = NET_CHARS[i] ?? "口";
        drawPiece(ctx, { ch, x, y, a }, { glow: hintFor(ch) || f > 0.5, flash: f, mono: this.def.mono });
      }
    } else {
      for (let b = this.world.getBodyList(); b; b = b.getNext()) {
        const m = b.getUserData() as Meta;
        if (!m.ch || !m.alive) continue;
        const p = b.getPosition();
        const glow = (m.landed && hintFor(m.ch)) || m.gold > 0.05;
        drawPiece(ctx, { ch: m.ch, x: p.x, y: p.y, a: b.getAngle() }, { glow, flash: m.flash, mono: this.def.mono });
        m.flash = Math.max(0, m.flash - dt * 2.5);
        m.gold = Math.max(0, m.gold - dt * 0.6);
      }
    }

    // 狙い（半透明）と落下ガイド
    if (!this.over && sel) {
      const ready = this.canDrop;
      ctx.strokeStyle = "rgba(60,45,35,0.25)";
      ctx.setLineDash([0.1, 0.1]);
      ctx.lineWidth = 0.025;
      ctx.beginPath();
      ctx.moveTo(this.aimX, spawnY);
      ctx.lineTo(this.aimX, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      drawPiece(ctx, { ch: sel, x: this.aimX, y: spawnY, a: this.aimAngle }, { alpha: ready ? 0.85 : 0.35, mono: this.def.mono });
    }

    // 合体・熟語の吹き出し
    for (const p of this.popups) {
      p.t += dt;
      ctx.save();
      ctx.translate(p.x, p.y + p.t * 0.8);
      ctx.scale(1, -1);
      ctx.globalAlpha = Math.max(0, 1 - p.t / 1.4);
      ctx.font = `900 0.62px "Zen Maru Gothic", "Noto Serif JP", sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 0.14;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#fff";
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    this.popups = this.popups.filter((p) => p.t < 1.4);
  }

  // ---------- 入力 ----------

  private unbind?: () => void;

  private bindInput() {
    const c = this.canvas;
    const toWorldX = (clientX: number) => {
      const r = c.getBoundingClientRect();
      return ((clientX - r.left) / r.width - 0.5) * VIEW_W;
    };
    const down = (e: PointerEvent) => {
      if (this.over || !this.mine) return;
      this.dragging = true;
      c.setPointerCapture(e.pointerId);
      this.aimX = toWorldX(e.clientX);
      this.move(0);
    };
    const moveH = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.aimX = toWorldX(e.clientX);
      this.move(0);
    };
    const up = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.drop();
    };
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, dialog[open]")) return;
      switch (e.key) {
        case "ArrowLeft":
          this.move(-0.25);
          break;
        case "ArrowRight":
          this.move(0.25);
          break;
        case "ArrowUp":
          this.rotate();
          break;
        case "ArrowDown":
          this.drop();
          break;
        case "1":
        case "2":
        case "3":
          this.select(Number(e.key) - 1);
          break;
        case " ":
          this.togglePause();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", moveH);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    this.unbind = () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", moveH);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
    };
  }
}
