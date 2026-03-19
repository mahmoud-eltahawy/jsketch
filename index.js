// utils.ts

// ----- Linear interpolation (defined before Color) -----
const lerp = (a, b, t) => a + (b - a) * t;

class Color {
  constructor(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
  }

  lerp(other, t) {
    return new Color(
      lerp(this.r, other.r, t),
      lerp(this.g, other.g, t),
      lerp(this.b, other.b, t)
    );
  }

  static random() {
    return new Color(
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256)
    );
  }

  toString() {
    return `rgb(${this.r}, ${this.g}, ${this.b})`;
  }
}

// Configuration
const CONFIG = {
  scaleX: 10,
  scaleY: 10,
};

const FPS = 180;
const TOTAL_FRAMES = 1000;
const DDT = 1000 / FPS;                       // ms per frame
const ANIMATION_DURATION = TOTAL_FRAMES * DDT; // ≈5556 ms
const NUM_VERTICES = 1000;                     // fixed vertex count for all shapes

const canvas = document.getElementById("box");
const ctx = canvas.getContext("2d");
let gridLevel = 3; // 1 = axes only, 2 = integer grid, 3 = half‑step grid

// ----- 2D vector with coordinate transformations -----
class Vec2 {
  constructor({ x, y }) {
    this.x = x;
    this.y = y;
  }

  // Convert world coordinates to canvas pixel coordinates
  normalized() {
    const half = boxSize() / 2;
    return {
      x: half * (1 + this.x / CONFIG.scaleX),
      y: half * (1 - this.y / CONFIG.scaleY),
    };
  }

  // Create a Vec2 from canvas pixel coordinates
  static fromCanvas({ x, y }) {
    const half = boxSize() / 2;
    return new Vec2({
      x: (x / half - 1) * CONFIG.scaleX,
      y: (1 - y / half) * CONFIG.scaleY,
    });
  }

  // Vector addition
  add(other) {
    return new Vec2({ x: this.x + other.x, y: this.y + other.y });
  }

  // Linear interpolation to another Vec2
  lerp(other, t) {
    return new Vec2({
      x: lerp(this.x, other.x, t),
      y: lerp(this.y, other.y, t),
    });
  }

  // Rotate by angle (radians) around origin
  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vec2({
      x: this.x * cos - this.y * sin,
      y: this.x * sin + this.y * cos,
    });
  }

  // Draw a square point at this vector
  draw(pointSize = 10, color = "#00FF00") {
    const { x, y } = this.normalized();
    ctx.fillStyle = color;
    ctx.fillRect(x - pointSize / 2, y - pointSize / 2, pointSize, pointSize);
  }

  // Draw a line from this vector to another
  drawLineTo(other, width = 2, color = "#FFFFFF") {
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
class Drawable {
  constructor() {
    if (this.constructor === Drawable) {
      throw new Error("Drawable is an abstract class and cannot be instantiated directly.");
    }
    this.active = true; // all drawables start active
  }

  draw() {
    throw new Error("draw() method must be implemented by subclass.");
  }
}

// ----- Helper class for animated properties -----
class Animation {
  constructor(start, target, duration, startTime) {
    this.start = start;
    this.target = target;
    this.duration = duration;
    this.startTime = startTime;
  }

  // Returns the current interpolated value, or null if finished
  value(now) {
    const elapsed = now - this.startTime;
    if (elapsed >= this.duration) {
      return this.target; // animation complete
    }
    const t = elapsed / this.duration;
    if (this.start instanceof Vec2) {
      return this.start.lerp(this.target, t);
    } else {
      // number (for rotation)
      return lerp(this.start, this.target, t);
    }
  }

  isFinished(now) {
    return now - this.startTime >= this.duration;
  }
}

// ----- Base class for all shapes (common properties and drawing logic) -----
class BaseShape extends Drawable {
  constructor(
    vertices,
    pointSize = 2,
    closed = false,
    translation = { x: 0, y: 0 },
    scale = { x: 1, y: 1 },
    rotation = 0  // in radians
  ) {
    super();
    this.vertices = vertices;                 // array of Vec2 (relative coordinates)
    this.color = Color.random();
    this.pointSize = pointSize;
    this.closed = closed;
    this.translation = new Vec2(translation); // world offset
    this.scale = new Vec2(scale);             // scaling factors
    this.rotation = rotation;                 // rotation angle in radians
    this.progress = 0;                         // number of vertices to show
    this.animationStart = null;                // timestamp when drawing animation started

    // Animation state for transformations
    this.animations = {
      translation: null,
      scale: null,
      rotation: null,
    };
  }

  // Update any active animations based on current time
  updateAnimations(now) {
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
  draw() {
    if (!this.active) return; // skip if inactive

    // Helper to transform a vertex
    const getTransformed = (v) => {
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
  constructor(fun) {
    const vertices = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1); // 0 to 1 inclusive
      const x = -CONFIG.scaleX + t * (2 * CONFIG.scaleX);
      const y = fun(x);
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, false); // open curve
  }
}

class CircleShape extends BaseShape {
  constructor(radius) {
    const vertices = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const angle = (i / NUM_VERTICES) * 2 * Math.PI;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, true); // closed loop
  }
}

class SquareShape extends BaseShape {
  constructor(sideLength) {
    const half = sideLength / 2;
    const perimeter = sideLength * 4;
    const vertices = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / NUM_VERTICES; // 0 to 1, exclusive of 1
      const s = t * perimeter;
      let x, y;
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
    super(vertices, 2, true); // closed loop
  }
}

class RegularPolygonShape extends BaseShape {
  constructor(radius, sides) {
    const vertices = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / NUM_VERTICES; // 0 to 1 (exclusive of 1)
      const angle = t * 2 * Math.PI;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, true); // closed loop
  }
}

