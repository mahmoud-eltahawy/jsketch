// utils.ts
function generateRandomRgbColor() {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return `rgb(${r}, ${g}, ${b})`;
}

// index.ts
var FPS = 180;
var TOTAL_FRAMES = 1000;
var DDT = 1000 / FPS;
var scale_x = 10;
var scale_y = 10;
var DDX = 2 * scale_x / TOTAL_FRAMES;
var draw_box = document.getElementById("box");
var ctx = draw_box.getContext("2d");
var draw_gradient_level = 3;
function size() {
  return Math.min(window.innerHeight, window.innerWidth);
}
function resize() {
  const s = size();
  draw_box.width = s;
  draw_box.height = s;
  clear();
}
addEventListener("resize", resize);
function normailze(vec2) {
  const { x, y } = vec2;
  const zero = size() / 2;
  return {
    x: zero * (1 + x / scale_x),
    y: zero * (1 - y / scale_y)
  };
}
function draw_text(vec2, text, font_size = 14, color = "#00FFFF") {
  const { x, y } = normailze(vec2);
  ctx.fillStyle = color;
  ctx.font = `${font_size}px sans-serif`;
  ctx.fillText(text, x, y);
}
function draw_point(vec2, size2 = 10, color = "#00FF00") {
  const { x, y } = normailze(vec2);
  ctx.fillStyle = color;
  ctx.fillRect(x - size2 / 2, y - size2 / 2, size2, size2);
}
function draw_line(begin, end, width = 2, color = "#FFFFFF") {
  const nbegin = normailze(begin);
  const nend = normailze(end);
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
function draw_gradient() {
  if (!draw_gradient_level) {
    return;
  }
  if (![1, 2, 3].includes(draw_gradient_level)) {
    throw `draw gradient level should be 1 , 2 , 3 or null but it = ${draw_gradient_level}`;
  }
  if (draw_gradient_level >= 1) {
    draw_line({ x: -scale_x, y: 0 }, { x: scale_x, y: 0 }, 3);
    draw_line({ y: -scale_y, x: 0 }, { y: scale_y, x: 0 }, 3);
  }
  for (let i = -scale_y;i <= scale_y; i++) {
    draw_text({ x: 0, y: i }, i.toString());
    if (draw_gradient_level >= 2) {
      draw_line({ x: -scale_x, y: i }, { x: scale_x, y: i }, 1);
    }
    if (draw_gradient_level === 3) {
      draw_line({ x: -scale_x, y: i + 0.5 }, { x: scale_x, y: i + 0.5 }, 0.3);
    }
  }
  for (let i = -scale_x;i <= scale_x; i++) {
    draw_text({ x: i, y: 0 }, i.toString());
    if (draw_gradient_level >= 2) {
      draw_line({ y: -scale_y, x: i }, { y: scale_y, x: i }, 1);
    }
    if (draw_gradient_level === 3) {
      draw_line({ y: -scale_y, x: i + 0.5 }, { y: scale_y, x: i + 0.5 }, 0.3);
    }
  }
}
function clear() {
  clear_background();
  draw_gradient();
  preserve_drawed_shapes();
}
var shapes = [];
var F = function(fun, miror_x = false, miror_y = false) {
  let x = -scale_x;
  let vertices = [];
  for (let i = 0;i < TOTAL_FRAMES; i++) {
    const y = fun(x);
    if (isNaN(y) || y < -scale_y || y > scale_y) {
      x += DDX;
      continue;
    }
    vertices.push({ x, y });
    if (miror_x) {
      vertices.push({ x, y: -y });
    }
    if (miror_y) {
      vertices.push({ x, y: fun(-x) });
    }
    x += DDX;
  }
  const index = shapes.length;
  shapes.push({
    vertices,
    draw_progress: 0,
    color: generateRandomRgbColor(),
    tf: miror_x && miror_y ? 3 : miror_x || miror_y ? 2 : 1,
    size: 2
  });
  return index;
};
window.F = F;
var Circle = function(radius) {
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
    draw_progress: 0,
    color: generateRandomRgbColor(),
    tf: 1,
    size: 2
  });
  return index;
};
window.Circle = Circle;
var draw = function(index) {
  const shape = shapes[index];
  if (!shape) {
    throw "shape is not initialzied";
  }
  for (let i = 0;i < shape.vertices.length; i++) {
    setTimeout(() => {
      const v = shape.vertices[shape.draw_progress];
      draw_point(v, shape.size, shape.color);
      shape.draw_progress = i;
    }, DDT * i);
  }
};
window.draw = draw;
function preserve_drawed_shapes() {
  for (const shape of shapes) {
    for (let i = 0;i < shape.draw_progress; i++) {
      draw_point(shape.vertices[i], shape.size, shape.color);
    }
  }
}
function main() {
  draw_gradient_level = 3;
  resize();
}
main();
