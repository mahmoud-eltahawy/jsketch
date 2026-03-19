// index.ts – compiled to index.js by bun
// A 2D animation framework with grid, shapes, recording, keyframe animations, easing, and advanced primitives.

// ----- Linear interpolation -----
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ----- Easing functions -----
type EasingFunction = (t: number) => number;

const EASINGS: Record<string, EasingFunction> = {
  linear: (t) => t,

  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),

  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => (--t) * t * t + 1,
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,

  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - (--t) * t * t * t,
  easeInOutQuart: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,

  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => (1 - Math.cos(Math.PI * t)) / 2,

  easeInElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI);
  },
  easeOutElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1;
  },
  easeInOutElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    if ((t *= 2) < 1) return -0.5 * Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI);
    return 0.5 * Math.pow(2, -10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI) + 1;
  },

  easeInBounce: (t) => 1 - EASINGS.easeOutBounce(1 - t),
  easeOutBounce: (t) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  },
  easeInOutBounce: (t) => t < 0.5 ? (1 - EASINGS.easeOutBounce(1 - 2 * t)) / 2 : (1 + EASINGS.easeOutBounce(2 * t - 1)) / 2,
};

// ----- Keyframe definition and animation class -----
interface Keyframe<T> {
  time: number;           // normalized 0..1
  value: T;
  easing?: EasingFunction | string; // if string, looked up in EASINGS
}

class KeyframeAnimation<T> {
  private keyframes: Keyframe<T>[];
  private duration: number;        // total duration in ms
  private startTime: number;       // effective time
  private _finished: boolean = false;

  constructor(keyframes: Keyframe<T>[], duration: number, startTime: number) {
    // Sort by time
    this.keyframes = [...keyframes].sort((a, b) => a.time - b.time);
    // Ensure first and last keyframes at 0 and 1
    if (this.keyframes.length === 0) throw new Error('Keyframes cannot be empty');
    if (this.keyframes[0].time !== 0) {
      this.keyframes.unshift({ time: 0, value: this.keyframes[0].value });
    }
    if (this.keyframes[this.keyframes.length - 1].time !== 1) {
      this.keyframes.push({ time: 1, value: this.keyframes[this.keyframes.length - 1].value });
    }
    this.duration = duration;
    this.startTime = startTime;
  }

  isFinished(now: number): boolean {
    return now - this.startTime >= this.duration;
  }

  sample(now: number): T {
    const elapsed = now - this.startTime;
    if (elapsed >= this.duration) {
      this._finished = true;
      return this.keyframes[this.keyframes.length - 1].value;
    }
    const progress = elapsed / this.duration; // 0..1

    // Find segment
    let i = 0;
    while (i < this.keyframes.length - 1 && this.keyframes[i + 1].time < progress) {
      i++;
    }
    const from = this.keyframes[i];
    const to = this.keyframes[i + 1];
    const segmentT = (progress - from.time) / (to.time - from.time);

    // Apply easing (use to.easing if provided, else linear)
    let easedT = segmentT;
    if (to.easing) {
      const easingFn = typeof to.easing === 'string' ? EASINGS[to.easing] : to.easing;
      if (easingFn) easedT = easingFn(segmentT);
    }

    // Interpolate based on type
    if (from.value instanceof Vec2 && to.value instanceof Vec2) {
      return (from.value as Vec2).lerp(to.value as Vec2, easedT) as T;
    } else if (from.value instanceof Color && to.value instanceof Color) {
      return (from.value as Color).lerp(to.value as Color, easedT) as T;
    } else {
      // assume number
      return lerp(from.value as number, to.value as number, easedT) as T;
    }
  }

  get finished(): boolean { return this._finished; }
}

// ----- Color class -----
class Color {
  r: number;
  g: number;
  b: number;
  a: number = 1.0;

