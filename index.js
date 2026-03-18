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

// ----- Linear interpolation (kept for possible future use) -----
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

  // Create a Vec2 from canvas pixel coordinates (useful for mouse interaction)
  static fromCanvas({ x, y }) {
    const half = boxSize() / 2;
    return new Vec2({
      x: (x / half - 1) * CONFIG.scaleX,
      y: (1 - y / half) * CONFIG.scaleY,
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

// ----- Shape class representing a connected set of points (open or closed) -----
class Shape {
  constructor(vertices, color, pointSize = 2, closed = false) {
    this.vertices = vertices;       // array of Vec2
    this.color = color;
    this.pointSize = pointSize;      // line width / point size (used for lines here)
    this.closed = closed;
    this.progress = 0;               // number of vertices to show (0 = none)
    this.animationStart = null;      // timestamp when animation started
  }

  // Draw all segments up to current progress
  draw() {
    // Draw lines between consecutive vertices
    for (let i = 0; i < this.progress - 1; i++) {
      this.vertices[i].drawLineTo(this.vertices[i + 1], this.pointSize, this.color);
    }
    // If the shape is closed and fully drawn, add the closing segment
    if (this.closed && this.progress === this.vertices.length) {
      this.vertices[this.vertices.length - 1].drawLineTo(this.vertices[0], this.pointSize, this.color);
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
  // Redraw happens automatically on next animation frame
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

// ----- Shape factories with fixed vertex count -----
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
  return shapes.length - 1; // index
}

function Circle(radius) {
  const vertices = [];
  for (let i = 0; i < NUM_VERTICES; i++) {
    const angle = (i / NUM_VERTICES) * 2 * Math.PI; // 0 to 2π, exclusive of endpoint
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
    const s = t * perimeter; // distance along perimeter
    let x, y;
    if (s < sideLength) {
      // top edge: left → right
      x = -half + s;
      y = -half;
    } else if (s < 2 * sideLength) {
      // right edge: top → bottom
      x = half;
      y = -half + (s - sideLength);
    } else if (s < 3 * sideLength) {
      // bottom edge: right → left
      x = half - (s - 2 * sideLength);
      y = half;
    } else {
      // left edge: bottom → top
      x = -half;
      y = half - (s - 3 * sideLength);
    }
    vertices.push(new Vec2({ x, y }));
  }
  const shape = new Shape(vertices, generateRandomRgbColor(), 2, true); // closed loop
  shapes.push(shape);
  return shapes.length - 1;
}

// ----- Animation control -----
function draw(index) {
  const shape = shapes[index];
  if (!shape) {
    throw new Error(`Shape with index ${index} does not exist.`);
  }
  // Start (or restart) the animation
  shape.animationStart = performance.now();
  shape.progress = 0;
}

// ----- Animation loop -----
function animate() {
  const now = performance.now();

  // Update progress for all animating shapes
  for (const shape of shapes) {
    if (shape.animationStart !== null) {
      const elapsed = now - shape.animationStart;
      const t = Math.min(elapsed, ANIMATION_DURATION);
      const targetProgress = Math.floor((t / ANIMATION_DURATION) * shape.vertices.length);
      shape.progress = Math.min(targetProgress, shape.vertices.length);

      if (elapsed >= ANIMATION_DURATION) {
        shape.animationStart = null; // stop updating this shape
      }
    }
  }

  // Redraw everything
  clearBackground();
  drawGrid();

  for (const shape of shapes) {
    shape.draw();
  }

  requestAnimationFrame(animate);
}

// Start the animation loop
requestAnimationFrame(animate);

// ----- Initialisation -----
function main() {
  gridLevel = 3;
  resize();
}
main();
