
// utils.ts

// ----- Linear interpolation (defined before Color) -----
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
const NUM_VERTICES = 1000;                     // fixed vertex count for all shapes

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
  active: boolean = true;

  constructor() {
    if (this.constructor === Drawable) {
      throw new Error("Drawable is an abstract class and cannot be instantiated directly.");
    }
  }

  abstract draw(): void;
}

// ----- Helper class for animated properties -----
class PropAnimation<T> {
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

  // Returns the current interpolated value, or null if finished
  value(now: number): T {
    const elapsed = now - this.startTime;
    if (elapsed >= this.duration) {
      return this.target; // animation complete
    }
    const t = elapsed / this.duration;
    if (this.start instanceof Vec2 && this.target instanceof Vec2) {
      // TypeScript can't infer that T is Vec2 here, so we use a type guard
      return (this.start as Vec2).lerp(this.target as Vec2, t) as T;
    } else {
      // number (for rotation)
      return lerp(this.start as number, this.target as number, t) as T;
    }
  }

  isFinished(now: number): boolean {
    return now - this.startTime >= this.duration;
  }
}

// ----- Base class for all shapes (common properties and drawing logic) -----
interface Animations {
  translation: PropAnimation<Vec2> | null;
  scale: PropAnimation<Vec2> | null;
  rotation: PropAnimation<number> | null;
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

  constructor(
    vertices: Vec2[],
    pointSize = 2,
    closed = false,
    translation: Vec2Params = { x: 0, y: 0 },
    scale: Vec2Params = { x: 1, y: 1 },
    rotation = 0
  ) {
    super();
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

// ----- Specific shape classes -----
class FShape extends BaseShape {
  constructor(fun: (x: number) => number) {
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1); // 0 to 1 inclusive
      const x = -CONFIG.scaleX + t * (2 * CONFIG.scaleX);
      const y = fun(x);
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, false);
  }
}

class CircleShape extends BaseShape {
  constructor(radius: number) {
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const angle = (i / NUM_VERTICES) * 2 * Math.PI;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, true);
  }
}

class SquareShape extends BaseShape {
  constructor(sideLength: number) {
    const half = sideLength / 2;
    const perimeter = sideLength * 4;
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / NUM_VERTICES; // 0 to 1, exclusive of 1
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
    super(vertices, 2, true);
  }
}

class RegularPolygonShape extends BaseShape {
  constructor(radius: number, sides: number) {
    const vertices: Vec2[] = [];
    // Precompute the corner points of the polygon
    const corners: Vec2[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * 2 * Math.PI;
      corners.push(new Vec2({
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
      }));
    }
    // Distribute NUM_VERTICES points along the edges
    const totalPerimeter = 2 * Math.PI * radius; // approximate, but exact for circle; for polygon it's 2 * radius * sides * sin(pi/sides) but we can just distribute by angle proportion
    // Simpler: distribute points by equal angular steps, but that will still smooth the polygon.
    // To get sharp corners, we need to place points along each edge.
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / NUM_VERTICES; // 0 to 1 (exclusive of 1)
      // Determine which edge we are on
      const edgeIndex = Math.floor(t * sides);
      const edgeT = (t * sides) - edgeIndex; // 0..1 along the edge
      const p1 = corners[edgeIndex % sides];
      const p2 = corners[(edgeIndex + 1) % sides];
      const x = p1.x + (p2.x - p1.x) * edgeT;
      const y = p1.y + (p2.y - p1.y) * edgeT;
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, true);
  }
}

class LineShape extends BaseShape {
  constructor(start: Vec2Params, end: Vec2Params) {
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const x = lerp(start.x, end.x, t);
      const y = lerp(start.y, end.y, t);
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, false);
  }
}

class ParametricCurveShape extends BaseShape {
  constructor(fx: (t: number) => number, fy: (t: number) => number, tMin = 0, tMax = 1) {
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const param = tMin + t * (tMax - tMin);
      const x = fx(param);
      const y = fy(param);
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, false);
  }
}

