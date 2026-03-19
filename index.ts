// index.ts – compiled to index.js by bun
// A 2D animation framework with grid, shapes, and recording.

// ----- Linear interpolation -----
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

class Color {
  r: number;
  g: number;
  b: number;
  a: number = 1.0; // alpha 0-1

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

// Configuration
const CONFIG = {
  scaleX: 10,
  scaleY: 10,
} as const;

const FPS = 180;
const TOTAL_FRAMES = 1000;
const DDT = 1000 / FPS;                       // ms per frame
const ANIMATION_DURATION = TOTAL_FRAMES * DDT; // ≈5556 ms
const NUM_VERTICES = 1000;                     // default vertex count for all shapes

const canvas = document.getElementById("box") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

// ----- Grid level management with automatic redraw -----
let _gridLevel: number | null = 3; // 1 = axes only, 2 = integer grid, 3 = half‑step grid
let gridDirty = true; // set to true when canvas size changes or gridLevel changes

function setGridLevel(level: number | null): void {
  _gridLevel = level;
  gridDirty = true;
}
// For external access (console)
Object.defineProperty(window, 'gridLevel', {
  get: () => _gridLevel,
  set: (val: number | null) => setGridLevel(val)
});

// ----- Offscreen canvas for grid caching -----
let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | null = null;

// ----- 2D vector with coordinate transformations -----
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

  // Convert world coordinates to canvas pixel coordinates
  normalized(): { x: number; y: number } {
    const half = boxSize() / 2;
    return {
      x: half * (1 + this.x / CONFIG.scaleX),
      y: half * (1 - this.y / CONFIG.scaleY),
    };
  }

  // Create a Vec2 from canvas pixel coordinates
  static fromCanvas({ x, y }: { x: number; y: number }): Vec2 {
    const half = boxSize() / 2;
    return new Vec2({
      x: (x / half - 1) * CONFIG.scaleX,
      y: (1 - y / half) * CONFIG.scaleY,
    });
  }

  // Vector addition
  add(other: Vec2): Vec2 {
    return new Vec2({ x: this.x + other.x, y: this.y + other.y });
  }

  // Linear interpolation to another Vec2
  lerp(other: Vec2, t: number): Vec2 {
    return new Vec2({
      x: lerp(this.x, other.x, t),
      y: lerp(this.y, other.y, t),
    });
  }

  // Rotate by angle (radians) around origin
  rotate(angle: number): Vec2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vec2({
      x: this.x * cos - this.y * sin,
      y: this.x * sin + this.y * cos,
    });
  }

  // Draw a square point at this vector
  draw(pointSize = 10, color = "#00FF00"): void {
    const { x, y } = this.normalized();
    ctx.fillStyle = color;
    ctx.fillRect(x - pointSize / 2, y - pointSize / 2, pointSize, pointSize);
  }
}

// ----- Abstract base class for all drawable objects -----
abstract class Drawable {
  id: number;               // unique identifier
  active: boolean = true;

  constructor(id: number) {
    this.id = id;
    if (this.constructor === Drawable) {
      throw new Error("Drawable is an abstract class and cannot be instantiated directly.");
    }
  }

  abstract draw(): void;
}

// ----- Helper class for animated properties -----
class PropertyAnimation<T> {
  start: T;
  target: T;
  duration: number;
  startTime: number;

  constructor(start: T, target: T, duration: number, startTime: number) {
    this.start = start;
    this.target = target;
    this.duration = duration;
    this.startTime = startTime;
  }

  // Returns the current interpolated value, or the target if finished
  value(now: number): T {
    const elapsed = now - this.startTime;
    if (elapsed >= this.duration) {
      return this.target;
    }
    const t = elapsed / this.duration;
    if (this.start instanceof Vec2 && this.target instanceof Vec2) {
      return (this.start as Vec2).lerp(this.target as Vec2, t) as T;
    } else if (this.start instanceof Color && this.target instanceof Color) {
      return (this.start as Color).lerp(this.target as Color, t) as T;
    } else {
      return lerp(this.start as number, this.target as number, t) as T;
    }
  }

  isFinished(now: number): boolean {
    return now - this.startTime >= this.duration;
  }
}

