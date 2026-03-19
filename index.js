// utils.ts

class Color {
  constructor(r,g,b) {
    this.r = r
    this.g = g
    this.b = b
  }

  lerp(other,t) {
        return new Color(
          lerp(this.r,other.r,t),
          lerp(this.g,other.g,t),
          lerp(this.b,other.b,t),
        )
  }

  static random() {
    return new Color(
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
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

// ----- Linear interpolation -----
function lerp(a, b, t) {
  return a + (b - a) * t;
}

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

// ----- Shape class with translation, scale, and rotation support -----
class Shape {
  constructor(
    vertices,
    pointSize = 2,
    closed = false,
    translation = { x: 0, y: 0 },
    scale = { x: 1, y: 1 },
    rotation = 0  // in radians
  ) {
    this.vertices = vertices;                 // array of Vec2 (relative coordinates)
    this.color = Color.random();
    this.pointSize = pointSize;
    this.closed = closed;
    this.translation = new Vec2(translation); // world offset
    this.scale = new Vec2(scale);             // scaling factors
    this.rotation = rotation;                 // rotation angle in radians
    this.progress = 0;                         // number of vertices to show
    this.animationStart = null;                // timestamp when animation started
  }

  // Draw all segments up to current progress, applying scale → rotate → translate
  draw() {
    // Helper to transform a vertex
    const getTransformed = (v) => {
      const scaled = new Vec2({ x: v.x * this.scale.x, y: v.y * this.scale.y });
      const rotated = scaled.rotate(this.rotation);
      return rotated.add(this.translation);
    };

    for (let i = 0; i < this.progress - 1; i++) {
      const a = getTransformed(this.vertices[i]);
      const b = getTransformed(this.vertices[i + 1]);
      a.drawLineTo(b, this.pointSize, this.color);
    }
    // Closing segment
    if (this.closed && this.progress === this.vertices.length) {
      const a = getTransformed(this.vertices[this.vertices.length - 1]);
      const b = getTransformed(this.vertices[0]);
      a.drawLineTo(b, this.pointSize, this.color);
    }
  }
}

// ----- MorphShape: interpolates between two shapes over time -----
class MorphShape {
  constructor(shape1, shape2, duration = ANIMATION_DURATION) {
    // Capture a snapshot of both shapes (vertices and transforms)
    this.shape1 = {
      vertices: shape1.vertices.map(v => new Vec2({ x: v.x, y: v.y })),
      translation: new Vec2({ x: shape1.translation.x, y: shape1.translation.y }),
      scale: new Vec2({ x: shape1.scale.x, y: shape1.scale.y }),
      rotation: shape1.rotation,
      color: shape1.color,
    };
    this.shape2 = {
      vertices: shape2.vertices.map(v => new Vec2({ x: v.x, y: v.y })),
      translation: new Vec2({ x: shape2.translation.x, y: shape2.translation.y }),
      scale: new Vec2({ x: shape2.scale.x, y: shape2.scale.y }),
      rotation: shape2.rotation,
      color: shape2.color,
    };
    this.duration = duration;
    this.pointSize = 2; // could also average point sizes
    this.closed = shape1.closed; // assume same closed state (or use shape1's)
    this.animationStart = performance.now(); // start immediately
    this.finished = false; // becomes true when morph completes
  }

  draw() {
    const now = performance.now();
    const elapsed = now - this.animationStart;
    const t = Math.min(elapsed / this.duration, 1);

    // Interpolate transforms
    const trans = this.shape1.translation.lerp(this.shape2.translation, t);
    const scale = this.shape1.scale.lerp(this.shape2.scale, t);
    const rot = lerp(this.shape1.rotation, this.shape2.rotation, t);
    // Interpolate color
    const color = this.shape1.color.lerp(this.shape2.color, t);

    // Interpolate and transform all vertices
    const count = this.shape1.vertices.length; // same as shape2
    const transformed = [];
    for (let i = 0; i < count; i++) {
      const v = this.shape1.vertices[i].lerp(this.shape2.vertices[i], t);
      const scaled = new Vec2({ x: v.x * scale.x, y: v.y * scale.y });
      const rotated = scaled.rotate(rot);
      transformed.push(rotated.add(trans));
    }

    // Draw lines between consecutive transformed vertices
    for (let i = 0; i < count - 1; i++) {
      transformed[i].drawLineTo(transformed[i + 1], this.pointSize, color);
    }
    if (this.closed) {
      transformed[count - 1].drawLineTo(transformed[0], this.pointSize, color);
    }

    // Mark as finished if animation completed
    if (elapsed >= this.duration) {
      this.finished = true;
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

// ----- Shape factories (all shapes created at origin with default scale 1 and rotation 0) -----
function F(fun) {
  const vertices = [];
  for (let i = 0; i < NUM_VERTICES; i++) {
    const t = i / (NUM_VERTICES - 1); // 0 to 1 inclusive
    const x = -CONFIG.scaleX + t * (2 * CONFIG.scaleX);
    const y = fun(x);
    vertices.push(new Vec2({ x, y }));
  }
  const shape = new Shape(vertices, 2, false); // open curve
  shapes.push(shape);
  return shapes.length - 1;
}

function Circle(radius) {
  const vertices = [];
  for (let i = 0; i < NUM_VERTICES; i++) {
    const angle = (i / NUM_VERTICES) * 2 * Math.PI;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    vertices.push(new Vec2({ x, y }));
  }
  const shape = new Shape(vertices,2, true); // closed loop
  shapes.push(shape);
  return shapes.length - 1;
}

function Square(sideLength) {
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
  const shape = new Shape(vertices, 2, true); // closed loop
  shapes.push(shape);
  return shapes.length - 1;
}

// ----- Shape Actions -----

// Set absolute translation
function Translate(idx, x, y) {
  shapes[idx].translation = new Vec2({ x, y });
  return idx
}

// Set absolute scale (uniform or separate x,y)
function Scale(idx, sx, sy = sx) {
  shapes[idx].scale = new Vec2({ x: sx, y: sy });
  return idx
}

// Set absolute rotation (in radians)
function Rotate(idx, angle) {
  shapes[idx].rotation = angle;
  return idx
}

// ----- Morph: create a shape that interpolates between two shapes -----
function Morph(idx1, idx2, duration = ANIMATION_DURATION) {
  const shape1 = shapes[idx1];
  const shape2 = shapes[idx2];
  if (!shape1 || !shape2) {
    throw new Error(`Invalid shape indices: ${idx1}, ${idx2}`);
  }
  const morph = new MorphShape(shape1, shape2, duration);
  shapes.push(morph);
  return shapes.length - 1; // index of the morph shape
}

// ----- Animation control for regular shapes (segment reveal) -----
function draw(index) {
  const shape = shapes[index];
  if (!shape) {
    throw new Error(`Shape with index ${index} does not exist.`);
  }
  // Only regular shapes have progress animation; morph shapes use their own timing.
  if (shape instanceof Shape) {
    shape.animationStart = performance.now();
    shape.progress = 0;
  }
  return index
}

// ----- Animation loop -----
function animate() {
  const now = performance.now();

  // Update progress only for regular shapes (Shape instances)
  for (const shape of shapes) {
    if (shape instanceof Shape && shape.animationStart !== null) {
      const elapsed = now - shape.animationStart;
      const t = Math.min(elapsed, ANIMATION_DURATION);
      const targetProgress = Math.floor((t / ANIMATION_DURATION) * shape.vertices.length);
      shape.progress = Math.min(targetProgress, shape.vertices.length);

      if (elapsed >= ANIMATION_DURATION) {
        shape.animationStart = null;
      }
    }
  }

  clearBackground();
  drawGrid();

  for (const shape of shapes) {
    shape.draw(); // MorphShape also has a draw method
  }

  // Remove finished morph shapes
  shapes = shapes.filter(s => !s.finished);

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

// ----- Initialisation -----
function main() {
  gridLevel = 3;
  resize();
}
main();
