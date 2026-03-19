// ----- Linear interpolation -----
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

class Color {
  r: number;
  g: number;
  b: number;

  constructor(r: number, g: number, b: number) {
    this.r = r;
    this.g = g;
    this.b = b;
  }

  lerp(other: Color, t: number): Color {
    return new Color(
      lerp(this.r, other.r, t),
      lerp(this.g, other.g, t),
      lerp(this.b, other.b, t)
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
    return `rgb(${this.r}, ${this.g}, ${this.b})`;
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
let gridLevel: number | null = 3; // 1 = axes only, 2 = integer grid, 3 = half‑step grid

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

  // Draw a line from this vector to another
  drawLineTo(other: Vec2, width = 2, color = "#FFFFFF"): void {
    const from = this.normalized();
    const to = other.normalized();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
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
}

abstract class BaseShape extends Drawable {
  vertices: Vec2[];
  color: Color;
  pointSize: number;
  closed: boolean;
  translation: Vec2;
  scale: Vec2;
  rotation: number;
  progress: number;
  animationStart: number | null;
  animations: Animations;
  revealDuration: number;          // total time for reveal animation (ms)

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
    this.color = Color.random();
    this.pointSize = pointSize;
    this.closed = closed;
    this.translation = new Vec2(translation);
    this.scale = new Vec2(scale);
    this.rotation = rotation;
    this.progress = 0;
    this.animationStart = null;
    this.animations = {
      translation: null,
      scale: null,
      rotation: null,
    };
    this.revealDuration = ANIMATION_DURATION;
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
  }

  // Draw all segments up to current progress, applying scale → rotate → translate
  draw(): void {
    if (!this.active) return;

    // Helper to transform a vertex
    const getTransformed = (v: Vec2): Vec2 => {
      const scaled = new Vec2({ x: v.x * this.scale.x, y: v.y * this.scale.y });
      const rotated = scaled.rotate(this.rotation);
      return rotated.add(this.translation);
    };

    const colorStr = this.color.toString();

    for (let i = 0; i < this.progress - 1; i++) {
      const a = getTransformed(this.vertices[i]);
      const b = getTransformed(this.vertices[i + 1]);
      a.drawLineTo(b, this.pointSize, colorStr);
    }
    // Closing segment
    if (this.closed && this.progress === this.vertices.length) {
      const a = getTransformed(this.vertices[this.vertices.length - 1]);
      const b = getTransformed(this.vertices[0]);
      a.drawLineTo(b, this.pointSize, colorStr);
    }
  }
}

// ----- Specific shape classes (they now pass an id to super) -----
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
    // Add closing segment distance
    const dx = vertices[0].x - vertices[vertices.length-1].x;
    const dy = vertices[0].y - vertices[vertices.length-1].y;
    const closingDist = Math.sqrt(dx*dx + dy*dy);
    // We'll treat the polyline as cyclic; for sampling we need to consider the loop
    // We'll create an extended array of segments including the closing edge.
    // Simpler: we can sample along the perimeter including the closing edge.
    // We'll build a list of segments with their start and end indices and cumulative length.
    const segments: { start: Vec2; end: Vec2; len: number; cum: number }[] = [];
    let total = 0;
    for (let i = 0; i < vertices.length - 1; i++) {
      const dx = vertices[i+1].x - vertices[i].x;
      const dy = vertices[i+1].y - vertices[i].y;
      const len = Math.sqrt(dx*dx + dy*dy);
      segments.push({ start: vertices[i], end: vertices[i+1], len, cum: total + len });
      total += len;
    }
    // closing segment
    const dx = vertices[0].x - vertices[vertices.length-1].x;
    const dy = vertices[0].y - vertices[vertices.length-1].y;
    const len = Math.sqrt(dx*dx + dy*dy);
    segments.push({ start: vertices[vertices.length-1], end: vertices[0], len, cum: total + len });
    total += len;

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
  id1: number;
  id2: number;
  duration: number;
  pointSize: number;
  animationStart: number;
  private resampled1: Vec2[] | null = null;   // cached resampled vertices for shape1
  private resampled2: Vec2[] | null = null;   // cached resampled vertices for shape2
  private scene: Scene;                        // reference to scene to fetch shapes

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

    const shape1 = this.scene.getShape(this.id1) as BaseShape;
    const shape2 = this.scene.getShape(this.id2) as BaseShape;
    if (!shape1 || !shape2 || !shape1.active || !shape2.active) return;

    // Ensure both shapes have the same number of vertices for morphing
    const count = Math.max(shape1.vertices.length, shape2.vertices.length);
    if (!this.resampled1 || this.resampled1.length !== count) {
      this.resampled1 = resamplePolyline(shape1.vertices, shape1.closed, count);
    }
    if (!this.resampled2 || this.resampled2.length !== count) {
      this.resampled2 = resamplePolyline(shape2.vertices, shape2.closed, count);
    }

    const now = performance.now();
    const elapsed = now - this.animationStart;
    const t = Math.min(elapsed / this.duration, 1);

    // Interpolate transforms and colors
    const trans = shape1.translation.lerp(shape2.translation, t);
    const scale = shape1.scale.lerp(shape2.scale, t);
    const rot = lerp(shape1.rotation, shape2.rotation, t);
    const color = shape1.color.lerp(shape2.color, t);
    const colorStr = color.toString();

    // Interpolate vertices using resampled arrays
    const transformed: Vec2[] = [];
    for (let i = 0; i < count; i++) {
      const v = this.resampled1[i].lerp(this.resampled2[i], t);
      const scaled = new Vec2({ x: v.x * scale.x, y: v.y * scale.y });
      const rotated = scaled.rotate(rot);
      transformed.push(rotated.add(trans));
    }

    // Draw lines
    for (let i = 0; i < count - 1; i++) {
      transformed[i].drawLineTo(transformed[i + 1], this.pointSize, colorStr);
    }
    if (shape2.closed) {
      transformed[count - 1].drawLineTo(transformed[0], this.pointSize, colorStr);
    }

    if (elapsed >= this.duration) {
      this.active = false;
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
}
window.addEventListener("resize", resize);

// ----- Text drawing helper (accepts Vec2) with offset to avoid overlap -----
function drawText(vec2: Vec2, text: string, fontSize = 14, color = "#00FFFF"): void {
  const { x, y } = vec2.normalized();
  ctx.fillStyle = color;
  ctx.font = `${fontSize}px sans-serif`;
  // Offset by 8px right and down so labels don't pile up at the origin
  ctx.fillText(text, x + 8, y + 8);
}

// ----- Simple line wrapper -----
function drawLine(begin: Vec2, end: Vec2, width = 2, color = "#FFFFFF"): void {
  begin.drawLineTo(end, width, color);
}

// ----- Clear canvas to black -----
function clearBackground(): void {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, boxSize(), boxSize());
}

// ----- Draw grid based on gridLevel -----
function drawGrid(): void {
  if (!gridLevel) return;
  if (![1, 2, 3].includes(gridLevel)) {
    throw new Error(`gridLevel must be 1, 2, 3 or falsy (got ${gridLevel})`);
  }

  // Axes (level ≥ 1)
  if (gridLevel >= 1) {
    drawLine(
      new Vec2({ x: -CONFIG.scaleX, y: 0 }),
      new Vec2({ x: CONFIG.scaleX, y: 0 }),
      3
    );
    drawLine(
      new Vec2({ x: 0, y: -CONFIG.scaleY }),
      new Vec2({ x: 0, y: CONFIG.scaleY }),
      3
    );
  }

  // Horizontal lines and labels
  for (let i = -CONFIG.scaleY; i <= CONFIG.scaleY; i++) {
    drawText(new Vec2({ x: 0, y: i }), i.toString());
    if (gridLevel >= 2) {
      drawLine(
        new Vec2({ x: -CONFIG.scaleX, y: i }),
        new Vec2({ x: CONFIG.scaleX, y: i }),
        1
      );
    }
    if (gridLevel === 3) {
      drawLine(
        new Vec2({ x: -CONFIG.scaleX, y: i + 0.5 }),
        new Vec2({ x: CONFIG.scaleX, y: i + 0.5 }),
        0.3
      );
    }
  }

  // Vertical lines and labels
  for (let i = -CONFIG.scaleX; i <= CONFIG.scaleX; i++) {
    drawText(new Vec2({ x: i, y: 0 }), i.toString());
    if (gridLevel >= 2) {
      drawLine(
        new Vec2({ x: i, y: -CONFIG.scaleY }),
        new Vec2({ x: i, y: CONFIG.scaleY }),
        1
      );
    }
    if (gridLevel === 3) {
      drawLine(
        new Vec2({ x: i + 0.5, y: -CONFIG.scaleY }),
        new Vec2({ x: i + 0.5, y: CONFIG.scaleY }),
        0.3
      );
    }
  }
}

// ==================== SHAPE REFERENCE (now stores ID) ====================
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

// ==================== SCENE CLASS (with Map and ID management) ====================
class Scene {
  private shapes: Map<number, Drawable> = new Map();
  private nextId: number = 0;