// ----- Base class for all shapes (common properties and drawing logic) -----
interface Animations {
  translation: PropertyAnimation<Vec2> | null;
  scale: PropertyAnimation<Vec2> | null;
  rotation: PropertyAnimation<number> | null;
  strokeColor: PropertyAnimation<Color> | null;
  fillColor: PropertyAnimation<Color> | null;
  opacity: PropertyAnimation<number> | null;
  lineDash: PropertyAnimation<number[]> | null;      // not interpolated yet
  lineCap: PropertyAnimation<CanvasLineCap> | null; // not interpolated
  lineJoin: PropertyAnimation<CanvasLineJoin> | null; // not interpolated
}

abstract class BaseShape extends Drawable {
  vertices: Vec2[];
  strokeColor: Color;
  fillColor: Color | null;
  lineDash: number[];
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  opacity: number; // 0-1
  pointSize: number;
  closed: boolean;
  progress: number;
  animationStart: number | null;
  animations: Animations;
  revealDuration: number;          // total time for reveal animation (ms)

  // Per‑vertex colors
  vertexColors: Color[] | null;
  private usePerVertexColors: boolean = false;

  // Performance optimizations
  private cachedTransformed: { x: number; y: number }[] | null = null;
  private dirtyTransform = true;    // set when translation/scale/rotation changes

  // Transform properties made private to enforce cache invalidation
  private _translation: Vec2;
  private _scale: Vec2;
  private _rotation: number;

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
    this.animations = {
      translation: null,
      scale: null,
      rotation: null,
      strokeColor: null,
      fillColor: null,
      opacity: null,
      lineDash: null,
      lineCap: null,
      lineJoin: null,
    };
    this.revealDuration = ANIMATION_DURATION;
    this.vertexColors = null;
  }

  // Getters and setters for transform properties
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

  // Backward compatibility: get/set color as strokeColor
  get color(): Color { return this.strokeColor; }
  set color(c: Color) { this.strokeColor = c; }

  // Set per‑vertex colors (must match vertices length)
  setVertexColors(colors: Color[] | null): void {
    if (colors && colors.length !== this.vertices.length) {
      throw new Error(`Vertex colors length (${colors.length}) must match vertices length (${this.vertices.length})`);
    }
    this.vertexColors = colors;
    this.usePerVertexColors = colors !== null;
  }

  // Update any active animations based on current time
  updateAnimations(now: number): void {
    if (this.animations.translation) {
      const anim = this.animations.translation;
      if (anim.isFinished(now)) {
        this.translation = anim.target;
        this.animations.translation = null;
      } else {
        this.translation = anim.value(now);
      }
    }

    if (this.animations.scale) {
      const anim = this.animations.scale;
      if (anim.isFinished(now)) {
        this.scale = anim.target;
        this.animations.scale = null;
      } else {
        this.scale = anim.value(now);
      }
    }

    if (this.animations.rotation) {
      const anim = this.animations.rotation;
      if (anim.isFinished(now)) {
        this.rotation = anim.target;
        this.animations.rotation = null;
      } else {
        this.rotation = anim.value(now);
      }
    }

    if (this.animations.strokeColor) {
      const anim = this.animations.strokeColor;
      if (anim.isFinished(now)) {
        this.strokeColor = anim.target;
        this.animations.strokeColor = null;
      } else {
        this.strokeColor = anim.value(now);
      }
    }

    if (this.animations.fillColor) {
      const anim = this.animations.fillColor;
      if (anim.isFinished(now)) {
        this.fillColor = anim.target;
        this.animations.fillColor = null;
      } else {
        this.fillColor = anim.value(now);
      }
    }

    if (this.animations.opacity) {
      const anim = this.animations.opacity;
      if (anim.isFinished(now)) {
        this.opacity = anim.target;
        this.animations.opacity = null;
      } else {
        this.opacity = anim.value(now);
      }
    }

    // lineDash, lineCap, lineJoin are not animated
  }

  // Compute transformed screen coordinates for all vertices
  private getTransformedPoints(): { x: number; y: number }[] {
    // If transform is clean and we have a cache, return it
    if (!this.dirtyTransform && this.cachedTransformed) {
      return this.cachedTransformed;
    }

    // Recompute all transformed points
    const transformed: { x: number; y: number }[] = [];
    const half = boxSize() / 2;

    for (const v of this.vertices) {
      // Apply scale, rotation, translation (world coords)
      const scaled = new Vec2({ x: v.x * this.scale.x, y: v.y * this.scale.y });
      const rotated = scaled.rotate(this.rotation);
      const world = rotated.add(this.translation);

      // Convert to screen coords
      const screenX = half * (1 + world.x / CONFIG.scaleX);
      const screenY = half * (1 - world.y / CONFIG.scaleY);
      transformed.push({ x: screenX, y: screenY });
    }

    this.cachedTransformed = transformed;
    this.dirtyTransform = false;
    return transformed;
  }

  // Draw the shape with current styling
  draw(): void {
    if (!this.active || this.progress === 0) return;

    const points = this.getTransformedPoints();
    const count = this.progress;

    // Special case: only one vertex revealed → draw a point
    if (count === 1) {
      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = this.strokeColor.toString();
      ctx.fillRect(points[0].x - this.pointSize/2, points[0].y - this.pointSize/2, this.pointSize, this.pointSize);
      ctx.restore();
      return;
    }

    // Save context state
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.lineWidth = this.pointSize;
    ctx.setLineDash(this.lineDash);
    ctx.lineCap = this.lineCap;
    ctx.lineJoin = this.lineJoin;

    if (this.usePerVertexColors && this.vertexColors) {
      // Draw each segment individually with the color of the start vertex
      for (let i = 0; i < count - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        ctx.strokeStyle = this.vertexColors[i].toString();
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      // If closed and fully drawn, draw closing segment with color of last vertex
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
      // Batch drawing: build a single path and fill/stroke with uniform colors
      const path = new Path2D();
      path.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < count; i++) {
        path.lineTo(points[i].x, points[i].y);
      }
      if (this.closed && count === this.vertices.length) {
        path.lineTo(points[0].x, points[0].y);
      }

      // Fill if fillColor is set
      if (this.fillColor) {
        ctx.fillStyle = this.fillColor.toString();
        ctx.fill(path);
      }

      // Stroke with strokeColor
      ctx.strokeStyle = this.strokeColor.toString();
      ctx.stroke(path);
    }

    ctx.restore();
  }

  // Mark transform as dirty (for external invalidation on resize)
  invalidateTransformCache(): void {
    this.dirtyTransform = true;
  }
}

