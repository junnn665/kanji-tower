import { Body, Box, Polygon, Vec2, World } from "planck";
import { kanji, mergeOf } from "./shared/kanji";
import { pickCandidates, rng, type Score } from "./shared/rules";
import { drawPiece, drawPlatform, outline, PLATFORM_H, PLATFORM_HALF, type Piece } from "./render";
import { sfx } from "./sound";

interface Meta {
  ch: string;
  landed: boolean;
  alive: boolean;
  flash: number;
}

export interface GameOptions {
  seed: number;
  /** 対戦の終了時刻（Date.now() 基準）。ひとり用は undefined */
  endsAt?: number;
  onChange?: (g: Game) => void;
  onMerge?: (ch: string, isNew: boolean) => void;
  onOver?: (g: Game) => void;
  isDiscovered?: (ch: string) => boolean;
}

interface Popup {
  text: string;
  x: number;
  y: number;
  t: number;
}

const VIEW_W = 8; // 画面の横幅（m）
const STEP = 1 / 60;

export class Game {
  readonly world = new World({ gravity: Vec2(0, -10) });
  readonly canvas: HTMLCanvasElement;
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

  candidates: string[] = [];
  selected = 0;
  aimX = 0;
  aimAngle = 0;
  paused = false;
  over = false;
  overReason: "fall" | "time" | "quit" | null = null;
  drops = 0;
  made: string[] = [];
  best: Score = { strokes: 0, height: 0, count: 0 };
  now: Score = { strokes: 0, height: 0, count: 0 };
  /** 最高記録を出したときの塔 */
  bestTower: Piece[] = [];

