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
var offscreenCanvas = null;
var offscreenCtx = null;
var gridDirty = true;

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
  id;
  active = true;
  constructor(id) {
    this.id = id;
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
  revealDuration;
  cachedTransformed = null;
  dirtyTransform = true;
  constructor(id, vertices, pointSize = 2, closed = false, translation = { x: 0, y: 0 }, scale = { x: 1, y: 1 }, rotation = 0) {
    super(id);
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
    this.revealDuration = ANIMATION_DURATION;
  }
  setTranslation(t) {
    this.translation = t;
    this.dirtyTransform = true;
  }
  setScale(s) {
    this.scale = s;
    this.dirtyTransform = true;
  }
  setRotation(r) {
    this.rotation = r;
    this.dirtyTransform = true;
  }
  updateAnimations(now) {
    if (this.animations.translation) {
      const anim = this.animations.translation;
      if (anim.isFinished(now)) {
        this.setTranslation(anim.target);
        this.animations.translation = null;
      } else {
        this.setTranslation(anim.value(now));
      }
    }
    if (this.animations.scale) {
      const anim = this.animations.scale;
      if (anim.isFinished(now)) {
        this.setScale(anim.target);
        this.animations.scale = null;
      } else {
        this.setScale(anim.value(now));
      }
    }
    if (this.animations.rotation) {
      const anim = this.animations.rotation;
      if (anim.isFinished(now)) {
        this.setRotation(anim.target);
        this.animations.rotation = null;
      } else {
        this.setRotation(anim.value(now));
      }
    }
  }
  getTransformedPoints() {
    if (!this.dirtyTransform && this.cachedTransformed) {
      return this.cachedTransformed;
    }
    const transformed = [];
    const half = boxSize() / 2;
    for (const v of this.vertices) {
      const scaled = new Vec2({ x: v.x * this.scale.x, y: v.y * this.scale.y });
      const rotated = scaled.rotate(this.rotation);
      const world = rotated.add(this.translation);
      const screenX = half * (1 + world.x / CONFIG.scaleX);
      const screenY = half * (1 - world.y / CONFIG.scaleY);
      transformed.push({ x: screenX, y: screenY });
    }
    this.cachedTransformed = transformed;
    this.dirtyTransform = false;
    return transformed;
  }
  draw() {
    if (!this.active || this.progress === 0)
      return;
    const points = this.getTransformedPoints();
    const count = this.progress;
    const path = new Path2D;
    path.moveTo(points[0].x, points[0].y);
    for (let i = 1;i < count; i++) {
      path.lineTo(points[i].x, points[i].y);
    }
    if (this.closed && count === this.vertices.length) {
      path.lineTo(points[0].x, points[0].y);
    }
    ctx.strokeStyle = this.color.toString();
    ctx.lineWidth = this.pointSize;
    ctx.stroke(path);
  }
}