// ----- Specific shape classes (unchanged except constructor signatures) -----
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

// ----- Utility: resample a polyline to a fixed number of points (length‑based) -----
function resamplePolyline(vertices: Vec2[], closed: boolean, numPoints: number): Vec2[] {
  if (vertices.length === 0) return [];
  if (vertices.length === 1) return Array(numPoints).fill(vertices[0]);

  // Compute cumulative distances
  const dist: number[] = [0];
  for (let i = 1; i < vertices.length; i++) {
    const dx = vertices[i].x - vertices[i-1].x;
    const dy = vertices[i].y - vertices[i-1].y;
    dist.push(dist[i-1] + Math.sqrt(dx*dx + dy*dy));
  }

  if (closed) {
    // Include the closing edge
    const dx = vertices[0].x - vertices[vertices.length-1].x;
    const dy = vertices[0].y - vertices[vertices.length-1].y;
    const closingLen = Math.sqrt(dx*dx + dy*dy);
    const total = dist[dist.length-1] + closingLen;

    const segments: { start: Vec2; end: Vec2; len: number; cum: number }[] = [];
    for (let i = 0; i < vertices.length - 1; i++) {
      const len = dist[i+1] - dist[i];
      segments.push({ start: vertices[i], end: vertices[i+1], len, cum: dist[i+1] });
    }
    // closing segment
    segments.push({
      start: vertices[vertices.length-1],
      end: vertices[0],
      len: closingLen,
      cum: total
    });

    const result: Vec2[] = [];
    for (let i = 0; i < numPoints; i++) {
      const t = i / numPoints; // 0 to 1 (exclusive of 1)
      const targetDist = t * total;
      // find segment
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
    // Ensure last point equals first for perfect closure (avoid gaps)
    if (result.length > 0) {
      result[result.length-1] = new Vec2({ x: result[0].x, y: result[0].y });
    }
    return result;
  } else {
    const total = dist[dist.length-1];
    const result: Vec2[] = [];
    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1); // include end
      const targetDist = t * total;
      // find segment
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

// ----- MorphShape: interpolates between two shapes over time, handles different vertex counts -----
class MorphShape extends Drawable {
  private id1: number;
  private id2: number;
  private duration: number;
  pointSize: number;
  private animationStart: number;
  private scene: Scene;

  constructor(id: number, scene: Scene, id1: number, id2: number, duration = ANIMATION_DURATION) {
    super(id);
    this.scene = scene;
    this.id1 = id1;
    this.id2 = id2;
    this.duration = duration;
    this.pointSize = 2;
    this.animationStart = performance.now();
  }

  draw(): void {
    if (!this.active) return;

    const shape1 = this.scene.getShape(this.id1);
    const shape2 = this.scene.getShape(this.id2);
    if (!shape1 || !shape2 || !shape1.active || !shape2.active) return;
    // Ensure they are BaseShapes (morph only works between BaseShapes)
    if (!(shape1 instanceof BaseShape) || !(shape2 instanceof BaseShape)) {
      console.warn('MorphShape only supports BaseShape sources.');
      return;
    }

    const count = Math.max(shape1.vertices.length, shape2.vertices.length);
    // Resample based on current vertices each frame (sources are static, but safe)
    const resampled1 = resamplePolyline(shape1.vertices, shape1.closed, count);
    const resampled2 = resamplePolyline(shape2.vertices, shape2.closed, count);

    const now = performance.now();
    const elapsed = now - this.animationStart;
    let t = elapsed / this.duration;
    if (this.duration <= 0) t = 1; // avoid division by zero
    else t = Math.min(t, 1);

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

    if (elapsed >= this.duration) {
      this.active = false;
      // Automatically remove from scene when finished
      this.scene.remove(this.id);
    }
  }
}

// ----- Canvas sizing -----
function boxSize(): number {
  return Math.min(window.innerHeight, window.innerWidth);
}

function resize(): void {
  const s = boxSize();
  canvas.width = s;
  canvas.height = s;
  gridDirty = true; // offscreen grid needs redraw

  // Invalidate all shape transform caches because canvas size changed
  if (window.scene) {
    (window.scene as Scene).invalidateAllTransforms();
  }
}
window.addEventListener("resize", resize);

// ----- Text drawing helper (accepts Vec2) with improved alignment -----
function drawText(vec2: Vec2, text: string, fontSize = 14, color = "#00FFFF"): void {
  const { x, y } = vec2.normalized();
  ctx.fillStyle = color;
  ctx.font = `${fontSize}px sans-serif`;
  // Align to avoid overlapping with axes
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + 8, y + 8);
}

// ----- Clear canvas to black -----
function clearBackground(): void {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, boxSize(), boxSize());
}

