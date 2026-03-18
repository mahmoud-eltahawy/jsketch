function generateRandomRgbColor() {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return `rgb(${r}, ${g}, ${b})`;
}

const config = {
  scaleX: 10,
  scaleY: 10,
};

const FPS = 180;
const TOTAL_FRAMES = 1000;
const DDT = 1000 / FPS;
const ANIMATION_DURATION = TOTAL_FRAMES * DDT; 
const DDX = (2 * config.scaleX) / TOTAL_FRAMES;

const draw_box = document.getElementById("box");
const ctx = draw_box.getContext("2d");
let draw_gradient_level = 3;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

class Vec2 {
  constructor({ x, y }) {
    this.x = x;
    this.y = y;
  }

  normalized() {
    const half = box_size() / 2;
    return {
      x: half * (1 + this.x / config.scaleX),
      y: half * (1 - this.y / config.scaleY),
    };
  }

  static fromCanvas({ x, y }) {
    const half = box_size() / 2;
    return new Vec2({
      x: (x / half - 1) * config.scaleX,
      y: (1 - y / half) * config.scaleY,
    });
  }

  distance_to(other) {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }

  lerp(other, t) {
    return new Vec2({
      x: lerp(this.x, other.x, t),
      y: lerp(this.y, other.y, t),
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

class Shape {
  constructor(vertices, color, size = 2, closed = false) {
    this.vertices = vertices;       
    this.color = color;
    this.size = size;
    this.closed = closed;           
    this.progress = 0;              
    this.animationStart = null;     
  }

  draw() {
    for (let i = 0; i < this.progress - 1; i++) {
      this.vertices[i].draw_line_to(this.vertices[i + 1], this.size, this.color);
    }
    if (this.closed && this.progress === this.vertices.length) {
      this.vertices[this.vertices.length - 1].draw_line_to(this.vertices[0], this.size, this.color);
    }
  }
}

const shapes = []; 

function box_size() {
  return Math.min(window.innerHeight, window.innerWidth);
}

function resize() {
  const s = box_size();
  draw_box.width = s;
  draw_box.height = s;
}
window.addEventListener("resize", resize);

function draw_text(vec2, text, font_size = 14, color = "#00FFFF") {
  const { x, y } = vec2.normalized();
  ctx.fillStyle = color;
  ctx.font = `${font_size}px sans-serif`;
  ctx.fillText(text, x, y);
}

function draw_line(begin, end, width = 2, color = "#FFFFFF") {
  begin.draw_line_to(end, width, color);
}

function clear_background() {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, box_size(), box_size());
}

function draw_gradient() {
  if (!draw_gradient_level) return;
  if (![1, 2, 3].includes(draw_gradient_level)) {
    throw new Error(
      `draw_gradient_level should be 1, 2, 3 or falsy, but it is ${draw_gradient_level}`
    );
  }

  if (draw_gradient_level >= 1) {
    draw_line(
      new Vec2({ x: -config.scaleX, y: 0 }),
      new Vec2({ x: config.scaleX, y: 0 }),
      3
    );
    draw_line(
      new Vec2({ x: 0, y: -config.scaleY }),
      new Vec2({ x: 0, y: config.scaleY }),
      3
    );
  }

  for (let i = -config.scaleY; i <= config.scaleY; i++) {
    draw_text(new Vec2({ x: 0, y: i }), i.toString());
    if (draw_gradient_level >= 2) {
      draw_line(
        new Vec2({ x: -config.scaleX, y: i }),
        new Vec2({ x: config.scaleX, y: i }),
        1
      );
    }
    if (draw_gradient_level === 3) {
      draw_line(
        new Vec2({ x: -config.scaleX, y: i + 0.5 }),
        new Vec2({ x: config.scaleX, y: i + 0.5 }),
        0.3
      );
    }
  }

  for (let i = -config.scaleX; i <= config.scaleX; i++) {
    draw_text(new Vec2({ x: i, y: 0 }), i.toString());
    if (draw_gradient_level >= 2) {
      draw_line(
        new Vec2({ x: i, y: -config.scaleY }),
        new Vec2({ x: i, y: config.scaleY }),
        1
      );
    }
    if (draw_gradient_level === 3) {
      draw_line(
        new Vec2({ x: i + 0.5, y: -config.scaleY }),
        new Vec2({ x: i + 0.5, y: config.scaleY }),
        0.3
      );
    }
  }
}

function F(fun) {
  let x = -config.scaleX;
  const vertices = [];
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const y = fun(x);
    if (!isNaN(y) && y >= -config.scaleY && y <= config.scaleY) {
      vertices.push(new Vec2({ x, y }));
    }
    x += DDX;
  }
  const shape = new Shape(vertices, generateRandomRgbColor(), 2, false); 
  shapes.push(shape);
  return shapes.length - 1; 
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
  const shape = new Shape(vertices, generateRandomRgbColor(), 2, true); 
  shapes.push(shape);
  return shapes.length - 1; 
}

function draw(index) {
  const shape = shapes[index];
  if (!shape) {
    throw new Error(`Shape with index ${index} does not exist.`);
  }
  shape.animationStart = performance.now();
  shape.progress = 0;
}

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

  clear_background();
  draw_gradient();

  for (const shape of shapes) {
    shape.draw();
  }

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

function main() {
  draw_gradient_level = 3;
  resize();
}
main();