class FShape extends BaseShape {
  constructor(id, fun) {
    const vertices = [];
    for (let i = 0;i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const x = -CONFIG.scaleX + t * (2 * CONFIG.scaleX);
      const y = fun(x);
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}

class CircleShape extends BaseShape {
  constructor(id, radius) {
    const vertices = [];
    for (let i = 0;i < NUM_VERTICES; i++) {
      const angle = i / NUM_VERTICES * 2 * Math.PI;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, true);
  }
}

class SquareShape extends BaseShape {
  constructor(id, sideLength) {
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
    super(id, vertices, 2, true);
  }
}

class RegularPolygonShape extends BaseShape {
  constructor(id, radius, sides) {
    const corners = [];
    for (let i = 0;i < sides; i++) {
      const angle = i / sides * 2 * Math.PI;
      corners.push(new Vec2({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) }));
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
    super(id, vertices, 2, true);
  }
}

class LineShape extends BaseShape {
  constructor(id, start, end) {
    const vertices = [];
    for (let i = 0;i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const x = lerp(start.x, end.x, t);
      const y = lerp(start.y, end.y, t);
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}

class ParametricCurveShape extends BaseShape {
  constructor(id, fx, fy, tMin = 0, tMax = 1) {
    const vertices = [];
    for (let i = 0;i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const param = tMin + t * (tMax - tMin);
      const x = fx(param);
      const y = fy(param);
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}

class StarShape extends BaseShape {
  constructor(id, outerRadius, innerRadius, points) {
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
    super(id, vertices, 2, true);
  }
}

class SpiralShape extends BaseShape {
  constructor(id, maxRadius, turns) {
    const vertices = [];
    for (let i = 0;i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const radius = maxRadius * t;
      const angle = turns * 2 * Math.PI * t;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}
function resamplePolyline(vertices, closed, numPoints) {
  if (vertices.length === 0)
    return [];
  if (vertices.length === 1)
    return Array(numPoints).fill(vertices[0]);
  const dist = [0];
  for (let i = 1;i < vertices.length; i++) {
    const dx = vertices[i].x - vertices[i - 1].x;
    const dy = vertices[i].y - vertices[i - 1].y;
    dist.push(dist[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  if (closed) {
    let dx = vertices[0].x - vertices[vertices.length - 1].x;
    let dy = vertices[0].y - vertices[vertices.length - 1].y;
    const closingDist = Math.sqrt(dx * dx + dy * dy);
    const segments = [];
    let total = 0;
    for (let i = 0;i < vertices.length - 1; i++) {
      const dx2 = vertices[i + 1].x - vertices[i].x;
      const dy2 = vertices[i + 1].y - vertices[i].y;
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      segments.push({ start: vertices[i], end: vertices[i + 1], len: len2, cum: total + len2 });
      total += len2;
    }
    dx = vertices[0].x - vertices[vertices.length - 1].x;
    dy = vertices[0].y - vertices[vertices.length - 1].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segments.push({ start: vertices[vertices.length - 1], end: vertices[0], len, cum: total + len });
    total += len;
    const result = [];
    for (let i = 0;i < numPoints; i++) {
      const t = i / numPoints;
      const targetDist = t * total;
      let segIndex = 0;
      while (segIndex < segments.length && segments[segIndex].cum < targetDist)
        segIndex++;
      if (segIndex >= segments.length)
        segIndex = segments.length - 1;
      const seg = segments[segIndex];
      const prevCum = segIndex === 0 ? 0 : segments[segIndex - 1].cum;
      const segT = (targetDist - prevCum) / seg.len;
      const x = lerp(seg.start.x, seg.end.x, segT);
      const y = lerp(seg.start.y, seg.end.y, segT);
      result.push(new Vec2({ x, y }));
    }
    return result;
  } else {
    const total = dist[dist.length - 1];
    const result = [];
    for (let i = 0;i < numPoints; i++) {
      const t = i / (numPoints - 1);
      const targetDist = t * total;
      let segIndex = 1;
      while (segIndex < dist.length && dist[segIndex] < targetDist)
        segIndex++;
      if (segIndex >= dist.length)
        segIndex = dist.length - 1;
      const prevDist = dist[segIndex - 1];
      const segT = (targetDist - prevDist) / (dist[segIndex] - prevDist);
      const x = lerp(vertices[segIndex - 1].x, vertices[segIndex].x, segT);
      const y = lerp(vertices[segIndex - 1].y, vertices[segIndex].y, segT);
      result.push(new Vec2({ x, y }));
    }
    return result;
  }
}

class MorphShape extends Drawable {
  id1;
  id2;
  duration;
  pointSize;
  animationStart;
  resampled1 = null;
  resampled2 = null;
  scene;
  constructor(id, scene, id1, id2, duration = ANIMATION_DURATION) {
    super(id);
    this.scene = scene;
    this.id1 = id1;
    this.id2 = id2;
    this.duration = duration;
    this.pointSize = 2;
    this.animationStart = performance.now();
  }
  draw() {
    if (!this.active)
      return;
    const shape1 = this.scene.getShape(this.id1);
    const shape2 = this.scene.getShape(this.id2);
    if (!shape1 || !shape2 || !shape1.active || !shape2.active)
      return;
    const count = Math.max(shape1.vertices.length, shape2.vertices.length);
    if (!this.resampled1 || this.resampled1.length !== count) {
      this.resampled1 = resamplePolyline(shape1.vertices, shape1.closed, count);
    }
    if (!this.resampled2 || this.resampled2.length !== count) {
      this.resampled2 = resamplePolyline(shape2.vertices, shape2.closed, count);
    }
    const now = performance.now();
    const elapsed = now - this.animationStart;
    const t = Math.min(elapsed / this.duration, 1);
    const trans = shape1.translation.lerp(shape2.translation, t);
    const scale = shape1.scale.lerp(shape2.scale, t);
    const rot = lerp(shape1.rotation, shape2.rotation, t);
    const color = shape1.color.lerp(shape2.color, t);
    const colorStr = color.toString();
    const transformed = [];
    for (let i = 0;i < count; i++) {
      const v = this.resampled1[i].lerp(this.resampled2[i], t);
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
      this.active = false;
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
  gridDirty = true;
}
window.addEventListener("resize", resize);
function clearBackground() {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, boxSize(), boxSize());
}
function drawGrid() {
  if (!gridLevel)
    return;
  const size = boxSize();
  if (!offscreenCanvas || offscreenCanvas.width !== size || offscreenCanvas.height !== size) {
    offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = size;
    offscreenCanvas.height = size;
    offscreenCtx = offscreenCanvas.getContext("2d");
    gridDirty = true;
  }
  if (gridDirty) {
    if (!offscreenCtx)
      return;
    offscreenCtx.clearRect(0, 0, size, size);
    offscreenCtx.fillStyle = "#000000";
    offscreenCtx.fillRect(0, 0, size, size);
    const half2 = size / 2;
    const scaleX = CONFIG.scaleX;
    const scaleY = CONFIG.scaleY;
    const line = (x1, y1, x2, y2, width, color) => {
      offscreenCtx.strokeStyle = color;
      offscreenCtx.lineWidth = width;
      offscreenCtx.beginPath();
      offscreenCtx.moveTo(x1, y1);
      offscreenCtx.lineTo(x2, y2);
      offscreenCtx.stroke();
    };
    if (gridLevel >= 1) {
      line(0, half2, size, half2, 3, "#FFFFFF");
      line(half2, 0, half2, size, 3, "#FFFFFF");
    }
    for (let i = -scaleY;i <= scaleY; i++) {
      const yScreen = half2 * (1 - i / scaleY);
      if (gridLevel >= 2) {
        line(0, yScreen, size, yScreen, 1, "#FFFFFF");
      }
      if (gridLevel === 3) {
        const yHalf = half2 * (1 - (i + 0.5) / scaleY);
        line(0, yHalf, size, yHalf, 0.3, "#FFFFFF");
      }
    }
    for (let i = -scaleX;i <= scaleX; i++) {
      const xScreen = half2 * (1 + i / scaleX);
      if (gridLevel >= 2) {
        line(xScreen, 0, xScreen, size, 1, "#FFFFFF");
      }
      if (gridLevel === 3) {
        const xHalf = half2 * (1 + (i + 0.5) / scaleX);
        line(xHalf, 0, xHalf, size, 0.3, "#FFFFFF");
      }
    }
    gridDirty = false;
  }
  ctx.drawImage(offscreenCanvas, 0, 0);
  ctx.fillStyle = "#00FFFF";
  ctx.font = "14px sans-serif";
  const half = size / 2;
  for (let i = -CONFIG.scaleY;i <= CONFIG.scaleY; i++) {
    const yScreen = half * (1 - i / CONFIG.scaleY);
    ctx.fillText(i.toString(), 8, yScreen + 8);
  }
  for (let i = -CONFIG.scaleX;i <= CONFIG.scaleX; i++) {
    const xScreen = half * (1 + i / CONFIG.scaleX);
    ctx.fillText(i.toString(), xScreen + 8, 8);
  }
}

class ShapeRef {
  scene;
  id;
  constructor(scene, id) {
    this.scene = scene;
    this.id = id;
  }
  translate(x, y, duration = 0) {
    this.scene.translate(this.id, x, y, duration);
    return this;
  }
  scale(sx, sy = sx, duration = 0) {
    this.scene.scale(this.id, sx, sy, duration);
    return this;
  }
  rotate(angle, duration = 0) {
    this.scene.rotate(this.id, angle, duration);
    return this;
  }
  reveal(duration = ANIMATION_DURATION) {
    this.scene.reveal(this.id, duration);
    return this;
  }
  morph(otherRef, duration = ANIMATION_DURATION) {
    const morphId = this.scene.morph(this.id, otherRef.id, duration);
    return new ShapeRef(this.scene, morphId);
  }
  remove() {
    this.scene.remove(this.id);
  }
}

class Scene {
  shapes = new Map;
  nextId = 0;
  mediaRecorder = null;
  recordedChunks = [];
  recordingStartTime = null;
  recordingDuration = null;
  recordingTimeout = null;
  pauseStart = null;
  pauseDuration = null;
  totalPausedTime = 0;
  getShape(id) {
    return this.shapes.get(id);
  }
  F(fun) {
    const id = this.nextId++;
    const shape = new FShape(id, fun);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }
  Circle(radius) {
    const id = this.nextId++;
    const shape = new CircleShape(id, radius);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }
  Square(sideLength) {
    const id = this.nextId++;
    const shape = new SquareShape(id, sideLength);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }
  RegularPolygon(radius, sides) {
    const id = this.nextId++;
    const shape = new RegularPolygonShape(id, radius, sides);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }
  Line(startX, startY, endX, endY) {
    const id = this.nextId++;
    const shape = new LineShape(id, { x: startX, y: startY }, { x: endX, y: endY });
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }
  ParametricCurve(fx, fy, tMin = 0, tMax = 1) {
    const id = this.nextId++;
    const shape = new ParametricCurveShape(id, fx, fy, tMin, tMax);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }
  Star(outerRadius, innerRadius, points = 5) {
    const id = this.nextId++;
    const shape = new StarShape(id, outerRadius, innerRadius, points);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }
  Spiral(maxRadius, turns = 3) {
    const id = this.nextId++;
    const shape = new SpiralShape(id, maxRadius, turns);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }
  translate(id, x, y, duration = 0) {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape))
      return;
    if (duration > 0) {
      shape.animations.translation = new PropertyAnimation(shape.translation, new Vec2({ x, y }), duration, performance.now() - this.totalPausedTime);
    } else {
      shape.setTranslation(new Vec2({ x, y }));
      shape.animations.translation = null;
    }
  }
  scale(id, sx, sy = sx, duration = 0) {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape))
      return;
    if (duration > 0) {
      shape.animations.scale = new PropertyAnimation(shape.scale, new Vec2({ x: sx, y: sy }), duration, performance.now() - this.totalPausedTime);
    } else {
      shape.setScale(new Vec2({ x: sx, y: sy }));
      shape.animations.scale = null;
    }
  }
  rotate(id, angle, duration = 0) {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape))
      return;
    if (duration > 0) {
      shape.animations.rotation = new PropertyAnimation(shape.rotation, angle, duration, performance.now() - this.totalPausedTime);
    } else {
      shape.setRotation(angle);
      shape.animations.rotation = null;
    }
  }
  morph(id1, id2, duration = ANIMATION_DURATION) {
    if (!this.shapes.has(id1) || !this.shapes.has(id2)) {
      throw new Error(`Invalid shape IDs: ${id1}, ${id2}`);
    }
    const morphId = this.nextId++;
    const morph = new MorphShape(morphId, this, id1, id2, duration);
    morph.animationStart -= this.totalPausedTime;
    this.shapes.set(morphId, morph);
    return morphId;
  }
  reveal(id, duration = ANIMATION_DURATION) {
    const shape = this.shapes.get(id);
    if (!shape)
      throw new Error(`Shape with id ${id} does not exist.`);
    if (shape instanceof BaseShape) {
      shape.animationStart = performance.now() - this.totalPausedTime;
      shape.progress = 0;
      shape.revealDuration = duration;
    }
  }
  remove(id) {
    this.shapes.delete(id);
  }
  wait(ms) {
    this.pauseStart = performance.now();
    this.pauseDuration = ms;
    return this;
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
  update(now) {
    if (this.pauseStart !== null && this.pauseDuration !== null) {
      const elapsedPause = now - this.pauseStart;
      if (elapsedPause < this.pauseDuration) {
        return;
      } else {
        const actualPause = Math.min(elapsedPause, this.pauseDuration);
        this.totalPausedTime += actualPause;
        for (const shape of this.shapes.values()) {
          if (shape instanceof BaseShape) {
            if (shape.animationStart !== null) {
              shape.animationStart += actualPause;
            }
            if (shape.animations.translation) {
              shape.animations.translation.startTime += actualPause;
            }
            if (shape.animations.scale) {
              shape.animations.scale.startTime += actualPause;
            }
            if (shape.animations.rotation) {
              shape.animations.rotation.startTime += actualPause;
            }
          } else if (shape instanceof MorphShape) {
            shape.animationStart += actualPause;
          }
        }
        this.pauseStart = null;
        this.pauseDuration = null;
      }
    }
    const effectiveNow = now - this.totalPausedTime;
    for (const shape of this.shapes.values()) {
      if (shape instanceof BaseShape && shape.active) {
        if (shape.animationStart !== null) {
          const elapsed = effectiveNow - shape.animationStart;
          const t = Math.min(elapsed / shape.revealDuration, 1);
          const targetProgress = Math.floor(t * shape.vertices.length);
          shape.progress = Math.min(targetProgress, shape.vertices.length);
          if (elapsed >= shape.revealDuration) {
            shape.animationStart = null;
          }
        }
        shape.updateAnimations(effectiveNow);
      }
    }
  }
  draw() {
    clearBackground();
    drawGrid();
    for (const shape of this.shapes.values()) {
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
