// utils.ts
function generateRandomRgbColor() {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return `rgb(${r}, ${g}, ${b})`;
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

// ----- Shape class with translation and scale support -----
class Shape {
  constructor(
    vertices,
    color,
    pointSize = 2,
    closed = false,
    translation = { x: 0, y: 0 },
    scale = { x: 1, y: 1 }
  ) {
    this.vertices = vertices;                 // array of Vec2 (relative coordinates)
    this.color = color;
    this.pointSize = pointSize;
    this.closed = closed;
    this.translation = new Vec2(translation); // world offset
    this.scale = new Vec2(scale);             // scaling factors (applied before translation)
    this.progress = 0;                         // number of vertices to show
    this.animationStart = null;                // timestamp when animation started
  }

  // Draw all segments up to current progress, applying scale then translation
  draw() {
    // Helper to transform a vertex: scale then translate
    const getTransformed = (v) => {
      const scaled = new Vec2({ x: v.x * this.scale.x, y: v.y * this.scale.y });
      return scaled.add(this.translation);
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

// Global collection of shapes
const shapes = [];

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

// ----- Shape factories (all shapes created at origin with default scale 1) -----
function F(fun) {
  const vertices = [];
  for (let i = 0; i < NUM_VERTICES; i++) {
    const t = i / (NUM_VERTICES - 1); // 0 to 1 inclusive
    const x = -CONFIG.scaleX + t * (2 * CONFIG.scaleX);
    const y = fun(x);
    vertices.push(new Vec2({ x, y }));
  }
  const shape = new Shape(vertices, generateRandomRgbColor(), 2, false); // open curve
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
  const shape = new Shape(vertices, generateRandomRgbColor(), 2, true); // closed loop
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
  const shape = new Shape(vertices, generateRandomRgbColor(), 2, true); // closed loop
  shapes.push(shape);
  return shapes.length - 1;
}

// ----- Shape Actions -----

// Set absolute translation
function Translate(idx, x, y) {
  shapes[idx].translation = new Vec2({ x, y });
}

// Set absolute scale (uniform or separate x,y)
function Scale(idx, x, y = x) {
  shapes[idx].scale = new Vec2({ x: x, y: y });
}

// ----- Animation control -----
function draw(index) {
  const shape = shapes[index];
  if (!shape) {
    throw new Error(`Shape with index ${index} does not exist.`);
  }
  shape.animationStart = performance.now();
  shape.progress = 0;
  return index
}

// ----- Animation loop -----
function animate() {
  const now = performance.now();

  for (const shape of shapes) {
    if (shape.animationStart !== null) {
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
    shape.draw();
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