class LineShape extends BaseShape {
  constructor(start, end) {
    const vertices = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1); // 0 to 1 inclusive
      const x = lerp(start.x, end.x, t);
      const y = lerp(start.y, end.y, t);
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, false); // open curve (just a line)
  }
}

class ParametricCurveShape extends BaseShape {
  constructor(fx, fy, tMin = 0, tMax = 1) {
    const vertices = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1); // 0 to 1 inclusive
      const param = tMin + t * (tMax - tMin);
      const x = fx(param);
      const y = fy(param);
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, false); // open curve by default (can be closed if parametric curve is closed)
  }
}

class StarShape extends BaseShape {
  constructor(outerRadius, innerRadius, points) {
    const vertices = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / NUM_VERTICES; // 0 to 1 (exclusive of 1)
      const angle = t * 2 * Math.PI;
      // Determine which point of the star we are on (two radii alternating)
      const sector = Math.floor(angle / (Math.PI / points)); // 0 .. 2*points-1
      const r = (sector % 2 === 0) ? outerRadius : innerRadius;
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, true); // closed loop
  }
}

class SpiralShape extends BaseShape {
  constructor(maxRadius, turns) {
    const vertices = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1); // 0 to 1 inclusive
      const radius = maxRadius * t;
      const angle = turns * 2 * Math.PI * t;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, false); // open curve
  }
}

// ----- MorphShape: interpolates between two shapes over time -----
class MorphShape extends Drawable {
  constructor(idx1, idx2, duration = ANIMATION_DURATION) {
    super();
    this.idx1 = idx1;               // index of first shape
    this.idx2 = idx2;               // index of second shape (target)
    this.duration = duration;
    this.pointSize = 2;              // could be averaged, but kept constant
    this.animationStart = performance.now();
    // No finished flag – we'll use active to control visibility
  }

  draw() {
    if (!this.active) return; // skip if inactive

    const shape1 = shapes[this.idx1];
    const shape2 = shapes[this.idx2];
    if (!shape1 || !shape2) return; // shapes might have been removed (but we never remove, so shouldn't happen)

    const now = performance.now();
    const elapsed = now - this.animationStart;
    const t = Math.min(elapsed / this.duration, 1);

    // Interpolate transforms and colors directly from current shape properties
    const trans = shape1.translation.lerp(shape2.translation, t);
    const scale = shape1.scale.lerp(shape2.scale, t);
    const rot = lerp(shape1.rotation, shape2.rotation, t);
    const color = shape1.color.lerp(shape2.color, t);
    const colorStr = color.toString();

    // Interpolate vertices (base vertices are static)
    const count = shape1.vertices.length; // same as shape2
    const transformed = [];
    for (let i = 0; i < count; i++) {
      const v = shape1.vertices[i].lerp(shape2.vertices[i], t);
      const scaled = new Vec2({ x: v.x * scale.x, y: v.y * scale.y });
      const rotated = scaled.rotate(rot);
      transformed.push(rotated.add(trans));
    }

    // Draw lines between consecutive transformed vertices
    for (let i = 0; i < count - 1; i++) {
      transformed[i].drawLineTo(transformed[i + 1], this.pointSize, colorStr);
    }
    if (shape2.closed) {
      transformed[count - 1].drawLineTo(transformed[0], this.pointSize, colorStr);
    }

    // Deactivate when animation completes, unless target shape hasn't started drawing
    if (elapsed >= this.duration) {
      const target = shapes[this.idx2];
      // Keep active if target progress is still 0 (target hasn't started drawing)
      if (target && target.progress === 0) {
        // remain active (we'll keep drawing the final state)
      } else {
        this.active = false; // hide when done and target has started
      }
    }
  }
}

// Global collection of shapes
let shapes = [];

// ----- Canvas sizing -----
function boxSize() {
  return Math.min(window.innerHeight, window.innerWidth);
}

