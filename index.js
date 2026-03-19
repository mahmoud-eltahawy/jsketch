// index.ts
var lerp = (a, b, t) => a + (b - a) * t;

class Color {
  r;
  g;
  b;
  constructor(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
  }
  lerp(other, t) {
    return new Color(lerp(this.r, other.r, t), lerp(this.g, other.g, t), lerp(this.b, other.b, t));
  }
  static random() {
    return new Color(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256));
  }
  toString() {
    return `rgb(${this.r}, ${this.g}, ${this.b})`;
  }
}
var CONFIG = {
  scaleX: 10,
  scaleY: 10
};
var FPS = 180;
var TOTAL_FRAMES = 1000;
var DDT = 1000 / FPS;
var ANIMATION_DURATION = TOTAL_FRAMES * DDT;
var NUM_VERTICES = 1000;
var canvas = document.getElementById("box");
var ctx = canvas.getContext("2d");
var gridLevel = 3;

class Vec2 {
  x;
  y;
  constructor({ x, y }) {
    this.x = x;
    this.y = y;
  }
  normalized() {
    const half = boxSize() / 2;
    return {
      x: half * (1 + this.x / CONFIG.scaleX),
      y: half * (1 - this.y / CONFIG.scaleY)
    };
  }
  static fromCanvas({ x, y }) {
    const half = boxSize() / 2;
    return new Vec2({
      x: (x / half - 1) * CONFIG.scaleX,
      y: (1 - y / half) * CONFIG.scaleY
    });
  }
  add(other) {
    return new Vec2({ x: this.x + other.x, y: this.y + other.y });
  }
  lerp(other, t) {
    return new Vec2({
      x: lerp(this.x, other.x, t),
      y: lerp(this.y, other.y, t)
    });
  }
  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vec2({
      x: this.x * cos - this.y * sin,
      y: this.x * sin + this.y * cos
    });
  }
  draw(pointSize = 10, color = "#00FF00") {
    const { x, y } = this.normalized();
    ctx.fillStyle = color;
    ctx.fillRect(x - pointSize / 2, y - pointSize / 2, pointSize, pointSize);
  }
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

class Drawable {
  active = true;
  constructor() {
    if (this.constructor === Drawable) {
      throw new Error("Drawable is an abstract class and cannot be instantiated directly.");
    }
  }
}

class PropertyAnimation {
  start;
  target;
  duration;
  startTime;
  constructor(start, target, duration, startTime) {
    this.start = start;
    this.target = target;
    this.duration = duration;
    this.startTime = startTime;
  }
  value(now) {
    const elapsed = now - this.startTime;
    if (elapsed >= this.duration) {
      return this.target;
    }
    const t = elapsed / this.duration;
    if (this.start instanceof Vec2 && this.target instanceof Vec2) {
      return this.start.lerp(this.target, t);
    } else {
      return lerp(this.start, this.target, t);
    }
  }
  isFinished(now) {
    return now - this.startTime >= this.duration;
  }
}

class BaseShape extends Drawable {
  vertices;
  color;
  pointSize;
  closed;
  translation;
  scale;
  rotation;
  progress;
  animationStart;
  animations;
  constructor(vertices, pointSize = 2, closed = false, translation = { x: 0, y: 0 }, scale = { x: 1, y: 1 }, rotation = 0) {
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
      rotation: null
    };
  }
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
  draw() {
    if (!this.active)
      return;
    const getTransformed = (v) => {
      const scaled = new Vec2({ x: v.x * this.scale.x, y: v.y * this.scale.y });
      const rotated = scaled.rotate(this.rotation);
      return rotated.add(this.translation);
    };
    const colorStr = this.color.toString();
    for (let i = 0;i < this.progress - 1; i++) {
      const a = getTransformed(this.vertices[i]);
      const b = getTransformed(this.vertices[i + 1]);
      a.drawLineTo(b, this.pointSize, colorStr);
    }
    if (this.closed && this.progress === this.vertices.length) {
      const a = getTransformed(this.vertices[this.vertices.length - 1]);
      const b = getTransformed(this.vertices[0]);
      a.drawLineTo(b, this.pointSize, colorStr);
    }
  }
}