  // Recording state (unchanged)
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStartTime: number | null = null;
  private recordingDuration: number | null = null;
  private recordingTimeout: number | null = null;

  // Get a shape by ID (internal use)
  getShape(id: number): Drawable | undefined {
    return this.shapes.get(id);
  }

  // ----- Shape factories (return ShapeRef) -----
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

  // ----- Transformations (now use ID) -----
  translate(id: number, x: number, y: number, duration = 0): void {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape)) return;
    if (duration > 0) {
      shape.animations.translation = new PropertyAnimation<Vec2>(
        shape.translation,
        new Vec2({ x, y }),
        duration,
        performance.now()
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
        performance.now()
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
        performance.now()
      );
    } else {
      shape.rotation = angle;
      shape.animations.rotation = null;
    }
  }

  // ----- Morph between two shapes (returns ID of morph) -----
  morph(id1: number, id2: number, duration = ANIMATION_DURATION): number {
    if (!this.shapes.has(id1) || !this.shapes.has(id2)) {
      throw new Error(`Invalid shape IDs: ${id1}, ${id2}`);
    }
    const morphId = this.nextId++;
    const morph = new MorphShape(morphId, this, id1, id2, duration);
    this.shapes.set(morphId, morph);
    return morphId;
  }

  // ----- Start segment reveal animation for a shape (with configurable duration) -----
  reveal(id: number, duration: number = ANIMATION_DURATION): void {
    const shape = this.shapes.get(id);
    if (!shape) throw new Error(`Shape with id ${id} does not exist.`);
    if (shape instanceof BaseShape) {
      shape.animationStart = performance.now();
      shape.progress = 0;
      shape.revealDuration = duration;
    }
  }

  // ----- Remove (deactivate) a shape by ID -----
  remove(id: number): void {
    this.shapes.delete(id);
  }

  // ----- Recording (unchanged) -----
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

  // ----- Update all shapes (progress & animations) -----
  update(now: number): void {
    for (const shape of this.shapes.values()) {
      if (shape instanceof BaseShape && shape.active) {
        // Update drawing progress using shape's revealDuration
        if (shape.animationStart !== null) {
          const elapsed = now - shape.animationStart;
          const t = Math.min(elapsed / shape.revealDuration, 1);
          const targetProgress = Math.floor(t * shape.vertices.length);
          shape.progress = Math.min(targetProgress, shape.vertices.length);

          if (elapsed >= shape.revealDuration) {
            shape.animationStart = null;
          }
        }
        // Update transformation animations
        shape.updateAnimations(now);
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

function animate(): void {
  scene.animate(performance.now());
  requestAnimationFrame(animate);
}

function main(): void {
  gridLevel = 3;
  resize();
  requestAnimationFrame(animate);
}
main();

// Expose scene to console
(window as any).scene = scene;