// ----- Draw grid using offscreen caching with improved label placement -----
function drawGrid(): void {
  if (!_gridLevel) return;

  const size = boxSize();
  // Ensure offscreen canvas exists and matches size
  if (!offscreenCanvas || offscreenCanvas.width !== size || offscreenCanvas.height !== size) {
    offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = size;
    offscreenCanvas.height = size;
    offscreenCtx = offscreenCanvas.getContext('2d')!;
    gridDirty = true;
  }

  // Redraw grid if dirty
  if (gridDirty) {
    if (!offscreenCtx) return;
    offscreenCtx.clearRect(0, 0, size, size);
    offscreenCtx.fillStyle = "#000000";
    offscreenCtx.fillRect(0, 0, size, size);

    const half = size / 2;
    const scaleX = CONFIG.scaleX;
    const scaleY = CONFIG.scaleY;

    // Helper to draw a line in screen coordinates
    const line = (x1: number, y1: number, x2: number, y2: number, width: number, color: string) => {
      offscreenCtx!.strokeStyle = color;
      offscreenCtx!.lineWidth = width;
      offscreenCtx!.beginPath();
      offscreenCtx!.moveTo(x1, y1);
      offscreenCtx!.lineTo(x2, y2);
      offscreenCtx!.stroke();
    };

    // Axes (level ≥ 1)
    if (_gridLevel >= 1) {
      line(0, half, size, half, 3, "#FFFFFF"); // x-axis in screen coords
      line(half, 0, half, size, 3, "#FFFFFF"); // y-axis
    }

    // Horizontal lines and labels (lines go to offscreen, labels drawn later)
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

    // Vertical lines
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

  // Draw the offscreen canvas onto the main canvas
  ctx.drawImage(offscreenCanvas!, 0, 0);

  // Draw labels with improved alignment
  ctx.fillStyle = "#00FFFF";
  ctx.font = "14px sans-serif";
  const half = size / 2;

  // Y-axis labels (left side)
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = -CONFIG.scaleY; i <= CONFIG.scaleY; i++) {
    const yScreen = half * (1 - i / CONFIG.scaleY);
    ctx.fillText(i.toString(), half - 8, yScreen);
  }
  // X-axis labels (bottom)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = -CONFIG.scaleX; i <= CONFIG.scaleX; i++) {
    const xScreen = half * (1 + i / CONFIG.scaleX);
    ctx.fillText(i.toString(), xScreen, half + 8);
  }
}