function resize() {
  const s = boxSize();
  canvas.width = s;
  canvas.height = s;
}
window.addEventListener("resize", resize);

// ----- Text drawing helper (accepts Vec2) -----
function drawText(vec2, text, fontSize = 14, color = "#00FFFF") {
  const { x, y } = vec2.normalized();
  ctx.fillStyle = color;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillText(text, x, y);
}

// ----- Simple line wrapper (for grid drawing) -----
function drawLine(begin, end, width = 2, color = "#FFFFFF") {
  begin.drawLineTo(end, width, color);
}

// ----- Clear canvas to black -----
function clearBackground() {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, boxSize(), boxSize());
}

// ----- Draw grid based on gridLevel -----
function drawGrid() {
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

// ----- Shape factories -----
function F(fun) {
  const shape = new FShape(fun);
  shapes.push(shape);
  return shapes.length - 1;
}

function Circle(radius) {
  const shape = new CircleShape(radius);
  shapes.push(shape);
  return shapes.length - 1;
}

function Square(sideLength) {
  const shape = new SquareShape(sideLength);
  shapes.push(shape);
  return shapes.length - 1;
}

function RegularPolygon(radius, sides) {
  const shape = new RegularPolygonShape(radius, sides);
  shapes.push(shape);
  return shapes.length - 1;
}

function Line(startX, startY, endX, endY) {
  const shape = new LineShape({ x: startX, y: startY }, { x: endX, y: endY });
  shapes.push(shape);
  return shapes.length - 1;
}

function ParametricCurve(fx, fy, tMin = 0, tMax = 1) {
  const shape = new ParametricCurveShape(fx, fy, tMin, tMax);
  shapes.push(shape);
  return shapes.length - 1;
}

function Star(outerRadius, innerRadius, points = 5) {
  const shape = new StarShape(outerRadius, innerRadius, points);
  shapes.push(shape);
  return shapes.length - 1;
}

function Spiral(maxRadius, turns = 3) {
  const shape = new SpiralShape(maxRadius, turns);
  shapes.push(shape);
  return shapes.length - 1;
}

// ----- Shape Actions (now with optional animation duration) -----

// Set absolute translation (animated if duration > 0)
function Translate(idx, x, y, duration = 0) {
  const shape = shapes[idx];
  if (!shape) return idx;
  if (duration > 0) {
    // Start animation from current value
    shape.animations.translation = new Animation(
      shape.translation,
      new Vec2({ x, y }),
      duration,
      performance.now()
    );
  } else {
    shape.translation = new Vec2({ x, y });
    shape.animations.translation = null; // cancel any ongoing animation
  }
  return idx;
}

// Set absolute scale (uniform or separate x,y) – animated if duration > 0
function Scale(idx, sx, sy = sx, duration = 0) {
  const shape = shapes[idx];
  if (!shape) return idx;
  if (duration > 0) {
    shape.animations.scale = new Animation(
      shape.scale,
      new Vec2({ x: sx, y: sy }),
      duration,
      performance.now()
    );
  } else {
    shape.scale = new Vec2({ x: sx, y: sy });
    shape.animations.scale = null;
  }
  return idx;
}

// Set absolute rotation (in radians) – animated if duration > 0
function Rotate(idx, angle, duration = 0) {
  const shape = shapes[idx];
  if (!shape) return idx;
  if (duration > 0) {
    shape.animations.rotation = new Animation(
      shape.rotation,
      angle,
      duration,
      performance.now()
    );
  } else {
    shape.rotation = angle;
    shape.animations.rotation = null;
  }
  return idx;
}

// ----- Morph: create a shape that interpolates between two shapes -----
function Morph(idx1, idx2, duration = ANIMATION_DURATION) {
  if (!shapes[idx1] || !shapes[idx2]) {
    throw new Error(`Invalid shape indices: ${idx1}, ${idx2}`);
  }
  const morph = new MorphShape(idx1, idx2, duration);
  shapes.push(morph);
  return shapes.length - 1;
}

// ----- Animation control for regular shapes (segment reveal) -----
function draw(index) {
  const shape = shapes[index];
  if (!shape) {
    throw new Error(`Shape with index ${index} does not exist.`);
  }
  // Only regular shapes (subclasses of BaseShape) have progress animation.
  if (shape instanceof BaseShape) {
    shape.animationStart = performance.now();
    shape.progress = 0;
  }
  return index;
}

// ----- Animation loop -----
function animate() {
  const now = performance.now();

  // Update progress and animations for regular shapes (BaseShape instances)
  for (const shape of shapes) {
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

  clearBackground();
  drawGrid();

  for (const shape of shapes) {
    if (shape.active) {
      shape.draw();
    }
  }

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

// ----- Initialisation -----
function main() {
  gridLevel = 3;
  resize();
}
main();
