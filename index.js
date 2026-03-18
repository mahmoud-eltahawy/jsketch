// utils.ts
function generateRandomRgbColor() {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return `rgb(${r}, ${g}, ${b})`;
}

// index.ts
const FPS = 180;
const TOTAL_FRAMES = 1000;
const DDT = 1000 / FPS;                      // ≈5.56 ms per frame
const ANIMATION_DURATION = TOTAL_FRAMES * DDT; // total time to draw one shape (≈5556 ms)

const scale_x = 10;
const scale_y = 10;
const DDX = (2 * scale_x) / TOTAL_FRAMES;     // x increment when sampling a function

const draw_box = document.getElementById("box");
const ctx = draw_box.getContext("2d");
let draw_gradient_level = 3;                   // can be changed later

// Store all shapes
const shapes = [];

// ----- Canvas sizing -----
function size() {
  return Math.min(window.innerHeight, window.innerWidth);
}

function resize() {
  const s = size();
  draw_box.width = s;
  draw_box.height = s;
  // No need to call clear() – the animation loop redraws everything each frame
}
window.addEventListener("resize", resize);

// ----- Coordinate transformation -----
function normalize(vec2) {
  const { x, y } = vec2;
  const zero = size() / 2;
  return {
    x: zero * (1 + x / scale_x),
    y: zero * (1 - y / scale_y),
  };
}

// ----- Drawing primitives -----
function draw_text(vec2, text, font_size = 14, color = "#00FFFF") {
  const { x, y } = normalize(vec2);
  ctx.fillStyle = color;
  ctx.font = `${font_size}px sans-serif`;
  ctx.fillText(text, x, y);
}

function draw_point(vec2, pointSize = 10, color = "#00FF00") {
  const { x, y } = normalize(vec2);
  ctx.fillStyle = color;
  ctx.fillRect(x - pointSize / 2, y - pointSize / 2, pointSize, pointSize);
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
  ctx.fillRect(0, 0, size(), size());
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
    draw_line({ x: -scale_x, y: 0 }, { x: scale_x, y: 0 }, 3);
    draw_line({ x: 0, y: -scale_y }, { x: 0, y: scale_y }, 3);
  }

  // Horizontal lines and labels
  for (let i = -scale_y; i <= scale_y; i++) {
    draw_text({ x: 0, y: i }, i.toString());
    if (draw_gradient_level >= 2) {
      draw_line({ x: -scale_x, y: i }, { x: scale_x, y: i }, 1);
    }
    if (draw_gradient_level === 3) {
      draw_line({ x: -scale_x, y: i + 0.5 }, { x: scale_x, y: i + 0.5 }, 0.3);
    }
  }

  // Vertical lines and labels
  for (let i = -scale_x; i <= scale_x; i++) {
    draw_text({ x: i, y: 0 }, i.toString());
    if (draw_gradient_level >= 2) {
      draw_line({ x: i, y: -scale_y }, { x: i, y: scale_y }, 1);
    }
    if (draw_gradient_level === 3) {
      draw_line({ x: i + 0.5, y: -scale_y }, { x: i + 0.5, y: scale_y }, 0.3);
    }
  }
}

// ----- Shape creation -----
function F(fun) {
  let x = -scale_x;
  const vertices = [];
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const y = fun(x);
    if (!isNaN(y) && y >= -scale_y && y <= scale_y) {
      vertices.push({ x, y });
    }
    x += DDX;
  }
  const index = shapes.length;
  shapes.push({
    vertices,
    progress: 0,                // number of vertices already drawn (0 = none)
    color: generateRandomRgbColor(),
    size: 2,
    animationStart: null,       // will be set when draw() is called
  });
  return index;
}

function Circle(radius) {
  let angle = 0;
  const d_angle = Math.PI / 1000;
  const vertices = [];
  while (angle <= 2 * Math.PI) {
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    vertices.push({ x, y });
    angle += d_angle;
  }
  const index = shapes.length;
  shapes.push({
    vertices,
    progress: 0,
    color: generateRandomRgbColor(),
    size: 2,
    animationStart: null,
  });
  return index;
}

// ----- Animation control -----
function draw(index) {
  const shape = shapes[index];
  if (!shape) {
    throw new Error(`Shape with index ${index} does not exist.`);
  }
  // (Re)start the animation for this shape
  shape.animationStart = performance.now();
  shape.progress = 0;           // reset progress so it begins from the first vertex
}

// ----- Animation loop -----
function animate() {
  // 1. Update progress for all animating shapes
  const now = performance.now();
  for (const shape of shapes) {
    if (shape.animationStart !== null) {
      const elapsed = now - shape.animationStart;
      // Clamp elapsed to the total duration to avoid over‑drawing
      const t = Math.min(elapsed, ANIMATION_DURATION);
      // How many vertices should be visible by now?
      const targetProgress = Math.floor((t / ANIMATION_DURATION) * shape.vertices.length);
      shape.progress = Math.min(targetProgress, shape.vertices.length);

      // If the animation has finished, we can stop tracking its start time
      if (elapsed >= ANIMATION_DURATION) {
        shape.animationStart = null; // optional, stops further calculations
      }
    }
  }

  // 2. Clear canvas and redraw everything
  clear_background();
  draw_gradient();

  // 3. Draw all shapes up to their current progress
  for (const shape of shapes) {
    for (let i = 0; i < shape.progress; i++) {
      draw_point(shape.vertices[i], shape.size, shape.color);
    }
  }

  requestAnimationFrame(animate);
}

// Start the animation loop once
requestAnimationFrame(animate);

// ----- Initialisation -----
function main() {
  draw_gradient_level = 3;
  resize(); // sets canvas size and clears it (the next animation frame will redraw)
}
main();