// ==================== SHAPE REFERENCE (stores ID) ====================
class ShapeRef {
  scene: Scene;
  id: number;

  constructor(scene: Scene, id: number) {
    this.scene = scene;
    this.id = id;
  }

  translate(x: number, y: number, duration = 0): this {
    this.scene.translate(this.id, x, y, duration);
    return this;
  }

  scale(sx: number, sy: number = sx, duration = 0): this {
    this.scene.scale(this.id, sx, sy, duration);
    return this;
  }

  rotate(angle: number, duration = 0): this {
    this.scene.rotate(this.id, angle, duration);
    return this;
  }

  // Styling methods
  stroke(color: Color | string, duration = 0): this {
    const col = typeof color === 'string' ? parseColor(color) : color;
    this.scene.strokeColor(this.id, col, duration);
    return this;
  }

  fill(color: Color | string | null, duration = 0): this {
    if (color === null) {
      this.scene.fillColor(this.id, null, duration);
    } else {
      const col = typeof color === 'string' ? parseColor(color) : color;
      this.scene.fillColor(this.id, col, duration);
    }
    return this;
  }

  opacity(value: number, duration = 0): this {
    this.scene.opacity(this.id, value, duration);
    return this;
  }

  lineDash(dashArray: number[], duration = 0): this {
    this.scene.lineDash(this.id, dashArray, duration);
    return this;
  }

  lineCap(cap: CanvasLineCap, duration = 0): this {
    this.scene.lineCap(this.id, cap, duration);
    return this;
  }

  lineJoin(join: CanvasLineJoin, duration = 0): this {
    this.scene.lineJoin(this.id, join, duration);
    return this;
  }