class FShape extends BaseShape {
  constructor(fun) {
    const vertices = [];
    for (let i = 0;i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const x = -CONFIG.scaleX + t * (2 * CONFIG.scaleX);
      const y = fun(x);
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, false);
  }
}

class CircleShape extends BaseShape {
  constructor(radius) {
    const vertices = [];
    for (let i = 0;i < NUM_VERTICES; i++) {
      const angle = i / NUM_VERTICES * 2 * Math.PI;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, true);
  }
}

class SquareShape extends BaseShape {
  constructor(sideLength) {
    const half = sideLength / 2;
    const perimeter = sideLength * 4;
    const vertices = [];
    for (let i = 0;i < NUM_VERTICES; i++) {
      const t = i / NUM_VERTICES;
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
    super(vertices, 2, true);
  }
}

class RegularPolygonShape extends BaseShape {
  constructor(radius, sides) {
    const corners = [];
    for (let i = 0;i < sides; i++) {
      const angle = i / sides * 2 * Math.PI;
      corners.push(new Vec2({
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
      }));
    }
    const vertices = [];
    for (let i = 0;i < NUM_VERTICES; i++) {
      const t = i / NUM_VERTICES;
      const edgeIndex = Math.floor(t * sides);
      const edgeT = t * sides - edgeIndex;
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
  constructor(start, end) {
    const vertices = [];
    for (let i = 0;i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const x = lerp(start.x, end.x, t);
      const y = lerp(start.y, end.y, t);
      vertices.push(new Vec2({ x, y }));
    }
    super(vertices, 2, false);
  }
}

class ParametricCurveShape extends BaseShape {
  constructor(fx, fy, tMin = 0, tMax = 1) {
    const vertices = [];
    for (let i = 0;i < NUM_VERTICES; i++) {
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
  constructor(outerRadius, innerRadius, points) {
    const vertices = [];
    for (let i = 0;i < NUM_VERTICES; i++) {
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
  constructor(maxRadius, turns) {
    const vertices = [];
    for (let i = 0;i < NUM_VERTICES; i++) {
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

class MorphShape extends Drawable {
  shapes;
  idx1;
  idx2;
  duration;
  pointSize;
  animationStart;
  constructor(shapesArray, idx1, idx2, duration = ANIMATION_DURATION) {
    super();
    this.shapes = shapesArray;
    this.idx1 = idx1;
    this.idx2 = idx2;
    this.duration = duration;
    this.pointSize = 2;
    this.animationStart = performance.now();
  }
  draw() {
    if (!this.active)
      return;
    const shape1 = this.shapes[this.idx1];
    const shape2 = this.shapes[this.idx2];
    if (!shape1 || !shape2)
      return;
    const now = performance.now();
    const elapsed = now - this.animationStart;
    const t = Math.min(elapsed / this.duration, 1);
    const trans = shape1.translation.lerp(shape2.translation, t);
    const scale = shape1.scale.lerp(shape2.scale, t);
    const rot = lerp(shape1.rotation, shape2.rotation, t);
    const color = shape1.color.lerp(shape2.color, t);
    const colorStr = color.toString();
    const count = shape1.vertices.length;
    const transformed = [];
    for (let i = 0;i < count; i++) {
      const v = shape1.vertices[i].lerp(shape2.vertices[i], t);
      const scaled = new Vec2({ x: v.x * scale.x, y: v.y * scale.y });
      const rotated = scaled.rotate(rot);
      transformed.push(rotated.add(trans));
    }
    for (let i = 0;i < count - 1; i++) {
      transformed[i].drawLineTo(transformed[i + 1], this.pointSize, colorStr);
    }
    if (shape2.closed) {
      transformed[count - 1].drawLineTo(transformed[0], this.pointSize, colorStr);
    }
    if (elapsed >= this.duration) {
      const target = this.shapes[this.idx2];
      if (target && target.progress === 0) {} else {
        this.active = false;
      }
    }
  }
}
function boxSize() {
  return Math.min(window.innerHeight, window.innerWidth);
}
function resize() {
  const s = boxSize();
  canvas.width = s;
  canvas.height = s;
}
window.addEventListener("resize", resize);
function drawText(vec2, text, fontSize = 14, color = "#00FFFF") {
  const { x, y } = vec2.normalized();
  ctx.fillStyle = color;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillText(text, x, y);
}
function drawLine(begin, end, width = 2, color = "#FFFFFF") {
  begin.drawLineTo(end, width, color);
}
function clearBackground() {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, boxSize(), boxSize());
}
function drawGrid() {
  if (!gridLevel)
    return;
  if (![1, 2, 3].includes(gridLevel)) {
    throw new Error(`gridLevel must be 1, 2, 3 or falsy (got ${gridLevel})`);
  }
  if (gridLevel >= 1) {
    drawLine(new Vec2({ x: -CONFIG.scaleX, y: 0 }), new Vec2({ x: CONFIG.scaleX, y: 0 }), 3);
    drawLine(new Vec2({ x: 0, y: -CONFIG.scaleY }), new Vec2({ x: 0, y: CONFIG.scaleY }), 3);
  }
  for (let i = -CONFIG.scaleY;i <= CONFIG.scaleY; i++) {
    drawText(new Vec2({ x: 0, y: i }), i.toString());
    if (gridLevel >= 2) {
      drawLine(new Vec2({ x: -CONFIG.scaleX, y: i }), new Vec2({ x: CONFIG.scaleX, y: i }), 1);
    }
    if (gridLevel === 3) {
      drawLine(new Vec2({ x: -CONFIG.scaleX, y: i + 0.5 }), new Vec2({ x: CONFIG.scaleX, y: i + 0.5 }), 0.3);
    }
  }
  for (let i = -CONFIG.scaleX;i <= CONFIG.scaleX; i++) {
    drawText(new Vec2({ x: i, y: 0 }), i.toString());
    if (gridLevel >= 2) {
      drawLine(new Vec2({ x: i, y: -CONFIG.scaleY }), new Vec2({ x: i, y: CONFIG.scaleY }), 1);
    }
    if (gridLevel === 3) {
      drawLine(new Vec2({ x: i + 0.5, y: -CONFIG.scaleY }), new Vec2({ x: i + 0.5, y: CONFIG.scaleY }), 0.3);
    }
  }
}

class ShapeRef {
  scene;
  index;
  constructor(scene, index) {
    this.scene = scene;
    this.index = index;
  }
  translate(x, y, duration = 0) {
    this.scene.translate(this.index, x, y, duration);
    return this;
  }
  scale(sx, sy = sx, duration = 0) {
    this.scene.scale(this.index, sx, sy, duration);
    return this;
  }
  rotate(angle, duration = 0) {
    this.scene.rotate(this.index, angle, duration);
    return this;
  }
  reveal() {
    this.scene.reveal(this.index);
    return this;
  }
  morph(otherRef, duration = ANIMATION_DURATION) {
    const morphIndex = this.scene.morph(this.index, otherRef.index, duration);
    return new ShapeRef(this.scene, morphIndex);
  }
  remove() {
    this.scene.remove(this.index);
  }
}

class Scene {
  shapes = [];
  mediaRecorder = null;
  recordedChunks = [];
  recordingStartTime = null;
  recordingDuration = null;
  recordingTimeout = null;
  F(fun) {
    const shape = new FShape(fun);
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }
  Circle(radius) {
    const shape = new CircleShape(radius);
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }
  Square(sideLength) {
    const shape = new SquareShape(sideLength);
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }
  RegularPolygon(radius, sides) {
    const shape = new RegularPolygonShape(radius, sides);
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }
  Line(startX, startY, endX, endY) {
    const shape = new LineShape({ x: startX, y: startY }, { x: endX, y: endY });
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }
  ParametricCurve(fx, fy, tMin = 0, tMax = 1) {
    const shape = new ParametricCurveShape(fx, fy, tMin, tMax);
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }
  Star(outerRadius, innerRadius, points = 5) {
    const shape = new StarShape(outerRadius, innerRadius, points);
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }
  Spiral(maxRadius, turns = 3) {
    const shape = new SpiralShape(maxRadius, turns);
    this.shapes.push(shape);
    return new ShapeRef(this, this.shapes.length - 1);
  }
  translate(idx, x, y, duration = 0) {
    const shape = this.shapes[idx];
    if (!shape)
      return;
    if (shape instanceof BaseShape) {
      if (duration > 0) {
        shape.animations.translation = new PropertyAnimation(shape.translation, new Vec2({ x, y }), duration, performance.now());
      } else {
        shape.translation = new Vec2({ x, y });
        shape.animations.translation = null;
      }
    }
  }
  scale(idx, sx, sy = sx, duration = 0) {
    const shape = this.shapes[idx];
    if (!shape)
      return;
    if (shape instanceof BaseShape) {
      if (duration > 0) {
        shape.animations.scale = new PropertyAnimation(shape.scale, new Vec2({ x: sx, y: sy }), duration, performance.now());
      } else {
        shape.scale = new Vec2({ x: sx, y: sy });
        shape.animations.scale = null;
      }
    }
  }
  rotate(idx, angle, duration = 0) {
    const shape = this.shapes[idx];
    if (!shape)
      return;
    if (shape instanceof BaseShape) {
      if (duration > 0) {
        shape.animations.rotation = new PropertyAnimation(shape.rotation, angle, duration, performance.now());
      } else {
        shape.rotation = angle;
        shape.animations.rotation = null;
      }
    }
  }
  morph(idx1, idx2, duration = ANIMATION_DURATION) {
    if (!this.shapes[idx1] || !this.shapes[idx2]) {
      throw new Error(`Invalid shape indices: ${idx1}, ${idx2}`);
    }
    const morph = new MorphShape(this.shapes, idx1, idx2, duration);
    this.shapes.push(morph);
    return this.shapes.length - 1;
  }
  reveal(idx) {
    const shape = this.shapes[idx];
    if (!shape) {
      throw new Error(`Shape with index ${idx} does not exist.`);
    }
    if (shape instanceof BaseShape) {
      shape.animationStart = performance.now();
      shape.progress = 0;
    }
  }
  remove(idx) {
    if (idx >= 0 && idx < this.shapes.length) {
      this.shapes[idx].active = false;
    }
  }
  startRecording(options = {}) {
    if (this.mediaRecorder) {
      console.warn("Recording already in progress.");
      return;
    }
    const fps = options.fps ?? 30;
    const mimeType = options.mimeType ?? "video/webm;codecs=vp9";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      console.warn(`MIME type ${mimeType} not supported, falling back to video/webm`);
    }
    const actualMimeType = MediaRecorder.isTypeSupported(mimeType) ? mimeType : "video/webm";
    const stream = canvas.captureStream(fps);
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: actualMimeType });
    this.recordedChunks = [];
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };
    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recording-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      this.mediaRecorder = null;
      this.recordedChunks = [];
      this.recordingStartTime = null;
      this.recordingDuration = null;
      if (this.recordingTimeout) {
        clearTimeout(this.recordingTimeout);
        this.recordingTimeout = null;
      }
    };
    this.mediaRecorder.start();
    this.recordingStartTime = performance.now();
    this.recordingDuration = options.duration ?? null;
    if (options.duration) {
      this.recordingTimeout = window.setTimeout(() => {
        this.stopRecording();
      }, options.duration * 1000);
    }
    console.log(`Recording started at ${fps} fps${options.duration ? ` for ${options.duration} seconds` : ""}`);
  }
  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
  }
  async wait(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
  update(now) {
    for (const shape of this.shapes) {
      if (shape instanceof BaseShape && shape.active) {
        if (shape.animationStart !== null) {
          const elapsed = now - shape.animationStart;
          const t = Math.min(elapsed, ANIMATION_DURATION);
          const targetProgress = Math.floor(t / ANIMATION_DURATION * shape.vertices.length);
          shape.progress = Math.min(targetProgress, shape.vertices.length);
          if (elapsed >= ANIMATION_DURATION) {
            shape.animationStart = null;
          }
        }
        shape.updateAnimations(now);
      }
    }
  }
  draw() {
    clearBackground();
    drawGrid();
    for (const shape of this.shapes) {
      if (shape.active) {
        shape.draw();
      }
    }
  }
  animate(now) {
    this.update(now);
    this.draw();
    if (this.mediaRecorder && this.recordingStartTime && this.recordingDuration) {
      const elapsed = (now - this.recordingStartTime) / 1000;
      if (elapsed >= this.recordingDuration) {
        this.stopRecording();
      }
    }
  }
}
var scene = new Scene;
function animate() {
  scene.animate(performance.now());
  requestAnimationFrame(animate);
}
function main() {
  gridLevel = 3;
  resize();
  requestAnimationFrame(animate);
}
main();
window.scene = scene;