  constructor(r: number, g: number, b: number, a: number = 1.0) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }

  lerp(other: Color, t: number): Color {
    return new Color(
      lerp(this.r, other.r, t),
      lerp(this.g, other.g, t),
      lerp(this.b, other.b, t),
      lerp(this.a, other.a, t)
    );
  }

  static random(): Color {
    return new Color(
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256)
    );
  }

  toString(): string {
    return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`;
  }
}

// ----- Configuration -----
const CONFIG = {
  scaleX: 10,
  scaleY: 10,
} as const;

const FPS = 180;
const NUM_VERTICES = 400;                     // default vertex count for all sampled shapes
const DDT = 1000 / FPS;                       // ms per frame
const ANIMATION_DURATION = NUM_VERTICES * DDT; // ≈5556 ms

const canvas = document.getElementById("box") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

// ----- Grid level management -----
let _gridLevel: number | null = 3; // 1 = axes only, 2 = integer grid, 3 = half‑step grid
let gridDirty = true;

function setGridLevel(level: number | null): void {
  if (level !== null) {
    if (typeof level !== 'number' || level < 1 || level > 3) {
      console.warn('gridLevel must be 1, 2, 3, or null. Clamping to 1-3.');
      level = Math.min(3, Math.max(1, Math.floor(level)));
    }
  }
  _gridLevel = level;
  gridDirty = true;
}
Object.defineProperty(window, 'gridLevel', {
  get: () => _gridLevel,
  set: (val: number | null) => setGridLevel(val)
});

// ----- Offscreen canvas for grid caching -----
let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | null = null;

// ----- 2D vector -----
interface Vec2Params {
  x: number;
  y: number;
}

class Vec2 {
  x: number;
  y: number;

  constructor({ x, y }: Vec2Params) {
    this.x = x;
    this.y = y;
  }

  normalized(): { x: number; y: number } {
    const half = boxSize() / 2;
    return {
      x: half * (1 + this.x / CONFIG.scaleX),
      y: half * (1 - this.y / CONFIG.scaleY),
    };
  }

  static fromCanvas({ x, y }: { x: number; y: number }): Vec2 {
    const half = boxSize() / 2;
    return new Vec2({
      x: (x / half - 1) * CONFIG.scaleX,
      y: (1 - y / half) * CONFIG.scaleY,
    });
  }

  add(other: Vec2): Vec2 {
    return new Vec2({ x: this.x + other.x, y: this.y + other.y });
  }

  lerp(other: Vec2, t: number): Vec2 {
    return new Vec2({
      x: lerp(this.x, other.x, t),
      y: lerp(this.y, other.y, t),
    });
  }

  rotate(angle: number): Vec2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vec2({
      x: this.x * cos - this.y * sin,
      y: this.x * sin + this.y * cos,
    });
  }

  draw(pointSize = 10, color = "#00FF00"): void {
    const { x, y } = this.normalized();
    ctx.fillStyle = color;
    ctx.fillRect(x - pointSize / 2, y - pointSize / 2, pointSize, pointSize);
  }
}

// ----- Abstract base class for all drawable objects -----
abstract class Drawable {
  id: number;
  active: boolean = true;

  constructor(id: number) {
    this.id = id;
    if (this.constructor === Drawable) {
      throw new Error("Drawable is an abstract class and cannot be instantiated directly.");
    }
  }

  abstract draw(): void;
  update(_now: number): void {}
}

// ----- BaseShape with keyframe animations -----
interface KeyframeAnimations {
  translation: KeyframeAnimation<Vec2> | null;
  scale: KeyframeAnimation<Vec2> | null;
  rotation: KeyframeAnimation<number> | null;
  strokeColor: KeyframeAnimation<Color> | null;
  fillColor: KeyframeAnimation<Color> | null;
  opacity: KeyframeAnimation<number> | null;
}

abstract class BaseShape extends Drawable {
  vertices: Vec2[];
  strokeColor: Color;
  fillColor: Color | null;
  lineDash: number[];
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  opacity: number;
  pointSize: number;
  closed: boolean;
  progress: number;
  animationStart: number | null;        // effective time when reveal started
  revealDuration: number;

  vertexColors: Color[] | null;
  private usePerVertexColors: boolean = false;

  private cachedTransformed: { x: number; y: number }[] | null = null;
  private dirtyTransform = true;

  private _translation: Vec2;
  private _scale: Vec2;
  private _rotation: number;

  // Keyframe animations
  protected keyframes: KeyframeAnimations = {
    translation: null,
    scale: null,
    rotation: null,
    strokeColor: null,
    fillColor: null,
    opacity: null,
  };

  constructor(
    id: number,
    vertices: Vec2[],
    pointSize = 2,
    closed = false,
    translation: Vec2Params = { x: 0, y: 0 },
    scale: Vec2Params = { x: 1, y: 1 },
    rotation = 0
  ) {
    super(id);
    this.vertices = vertices;
    this.strokeColor = Color.random();
    this.fillColor = null;
    this.lineDash = [];
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.opacity = 1.0;
    this.pointSize = pointSize;
    this.closed = closed;
    this._translation = new Vec2(translation);
    this._scale = new Vec2(scale);
    this._rotation = rotation;
    this.progress = 0;
    this.animationStart = null;
    this.revealDuration = ANIMATION_DURATION;
    this.vertexColors = null;
  }

  get translation(): Vec2 { return this._translation; }
  set translation(t: Vec2) {
    this._translation = t;
    this.dirtyTransform = true;
  }

  get scale(): Vec2 { return this._scale; }
  set scale(s: Vec2) {
    this._scale = s;
    this.dirtyTransform = true;
  }

  get rotation(): number { return this._rotation; }
  set rotation(r: number) {
    this._rotation = r;
    this.dirtyTransform = true;
  }

  get color(): Color { return this.strokeColor; }
  set color(c: Color) { this.strokeColor = c; }

  setVertexColors(colors: Color[] | null): void {
    if (colors && colors.length !== this.vertices.length) {
      throw new Error(`Vertex colors length (${colors.length}) must match vertices length (${this.vertices.length})`);
    }
    this.vertexColors = colors;
    this.usePerVertexColors = colors !== null;
  }

  // Keyframe animation setters
  setTranslationKeyframes(keyframes: Keyframe<Vec2>[], duration: number, startTime: number): void {
    this.keyframes.translation = new KeyframeAnimation(keyframes, duration, startTime);
  }

  setScaleKeyframes(keyframes: Keyframe<Vec2>[], duration: number, startTime: number): void {
    this.keyframes.scale = new KeyframeAnimation(keyframes, duration, startTime);
  }

  setRotationKeyframes(keyframes: Keyframe<number>[], duration: number, startTime: number): void {
    this.keyframes.rotation = new KeyframeAnimation(keyframes, duration, startTime);
  }

  setStrokeColorKeyframes(keyframes: Keyframe<Color>[], duration: number, startTime: number): void {
    this.keyframes.strokeColor = new KeyframeAnimation(keyframes, duration, startTime);
  }

  setFillColorKeyframes(keyframes: Keyframe<Color>[], duration: number, startTime: number): void {
    this.keyframes.fillColor = new KeyframeAnimation(keyframes, duration, startTime);
  }

  setOpacityKeyframes(keyframes: Keyframe<number>[], duration: number, startTime: number): void {
    this.keyframes.opacity = new KeyframeAnimation(keyframes, duration, startTime);
  }

  updateAnimations(now: number): void {
    if (this.keyframes.translation) {
      if (this.keyframes.translation.isFinished(now)) {
        this.translation = this.keyframes.translation.sample(now);
        this.keyframes.translation = null;
      } else {
        this.translation = this.keyframes.translation.sample(now);
      }
    }
    if (this.keyframes.scale) {
      if (this.keyframes.scale.isFinished(now)) {
        this.scale = this.keyframes.scale.sample(now);
        this.keyframes.scale = null;
      } else {
        this.scale = this.keyframes.scale.sample(now);
      }
    }
    if (this.keyframes.rotation) {
      if (this.keyframes.rotation.isFinished(now)) {
        this.rotation = this.keyframes.rotation.sample(now);
        this.keyframes.rotation = null;
      } else {
        this.rotation = this.keyframes.rotation.sample(now);
      }
    }
    if (this.keyframes.strokeColor) {
      if (this.keyframes.strokeColor.isFinished(now)) {
        this.strokeColor = this.keyframes.strokeColor.sample(now);
        this.keyframes.strokeColor = null;
      } else {
        this.strokeColor = this.keyframes.strokeColor.sample(now);
      }
    }
    if (this.keyframes.fillColor) {
      if (this.keyframes.fillColor.isFinished(now)) {
        this.fillColor = this.keyframes.fillColor.sample(now);
        this.keyframes.fillColor = null;
      } else {
        this.fillColor = this.keyframes.fillColor.sample(now);
      }
    }
    if (this.keyframes.opacity) {
      if (this.keyframes.opacity.isFinished(now)) {
        this.opacity = this.keyframes.opacity.sample(now);
        this.keyframes.opacity = null;
      } else {
        this.opacity = this.keyframes.opacity.sample(now);
      }
    }
  }

  private getTransformedPoints(): { x: number; y: number }[] {
    if (!this.dirtyTransform && this.cachedTransformed) {
      return this.cachedTransformed;
    }

    const transformed: { x: number; y: number }[] = [];
    const half = boxSize() / 2;

    for (const v of this.vertices) {
      const scaled = new Vec2({ x: v.x * this.scale.x, y: v.y * this.scale.y });
      const rotated = scaled.rotate(this.rotation);
      const world = rotated.add(this.translation);
      const screenX = half * (1 + world.x / CONFIG.scaleX);
      const screenY = half * (1 - world.y / CONFIG.scaleY);
      transformed.push({ x: screenX, y: screenY });
    }

    this.cachedTransformed = transformed;
    this.dirtyTransform = false;
    return transformed;
  }

  draw(): void {
    if (!this.active || this.progress === 0) return;

    const points = this.getTransformedPoints();
    const count = this.progress;

    if (count === 1) {
      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = this.strokeColor.toString();
      ctx.fillRect(points[0].x - this.pointSize/2, points[0].y - this.pointSize/2, this.pointSize, this.pointSize);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.lineWidth = this.pointSize;
    ctx.setLineDash(this.lineDash);
    ctx.lineCap = this.lineCap;
    ctx.lineJoin = this.lineJoin;

    if (this.usePerVertexColors && this.vertexColors) {
      for (let i = 0; i < count - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        ctx.strokeStyle = this.vertexColors[i].toString();
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      if (this.closed && count === this.vertices.length) {
        const start = points[count - 1];
        const end = points[0];
        ctx.strokeStyle = this.vertexColors[count - 1].toString();
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    } else {
      const path = new Path2D();
      path.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < count; i++) {
        path.lineTo(points[i].x, points[i].y);
      }
      if (this.closed && count === this.vertices.length) {
        path.lineTo(points[0].x, points[0].y);
      }

      if (this.fillColor) {
        ctx.fillStyle = this.fillColor.toString();
        ctx.fill(path);
      }
      ctx.strokeStyle = this.strokeColor.toString();
      ctx.stroke(path);
    }

    ctx.restore();
  }

  invalidateTransformCache(): void {
    this.dirtyTransform = true;
  }
}

// ----- Existing shape classes (they just define vertices) -----
class FShape extends BaseShape {
  constructor(id: number, fun: (x: number) => number) {
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const x = -CONFIG.scaleX + t * (2 * CONFIG.scaleX);
      const y = fun(x);
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}

class CircleShape extends BaseShape {
  constructor(id: number, radius: number) {
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const angle = (i / NUM_VERTICES) * 2 * Math.PI;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, true);
  }
}

class SquareShape extends BaseShape {
  constructor(id: number, sideLength: number) {
    const half = sideLength / 2;
    const perimeter = sideLength * 4;
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / NUM_VERTICES;
      const s = t * perimeter;
      let x: number, y: number;
      if (s < sideLength) {
        x = -half + s;
        y = -half;
      } else if (s < 2 * sideLength) {
        x = half;
        y = -half + (s - sideLength);
      } else if (s < 3 * sideLength) {
        x = half - (s - 2 * sideLength);
        y = half;
      } else {
        x = -half;
        y = half - (s - 3 * sideLength);
      }
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, true);
  }
}

class RegularPolygonShape extends BaseShape {
  constructor(id: number, radius: number, sides: number) {
    const corners: Vec2[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * 2 * Math.PI;
      corners.push(new Vec2({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) }));
    }
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / NUM_VERTICES;
      const edgeIndex = Math.floor(t * sides);
      const edgeT = (t * sides) - edgeIndex;
      const p1 = corners[edgeIndex % sides];
      const p2 = corners[(edgeIndex + 1) % sides];
      const x = p1.x + (p2.x - p1.x) * edgeT;
      const y = p1.y + (p2.y - p1.y) * edgeT;
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, true);
  }
}

class LineShape extends BaseShape {
  constructor(id: number, start: Vec2Params, end: Vec2Params) {
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const x = lerp(start.x, end.x, t);
      const y = lerp(start.y, end.y, t);
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}

class ParametricCurveShape extends BaseShape {
  constructor(id: number, fx: (t: number) => number, fy: (t: number) => number, tMin = 0, tMax = 1) {
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const param = tMin + t * (tMax - tMin);
      const x = fx(param);
      const y = fy(param);
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}

class StarShape extends BaseShape {
  constructor(id: number, outerRadius: number, innerRadius: number, points: number) {
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / NUM_VERTICES;
      const angle = t * 2 * Math.PI;
      const sector = Math.floor(angle / (Math.PI / points));
      const r = sector % 2 === 0 ? outerRadius : innerRadius;
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, true);
  }
}

class SpiralShape extends BaseShape {
  constructor(id: number, maxRadius: number, turns: number) {
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const radius = maxRadius * t;
      const angle = turns * 2 * Math.PI * t;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}

// ----- New shape primitives -----
class QuadraticBezierShape extends BaseShape {
  constructor(id: number, p0: Vec2Params, p1: Vec2Params, p2: Vec2Params) {
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const x = (1-t)*(1-t)*p0.x + 2*(1-t)*t*p1.x + t*t*p2.x;
      const y = (1-t)*(1-t)*p0.y + 2*(1-t)*t*p1.y + t*t*p2.y;
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}

class CubicBezierShape extends BaseShape {
  constructor(id: number, p0: Vec2Params, p1: Vec2Params, p2: Vec2Params, p3: Vec2Params) {
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const x = (1-t)*(1-t)*(1-t)*p0.x + 3*(1-t)*(1-t)*t*p1.x + 3*(1-t)*t*t*p2.x + t*t*t*p3.x;
      const y = (1-t)*(1-t)*(1-t)*p0.y + 3*(1-t)*(1-t)*t*p1.y + 3*(1-t)*t*t*p2.y + t*t*t*p3.y;
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}

class ArcShape extends BaseShape {
  constructor(id: number, center: Vec2Params, radius: number, startAngle: number, endAngle: number, anticlockwise = false) {
    const vertices: Vec2[] = [];
    const angleRange = anticlockwise ? startAngle - endAngle : endAngle - startAngle;
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const angle = startAngle + t * angleRange;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}

class EllipseShape extends BaseShape {
  constructor(id: number, center: Vec2Params, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, anticlockwise = false) {
    const vertices: Vec2[] = [];
    const angleRange = anticlockwise ? startAngle - endAngle : endAngle - startAngle;
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const angle = startAngle + t * angleRange;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = center.x + radiusX * cos * Math.cos(rotation) - radiusY * sin * Math.sin(rotation);
      const y = center.y + radiusX * cos * Math.sin(rotation) + radiusY * sin * Math.cos(rotation);
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}

// ----- TextShape (with keyframe support) -----
class TextShape extends Drawable {
  private _text: string;
  private _font: string;
  strokeColor: Color;
  fillColor: Color | null;
  opacity: number;
  lineWidth: number;
  lineDash: number[];
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;

  private _translation: Vec2;
  private _scale: Vec2;
  private _rotation: number;

  protected keyframes: KeyframeAnimations = {
    translation: null,
    scale: null,
    rotation: null,
    strokeColor: null,
    fillColor: null,
    opacity: null,
  };

  constructor(
    id: number,
    text: string,
    font = '14px sans-serif',
    translation: Vec2Params = { x: 0, y: 0 },
    scale: Vec2Params = { x: 1, y: 1 },
    rotation = 0
  ) {
    super(id);
    this._text = text;
    this._font = font;
    this.strokeColor = Color.random();
    this.fillColor = null;
    this.opacity = 1.0;
    this.lineWidth = 1;
    this.lineDash = [];
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this._translation = new Vec2(translation);
    this._scale = new Vec2(scale);
    this._rotation = rotation;
  }

  get text(): string { return this._text; }
  set text(t: string) { this._text = t; }
  get font(): string { return this._font; }
  set font(f: string) { this._font = f; }
  get translation(): Vec2 { return this._translation; }
  set translation(t: Vec2) { this._translation = t; }
  get scale(): Vec2 { return this._scale; }
  set scale(s: Vec2) { this._scale = s; }
  get rotation(): number { return this._rotation; }
  set rotation(r: number) { this._rotation = r; }

  setTranslationKeyframes(keyframes: Keyframe<Vec2>[], duration: number, startTime: number): void {
    this.keyframes.translation = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setScaleKeyframes(keyframes: Keyframe<Vec2>[], duration: number, startTime: number): void {
    this.keyframes.scale = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setRotationKeyframes(keyframes: Keyframe<number>[], duration: number, startTime: number): void {
    this.keyframes.rotation = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setStrokeColorKeyframes(keyframes: Keyframe<Color>[], duration: number, startTime: number): void {
    this.keyframes.strokeColor = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setFillColorKeyframes(keyframes: Keyframe<Color>[], duration: number, startTime: number): void {
    this.keyframes.fillColor = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setOpacityKeyframes(keyframes: Keyframe<number>[], duration: number, startTime: number): void {
    this.keyframes.opacity = new KeyframeAnimation(keyframes, duration, startTime);
  }

  update(now: number): void {
    if (this.keyframes.translation) {
      if (this.keyframes.translation.isFinished(now)) {
        this.translation = this.keyframes.translation.sample(now);
        this.keyframes.translation = null;
      } else {
        this.translation = this.keyframes.translation.sample(now);
      }
    }
    if (this.keyframes.scale) {
      if (this.keyframes.scale.isFinished(now)) {
        this.scale = this.keyframes.scale.sample(now);
        this.keyframes.scale = null;
      } else {
        this.scale = this.keyframes.scale.sample(now);
      }
    }
    if (this.keyframes.rotation) {
      if (this.keyframes.rotation.isFinished(now)) {
        this.rotation = this.keyframes.rotation.sample(now);
        this.keyframes.rotation = null;
      } else {
        this.rotation = this.keyframes.rotation.sample(now);
      }
    }
    if (this.keyframes.strokeColor) {
      if (this.keyframes.strokeColor.isFinished(now)) {
        this.strokeColor = this.keyframes.strokeColor.sample(now);
        this.keyframes.strokeColor = null;
      } else {
        this.strokeColor = this.keyframes.strokeColor.sample(now);
      }
    }
    if (this.keyframes.fillColor) {
      if (this.keyframes.fillColor.isFinished(now)) {
        this.fillColor = this.keyframes.fillColor.sample(now);
        this.keyframes.fillColor = null;
      } else {
        this.fillColor = this.keyframes.fillColor.sample(now);
      }
    }
    if (this.keyframes.opacity) {
      if (this.keyframes.opacity.isFinished(now)) {
        this.opacity = this.keyframes.opacity.sample(now);
        this.keyframes.opacity = null;
      } else {
        this.opacity = this.keyframes.opacity.sample(now);
      }
    }
  }

  draw(): void {
    if (!this.active) return;

    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.font = this._font;
    ctx.lineWidth = this.lineWidth;
    ctx.setLineDash(this.lineDash);
    ctx.lineCap = this.lineCap;
    ctx.lineJoin = this.lineJoin;

    const half = boxSize() / 2;
    const screenPos = this.translation.normalized();
    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(this.rotation);
    ctx.scale(this.scale.x, this.scale.y);

    if (this.fillColor) {
      ctx.fillStyle = this.fillColor.toString();
      ctx.fillText(this._text, 0, 0);
    }
    if (this.strokeColor) {
      ctx.strokeStyle = this.strokeColor.toString();
      ctx.strokeText(this._text, 0, 0);
    }

    ctx.restore();
  }
}

// ----- ImageShape (with keyframe support) -----
class ImageShape extends Drawable {
  private _image: HTMLImageElement | ImageBitmap;
  opacity: number;

  private _translation: Vec2;
  private _scale: Vec2;
  private _rotation: number;

  protected keyframes: {
    translation: KeyframeAnimation<Vec2> | null;
    scale: KeyframeAnimation<Vec2> | null;
    rotation: KeyframeAnimation<number> | null;
    opacity: KeyframeAnimation<number> | null;
  } = {
    translation: null,
    scale: null,
    rotation: null,
    opacity: null,
  };

  constructor(
    id: number,
    image: HTMLImageElement | ImageBitmap,
    translation: Vec2Params = { x: 0, y: 0 },
    scale: Vec2Params = { x: 1, y: 1 },
    rotation = 0
  ) {
    super(id);
    this._image = image;
    this.opacity = 1.0;
    this._translation = new Vec2(translation);
    this._scale = new Vec2(scale);
    this._rotation = rotation;
  }

  get image(): HTMLImageElement | ImageBitmap { return this._image; }
  set image(img: HTMLImageElement | ImageBitmap) { this._image = img; }
  get translation(): Vec2 { return this._translation; }
  set translation(t: Vec2) { this._translation = t; }
  get scale(): Vec2 { return this._scale; }
  set scale(s: Vec2) { this._scale = s; }
  get rotation(): number { return this._rotation; }
  set rotation(r: number) { this._rotation = r; }

  setTranslationKeyframes(keyframes: Keyframe<Vec2>[], duration: number, startTime: number): void {
    this.keyframes.translation = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setScaleKeyframes(keyframes: Keyframe<Vec2>[], duration: number, startTime: number): void {
    this.keyframes.scale = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setRotationKeyframes(keyframes: Keyframe<number>[], duration: number, startTime: number): void {
    this.keyframes.rotation = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setOpacityKeyframes(keyframes: Keyframe<number>[], duration: number, startTime: number): void {
    this.keyframes.opacity = new KeyframeAnimation(keyframes, duration, startTime);
  }

  update(now: number): void {
    if (this.keyframes.translation) {
      if (this.keyframes.translation.isFinished(now)) {
        this.translation = this.keyframes.translation.sample(now);
        this.keyframes.translation = null;
      } else {
        this.translation = this.keyframes.translation.sample(now);
      }
    }
    if (this.keyframes.scale) {
      if (this.keyframes.scale.isFinished(now)) {
        this.scale = this.keyframes.scale.sample(now);
        this.keyframes.scale = null;
      } else {
        this.scale = this.keyframes.scale.sample(now);
      }
    }
    if (this.keyframes.rotation) {
      if (this.keyframes.rotation.isFinished(now)) {
        this.rotation = this.keyframes.rotation.sample(now);
        this.keyframes.rotation = null;
      } else {
        this.rotation = this.keyframes.rotation.sample(now);
      }
    }
    if (this.keyframes.opacity) {
      if (this.keyframes.opacity.isFinished(now)) {
        this.opacity = this.keyframes.opacity.sample(now);
        this.keyframes.opacity = null;
      } else {
        this.opacity = this.keyframes.opacity.sample(now);
      }
    }
  }

  draw(): void {
    if (!this.active) return;

    ctx.save();
    ctx.globalAlpha = this.opacity;

    const half = boxSize() / 2;
    const screenPos = this.translation.normalized();
    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(this.rotation);
    ctx.scale(this.scale.x, this.scale.y);

    ctx.drawImage(this._image, -this._image.width/2, -this._image.height/2);

    ctx.restore();
  }
}

// ----- Utility: resample a polyline to a fixed number of points (length‑based) -----
function resamplePolyline(vertices: Vec2[], closed: boolean, numPoints: number): Vec2[] {
  if (vertices.length === 0) return [];
  if (vertices.length === 1) return Array(numPoints).fill(vertices[0]);

  const dist: number[] = [0];
  for (let i = 1; i < vertices.length; i++) {
    const dx = vertices[i].x - vertices[i-1].x;
    const dy = vertices[i].y - vertices[i-1].y;
    dist.push(dist[i-1] + Math.sqrt(dx*dx + dy*dy));
  }

  if (closed) {
    const dx = vertices[0].x - vertices[vertices.length-1].x;
    const dy = vertices[0].y - vertices[vertices.length-1].y;
    const closingLen = Math.sqrt(dx*dx + dy*dy);
    const total = dist[dist.length-1] + closingLen;

    const segments: { start: Vec2; end: Vec2; len: number; cum: number }[] = [];
    for (let i = 0; i < vertices.length - 1; i++) {
      const len = dist[i+1] - dist[i];
      segments.push({ start: vertices[i], end: vertices[i+1], len, cum: dist[i+1] });
    }
    segments.push({
      start: vertices[vertices.length-1],
      end: vertices[0],
      len: closingLen,
      cum: total
    });

    const result: Vec2[] = [];
    for (let i = 0; i < numPoints; i++) {
      const t = i / numPoints;
      const targetDist = t * total;
      let segIndex = 0;
      while (segIndex < segments.length && segments[segIndex].cum < targetDist) segIndex++;
      if (segIndex >= segments.length) segIndex = segments.length - 1;
      const seg = segments[segIndex];
      const prevCum = segIndex === 0 ? 0 : segments[segIndex-1].cum;
      const segT = (targetDist - prevCum) / seg.len;
      const x = lerp(seg.start.x, seg.end.x, segT);
      const y = lerp(seg.start.y, seg.end.y, segT);
      result.push(new Vec2({ x, y }));
    }
    if (result.length > 0) {
      result[result.length-1] = new Vec2({ x: result[0].x, y: result[0].y });
    }
    return result;
  } else {
    const total = dist[dist.length-1];
    const result: Vec2[] = [];
    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);
      const targetDist = t * total;
      let segIndex = 1;
      while (segIndex < dist.length && dist[segIndex] < targetDist) segIndex++;
      if (segIndex >= dist.length) segIndex = dist.length - 1;
      const prevDist = dist[segIndex-1];
      const segT = (targetDist - prevDist) / (dist[segIndex] - prevDist);
      const x = lerp(vertices[segIndex-1].x, vertices[segIndex].x, segT);
      const y = lerp(vertices[segIndex-1].y, vertices[segIndex].y, segT);
      result.push(new Vec2({ x, y }));
    }
    return result;
  }
}

// ----- MorphShape: interpolates between two shapes over time -----
class MorphShape extends Drawable {
  private id1: number;
  private id2: number;
  private duration: number;
  pointSize: number;
  private animationStart: number; // effective time
  private scene: Scene;

  constructor(id: number, scene: Scene, id1: number, id2: number, duration = ANIMATION_DURATION) {
    super(id);
    this.scene = scene;
    this.id1 = id1;
    this.id2 = id2;
    this.duration = duration;
    this.pointSize = 2;
    this.animationStart = scene.currentEffectiveTime();
  }

  update(now: number): void {
    const shape1 = this.scene.getShape(this.id1);
    const shape2 = this.scene.getShape(this.id2);
    if (!shape1?.active || !shape2?.active) {
      this.scene.markForRemoval(this.id);
      return;
    }
    if (now - this.animationStart >= this.duration) {
      this.scene.markForRemoval(this.id);
    }
  }

  draw(): void {
    if (!this.active) return;

    const shape1 = this.scene.getShape(this.id1);
    const shape2 = this.scene.getShape(this.id2);
    if (!shape1?.active || !shape2?.active) return;
    if (!(shape1 instanceof BaseShape) || !(shape2 instanceof BaseShape)) {
      console.warn('MorphShape only supports BaseShape sources.');
      return;
    }

    const count = Math.max(shape1.vertices.length, shape2.vertices.length);
    const resampled1 = resamplePolyline(shape1.vertices, shape1.closed, count);
    const resampled2 = resamplePolyline(shape2.vertices, shape2.closed, count);

    const now = this.scene.currentEffectiveTime();
    const elapsed = now - this.animationStart;
    let t = 1;
    if (this.duration > 0) {
      t = Math.min(elapsed / this.duration, 1);
    }

    const trans = shape1.translation.lerp(shape2.translation, t);
    const scale = shape1.scale.lerp(shape2.scale, t);
    const rot = lerp(shape1.rotation, shape2.rotation, t);
    const strokeColor = shape1.strokeColor.lerp(shape2.strokeColor, t);
    const fillColor = shape1.fillColor && shape2.fillColor ? shape1.fillColor.lerp(shape2.fillColor, t) : (shape1.fillColor || shape2.fillColor);
    const opacity = lerp(shape1.opacity, shape2.opacity, t);

    const transformed: Vec2[] = [];
    for (let i = 0; i < count; i++) {
      const v = resampled1[i].lerp(resampled2[i], t);
      const scaled = new Vec2({ x: v.x * scale.x, y: v.y * scale.y });
      const rotated = scaled.rotate(rot);
      transformed.push(rotated.add(trans));
    }

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.lineWidth = this.pointSize;
    ctx.strokeStyle = strokeColor.toString();
    if (fillColor) ctx.fillStyle = fillColor.toString();

    const path = new Path2D();
    path.moveTo(transformed[0].x, transformed[0].y);
    for (let i = 1; i < count; i++) {
      path.lineTo(transformed[i].x, transformed[i].y);
    }
    if (shape2.closed) {
      path.lineTo(transformed[0].x, transformed[0].y);
    }

    if (fillColor) ctx.fill(path);
    ctx.stroke(path);
    ctx.restore();
  }
}

// ----- Canvas sizing and utilities -----
function boxSize(): number {
  return Math.min(window.innerHeight, window.innerWidth);
}

function resize(): void {
  const s = boxSize();
  canvas.width = s;
  canvas.height = s;
  gridDirty = true;

  if (scene && typeof scene.invalidateAllTransforms === 'function') {
    (scene as Scene).invalidateAllTransforms();
  }
}
window.addEventListener("resize", resize);

function drawText(vec2: Vec2, text: string, fontSize = 14, color = "#00FFFF"): void {
  const { x, y } = vec2.normalized();
  ctx.fillStyle = color;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + 8, y + 8);
}

function clearBackground(): void {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, boxSize(), boxSize());
}

function drawGrid(): void {
  if (!_gridLevel) return;

  const size = boxSize();
  if (!offscreenCanvas || offscreenCanvas.width !== size || offscreenCanvas.height !== size) {
    offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = size;
    offscreenCanvas.height = size;
    offscreenCtx = offscreenCanvas.getContext('2d')!;
    gridDirty = true;
  }

  if (gridDirty) {
    if (!offscreenCtx) return;
    offscreenCtx.clearRect(0, 0, size, size);
    offscreenCtx.fillStyle = "#000000";
    offscreenCtx.fillRect(0, 0, size, size);

    const half = size / 2;
    const scaleX = CONFIG.scaleX;
    const scaleY = CONFIG.scaleY;

    const line = (x1: number, y1: number, x2: number, y2: number, width: number, color: string) => {
      offscreenCtx!.strokeStyle = color;
      offscreenCtx!.lineWidth = width;
      offscreenCtx!.beginPath();
      offscreenCtx!.moveTo(x1, y1);
      offscreenCtx!.lineTo(x2, y2);
      offscreenCtx!.stroke();
    };

    if (_gridLevel >= 1) {
      line(0, half, size, half, 3, "#FFFFFF");
      line(half, 0, half, size, 3, "#FFFFFF");
    }

    for (let i = -scaleY; i <= scaleY; i++) {
      const yScreen = half * (1 - i / scaleY);
      if (_gridLevel >= 2) {
        line(0, yScreen, size, yScreen, 1, "#FFFFFF");
      }
      if (_gridLevel === 3) {
        const yHalf = half * (1 - (i + 0.5) / scaleY);
        line(0, yHalf, size, yHalf, 0.3, "#FFFFFF");
      }
    }

    for (let i = -scaleX; i <= scaleX; i++) {
      const xScreen = half * (1 + i / scaleX);
      if (_gridLevel >= 2) {
        line(xScreen, 0, xScreen, size, 1, "#FFFFFF");
      }
      if (_gridLevel === 3) {
        const xHalf = half * (1 + (i + 0.5) / scaleX);
        line(xHalf, 0, xHalf, size, 0.3, "#FFFFFF");
      }
    }

    gridDirty = false;
  }

  ctx.drawImage(offscreenCanvas!, 0, 0);

  ctx.fillStyle = "#00FFFF";
  ctx.font = "14px sans-serif";
  const half = size / 2;

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = -CONFIG.scaleY; i <= CONFIG.scaleY; i++) {
    const yScreen = half * (1 - i / CONFIG.scaleY);
    ctx.fillText(i.toString(), half - 8, yScreen);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = -CONFIG.scaleX; i <= CONFIG.scaleX; i++) {
    const xScreen = half * (1 + i / CONFIG.scaleX);
    ctx.fillText(i.toString(), xScreen, half + 8);
  }
}

// ----- Color parser -----
function parseColor(str: string): Color {
  str = str.trim().toLowerCase();

  if (str.startsWith('#')) {
    const hex = str.slice(1);
    let r, g, b, a = 1;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 4) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
      a = parseInt(hex[3] + hex[3], 16) / 255;
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0,2), 16);
      g = parseInt(hex.slice(2,4), 16);
      b = parseInt(hex.slice(4,6), 16);
    } else if (hex.length === 8) {
      r = parseInt(hex.slice(0,2), 16);
      g = parseInt(hex.slice(2,4), 16);
      b = parseInt(hex.slice(4,6), 16);
      a = parseInt(hex.slice(6,8), 16) / 255;
    } else {
      throw new Error(`Invalid hex color: ${str}`);
    }
    return new Color(r, g, b, a);
  }

  const rgbMatch = str.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    return new Color(
      parseInt(rgbMatch[1]),
      parseInt(rgbMatch[2]),
      parseInt(rgbMatch[3])
    );
  }
  const rgbaMatch = str.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/);
  if (rgbaMatch) {
    return new Color(
      parseInt(rgbaMatch[1]),
      parseInt(rgbaMatch[2]),
      parseInt(rgbaMatch[3]),
      parseFloat(rgbaMatch[4])
    );
  }

  throw new Error(`Unsupported color string: ${str}`);
}

// ==================== SHAPE REFERENCE ====================
type KeyframeConfig<T> = Array<{ time: number; value: T; easing?: string | EasingFunction }>;

class ShapeRef {
  scene: Scene;
  id: number;

  constructor(scene: Scene, id: number) {
    this.scene = scene;
    this.id = id;
  }

  // Simple transformations (two-keyframe animations with easing)
  translate(x: number, y: number, duration = 0, easing: string | EasingFunction = 'linear'): this {
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        const current = shape.translation;
        const keyframes: Keyframe<Vec2>[] = [
          { time: 0, value: current },
          { time: 1, value: new Vec2({ x, y }), easing }
        ];
        this.scene.translateKeyframes(this.id, keyframes, duration);
      }
    } else {
      this.scene.translate(this.id, x, y, 0);
    }
    return this;
  }

  scale(sx: number, sy: number = sx, duration = 0, easing: string | EasingFunction = 'linear'): this {
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        const current = shape.scale;
        const keyframes: Keyframe<Vec2>[] = [
          { time: 0, value: current },
          { time: 1, value: new Vec2({ x: sx, y: sy }), easing }
        ];
        this.scene.scaleKeyframes(this.id, keyframes, duration);
      }
    } else {
      this.scene.scale(this.id, sx, sy, 0);
    }
    return this;
  }

  rotate(angle: number, duration = 0, easing: string | EasingFunction = 'linear'): this {
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        const current = shape.rotation;
        const keyframes: Keyframe<number>[] = [
          { time: 0, value: current },
          { time: 1, value: angle, easing }
        ];
        this.scene.rotationKeyframes(this.id, keyframes, duration);
      }
    } else {
      this.scene.rotate(this.id, angle, 0);
    }
    return this;
  }

  stroke(color: Color | string, duration = 0, easing: string | EasingFunction = 'linear'): this {
    const col = typeof color === 'string' ? parseColor(color) : color;
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape || shape instanceof TextShape) {
        const current = shape.strokeColor;
        const keyframes: Keyframe<Color>[] = [
          { time: 0, value: current },
          { time: 1, value: col, easing }
        ];
        this.scene.strokeColorKeyframes(this.id, keyframes, duration);
      }
    } else {
      this.scene.strokeColor(this.id, col, 0);
    }
    return this;
  }

  fill(color: Color | string | null, duration = 0, easing: string | EasingFunction = 'linear'): this {
    if (color === null) {
      this.scene.fillColor(this.id, null, 0);
    } else {
      const col = typeof color === 'string' ? parseColor(color) : color;
      if (duration > 0) {
        const shape = this.scene.getShape(this.id);
        if (shape instanceof BaseShape || shape instanceof TextShape) {
          const current = shape.fillColor || new Color(0,0,0,0);
          const keyframes: Keyframe<Color>[] = [
            { time: 0, value: current },
            { time: 1, value: col, easing }
          ];
          this.scene.fillColorKeyframes(this.id, keyframes, duration);
        }
      } else {
        this.scene.fillColor(this.id, col, 0);
      }
    }
    return this;
  }

  opacity(value: number, duration = 0, easing: string | EasingFunction = 'linear'): this {
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        const current = shape.opacity;
        const keyframes: Keyframe<number>[] = [
          { time: 0, value: current },
          { time: 1, value, easing }
        ];
        this.scene.opacityKeyframes(this.id, keyframes, duration);
      }
    } else {
      this.scene.opacity(this.id, value, 0);
    }
    return this;
  }

  // Advanced keyframe method: define arbitrary keyframes for multiple properties
  keyframes(config: {
    translation?: KeyframeConfig<Vec2Params | Vec2>;
    scale?: KeyframeConfig<Vec2Params | Vec2>;
    rotation?: KeyframeConfig<number>;
    strokeColor?: KeyframeConfig<Color | string>;
    fillColor?: KeyframeConfig<Color | string | null>;
    opacity?: KeyframeConfig<number>;
  }, duration: number): this {
    const shape = this.scene.getShape(this.id);
    if (!shape) return this;

    const effectiveNow = this.scene.currentEffectiveTime();

    if (config.translation) {
      const keyframes = config.translation.map(kf => ({
        time: kf.time,
        value: kf.value instanceof Vec2 ? kf.value : new Vec2(kf.value as Vec2Params),
        easing: kf.easing
      }));
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        shape.setTranslationKeyframes?.(keyframes, duration, effectiveNow);
      }
    }
    if (config.scale) {
      const keyframes = config.scale.map(kf => ({
        time: kf.time,
        value: kf.value instanceof Vec2 ? kf.value : new Vec2(kf.value as Vec2Params),
        easing: kf.easing
      }));
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        shape.setScaleKeyframes?.(keyframes, duration, effectiveNow);
      }
    }
    if (config.rotation) {
      const keyframes = config.rotation.map(kf => ({
        time: kf.time,
        value: kf.value,
        easing: kf.easing
      }));
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        shape.setRotationKeyframes?.(keyframes, duration, effectiveNow);
      }
    }
    if (config.strokeColor) {
      const keyframes = config.strokeColor.map(kf => ({
        time: kf.time,
        value: typeof kf.value === 'string' ? parseColor(kf.value) : kf.value as Color,
        easing: kf.easing
      }));
      if (shape instanceof BaseShape || shape instanceof TextShape) {
        shape.setStrokeColorKeyframes?.(keyframes, duration, effectiveNow);
      }
    }
    if (config.fillColor) {
      const keyframes = config.fillColor.map(kf => ({
        time: kf.time,
        value: kf.value === null ? new Color(0,0,0,0) : (typeof kf.value === 'string' ? parseColor(kf.value) : kf.value as Color),
        easing: kf.easing
      }));
      if (shape instanceof BaseShape || shape instanceof TextShape) {
        shape.setFillColorKeyframes?.(keyframes, duration, effectiveNow);
      }
    }
    if (config.opacity) {
      const keyframes = config.opacity.map(kf => ({
        time: kf.time,
        value: kf.value,
        easing: kf.easing
      }));
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        shape.setOpacityKeyframes?.(keyframes, duration, effectiveNow);
      }
    }
    return this;
  }

  // Global pause (affects whole scene)
  delay(seconds: number): this {
    this.scene.pause(seconds);
    return this;
  }

  // Immediate styling setters (no animation)
  lineDash(dashArray: number[]): this {
    this.scene.lineDash(this.id, dashArray);
    return this;
  }

  lineCap(cap: CanvasLineCap): this {
    this.scene.lineCap(this.id, cap);
    return this;
  }

  lineJoin(join: CanvasLineJoin): this {
    this.scene.lineJoin(this.id, join);
    return this;
  }

  vertexColors(colors: (Color | string)[] | null): this {
    if (colors === null) {
      this.scene.vertexColors(this.id, null);
    } else {
      const cols = colors.map(c => typeof c === 'string' ? parseColor(c) : c);
      this.scene.vertexColors(this.id, cols);
    }
    return this;
  }

  reveal(duration: number = ANIMATION_DURATION): this {
    this.scene.reveal(this.id, duration);
    return this;
  }

  morph(otherRef: ShapeRef, duration = ANIMATION_DURATION): ShapeRef {
    const morphId = this.scene.morph(this.id, otherRef.id, duration);
    return new ShapeRef(this.scene, morphId);
  }

  remove(): void {
    this.scene.remove(this.id);
  }

  // TextShape specific
  font(fontString: string): this {
    this.scene.font(this.id, fontString);
    return this;
  }

  pointSize(size: number): this {
    this.scene.pointSize(this.id, size);
    return this;
  }

  lineWidth(width: number): this {
    return this.pointSize(width);
  }  
}

// ==================== SCENE CLASS ====================
class Scene {
  private shapes: Map<number, Drawable> = new Map();
  private nextId: number = 0;
  private removalSet: Set<number> = new Set();

  // Pause state
  private pauseStartReal: number | null = null;
  private pauseDuration: number | null = null;
  private effectiveTimeAtPauseStart: number | null = null;
  private totalPausedTime: number = 0;

  // Recording state
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStartTime: number | null = null;
  private recordingDuration: number | null = null;
  private recordingTimeout: number | null = null;

  getShape(id: number): Drawable | undefined {
    return this.shapes.get(id);
  }

  currentEffectiveTime(): number {
    const now = performance.now();
    if (this.pauseStartReal !== null) {
      return this.effectiveTimeAtPauseStart!;
    } else {
      return now - this.totalPausedTime;
    }
  }

  invalidateAllTransforms(): void {
    for (const shape of this.shapes.values()) {
      if (shape instanceof BaseShape) {
        shape.invalidateTransformCache();
      }
    }
  }

  // ----- Shape factories -----
  F(fun: (x: number) => number): ShapeRef {
    const id = this.nextId++;
    const shape = new FShape(id, fun);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }

  Circle(radius: number): ShapeRef {
    const id = this.nextId++;
    const shape = new CircleShape(id, radius);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }

  Square(sideLength: number): ShapeRef {
    const id = this.nextId++;
    const shape = new SquareShape(id, sideLength);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }

  RegularPolygon(radius: number, sides: number): ShapeRef {
    const id = this.nextId++;
    const shape = new RegularPolygonShape(id, radius, sides);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }

  Line(startX: number, startY: number, endX: number, endY: number): ShapeRef {
    const id = this.nextId++;
    const shape = new LineShape(id, { x: startX, y: startY }, { x: endX, y: endY });
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }

  ParametricCurve(fx: (t: number) => number, fy: (t: number) => number, tMin = 0, tMax = 1): ShapeRef {
    const id = this.nextId++;
    const shape = new ParametricCurveShape(id, fx, fy, tMin, tMax);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }

  Star(outerRadius: number, innerRadius: number, points = 5): ShapeRef {
    const id = this.nextId++;
    const shape = new StarShape(id, outerRadius, innerRadius, points);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }

  Spiral(maxRadius: number, turns = 3): ShapeRef {
    const id = this.nextId++;
    const shape = new SpiralShape(id, maxRadius, turns);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }

  QuadraticBezier(p0: Vec2Params, p1: Vec2Params, p2: Vec2Params): ShapeRef {
    const id = this.nextId++;
    const shape = new QuadraticBezierShape(id, p0, p1, p2);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }

  CubicBezier(p0: Vec2Params, p1: Vec2Params, p2: Vec2Params, p3: Vec2Params): ShapeRef {
    const id = this.nextId++;
    const shape = new CubicBezierShape(id, p0, p1, p2, p3);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }

  Arc(center: Vec2Params, radius: number, startAngle: number, endAngle: number, anticlockwise = false): ShapeRef {
    const id = this.nextId++;
    const shape = new ArcShape(id, center, radius, startAngle, endAngle, anticlockwise);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }

  Ellipse(center: Vec2Params, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, anticlockwise = false): ShapeRef {
    const id = this.nextId++;
    const shape = new EllipseShape(id, center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }

  Text(text: string, font = '14px sans-serif', translation: Vec2Params = { x: 0, y: 0 }): ShapeRef {
    const id = this.nextId++;
    const shape = new TextShape(id, text, font, translation);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }

  Image(image: HTMLImageElement | ImageBitmap, translation: Vec2Params = { x: 0, y: 0 }): ShapeRef {
    const id = this.nextId++;
    const shape = new ImageShape(id, image, translation);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }

  // ----- Immediate setters (no animation) -----
  translate(id: number, x: number, y: number, _duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.translation = new Vec2({ x, y });
    }
  }

  scale(id: number, sx: number, sy: number = sx, _duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.scale = new Vec2({ x: sx, y: sy });
    }
  }

  rotate(id: number, angle: number, _duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.rotation = angle;
    }
  }

  strokeColor(id: number, color: Color, _duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      shape.strokeColor = color;
    }
  }

  fillColor(id: number, color: Color | null, _duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      shape.fillColor = color;
    }
  }

  opacity(id: number, value: number, _duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.opacity = value;
    }
  }

  lineDash(id: number, dashArray: number[]): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      shape.lineDash = dashArray;
    }
  }

  lineCap(id: number, cap: CanvasLineCap): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      shape.lineCap = cap;
    }
  }

  lineJoin(id: number, join: CanvasLineJoin): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      shape.lineJoin = join;
    }
  }

  vertexColors(id: number, colors: Color[] | null): void {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape)) return;
    shape.setVertexColors(colors);
  }

  font(id: number, fontString: string): void {
    const shape = this.shapes.get(id);
    if (shape instanceof TextShape) {
      shape.font = fontString;
    }
  }

  // ----- Keyframe animation setters -----
  translateKeyframes(id: number, keyframes: Keyframe<Vec2>[], duration: number): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    const startTime = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.setTranslationKeyframes?.(keyframes, duration, startTime);
    }
  }

  scaleKeyframes(id: number, keyframes: Keyframe<Vec2>[], duration: number): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    const startTime = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.setScaleKeyframes?.(keyframes, duration, startTime);
    }
  }

  rotationKeyframes(id: number, keyframes: Keyframe<number>[], duration: number): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    const startTime = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.setRotationKeyframes?.(keyframes, duration, startTime);
    }
  }

  strokeColorKeyframes(id: number, keyframes: Keyframe<Color>[], duration: number): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    const startTime = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      shape.setStrokeColorKeyframes?.(keyframes, duration, startTime);
    }
  }

  fillColorKeyframes(id: number, keyframes: Keyframe<Color>[], duration: number): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    const startTime = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      shape.setFillColorKeyframes?.(keyframes, duration, startTime);
    }
  }

  opacityKeyframes(id: number, keyframes: Keyframe<number>[], duration: number): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    const startTime = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.setOpacityKeyframes?.(keyframes, duration, startTime);
    }
  }

  // ----- Morph -----
  morph(id1: number, id2: number, duration = ANIMATION_DURATION): number {
    if (!this.shapes.has(id1) || !this.shapes.has(id2)) {
      throw new Error(`Invalid shape IDs: ${id1}, ${id2}`);
    }
    const morphId = this.nextId++;
    const morph = new MorphShape(morphId, this, id1, id2, duration);
    this.shapes.set(morphId, morph);
    return morphId;
  }

  // ----- Reveal -----
  reveal(id: number, duration: number = ANIMATION_DURATION): void {
    const shape = this.shapes.get(id);
    if (!shape) throw new Error(`Shape with id ${id} does not exist.`);
    if (shape instanceof BaseShape) {
      shape.animationStart = this.currentEffectiveTime();
      shape.progress = 0;
      shape.revealDuration = duration;
    }
  }

  // ----- Remove -----
  remove(id: number): void {
    this.removalSet.add(id);
  }

  markForRemoval(id: number): void {
    this.removalSet.add(id);
  }

  // ----- WAIT (global pause) -----
  pause(seconds: number): this {
    const now = performance.now();
    if (this.pauseStartReal !== null) {
      const elapsed = now - this.pauseStartReal;
      const actual = Math.min(elapsed, this.pauseDuration!);
      this.totalPausedTime += actual;
      this.pauseStartReal = null;
      this.pauseDuration = null;
      this.effectiveTimeAtPauseStart = null;
    }
    this.pauseStartReal = now;
    this.pauseDuration = seconds * 1000;
    this.effectiveTimeAtPauseStart = now - this.totalPausedTime;
    return this;
  }

  async wait(seconds: number) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
  

  // ----- Recording -----
  startRecording(options: { fps?: number; duration?: number; mimeType?: string } = {}): void {
    if (this.mediaRecorder) {
      console.warn('Recording already in progress.');
      return;
    }

    const fps = options.fps ?? 30;
    const mimeType = options.mimeType ?? 'video/webm;codecs=vp9';

    if (!MediaRecorder.isTypeSupported(mimeType)) {
      console.warn(`MIME type ${mimeType} not supported, falling back to video/webm`);
    }
    const actualMimeType = MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm';

    const stream = canvas.captureStream(fps);
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: actualMimeType });
    this.recordedChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);

      this.mediaRecorder = null;
      this.recordedChunks = [];
      this.recordingStartTime = null;
      this.recordingDuration = null;
      if (this.recordingTimeout) {
        clearTimeout(this.recordingTimeout);
        this.recordingTimeout = null;
      }
    };

    this.mediaRecorder.start();
    this.recordingStartTime = performance.now();
    this.recordingDuration = options.duration ?? null;

    if (options.duration) {
      this.recordingTimeout = window.setTimeout(() => {
        this.stopRecording();
      }, options.duration * 1000);
    }

    console.log(`Recording started at ${fps} fps${options.duration ? ` for ${options.duration} seconds` : ''}`);
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  // ----- Update loop -----
  update(now: number): void {
    if (this.pauseStartReal !== null) {
      const elapsedPause = now - this.pauseStartReal;
      if (elapsedPause < this.pauseDuration!) {
        return;
      } else {
        const actualPause = Math.min(elapsedPause, this.pauseDuration!);
        this.totalPausedTime += actualPause;
        this.pauseStartReal = null;
        this.pauseDuration = null;
        this.effectiveTimeAtPauseStart = null;
      }
    }

    const effectiveNow = now - this.totalPausedTime;

    for (const shape of this.shapes.values()) {
      shape.update(effectiveNow);
    }

    for (const shape of this.shapes.values()) {
      if (shape instanceof BaseShape && shape.active) {
        if (shape.animationStart !== null) {
          const elapsed = effectiveNow - shape.animationStart;
          const t = Math.min(elapsed / shape.revealDuration, 1);
          const targetProgress = Math.floor(t * shape.vertices.length);
          shape.progress = Math.min(targetProgress, shape.vertices.length);
          if (elapsed >= shape.revealDuration) {
            shape.animationStart = null;
          }
        }
        shape.updateAnimations(effectiveNow);
      }
    }

    for (const id of this.removalSet) {
      this.shapes.delete(id);
    }
    this.removalSet.clear();
  }

  draw(): void {
    clearBackground();
    drawGrid();

    for (const shape of this.shapes.values()) {
      if (shape.active) {
        shape.draw();
      }
    }
  }

  animate(now: number): void {
    this.update(now);
    this.draw();

    if (this.mediaRecorder && this.recordingStartTime && this.recordingDuration) {
      const elapsed = (now - this.recordingStartTime) / 1000;
      if (elapsed >= this.recordingDuration) {
        this.stopRecording();
      }
    }
  }

  pointSize(id: number, size: number): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    if (shape instanceof BaseShape) {
      shape.pointSize = size;
    }
    // For TextShape and ImageShape, pointSize is not directly used,
    // but we could ignore or set a similar property if needed.
  }  
}

// ==================== GLOBAL SETUP ====================
const scene = new Scene();
(window as any).scene = scene;

function animate(): void {
  scene.animate(performance.now());
  requestAnimationFrame(animate);
}

function main(): void {
  setGridLevel(3);
  resize();
  requestAnimationFrame(animate);
}
main();


// ==================== TEST SUITE ====================
// Run in browser console after page load: runAllTests()
// Or run individual tests: testBasicShapes(), testTransformations(), etc.

// Helper to clear scene between tests
function clearScene() {
  // @ts-ignore - accessing private shapes map for cleanup
  scene.shapes.clear()
  // Also reset any pending removals
  // @ts-ignore
  scene.removalSet.clear();
  // Reset pause state
  // @ts-ignore
  scene.pauseStartReal = null;
  // @ts-ignore
  scene.pauseDuration = null;
  // @ts-ignore
  scene.effectiveTimeAtPauseStart = null;
  // @ts-ignore
  scene.totalPausedTime = 0;
}

// ---------- Test 1: Basic Shapes ----------
function testBasicShapes() {
  clearScene();
  console.log('Test 1: Basic Shapes');

  // F(x) = sin(x)
  scene.F(x => Math.sin(x)).stroke('#ff0000').scale(0.5).reveal();

  // Circle
  scene.Circle(5).stroke('#00ff00').translate(5, 0).reveal();

  // Square
  scene.Square(4).stroke('#0000ff').translate(-5, 5).reveal();

  // Regular polygon (hexagon)
  scene.RegularPolygon(3, 6).stroke('#ffff00').translate(5, -5).reveal();

  // Line
  scene.Line(-8, -8, -2, -2).stroke('#ff00ff').reveal();

  // Parametric curve (heart shape)
  scene.ParametricCurve(
    t => 16 * Math.sin(t)**3,
    t => 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t),
    0, 2*Math.PI
  ).stroke('#ff8800').translate(-5, -5).scale(0.3).reveal();

  // Star
  scene.Star(4, 2, 5).stroke('#00ffff').translate(5, 5).reveal();
}

// ---------- Test 2: Transformations (immediate) ----------
function testTransformations() {
  clearScene();
  console.log('Test 2: Transformations (immediate)');

  // Create a square, then apply transforms
  const square = scene.Square(3).stroke('#ffffff').reveal();
  square.translate(2, 2).scale(1.5, 0.5).rotate(Math.PI/4);

  // Another shape with chained transforms
  scene.Circle(2).stroke('#ff00ff')
    .translate(-3, -3)
    .scale(2)
    .rotate(Math.PI/2)
    .reveal();
}

// ---------- Test 3: Styling (fill, opacity, line dash) ----------
function testStyling() {
  clearScene();
  console.log('Test 3: Styling');

  // Filled circle with opacity
  scene.Circle(4).fill('rgba(255,0,0,0.5)').stroke('#ffffff').reveal();

  // Dashed line
  scene.Line(-8, -8, 8, 8).stroke('#00ff00').lineDash([10, 5]).lineWidth(3).reveal();

  // Square with different line cap/join
  scene.Square(5).translate(5, 5).stroke('#0000ff')
    .lineCap('round').lineJoin('round').lineDash([5, 2]).reveal();
}

// ---------- Test 4: Per-Vertex Colors ----------
function testPerVertexColors() {
  clearScene();
  console.log('Test 4: Per-Vertex Colors');

  // Create a line with rainbow colors
  const line = scene.Line(-8, 0, 8, 0).stroke('#ffffff').scale(1, 1).reveal();
  const colors: Color[] = [];
  for (let i = 0; i < NUM_VERTICES; i++) {
    const hue = (i / NUM_VERTICES) * 360;
    // Convert HSL to RGB (simplified – just for demo)
    const c = new Color(
      Math.floor(128 + 127 * Math.sin(hue * Math.PI/180)),
      Math.floor(128 + 127 * Math.sin((hue + 120) * Math.PI/180)),
      Math.floor(128 + 127 * Math.sin((hue + 240) * Math.PI/180))
    );
    colors.push(c);
  }
  line.vertexColors(colors);

  // A circle with gradient per vertex (but closed shape)
  const circle = scene.Circle(5).translate(0, 3).stroke('#ffffff').reveal();
  const circleColors: Color[] = [];
  for (let i = 0; i < NUM_VERTICES; i++) {
    circleColors.push(Color.random());
  }
  circle.vertexColors(circleColors);
}

// ---------- Test 5: Simple Animations (duration + easing) ----------
function testSimpleAnimations() {
  clearScene();
  console.log('Test 5: Simple Animations');

  // Bouncing ball (circle) with easeOutBounce
  const ball = scene.Circle(2).fill('#ffaa00').stroke('#ffffff');
  ball.translate(-8, 0)
    .translate(8, 0, 2000, 'easeOutBounce')
    .translate(-8, 0, 2000, 'easeInOutQuad').reveal();

  // Rotating square with easeInOutElastic
  const square = scene.Square(3).stroke('#00aaff').translate(0, 5).reveal();
  square.rotate(0)
    .rotate(2 * Math.PI, 3000, 'easeInOutElastic').reveal();

  // Scaling heart with easeInOutSine
  const heart = scene.ParametricCurve(
    t => 16 * Math.sin(t)**3,
    t => 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t),
    0, 2*Math.PI
  ).stroke('#ff66aa').scale(0.3).translate(-5, -5).reveal();
  heart.scale(0.3, 0.3, 0)
    .scale(1.2, 1.2, 2000, 'easeInOutSine')
    .scale(0.3, 0.3, 2000, 'easeInOutSine').reveal();
}

// ---------- Test 6: Keyframe Animations ----------
function testKeyframes() {
  clearScene();
  console.log('Test 6: Keyframe Animations');

  // Star that moves along a path with easing on certain segments
  const star = scene.Star(3, 1.5, 5).fill('#ffaa00').stroke('#ffffff').reveal();

  star.keyframes({
    translation: [
      { time: 0, value: { x: -8, y: -8 } },
      { time: 0.3, value: { x: 0, y: -8 }, easing: 'easeOutQuad' },
      { time: 0.6, value: { x: 8, y: 0 }, easing: 'easeInOutCubic' },
      { time: 1, value: { x: -8, y: 8 }, easing: 'easeInElastic' }
    ],
    rotation: [
      { time: 0, value: 0 },
      { time: 0.5, value: Math.PI },
      { time: 1, value: 2 * Math.PI }
    ],
    scale: [
      { time: 0, value: { x: 0.5, y: 0.5 } },
      { time: 0.2, value: { x: 1.5, y: 1.5 } },
      { time: 0.8, value: { x: 0.8, y: 0.8 } },
      { time: 1, value: { x: 1, y: 1 } }
    ],
    opacity: [
      { time: 0, value: 1 },
      { time: 0.3, value: 0.3 },
      { time: 0.7, value: 1 },
      { time: 1, value: 0.5 }
    ]
  }, 4000).reveal();
}

// ---------- Test 7: Morphing ----------
function testMorph() {
  clearScene();
  console.log('Test 7: Morph');

  // Create two shapes
  const circle = scene.Circle(4).stroke('#ff0000').translate(-5, 0).reveal();
  const square = scene.Square(6).stroke('#0000ff').translate(5, 0).reveal();

  // Morph between them
  const morph = circle.morph(square, 3000);
  morph.stroke('#ffffff'); // optional styling
}

// ---------- Test 8: TextShape ----------
function testText() {
  clearScene();
  console.log('Test 8: TextShape');

  // Simple text
  scene.Text('Hello jsketch!', '24px Arial', { x: -5, y: 5 })
    .fill('#ffaa00')
    .stroke('#ffffff')
    .rotate(0.2).reveal();

  // Animated text
  const txt = scene.Text('Keyframe Text', '18px monospace', { x: 0, y: -5 })
    .fill('#00aaff').reveal();
  txt.keyframes({
    translation: [
      { time: 0, value: { x: -8, y: -5 } },
      { time: 0.5, value: { x: 8, y: -5 } },
      { time: 1, value: { x: -8, y: -5 } }
    ],
    rotation: [
      { time: 0, value: 0 },
      { time: 1, value: 2 * Math.PI }
    ],
    scale: [
      { time: 0, value: { x: 0.5, y: 0.5 } },
      { time: 0.3, value: { x: 2, y: 2 } },
      { time: 0.7, value: { x: 1, y: 1 } },
      { time: 1, value: { x: 0.5, y: 0.5 } }
    ]
  }, 4000).reveal();
}

// ---------- Test 9: ImageShape ----------
function testImage() {
  clearScene();
  console.log('Test 9: ImageShape');

  // Create an Image element (you need to have an image loaded)
  const img = new Image();
  img.src = 'https://via.placeholder.com/100/ff0000/ffffff?text=Test';
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const imageShape = scene.Image(img, { x: 0, y: 0 })
      .scale(0.5)
      .rotate(0.2);
    // Animate it
    imageShape.keyframes({
      translation: [
        { time: 0, value: { x: -5, y: -5 } },
        { time: 0.5, value: { x: 5, y: 5 } },
        { time: 1, value: { x: -5, y: -5 } }
      ],
      rotation: [
        { time: 0, value: 0 },
        { time: 1, value: 2 * Math.PI }
      ],
      scale: [
        { time: 0, value: { x: 0.5, y: 0.5 } },
        { time: 0.3, value: { x: 1.5, y: 1.5 } },
        { time: 0.7, value: { x: 0.8, y: 0.8 } },
        { time: 1, value: { x: 0.5, y: 0.5 } }
      ]
    }, 4000);
  };
}

// ---------- Test 10: Advanced Primitives (Bezier, Arc, Ellipse) ----------
function testAdvancedPrimitives() {
  clearScene();
  console.log('Test 10: Advanced Primitives');

  // Quadratic Bezier
  scene.QuadraticBezier({ x: -8, y: -8 }, { x: 0, y: 8 }, { x: 8, y: -8 })
    .stroke('#ff00ff').scale(0.8).reveal();

  // Cubic Bezier
  scene.CubicBezier({ x: -8, y: 8 }, { x: -4, y: -8 }, { x: 4, y: 8 }, { x: 8, y: -8 })
    .stroke('#00ffff').translate(0, 2).reveal();

  // Arc (open)
  scene.Arc({ x: -4, y: -4 }, 3, 0, Math.PI, false)
    .stroke('#ffff00').lineDash([5, 3]).reveal();

  // Ellipse (full)
  scene.Ellipse({ x: 4, y: 4 }, 3, 1.5, Math.PI/4, 0, 2*Math.PI, false)
    .stroke('#ffaa00').fill('rgba(255,170,0,0.3)').reveal();
}

// ---------- Test 11: Pause / Delay ----------
async function testPause() {
  clearScene();
  console.log('Test 11: Pause / Delay');

  const square = scene.Square(3).fill('#ff0000').translate(-5, 0).reveal();
  square.translate(5, 0, 2000); // will move right

  await scene.wait(1);

  const circle = scene.Circle(2).fill('#00ff00').translate(0, -5).reveal();
  circle.translate(0, 5, 2000); // will move down

  // After pause, both animations continue concurrently
}

// ---------- Test 12: Concurrent Animations ----------
function testConcurrent() {
  clearScene();
  console.log('Test 12: Concurrent Animations');

  // Multiple shapes animating independently
  for (let i = 0; i < 5; i++) {
    const y = -8 + i * 4;
    const star = scene.Star(2, 1, 5).fill(Color.random()).stroke('#ffffff')
      .translate(-8, y);
    star.keyframes({
      translation: [
        { time: 0, value: { x: -8, y } },
        { time: 1, value: { x: 8, y } }
      ],
      rotation: [
        { time: 0, value: 0 },
        { time: 1, value: 2 * Math.PI }
      ]
    }, 3000 + i * 500).reveal();
  }
}

// ---------- Test 13: Edge Cases ----------
function testEdgeCases() {
  clearScene();
  console.log('Test 13: Edge Cases');

  // Zero duration animation (should jump immediately)
  scene.Circle(2).fill('#ff0000').translate(5, 5).translate(-5, -5, 0).reveal();

  // Negative scale (mirroring)
  scene.Square(3).stroke('#00ff00').scale(-1, 1).translate(3, 0).reveal();

  // Very large translation (should go offscreen but not crash)
  scene.Line(0, 0, 1000, 1000).stroke('#0000ff').reveal();

  // Null fill (should be no fill)
  scene.RegularPolygon(3, 5).fill(null).stroke('#ffff00').reveal();
}

// ---------- Test 14: Stress Test (many shapes) ----------
function testStress() {
  clearScene();
  console.log('Test 14: Stress Test (100 shapes)');

  for (let i = 0; i < 100; i++) {
    const x = (Math.random() - 0.5) * 18;
    const y = (Math.random() - 0.5) * 18;
    const size = 0.5 + Math.random() * 2;
    const shapeType = Math.floor(Math.random() * 3);
    let shape: ShapeRef;
    if (shapeType === 0) {
      shape = scene.Circle(size).fill(Color.random()).stroke('#ffffff').reveal();
    } else if (shapeType === 1) {
      shape = scene.Square(size * 2).fill(Color.random()).stroke('#ffffff').reveal();
    } else {
      shape = scene.Star(size, size/2, 5).fill(Color.random()).stroke('#ffffff').reveal();
    }
    shape.translate(x, y).rotate(Math.random() * Math.PI).reveal();

    // Animate randomly
    if (Math.random() > 0.5) {
      shape.keyframes({
        translation: [
          { time: 0, value: { x, y } },
          { time: 1, value: { x: x + (Math.random()-0.5)*10, y: y + (Math.random()-0.5)*10 } }
        ],
        rotation: [
          { time: 0, value: 0 },
          { time: 1, value: 2 * Math.PI }
        ]
      }, 5000).reveal();
    }
  }
}

// ---------- Run all tests sequentially ----------
async function runAllTests() {
  console.clear();
  console.log('RECORDING');
  scene.startRecording()
  console.log('=== Starting jsketch Test Suite ===');

  testBasicShapes();
  await scene.wait(5);

  testTransformations();
  await scene.wait(5);

  testStyling();
  await scene.wait(5);

  testPerVertexColors();
  await scene.wait(5);

  testSimpleAnimations();
  await scene.wait(5);

  testKeyframes();
  await scene.wait(5);

  testMorph();
  await scene.wait(5);

  testText();
  await scene.wait(5);

  // testImage(); // requires image load, maybe skip or handle separately

  testAdvancedPrimitives();
  await scene.wait(5);

  await testPause(); // testPause includes its own waits
  await scene.wait(5);

  testConcurrent();
  await scene.wait(5);

  testEdgeCases();
  await scene.wait(5);

  testStress();
  await scene.wait(5);

  console.log('=== Test Suite Completed ===');
  scene.stopRecording()
  console.log('RECORDING STOPED');
}

(window as any).runAllTests = runAllTests;
