// index.ts
var lerp = (a, b, t) => a + (b - a) * t;

class Color {
  r;
  g;
  b;
  a = 1;
  constructor(r, g, b, a = 1) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }
  lerp(other, t) {
    return new Color(lerp(this.r, other.r, t), lerp(this.g, other.g, t), lerp(this.b, other.b, t), lerp(this.a, other.a, t));
  }
  static random() {
    return new Color(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256));
  }
  toString() {
    return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`;
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
var _gridLevel = 3;
var gridDirty = true;
function setGridLevel(level) {
  if (level !== null) {
    if (typeof level !== "number" || level < 1 || level > 3) {
      console.warn("gridLevel must be 1, 2, 3, or null. Clamping to 1-3.");
      level = Math.min(3, Math.max(1, Math.floor(level)));
    }
  }
  _gridLevel = level;
  gridDirty = true;
}
Object.defineProperty(window, "gridLevel", {
  get: () => _gridLevel,
  set: (val) => setGridLevel(val)
});
var offscreenCanvas = null;
var offscreenCtx = null;

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
  update(_now) {}
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
    } else if (this.start instanceof Color && this.target instanceof Color) {
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
  strokeColor;
  fillColor;
  lineDash;
  lineCap;
  lineJoin;
  opacity;
  pointSize;
  closed;
  progress;
  animationStart;
  animations;
  revealDuration;
  vertexColors;
  usePerVertexColors = false;
  cachedTransformed = null;
  dirtyTransform = true;
  _translation;
  _scale;
  _rotation;
  constructor(id, vertices, pointSize = 2, closed = false, translation = { x: 0, y: 0 }, scale = { x: 1, y: 1 }, rotation = 0) {
    super(id);
    this.vertices = vertices;
    this.strokeColor = Color.random();
    this.fillColor = null;
    this.lineDash = [];
    this.lineCap = "butt";
    this.lineJoin = "miter";
    this.opacity = 1;
    this.pointSize = pointSize;
    this.closed = closed;
    this._translation = new Vec2(translation);
    this._scale = new Vec2(scale);
    this._rotation = rotation;
    this.progress = 0;
    this.animationStart = null;
    this.animations = {
      translation: null,
      scale: null,
      rotation: null,
      strokeColor: null,
      fillColor: null,
      opacity: null
    };
    this.revealDuration = ANIMATION_DURATION;
    this.vertexColors = null;
  }
  get translation() {
    return this._translation;
  }
  set translation(t) {
    this._translation = t;
    this.dirtyTransform = true;
  }
  get scale() {
    return this._scale;
  }
  set scale(s) {
    this._scale = s;
    this.dirtyTransform = true;
  }
  get rotation() {
    return this._rotation;
  }
  set rotation(r) {
    this._rotation = r;
    this.dirtyTransform = true;
  }
  get color() {
    return this.strokeColor;
  }
  set color(c) {
    this.strokeColor = c;
  }
  setVertexColors(colors) {
    if (colors && colors.length !== this.vertices.length) {
      throw new Error(`Vertex colors length (${colors.length}) must match vertices length (${this.vertices.length})`);
    }
    this.vertexColors = colors;
    this.usePerVertexColors = colors !== null;
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
    if (this.animations.strokeColor) {
      const anim = this.animations.strokeColor;
      if (anim.isFinished(now)) {
        this.strokeColor = anim.target;
        this.animations.strokeColor = null;
      } else {
        this.strokeColor = anim.value(now);
      }
    }
    if (this.animations.fillColor) {
      const anim = this.animations.fillColor;
      if (anim.isFinished(now)) {
        this.fillColor = anim.target;
        this.animations.fillColor = null;
      } else {
        this.fillColor = anim.value(now);
      }
    }
    if (this.animations.opacity) {
      const anim = this.animations.opacity;
      if (anim.isFinished(now)) {
        this.opacity = anim.target;
        this.animations.opacity = null;
      } else {
        this.opacity = anim.value(now);
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
    if (count === 1) {
      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = this.strokeColor.toString();
      ctx.fillRect(points[0].x - this.pointSize / 2, points[0].y - this.pointSize / 2, this.pointSize, this.pointSize);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.lineWidth = this.pointSize;
    ctx.setLineDash(this.lineDash);
    ctx.lineCap = this.lineCap;
    ctx.lineJoin = this.lineJoin;
    if (this.usePerVertexColors && this.vertexColors) {
      for (let i = 0;i < count - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        ctx.strokeStyle = this.vertexColors[i].toString();
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      if (this.closed && count === this.vertices.length) {
        const start = points[count - 1];
        const end = points[0];
        ctx.strokeStyle = this.vertexColors[count - 1].toString();
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    } else {
      const path = new Path2D;
      path.moveTo(points[0].x, points[0].y);
      for (let i = 1;i < count; i++) {
        path.lineTo(points[i].x, points[i].y);
      }
      if (this.closed && count === this.vertices.length) {
        path.lineTo(points[0].x, points[0].y);
      }
      if (this.fillColor) {
        ctx.fillStyle = this.fillColor.toString();
        ctx.fill(path);
      }
      ctx.strokeStyle = this.strokeColor.toString();
      ctx.stroke(path);
    }
    ctx.restore();
  }
  invalidateTransformCache() {
    this.dirtyTransform = true;
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

class QuadraticBezierShape extends BaseShape {
  constructor(id, p0, p1, p2) {
    const vertices = [];
    for (let i = 0;i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
      const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}

class CubicBezierShape extends BaseShape {
  constructor(id, p0, p1, p2, p3) {
    const vertices = [];
    for (let i = 0;i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const x = (1 - t) * (1 - t) * (1 - t) * p0.x + 3 * (1 - t) * (1 - t) * t * p1.x + 3 * (1 - t) * t * t * p2.x + t * t * t * p3.x;
      const y = (1 - t) * (1 - t) * (1 - t) * p0.y + 3 * (1 - t) * (1 - t) * t * p1.y + 3 * (1 - t) * t * t * p2.y + t * t * t * p3.y;
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}

class ArcShape extends BaseShape {
  constructor(id, center, radius, startAngle, endAngle, anticlockwise = false) {
    const vertices = [];
    const angleRange = anticlockwise ? startAngle - endAngle : endAngle - startAngle;
    for (let i = 0;i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const angle = startAngle + t * angleRange;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}

class EllipseShape extends BaseShape {
  constructor(id, center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise = false) {
    const vertices = [];
    const angleRange = anticlockwise ? startAngle - endAngle : endAngle - startAngle;
    for (let i = 0;i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const angle = startAngle + t * angleRange;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = center.x + radiusX * cos * Math.cos(rotation) - radiusY * sin * Math.sin(rotation);
      const y = center.y + radiusX * cos * Math.sin(rotation) + radiusY * sin * Math.cos(rotation);
      vertices.push(new Vec2({ x, y }));
    }
    super(id, vertices, 2, false);
  }
}

class TextShape extends Drawable {
  _text;
  _font;
  strokeColor;
  fillColor;
  opacity;
  lineWidth;
  lineDash;
  lineCap;
  lineJoin;
  _translation;
  _scale;
  _rotation;
  animations;
  constructor(id, text, font = "14px sans-serif", translation = { x: 0, y: 0 }, scale = { x: 1, y: 1 }, rotation = 0) {
    super(id);
    this._text = text;
    this._font = font;
    this.strokeColor = Color.random();
    this.fillColor = null;
    this.opacity = 1;
    this.lineWidth = 1;
    this.lineDash = [];
    this.lineCap = "butt";
    this.lineJoin = "miter";
    this._translation = new Vec2(translation);
    this._scale = new Vec2(scale);
    this._rotation = rotation;
    this.animations = {
      translation: null,
      scale: null,
      rotation: null,
      strokeColor: null,
      fillColor: null,
      opacity: null
    };
  }
  get text() {
    return this._text;
  }
  set text(t) {
    this._text = t;
  }
  get font() {
    return this._font;
  }
  set font(f) {
    this._font = f;
  }
  get translation() {
    return this._translation;
  }
  set translation(t) {
    this._translation = t;
  }
  get scale() {
    return this._scale;
  }
  set scale(s) {
    this._scale = s;
  }
  get rotation() {
    return this._rotation;
  }
  set rotation(r) {
    this._rotation = r;
  }
  update(now) {
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
    if (this.animations.strokeColor) {
      const anim = this.animations.strokeColor;
      if (anim.isFinished(now)) {
        this.strokeColor = anim.target;
        this.animations.strokeColor = null;
      } else {
        this.strokeColor = anim.value(now);
      }
    }
    if (this.animations.fillColor) {
      const anim = this.animations.fillColor;
      if (anim.isFinished(now)) {
        this.fillColor = anim.target;
        this.animations.fillColor = null;
      } else {
        this.fillColor = anim.value(now);
      }
    }
    if (this.animations.opacity) {
      const anim = this.animations.opacity;
      if (anim.isFinished(now)) {
        this.opacity = anim.target;
        this.animations.opacity = null;
      } else {
        this.opacity = anim.value(now);
      }
    }
  }
  draw() {
    if (!this.active)
      return;
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.font = this._font;
    ctx.lineWidth = this.lineWidth;
    ctx.setLineDash(this.lineDash);
    ctx.lineCap = this.lineCap;
    ctx.lineJoin = this.lineJoin;
    const half = boxSize() / 2;
    const screenPos = this.translation.normalized();
    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(this.rotation);
    ctx.scale(this.scale.x, this.scale.y);
    if (this.fillColor) {
      ctx.fillStyle = this.fillColor.toString();
      ctx.fillText(this._text, 0, 0);
    }
    if (this.strokeColor) {
      ctx.strokeStyle = this.strokeColor.toString();
      ctx.strokeText(this._text, 0, 0);
    }
    ctx.restore();
  }
}

class ImageShape extends Drawable {
  _image;
  strokeColor;
  fillColor;
  opacity;
  lineWidth;
  _translation;
  _scale;
  _rotation;
  animations;
  constructor(id, image, translation = { x: 0, y: 0 }, scale = { x: 1, y: 1 }, rotation = 0) {
    super(id);
    this._image = image;
    this.opacity = 1;
    this._translation = new Vec2(translation);
    this._scale = new Vec2(scale);
    this._rotation = rotation;
    this.animations = {
      translation: null,
      scale: null,
      rotation: null,
      opacity: null
    };
  }
  get image() {
    return this._image;
  }
  set image(img) {
    this._image = img;
  }
  get translation() {
    return this._translation;
  }
  set translation(t) {
    this._translation = t;
  }
  get scale() {
    return this._scale;
  }
  set scale(s) {
    this._scale = s;
  }
  get rotation() {
    return this._rotation;
  }
  set rotation(r) {
    this._rotation = r;
  }
  update(now) {
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
    if (this.animations.opacity) {
      const anim = this.animations.opacity;
      if (anim.isFinished(now)) {
        this.opacity = anim.target;
        this.animations.opacity = null;
      } else {
        this.opacity = anim.value(now);
      }
    }
  }
  draw() {
    if (!this.active)
      return;
    ctx.save();
    ctx.globalAlpha = this.opacity;
    const half = boxSize() / 2;
    const screenPos = this.translation.normalized();
    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(this.rotation);
    ctx.scale(this.scale.x, this.scale.y);
    ctx.drawImage(this._image, -this._image.width / 2, -this._image.height / 2);
    ctx.restore();
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
    const dx = vertices[0].x - vertices[vertices.length - 1].x;
    const dy = vertices[0].y - vertices[vertices.length - 1].y;
    const closingLen = Math.sqrt(dx * dx + dy * dy);
    const total = dist[dist.length - 1] + closingLen;
    const segments = [];
    for (let i = 0;i < vertices.length - 1; i++) {
      const len = dist[i + 1] - dist[i];
      segments.push({ start: vertices[i], end: vertices[i + 1], len, cum: dist[i + 1] });
    }
    segments.push({
      start: vertices[vertices.length - 1],
      end: vertices[0],
      len: closingLen,
      cum: total
    });
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
    if (result.length > 0) {
      result[result.length - 1] = new Vec2({ x: result[0].x, y: result[0].y });
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
  scene;
  constructor(id, scene, id1, id2, duration = ANIMATION_DURATION) {
    super(id);
    this.scene = scene;
    this.id1 = id1;
    this.id2 = id2;
    this.duration = duration;
    this.pointSize = 2;
    this.animationStart = scene.currentEffectiveTime();
  }
  update(now) {
    const shape1 = this.scene.getShape(this.id1);
    const shape2 = this.scene.getShape(this.id2);
    if (!shape1?.active || !shape2?.active) {
      this.scene.markForRemoval(this.id);
      return;
    }
    if (now - this.animationStart >= this.duration) {
      this.scene.markForRemoval(this.id);
    }
  }
  draw() {
    if (!this.active)
      return;
    const shape1 = this.scene.getShape(this.id1);
    const shape2 = this.scene.getShape(this.id2);
    if (!shape1?.active || !shape2?.active)
      return;
    if (!(shape1 instanceof BaseShape) || !(shape2 instanceof BaseShape)) {
      console.warn("MorphShape only supports BaseShape sources.");
      return;
    }
    const count = Math.max(shape1.vertices.length, shape2.vertices.length);
    const resampled1 = resamplePolyline(shape1.vertices, shape1.closed, count);
    const resampled2 = resamplePolyline(shape2.vertices, shape2.closed, count);
    const now = this.scene.currentEffectiveTime();
    const elapsed = now - this.animationStart;
    let t = 1;
    if (this.duration > 0) {
      t = Math.min(elapsed / this.duration, 1);
    }
    const trans = shape1.translation.lerp(shape2.translation, t);
    const scale = shape1.scale.lerp(shape2.scale, t);
    const rot = lerp(shape1.rotation, shape2.rotation, t);
    const strokeColor = shape1.strokeColor.lerp(shape2.strokeColor, t);
    const fillColor = shape1.fillColor && shape2.fillColor ? shape1.fillColor.lerp(shape2.fillColor, t) : shape1.fillColor || shape2.fillColor;
    const opacity = lerp(shape1.opacity, shape2.opacity, t);
    const transformed = [];
    for (let i = 0;i < count; i++) {
      const v = resampled1[i].lerp(resampled2[i], t);
      const scaled = new Vec2({ x: v.x * scale.x, y: v.y * scale.y });
      const rotated = scaled.rotate(rot);
      transformed.push(rotated.add(trans));
    }
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.lineWidth = this.pointSize;
    ctx.strokeStyle = strokeColor.toString();
    if (fillColor)
      ctx.fillStyle = fillColor.toString();
    const path = new Path2D;
    path.moveTo(transformed[0].x, transformed[0].y);
    for (let i = 1;i < count; i++) {
      path.lineTo(transformed[i].x, transformed[i].y);
    }
    if (shape2.closed) {
      path.lineTo(transformed[0].x, transformed[0].y);
    }
    if (fillColor)
      ctx.fill(path);
    ctx.stroke(path);
    ctx.restore();
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
  if (window.scene && typeof window.scene.invalidateAllTransforms === "function") {
    window.scene.invalidateAllTransforms();
  }
}
window.addEventListener("resize", resize);
function clearBackground() {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, boxSize(), boxSize());
}
function drawGrid() {
  if (!_gridLevel)
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
    if (_gridLevel >= 1) {
      line(0, half2, size, half2, 3, "#FFFFFF");
      line(half2, 0, half2, size, 3, "#FFFFFF");
    }
    for (let i = -scaleY;i <= scaleY; i++) {
      const yScreen = half2 * (1 - i / scaleY);
      if (_gridLevel >= 2) {
        line(0, yScreen, size, yScreen, 1, "#FFFFFF");
      }
      if (_gridLevel === 3) {
        const yHalf = half2 * (1 - (i + 0.5) / scaleY);
        line(0, yHalf, size, yHalf, 0.3, "#FFFFFF");
      }
    }
    for (let i = -scaleX;i <= scaleX; i++) {
      const xScreen = half2 * (1 + i / scaleX);
      if (_gridLevel >= 2) {
        line(xScreen, 0, xScreen, size, 1, "#FFFFFF");
      }
      if (_gridLevel === 3) {
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
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = -CONFIG.scaleY;i <= CONFIG.scaleY; i++) {
    const yScreen = half * (1 - i / CONFIG.scaleY);
    ctx.fillText(i.toString(), half - 8, yScreen);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = -CONFIG.scaleX;i <= CONFIG.scaleX; i++) {
    const xScreen = half * (1 + i / CONFIG.scaleX);
    ctx.fillText(i.toString(), xScreen, half + 8);
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
  stroke(color, duration = 0) {
    const col = typeof color === "string" ? parseColor(color) : color;
    this.scene.strokeColor(this.id, col, duration);
    return this;
  }
  fill(color, duration = 0) {
    if (color === null) {
      this.scene.fillColor(this.id, null, duration);
    } else {
      const col = typeof color === "string" ? parseColor(color) : color;
      this.scene.fillColor(this.id, col, duration);
    }
    return this;
  }
  opacity(value, duration = 0) {
    this.scene.opacity(this.id, value, duration);
    return this;
  }
  lineDash(dashArray, _duration = 0) {
    this.scene.lineDash(this.id, dashArray);
    return this;
  }
  lineCap(cap, _duration = 0) {
    this.scene.lineCap(this.id, cap);
    return this;
  }
  lineJoin(join, _duration = 0) {
    this.scene.lineJoin(this.id, join);
    return this;
  }
  vertexColors(colors, _duration = 0) {
    if (colors === null) {
      this.scene.vertexColors(this.id, null);
    } else {
      const cols = colors.map((c) => typeof c === "string" ? parseColor(c) : c);
      this.scene.vertexColors(this.id, cols);
    }
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
  font(fontString) {
    this.scene.font(this.id, fontString);
    return this;
  }
}
function parseColor(str) {
  str = str.trim().toLowerCase();
  if (str.startsWith("#")) {
    const hex = str.slice(1);
    let r, g, b, a = 1;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 4) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
      a = parseInt(hex[3] + hex[3], 16) / 255;
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      a = parseInt(hex.slice(6, 8), 16) / 255;
    } else {
      throw new Error(`Invalid hex color: ${str}`);
    }
    return new Color(r, g, b, a);
  }
  const rgbMatch = str.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    return new Color(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]));
  }
  const rgbaMatch = str.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/);
  if (rgbaMatch) {
    return new Color(parseInt(rgbaMatch[1]), parseInt(rgbaMatch[2]), parseInt(rgbaMatch[3]), parseFloat(rgbaMatch[4]));
  }
  throw new Error(`Unsupported color string: ${str}`);
}

class Scene {
  shapes = new Map;
  nextId = 0;
  removalSet = new Set;
  pauseStartReal = null;
  pauseDuration = null;
  effectiveTimeAtPauseStart = null;
  totalPausedTime = 0;
  mediaRecorder = null;
  recordedChunks = [];
  recordingStartTime = null;
  recordingDuration = null;
  recordingTimeout = null;
  getShape(id) {
    return this.shapes.get(id);
  }
  currentEffectiveTime() {
    const now = performance.now();
    if (this.pauseStartReal !== null) {
      return this.effectiveTimeAtPauseStart;
    } else {
      return now - this.totalPausedTime;
    }
  }
  invalidateAllTransforms() {
    for (const shape of this.shapes.values()) {
      if (shape instanceof BaseShape) {
        shape.invalidateTransformCache();
      }
    }
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
  QuadraticBezier(p0, p1, p2) {
    const id = this.nextId++;
    const shape = new QuadraticBezierShape(id, p0, p1, p2);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }
  CubicBezier(p0, p1, p2, p3) {
    const id = this.nextId++;
    const shape = new CubicBezierShape(id, p0, p1, p2, p3);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }
  Arc(center, radius, startAngle, endAngle, anticlockwise = false) {
    const id = this.nextId++;
    const shape = new ArcShape(id, center, radius, startAngle, endAngle, anticlockwise);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }
  Ellipse(center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise = false) {
    const id = this.nextId++;
    const shape = new EllipseShape(id, center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }
  Text(text, font = "14px sans-serif", translation = { x: 0, y: 0 }) {
    const id = this.nextId++;
    const shape = new TextShape(id, text, font, translation);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }
  Image(image, translation = { x: 0, y: 0 }) {
    const id = this.nextId++;
    const shape = new ImageShape(id, image, translation);
    this.shapes.set(id, shape);
    return new ShapeRef(this, id);
  }
  translate(id, x, y, duration = 0) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    const effectiveNow = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      if (duration > 0) {
        shape.animations.translation = new PropertyAnimation(shape.translation, new Vec2({ x, y }), duration, effectiveNow);
      } else {
        shape.translation = new Vec2({ x, y });
        shape.animations.translation = null;
      }
    }
  }
  scale(id, sx, sy = sx, duration = 0) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    const effectiveNow = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      if (duration > 0) {
        shape.animations.scale = new PropertyAnimation(shape.scale, new Vec2({ x: sx, y: sy }), duration, effectiveNow);
      } else {
        shape.scale = new Vec2({ x: sx, y: sy });
        shape.animations.scale = null;
      }
    }
  }
  rotate(id, angle, duration = 0) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    const effectiveNow = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      if (duration > 0) {
        shape.animations.rotation = new PropertyAnimation(shape.rotation, angle, duration, effectiveNow);
      } else {
        shape.rotation = angle;
        shape.animations.rotation = null;
      }
    }
  }
  strokeColor(id, color, duration = 0) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    const effectiveNow = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      if (duration > 0) {
        shape.animations.strokeColor = new PropertyAnimation(shape.strokeColor, color, duration, effectiveNow);
      } else {
        shape.strokeColor = color;
        shape.animations.strokeColor = null;
      }
    }
  }
  fillColor(id, color, duration = 0) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    const effectiveNow = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      if (duration > 0 && color !== null) {
        shape.animations.fillColor = new PropertyAnimation(shape.fillColor || new Color(0, 0, 0, 0), color, duration, effectiveNow);
      } else {
        shape.fillColor = color;
        shape.animations.fillColor = null;
      }
    }
  }
  opacity(id, value, duration = 0) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    const effectiveNow = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      if (duration > 0) {
        shape.animations.opacity = new PropertyAnimation(shape.opacity, value, duration, effectiveNow);
      } else {
        shape.opacity = value;
        shape.animations.opacity = null;
      }
    }
  }
  lineDash(id, dashArray) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      shape.lineDash = dashArray;
    }
  }
  lineCap(id, cap) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      shape.lineCap = cap;
    }
  }
  lineJoin(id, join) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      shape.lineJoin = join;
    }
  }
  vertexColors(id, colors) {
    const shape = this.shapes.get(id);
    if (!shape || !(shape instanceof BaseShape))
      return;
    shape.setVertexColors(colors);
  }
  font(id, fontString) {
    const shape = this.shapes.get(id);
    if (shape instanceof TextShape) {
      shape.font = fontString;
    }
  }
  morph(id1, id2, duration = ANIMATION_DURATION) {
    if (!this.shapes.has(id1) || !this.shapes.has(id2)) {
      throw new Error(`Invalid shape IDs: ${id1}, ${id2}`);
    }
    const morphId = this.nextId++;
    const morph = new MorphShape(morphId, this, id1, id2, duration);
    this.shapes.set(morphId, morph);
    return morphId;
  }
  reveal(id, duration = ANIMATION_DURATION) {
    const shape = this.shapes.get(id);
    if (!shape)
      throw new Error(`Shape with id ${id} does not exist.`);
    if (shape instanceof BaseShape) {
      shape.animationStart = this.currentEffectiveTime();
      shape.progress = 0;
      shape.revealDuration = duration;
    }
  }
  remove(id) {
    this.removalSet.add(id);
  }
  markForRemoval(id) {
    this.removalSet.add(id);
  }
  wait(seconds) {
    const now = performance.now();
    if (this.pauseStartReal !== null) {
      const elapsed = now - this.pauseStartReal;
      const actual = Math.min(elapsed, this.pauseDuration);
      this.totalPausedTime += actual;
      this.pauseStartReal = null;
      this.pauseDuration = null;
      this.effectiveTimeAtPauseStart = null;
    }
    this.pauseStartReal = now;
    this.pauseDuration = seconds * 1000;
    this.effectiveTimeAtPauseStart = now - this.totalPausedTime;
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
    if (this.pauseStartReal !== null) {
      const elapsedPause = now - this.pauseStartReal;
      if (elapsedPause < this.pauseDuration) {
        return;
      } else {
        const actualPause = Math.min(elapsedPause, this.pauseDuration);
        this.totalPausedTime += actualPause;
        this.pauseStartReal = null;
        this.pauseDuration = null;
        this.effectiveTimeAtPauseStart = null;
      }
    }
    const effectiveNow = now - this.totalPausedTime;
    for (const shape of this.shapes.values()) {
      shape.update(effectiveNow);
    }
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
    for (const id of this.removalSet) {
      this.shapes.delete(id);
    }
    this.removalSet.clear();
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
window.scene = scene;
function animate() {
  scene.animate(performance.now());
  requestAnimationFrame(animate);
}
function main() {
  setGridLevel(3);
  resize();
  requestAnimationFrame(animate);
}
main();
