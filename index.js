const FPS = 180;
const TOTAL_FRAMES = 1000;
const TOTAL_SECONDS = TOTAL_FRAMES / FPS;
const DDT = 1000 / FPS;
const colors = ["#FFFF77", "#FF2000", "#EEFF00", "#EE9999", "#88DD88", "#DD88DD"];
let scale_x = 10;
let scale_y = 10;
const DDX = 2 * scale_x / TOTAL_FRAMES;
const draw_box = document.getElementById("box");
const ctx = draw_box.getContext("2d");
let draw_gradient_level = 3;
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
function normailze({ x, y }) {
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
function draw_point(vec2, size = 10, color = "#00FF00") {
  const { x, y } = normailze(vec2);
  ctx.fillStyle = color;
  ctx.fillRect(x - size / 2, y - size / 2, size, size);
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
    throw `draw gradient level should be 1 , 2 , 3 or undefined but it = ${draw_gradient_level}`;
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
}
const shapes = [];
function F(fun, miror_x = false, miror_y = false) {
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
    color: colors[index % colors.length],
    tf: miror_x && miror_y ? 3 : miror_x || miror_y ? 2 : 1,
    size: 2
  });
  return index;
}
function draw(index) {
  const shape = shapes.at(index);
  if (!shape) {
    throw "shape is not initialzied";
  }
  for (let i = 0;i < TOTAL_FRAMES; i++) {
    setTimeout(() => {
      draw_point(shape.vertices[i], shape.size, shape.color);
    }, DDT * i);
  }
}
function main() {
  draw_gradient_level = 3;
  resize();
}
main();