  vertexColors(colors: (Color | string)[] | null, duration = 0): this {
    if (colors === null) {
      this.scene.vertexColors(this.id, null, duration);
    } else {
      const cols = colors.map(c => typeof c === 'string' ? parseColor(c) : c);
      this.scene.vertexColors(this.id, cols, duration);
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
}

// Enhanced color parser supporting #rgb, #rrggbb, #rgba, #rrggbbaa, rgb(r,g,b), rgba(r,g,b,a)
function parseColor(str: string): Color {
  str = str.trim().toLowerCase();

  // #rgb / #rrggbb / #rgba / #rrggbbaa
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

  // rgb(r,g,b) or rgba(r,g,b,a)
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

// ==================== SCENE CLASS ====================
class Scene {
  private shapes: Map<number, Drawable> = new Map();
  private nextId: number = 0;

  // Recording state
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStartTime: number | null = null;
  private recordingDuration: number | null = null;
  private recordingTimeout: number | null = null;

  // Pause state (simple, not queued – subsequent waits replace previous)
  private pauseStart: number | null = null;
  private pauseDuration: number | null = null;
  private totalPausedTime: number = 0;

  getShape(id: number): Drawable | undefined {
    return this.shapes.get(id);
  }

  // Invalidate all shape transform caches (called on resize)
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

  // ----- Transformations -----
  translate(id: number, x: number, y: number, duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape)) return;
    if (duration > 0) {
      shape.animations.translation = new PropertyAnimation<Vec2>(
        shape.translation,
        new Vec2({ x, y }),
        duration,
        performance.now() - this.totalPausedTime
      );
    } else {
      shape.translation = new Vec2({ x, y });
      shape.animations.translation = null;
    }
  }

  scale(id: number, sx: number, sy: number = sx, duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape)) return;
    if (duration > 0) {
      shape.animations.scale = new PropertyAnimation<Vec2>(
        shape.scale,
        new Vec2({ x: sx, y: sy }),
        duration,
        performance.now() - this.totalPausedTime
      );
    } else {
      shape.scale = new Vec2({ x: sx, y: sy });
      shape.animations.scale = null;
    }
  }

  rotate(id: number, angle: number, duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape)) return;
    if (duration > 0) {
      shape.animations.rotation = new PropertyAnimation<number>(
        shape.rotation,
        angle,
        duration,
        performance.now() - this.totalPausedTime
      );
    } else {
      shape.rotation = angle;
      shape.animations.rotation = null;
    }
  }

  // ----- Styling setters -----
  strokeColor(id: number, color: Color, duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape)) return;
    if (duration > 0) {
      shape.animations.strokeColor = new PropertyAnimation<Color>(
        shape.strokeColor,
        color,
        duration,
        performance.now() - this.totalPausedTime
      );
    } else {
      shape.strokeColor = color;
      shape.animations.strokeColor = null;
    }
  }

  fillColor(id: number, color: Color | null, duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape)) return;
    if (duration > 0 && color !== null) {
      shape.animations.fillColor = new PropertyAnimation<Color>(
        shape.fillColor || new Color(0,0,0,0),
        color,
        duration,
        performance.now() - this.totalPausedTime
      );
    } else {
      shape.fillColor = color;
      shape.animations.fillColor = null;
    }
  }

  opacity(id: number, value: number, duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape)) return;
    if (duration > 0) {
      shape.animations.opacity = new PropertyAnimation<number>(
        shape.opacity,
        value,
        duration,
        performance.now() - this.totalPausedTime
      );
    } else {
      shape.opacity = value;
      shape.animations.opacity = null;
    }
  }

  lineDash(id: number, dashArray: number[], duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape)) return;
    shape.lineDash = dashArray;
  }

  lineCap(id: number, cap: CanvasLineCap, duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape)) return;
    shape.lineCap = cap;
  }

  lineJoin(id: number, join: CanvasLineJoin, duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape)) return;
    shape.lineJoin = join;
  }

  vertexColors(id: number, colors: Color[] | null, duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape)) return;
    shape.setVertexColors(colors);
  }

  // ----- Morph -----
  morph(id1: number, id2: number, duration = ANIMATION_DURATION): number {
    if (!this.shapes.has(id1) || !this.shapes.has(id2)) {
      throw new Error(`Invalid shape IDs: ${id1}, ${id2}`);
    }
    const morphId = this.nextId++;
    const morph = new MorphShape(morphId, this, id1, id2, duration);
    morph.animationStart -= this.totalPausedTime;
    this.shapes.set(morphId, morph);
    return morphId;
  }

  // ----- Reveal -----
  reveal(id: number, duration: number = ANIMATION_DURATION): void {
    const shape = this.shapes.get(id);
    if (!shape) throw new Error(`Shape with id ${id} does not exist.`);
    if (shape instanceof BaseShape) {
      shape.animationStart = performance.now() - this.totalPausedTime;
      shape.progress = 0;
      shape.revealDuration = duration;
    }
  }

  // ----- Remove -----
  remove(id: number): void {
    this.shapes.delete(id);
  }

  // ----- WAIT (simple pause, overwrites any ongoing pause) -----
  wait(seconds: number): this {
    this.pauseStart = performance.now();
    this.pauseDuration = seconds * 1000;
    return this;
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

  // ----- Update all shapes (progress & animations) with pause support -----
  update(now: number): void {
    // Handle pause logic
    if (this.pauseStart !== null && this.pauseDuration !== null) {
      const elapsedPause = now - this.pauseStart;
      if (elapsedPause < this.pauseDuration) {
        return;
      } else {
        const actualPause = Math.min(elapsedPause, this.pauseDuration);
        this.totalPausedTime += actualPause;

        for (const shape of this.shapes.values()) {
          if (shape instanceof BaseShape) {
            if (shape.animationStart !== null) {
              shape.animationStart += actualPause;
            }
            if (shape.animations.translation) shape.animations.translation.startTime += actualPause;
            if (shape.animations.scale) shape.animations.scale.startTime += actualPause;
            if (shape.animations.rotation) shape.animations.rotation.startTime += actualPause;
            if (shape.animations.strokeColor) shape.animations.strokeColor.startTime += actualPause;
            if (shape.animations.fillColor) shape.animations.fillColor.startTime += actualPause;
            if (shape.animations.opacity) shape.animations.opacity.startTime += actualPause;
          } else if (shape instanceof MorphShape) {
            shape.animationStart += actualPause;
          }
        }

        this.pauseStart = null;
        this.pauseDuration = null;
      }
    }

    const effectiveNow = now - this.totalPausedTime;

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
  }

  // ----- Draw everything in the scene -----
  draw(): void {
    clearBackground();
    drawGrid();

    for (const shape of this.shapes.values()) {
      if (shape.active) {
        shape.draw();
      }
    }
  }

  // ----- Animation loop entry point -----
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
}

// ==================== GLOBAL SETUP ====================
const scene = new Scene();
// Expose scene to console
(window as any).scene = scene;

function animate(): void {
  scene.animate(performance.now());
  requestAnimationFrame(animate);
}

function main(): void {
  setGridLevel(3); // use setter to ensure gridDirty = true
  resize();
  requestAnimationFrame(animate);
}
main();

// Also expose gridLevel setter globally (already done via property definition)