class StarShape extends BaseShape {
  constructor(outerRadius: number, innerRadius: number, points: number) {
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
    super(vertices, 2, true);
  }
}

class SpiralShape extends BaseShape {
  constructor(maxRadius: number, turns: number) {
    const vertices: Vec2[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const radius = maxRadius * t;
      const angle = turns * 2 * Math.PI * t;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, false);
  }
}

// ----- MorphShape: interpolates between two shapes over time -----
class MorphShape extends Drawable {
  shapes: Drawable[];
  idx1: number;
  idx2: number;
  duration: number;
  pointSize: number;
  animationStart: number;

  constructor(shapesArray: Drawable[], idx1: number, idx2: number, duration = ANIMATION_DURATION) {
    super();
    this.shapes = shapesArray;
    this.idx1 = idx1;
    this.idx2 = idx2;
    this.duration = duration;
    this.pointSize = 2;
    this.animationStart = performance.now();
  }

  draw(): void {
    if (!this.active) return;

    const shape1 = this.shapes[this.idx1] as BaseShape; // assume they are BaseShape
    const shape2 = this.shapes[this.idx2] as BaseShape;
    if (!shape1 || !shape2) return;

    const now = performance.now();
    const elapsed = now - this.animationStart;
    const t = Math.min(elapsed / this.duration, 1);

    // Interpolate transforms and colors
    const trans = shape1.translation.lerp(shape2.translation, t);
    const scale = shape1.scale.lerp(shape2.scale, t);
    const rot = lerp(shape1.rotation, shape2.rotation, t);
    const color = shape1.color.lerp(shape2.color, t);
    const colorStr = color.toString();

    // Interpolate vertices
    const count = shape1.vertices.length;
    const transformed: Vec2[] = [];
    for (let i = 0; i < count; i++) {
      const v = shape1.vertices[i].lerp(shape2.vertices[i], t);
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

    // Deactivate when animation completes, unless target shape hasn't started drawing
    if (elapsed >= this.duration) {
      const target = this.shapes[this.idx2] as BaseShape;
      if (target && target.progress === 0) {
        // remain active
      } else {
        this.active = false;
      }
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

// ----- Text drawing helper (accepts Vec2) -----
function drawText(vec2: Vec2, text: string, fontSize = 14, color = "#00FFFF"): void {
  const { x, y } = vec2.normalized();
  ctx.fillStyle = color;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillText(text, x, y);
}

// ----- Simple line wrapper (for grid drawing) -----
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

// ==================== SHAPE REFERENCE FOR CHAINING ====================
class ShapeRef {
  scene: Scene;
  index: number;

  constructor(scene: Scene, index: number) {
    this.scene = scene;
    this.index = index;
  }

  // Translation with optional duration (ms)
  translate(x: number, y: number, duration = 0): this {
    this.scene.translate(this.index, x, y, duration);
    return this;
  }

  // Scale with optional duration
  scale(sx: number, sy: number = sx, duration = 0): this {
    this.scene.scale(this.index, sx, sy, duration);
    return this;
  }

  // Rotate (radians) with optional duration
  rotate(angle: number, duration = 0): this {
    this.scene.rotate(this.index, angle, duration);
    return this;
  }

  // Start the segment‑reveal animation
  reveal(): this {
    this.scene.reveal(this.index);
    return this;
  }

  // Morph this shape into another shape (returns a new ShapeRef for the morph)
  morph(otherRef: ShapeRef, duration = ANIMATION_DURATION): ShapeRef {
    const morphIndex = this.scene.morph(this.index, otherRef.index, duration);
    return new ShapeRef(this.scene, morphIndex);
  }

  // Remove (deactivate) this shape
  remove(): void {
    this.scene.remove(this.index);
  }
}

// ==================== SCENE CLASS ====================
class Scene {
  shapes: Drawable[] = [];

  // ----- Shape factories (return ShapeRef) -----
  F(fun: (x: number) => number): ShapeRef {
    const shape = new FShape(fun);
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }

  Circle(radius: number): ShapeRef {
    const shape = new CircleShape(radius);
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }

  Square(sideLength: number): ShapeRef {
    const shape = new SquareShape(sideLength);
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }

  RegularPolygon(radius: number, sides: number): ShapeRef {
    const shape = new RegularPolygonShape(radius, sides);
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }

  Line(startX: number, startY: number, endX: number, endY: number): ShapeRef {
    const shape = new LineShape({ x: startX, y: startY }, { x: endX, y: endY });
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }

  ParametricCurve(fx: (t: number) => number, fy: (t: number) => number, tMin = 0, tMax = 1): ShapeRef {
    const shape = new ParametricCurveShape(fx, fy, tMin, tMax);
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }

  Star(outerRadius: number, innerRadius: number, points = 5): ShapeRef {
    const shape = new StarShape(outerRadius, innerRadius, points);
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }

  Spiral(maxRadius: number, turns = 3): ShapeRef {
    const shape = new SpiralShape(maxRadius, turns);
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }

  // ----- Transformations (low‑level, used by ShapeRef) -----
  translate(idx: number, x: number, y: number, duration = 0): void {
    const shape = this.shapes[idx];
    if (!shape) return;
    if (shape instanceof BaseShape) {
      if (duration > 0) {
        shape.animations.translation = new PropAnimation<Vec2>(
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
  }

  scale(idx: number, sx: number, sy: number = sx, duration = 0): void {
    const shape = this.shapes[idx];
    if (!shape) return;
    if (shape instanceof BaseShape) {
      if (duration > 0) {
        shape.animations.scale = new PropAnimation<Vec2>(
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
  }

  rotate(idx: number, angle: number, duration = 0): void {
    const shape = this.shapes[idx];
    if (!shape) return;
    if (shape instanceof BaseShape) {
      if (duration > 0) {
        shape.animations.rotation = new PropAnimation<number>(
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
  }

  // ----- Morph between two shapes (returns index of morph) -----
  morph(idx1: number, idx2: number, duration = ANIMATION_DURATION): number {
    if (!this.shapes[idx1] || !this.shapes[idx2]) {
      throw new Error(`Invalid shape indices: ${idx1}, ${idx2}`);
    }
    const morph = new MorphShape(this.shapes, idx1, idx2, duration);
    this.shapes.push(morph);
    return this.shapes.length - 1;
  }

  // ----- Start segment reveal animation for a shape -----
  reveal(idx: number): void {
    const shape = this.shapes[idx];
    if (!shape) {
      throw new Error(`Shape with index ${idx} does not exist.`);
    }
    if (shape instanceof BaseShape) {
      shape.animationStart = performance.now();
      shape.progress = 0;
    }
  }

  // ----- Remove (deactivate) a shape by index -----
  remove(idx: number): void {
    if (idx >= 0 && idx < this.shapes.length) {
      this.shapes[idx].active = false; // just deactivate, keep index stable
    }
  }

  // ----- Update all shapes (progress & animations) -----
  update(now: number): void {
    for (const shape of this.shapes) {
      if (shape instanceof BaseShape && shape.active) {
        // Update drawing progress
        if (shape.animationStart !== null) {
          const elapsed = now - shape.animationStart;
          const t = Math.min(elapsed, ANIMATION_DURATION);
          const targetProgress = Math.floor((t / ANIMATION_DURATION) * shape.vertices.length);
          shape.progress = Math.min(targetProgress, shape.vertices.length);

          if (elapsed >= ANIMATION_DURATION) {
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

    for (const shape of this.shapes) {
      if (shape.active) {
        shape.draw();
      }
    }
  }

  // ----- Animation loop entry point -----
  animate(now: number): void {
    this.update(now);
    this.draw();
  }
}

// ==================== GLOBAL SETUP ====================
// Create a default scene (you can also create multiple scenes)
const scene = new Scene();

// Animation loop
function animate(): void {
  scene.animate(performance.now());
  requestAnimationFrame(animate);
}

// Initialisation
function main(): void {
  gridLevel = 3;
  resize();
  requestAnimationFrame(animate);
}
main();

// Expose scene to console for interactive use
(window as any).scene = scene;