  constructor(canvas: HTMLCanvasElement, readonly opts: GameOptions) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.rand = rng(opts.seed);
    const ground = this.world.createBody({ type: "static", position: Vec2(0, -PLATFORM_H / 2) });
    ground.createFixture(new Box(PLATFORM_HALF, PLATFORM_H / 2), { friction: 0.9 });
    ground.setUserData({ ch: "", landed: true, alive: true, flash: 0 } satisfies Meta);
    this.world.on("begin-contact", (c) => {
      const a = c.getFixtureA().getBody();
      const b = c.getFixtureB().getBody();
      const ma = a.getUserData() as Meta;
      const mb = b.getUserData() as Meta;
      if (ma.landed || mb.landed) {
        if (!ma.landed || !mb.landed) sfx("land");
        ma.landed = mb.landed = true;
      }
      if (ma.ch && mb.ch && mergeOf(ma.ch, mb.ch)) this.pending.push([a, b]);
    });
    this.reroll();
    this.bindInput();
    this.startedAt = performance.now();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.unbind?.();
  }

  get playMs() {
    return Math.round(performance.now() - this.startedAt);
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
    for (const b of this.towerBodies()) {
      for (let f = b.getFixtureList(); f; f = f.getNext()) top = Math.max(top, f.getAABB(0).upperBound.y);
    }
    return top;
  }

  private reroll() {
    const tower = this.towerBodies().map((b) => (b.getUserData() as Meta).ch);
    this.candidates = pickCandidates(this.rand, tower, this.seen);
    this.selected = Math.min(this.selected, 2);
    this.aimAngle = 0;
    this.opts.onChange?.(this);
  }

  get canDrop() {
    if (this.over || this.paused) return false;
    const t = performance.now() - this.lastDropAt;
    const landed = !this.dropBody || (this.dropBody.getUserData() as Meta).landed || !(this.dropBody.getUserData() as Meta).alive;
    return t > 350 && (landed || t > 1800);
  }

  private spawnY() {
    return this.towerTop() + 2.6;
  }

  private makeBody(ch: string, x: number, y: number, angle: number, landed: boolean): Body {
    const body = this.world.createBody({ type: "dynamic", position: Vec2(x, y), angle });
    const pts = outline(ch).map(([px, py]) => Vec2(px, py));
    body.createFixture(new Polygon(pts), { density: 1, friction: 0.8, restitution: 0.02 });
    body.setUserData({ ch, landed, alive: true, flash: 0 } satisfies Meta);
    return body;
  }

  select(i: number) {
    if (i < 0 || i >= this.candidates.length) return;
    this.selected = i;
    this.aimAngle = 0;
    sfx("tick");
    this.opts.onChange?.(this);
  }

  rotate() {
    this.aimAngle = (this.aimAngle + Math.PI / 6) % (Math.PI * 2);
    sfx("tick");
  }

  move(dx: number) {
    this.aimX = Math.max(-VIEW_W / 2 + 0.6, Math.min(VIEW_W / 2 - 0.6, this.aimX + dx));
  }

  drop() {
    if (!this.canDrop) return;
    const ch = this.candidates[this.selected];
    this.dropBody = this.makeBody(ch, this.aimX, this.spawnY(), this.aimAngle, false);
    this.seen.set(ch, (this.seen.get(ch) ?? 0) + 1);
    this.lastDropAt = performance.now();
    this.drops++;
    sfx("drop");
    this.reroll();
  }

  togglePause() {
    if (this.over || this.opts.endsAt) return;
    this.paused = !this.paused;
    this.opts.onChange?.(this);
  }

  end(reason: "fall" | "time" | "quit") {
    if (this.over) return;
    this.over = true;
    this.overReason = reason;
    sfx(reason === "fall" ? "fall" : "end");
    this.opts.onChange?.(this);
    this.opts.onOver?.(this);
  }

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
      this.popups.push({ text: `${ch}！`, x, y: y + 0.8, t: 0 });
      sfx("merge");
      this.opts.onMerge?.(ch, isNew);
    }
    this.pending = [];
  }

  private updateScore() {
    const bodies = this.towerBodies();
    const settled = bodies.every((b) => b.getLinearVelocity().length() < 0.8);
    const strokes = bodies.reduce((s, b) => s + kanji((b.getUserData() as Meta).ch).strokes, 0);
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

  private loop = (t: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (!this.paused && !this.over) {
      this.acc += dt;
      while (this.acc >= STEP) {
        this.world.step(STEP);
        this.doMerges();
        this.acc -= STEP;
      }
      this.checkFall();
      this.updateScore();
      if (this.opts.endsAt && Date.now() >= this.opts.endsAt) this.end("time");
    } else if (this.over) {
      // 終了後も崩れていく様子は見せる
      this.world.step(STEP);
    }
    this.draw(dt);
  };

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
    drawPlatform(ctx);

    const sel = this.candidates[this.selected];
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      const m = b.getUserData() as Meta;
      if (!m.ch || !m.alive) continue;
      const p = b.getPosition();
      const glow = !this.over && m.landed && !!sel && !!mergeOf(sel, m.ch);
      drawPiece(ctx, { ch: m.ch, x: p.x, y: p.y, a: b.getAngle() }, { glow, flash: m.flash });
      m.flash = Math.max(0, m.flash - dt * 2.5);
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
      drawPiece(ctx, { ch: sel, x: this.aimX, y: spawnY, a: this.aimAngle }, { alpha: ready ? 0.85 : 0.35 });
    }

    // 合体の吹き出し
    for (const p of this.popups) {
      p.t += dt;
      ctx.save();
      ctx.translate(p.x, p.y + p.t * 0.8);
      ctx.scale(1, -1);
      ctx.globalAlpha = Math.max(0, 1 - p.t / 1.2);
      ctx.font = `700 0.7px "Dela Gothic One", "Noto Serif JP", sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 0.12;
      ctx.strokeStyle = "#fff";
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = "#d14a2f";
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    this.popups = this.popups.filter((p) => p.t < 1.2);
  }

  private unbind?: () => void;

  private bindInput() {
    const c = this.canvas;
    const toWorldX = (clientX: number) => {
      const r = c.getBoundingClientRect();
      return ((clientX - r.left) / r.width - 0.5) * VIEW_W;
    };
    const down = (e: PointerEvent) => {
      if (this.over) return;
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
