// utils.ts
function generateRandomRgbColor() {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return `rgb(${r}, ${g}, ${b})`;
}

const config = {
  scale_x : 10,  
  scale_y :10,
}

// index.ts
const FPS = 180;
const TOTAL_FRAMES = 1000;
const DDT = 1000 / FPS;
const ANIMATION_DURATION = TOTAL_FRAMES * DDT; // ≈5556 ms
const DDX = (2 * config.scale_x) / TOTAL_FRAMES;


const draw_box = document.getElementById("box");
const ctx = draw_box.getContext("2d");
let draw_gradient_level = 3;

function lerp(a,b,t) {
  return a + (b - a) * t
}

class Vec2 {
  constructor({ x, y }) {
    this.x = x;
    this.y = y;
  }

  normalized() {
    const half = box_size() / 2;
    return {
      x: half * (1 + this.x / config.scale_x),
      y: half * (1 - this.y / config.scale_y),
    };
  }

  static fromCanvas({ x, y }) {
    const half = box_size() / 2;
    return new Vec2({
      x: (x / half - 1) * config.scale_x,
      y: (1 - y / half) * config.scale_y,
    });
  }

  distance_to(other) {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }

  lerp(other, t) {
    return new Vec2({
      x: lerp(this.x,other.x,t),
      y: lerp(this.y,other.y,t),
    });
  }

  draw(size = 10, color = "#00FF00") {
    const { x, y } = this.normalized();
    ctx.fillStyle = color;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }

  draw_line_to(other, width = 2, color = "#FFFFFF") {
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

// ----- Shape class -----
class Shape {
  constructor(vertices, color, size = 2) {
    this.vertices = vertices;       // array of {x, y} in world coordinates
    this.color = color;
    this.size = size;
    this.progress = 0;              // number of vertices already drawn (0 = none)
    this.animationStart = null;     // timestamp when animation started
  }

  draw() {
    for (let i = 0; i < this.progress -1; i++) {
      this.vertices[i].draw_line_to(this.vertices[i + 1], this.size, this.color);
    }
  }
}

const shapes = []; // will hold Shape instances

// ----- Canvas sizing -----
function box_size() {
  return Math.min(window.innerHeight, window.innerWidth);
}

function resize() {
  const s = box_size();
  draw_box.width = s;
  draw_box.height = s;
  // No explicit clear needed – animation loop redraws everything
}
window.addEventListener("resize", resize);

// ----- Coordinate transformation -----
function normalize(vec2) {
  const { x, y } = vec2;
  const zero = box_size() / 2;
  return {
    x: zero * (1 + x / config.scale_x),
    y: zero * (1 - y / config.scale_y),
  };
}

// ----- Drawing primitives (for grid and text) -----
function draw_text(vec2, text, font_size = 14, color = "#00FFFF") {
  const { x, y } = normalize(vec2);
  ctx.fillStyle = color;
  ctx.font = `${font_size}px sans-serif`;
  ctx.fillText(text, x, y);
}

function draw_line(begin, end, width = 2, color = "#FFFFFF") {
  const nbegin = normalize(begin);
  const nend = normalize(end);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(nbegin.x, nbegin.y);
  ctx.lineTo(nend.x, nend.y);
  ctx.stroke();
}

function clear_background() {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, box_size(), box_size());
}

// ----- Grid drawing -----
function draw_gradient() {
  if (!draw_gradient_level) return;
  if (![1, 2, 3].includes(draw_gradient_level)) {
    throw new Error(
      `draw_gradient_level should be 1, 2, 3 or falsy, but it is ${draw_gradient_level}`
    );
  }

  // Axes (level ≥ 1)
  if (draw_gradient_level >= 1) {
    draw_line({ x: -config.scale_x, y: 0 }, { x: config.scale_x, y: 0 }, 3);
    draw_line({ x: 0, y: -config.scale_y }, { x: 0, y: config.scale_y }, 3);
  }

  // Horizontal lines and labels
  for (let i = -config.scale_y; i <= config.scale_y; i++) {
    draw_text({ x: 0, y: i }, i.toString());
    if (draw_gradient_level >= 2) {
      draw_line({ x: -config.scale_x, y: i }, { x: config.scale_x, y: i }, 1);
    }
    if (draw_gradient_level === 3) {
      draw_line({ x: -config.scale_x, y: i + 0.5 }, { x: config.scale_x, y: i + 0.5 }, 0.3);
    }
  }

  // Vertical lines and labels
  for (let i = -config.scale_x; i <= config.scale_x; i++) {
    draw_text({ x: i, y: 0 }, i.toString());
    if (draw_gradient_level >= 2) {
      draw_line({ x: i, y: -config.scale_y }, { x: i, y: config.scale_y }, 1);
    }
    if (draw_gradient_level === 3) {
      draw_line({ x: i + 0.5, y: -config.scale_y }, { x: i + 0.5, y: config.scale_y }, 0.3);
    }
  }
}

// ----- Shape creation -----
function F(fun) {
  let x = -config.scale_x;
  const vertices = [];
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const y = fun(x);
    if (!isNaN(y) && y >= -config.scale_y && y <= config.scale_y) {
      vertices.push(new Vec2({ x, y }));
    }
    x += DDX;
  }
  const shape = new Shape(vertices, generateRandomRgbColor(), 2);
  shapes.push(shape);
  return shapes.length - 1; // index
}

function Circle(radius) {
  let angle = 0;
  const d_angle = Math.PI / 1000;
  const vertices = [];
  while (angle <= 2 * Math.PI) {
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    vertices.push(new Vec2({ x, y }));
    angle += d_angle;
  }
  const shape = new Shape(vertices, generateRandomRgbColor(), 2);
  shapes.push(shape);
  return shapes.length - 1; // index
}

// ----- Animation control -----
function draw(index) {
  const shape = shapes[index];
  if (!shape) {
    throw new Error(`Shape with index ${index} does not exist.`);
  }
  // (Re)start the animation
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

      // If animation finished, we can clear the start time (optional)
      if (elapsed >= ANIMATION_DURATION) {
        shape.animationStart = null;
      }
    }
  }

  // Redraw everything
  clear_background();
  draw_gradient();

  for (const shape of shapes) {
    shape.draw();
  }

  requestAnimationFrame(animate);
}

// Start the animation loop
requestAnimationFrame(animate);

// ----- Initialisation -----
function main() {
  draw_gradient_level = 3;
  resize();
}
main();

