// index.ts
var lerp = (a, b, t) => a + (b - a) * t;
var EASINGS = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => --t * t * t + 1,
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - --t * t * t * t,
  easeInOutQuart: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t,
  easeInSine: (t) => 1 - Math.cos(t * Math.PI / 2),
  easeOutSine: (t) => Math.sin(t * Math.PI / 2),
  easeInOutSine: (t) => (1 - Math.cos(Math.PI * t)) / 2,
  easeInElastic: (t) => {
    if (t === 0)
      return 0;
    if (t === 1)
      return 1;
    return -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI);
  },
  easeOutElastic: (t) => {
    if (t === 0)
      return 0;
    if (t === 1)
      return 1;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1;
  },
  easeInOutElastic: (t) => {
    if (t === 0)
      return 0;
    if (t === 1)
      return 1;
    if ((t *= 2) < 1)
      return -0.5 * Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI);
    return 0.5 * Math.pow(2, -10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI) + 1;
  },
  easeInBounce: (t) => 1 - EASINGS.easeOutBounce(1 - t),
  easeOutBounce: (t) => {
    if (t < 1 / 2.75)
      return 7.5625 * t * t;
    if (t < 2 / 2.75)
      return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75)
      return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  },
  easeInOutBounce: (t) => t < 0.5 ? (1 - EASINGS.easeOutBounce(1 - 2 * t)) / 2 : (1 + EASINGS.easeOutBounce(2 * t - 1)) / 2
};

class KeyframeAnimation {
  keyframes;
  duration;
  startTime;
  _finished = false;
  constructor(keyframes, duration, startTime) {
    this.keyframes = [...keyframes].sort((a, b) => a.time - b.time);
    if (this.keyframes.length === 0)
      throw new Error("Keyframes cannot be empty");
    if (this.keyframes[0].time !== 0) {
      this.keyframes.unshift({ time: 0, value: this.keyframes[0].value });
    }
    if (this.keyframes[this.keyframes.length - 1].time !== 1) {
      this.keyframes.push({ time: 1, value: this.keyframes[this.keyframes.length - 1].value });
    }
    this.duration = duration;
    this.startTime = startTime;
  }
  isFinished(now) {
    return now - this.startTime >= this.duration;
  }
  sample(now) {
    const elapsed = now - this.startTime;
    if (elapsed >= this.duration) {
      this._finished = true;
      return this.keyframes[this.keyframes.length - 1].value;
    }
    const progress = elapsed / this.duration;
    let i = 0;
    while (i < this.keyframes.length - 1 && this.keyframes[i + 1].time < progress) {
      i++;
    }
    const from = this.keyframes[i];
    const to = this.keyframes[i + 1];
    const segmentT = (progress - from.time) / (to.time - from.time);
    let easedT = segmentT;
    if (to.easing) {
      const easingFn = typeof to.easing === "string" ? EASINGS[to.easing] : to.easing;
      if (easingFn)
        easedT = easingFn(segmentT);
    }
    if (from.value instanceof Vec2 && to.value instanceof Vec2) {
      return from.value.lerp(to.value, easedT);
    } else if (from.value instanceof Color && to.value instanceof Color) {
      return from.value.lerp(to.value, easedT);
    } else {
      return lerp(from.value, to.value, easedT);
    }
  }
  get finished() {
    return this._finished;
  }
}

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
var NUM_VERTICES = 400;
var DDT = 1000 / FPS;
var ANIMATION_DURATION = NUM_VERTICES * DDT;
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
  revealDuration;
  vertexColors;
  usePerVertexColors = false;
  cachedTransformed = null;
  dirtyTransform = true;
  _translation;
  _scale;
  _rotation;
  keyframes = {
    translation: null,
    scale: null,
    rotation: null,
    strokeColor: null,
    fillColor: null,
    opacity: null
  };
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
  setTranslationKeyframes(keyframes, duration, startTime) {
    this.keyframes.translation = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setScaleKeyframes(keyframes, duration, startTime) {
    this.keyframes.scale = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setRotationKeyframes(keyframes, duration, startTime) {
    this.keyframes.rotation = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setStrokeColorKeyframes(keyframes, duration, startTime) {
    this.keyframes.strokeColor = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setFillColorKeyframes(keyframes, duration, startTime) {
    this.keyframes.fillColor = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setOpacityKeyframes(keyframes, duration, startTime) {
    this.keyframes.opacity = new KeyframeAnimation(keyframes, duration, startTime);
  }
  updateAnimations(now) {
    if (this.keyframes.translation) {
      if (this.keyframes.translation.isFinished(now)) {
        this.translation = this.keyframes.translation.sample(now);
        this.keyframes.translation = null;
      } else {
        this.translation = this.keyframes.translation.sample(now);
      }
    }
    if (this.keyframes.scale) {
      if (this.keyframes.scale.isFinished(now)) {
        this.scale = this.keyframes.scale.sample(now);
        this.keyframes.scale = null;
      } else {
        this.scale = this.keyframes.scale.sample(now);
      }
    }
    if (this.keyframes.rotation) {
      if (this.keyframes.rotation.isFinished(now)) {
        this.rotation = this.keyframes.rotation.sample(now);
        this.keyframes.rotation = null;
      } else {
        this.rotation = this.keyframes.rotation.sample(now);
      }
    }
    if (this.keyframes.strokeColor) {
      if (this.keyframes.strokeColor.isFinished(now)) {
        this.strokeColor = this.keyframes.strokeColor.sample(now);
        this.keyframes.strokeColor = null;
      } else {
        this.strokeColor = this.keyframes.strokeColor.sample(now);
      }
    }
    if (this.keyframes.fillColor) {
      if (this.keyframes.fillColor.isFinished(now)) {
        this.fillColor = this.keyframes.fillColor.sample(now);
        this.keyframes.fillColor = null;
      } else {
        this.fillColor = this.keyframes.fillColor.sample(now);
      }
    }
    if (this.keyframes.opacity) {
      if (this.keyframes.opacity.isFinished(now)) {
        this.opacity = this.keyframes.opacity.sample(now);
        this.keyframes.opacity = null;
      } else {
        this.opacity = this.keyframes.opacity.sample(now);
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
  keyframes = {
    translation: null,
    scale: null,
    rotation: null,
    strokeColor: null,
    fillColor: null,
    opacity: null
  };
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
  setTranslationKeyframes(keyframes, duration, startTime) {
    this.keyframes.translation = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setScaleKeyframes(keyframes, duration, startTime) {
    this.keyframes.scale = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setRotationKeyframes(keyframes, duration, startTime) {
    this.keyframes.rotation = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setStrokeColorKeyframes(keyframes, duration, startTime) {
    this.keyframes.strokeColor = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setFillColorKeyframes(keyframes, duration, startTime) {
    this.keyframes.fillColor = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setOpacityKeyframes(keyframes, duration, startTime) {
    this.keyframes.opacity = new KeyframeAnimation(keyframes, duration, startTime);
  }
  update(now) {
    if (this.keyframes.translation) {
      if (this.keyframes.translation.isFinished(now)) {
        this.translation = this.keyframes.translation.sample(now);
        this.keyframes.translation = null;
      } else {
        this.translation = this.keyframes.translation.sample(now);
      }
    }
    if (this.keyframes.scale) {
      if (this.keyframes.scale.isFinished(now)) {
        this.scale = this.keyframes.scale.sample(now);
        this.keyframes.scale = null;
      } else {
        this.scale = this.keyframes.scale.sample(now);
      }
    }
    if (this.keyframes.rotation) {
      if (this.keyframes.rotation.isFinished(now)) {
        this.rotation = this.keyframes.rotation.sample(now);
        this.keyframes.rotation = null;
      } else {
        this.rotation = this.keyframes.rotation.sample(now);
      }
    }
    if (this.keyframes.strokeColor) {
      if (this.keyframes.strokeColor.isFinished(now)) {
        this.strokeColor = this.keyframes.strokeColor.sample(now);
        this.keyframes.strokeColor = null;
      } else {
        this.strokeColor = this.keyframes.strokeColor.sample(now);
      }
    }
    if (this.keyframes.fillColor) {
      if (this.keyframes.fillColor.isFinished(now)) {
        this.fillColor = this.keyframes.fillColor.sample(now);
        this.keyframes.fillColor = null;
      } else {
        this.fillColor = this.keyframes.fillColor.sample(now);
      }
    }
    if (this.keyframes.opacity) {
      if (this.keyframes.opacity.isFinished(now)) {
        this.opacity = this.keyframes.opacity.sample(now);
        this.keyframes.opacity = null;
      } else {
        this.opacity = this.keyframes.opacity.sample(now);
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
  opacity;
  _translation;
  _scale;
  _rotation;
  keyframes = {
    translation: null,
    scale: null,
    rotation: null,
    opacity: null
  };
  constructor(id, image, translation = { x: 0, y: 0 }, scale = { x: 1, y: 1 }, rotation = 0) {
    super(id);
    this._image = image;
    this.opacity = 1;
    this._translation = new Vec2(translation);
    this._scale = new Vec2(scale);
    this._rotation = rotation;
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
  setTranslationKeyframes(keyframes, duration, startTime) {
    this.keyframes.translation = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setScaleKeyframes(keyframes, duration, startTime) {
    this.keyframes.scale = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setRotationKeyframes(keyframes, duration, startTime) {
    this.keyframes.rotation = new KeyframeAnimation(keyframes, duration, startTime);
  }
  setOpacityKeyframes(keyframes, duration, startTime) {
    this.keyframes.opacity = new KeyframeAnimation(keyframes, duration, startTime);
  }
  update(now) {
    if (this.keyframes.translation) {
      if (this.keyframes.translation.isFinished(now)) {
        this.translation = this.keyframes.translation.sample(now);
        this.keyframes.translation = null;
      } else {
        this.translation = this.keyframes.translation.sample(now);
      }
    }
    if (this.keyframes.scale) {
      if (this.keyframes.scale.isFinished(now)) {
        this.scale = this.keyframes.scale.sample(now);
        this.keyframes.scale = null;
      } else {
        this.scale = this.keyframes.scale.sample(now);
      }
    }
    if (this.keyframes.rotation) {
      if (this.keyframes.rotation.isFinished(now)) {
        this.rotation = this.keyframes.rotation.sample(now);
        this.keyframes.rotation = null;
      } else {
        this.rotation = this.keyframes.rotation.sample(now);
      }
    }
    if (this.keyframes.opacity) {
      if (this.keyframes.opacity.isFinished(now)) {
        this.opacity = this.keyframes.opacity.sample(now);
        this.keyframes.opacity = null;
      } else {
        this.opacity = this.keyframes.opacity.sample(now);
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
    const worldPoints = [];
    for (let i = 0;i < count; i++) {
      const v = resampled1[i].lerp(resampled2[i], t);
      const scaled = new Vec2({ x: v.x * scale.x, y: v.y * scale.y });
      const rotated = scaled.rotate(rot);
      worldPoints.push(rotated.add(trans));
    }
    const half = boxSize() / 2;
    const screenPoints = worldPoints.map((p) => ({
      x: half * (1 + p.x / CONFIG.scaleX),
      y: half * (1 - p.y / CONFIG.scaleY)
    }));
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.lineWidth = this.pointSize;
    ctx.strokeStyle = strokeColor.toString();
    if (fillColor)
      ctx.fillStyle = fillColor.toString();
    const path = new Path2D;
    path.moveTo(screenPoints[0].x, screenPoints[0].y);
    for (let i = 1;i < screenPoints.length; i++) {
      path.lineTo(screenPoints[i].x, screenPoints[i].y);
    }
    if (shape2.closed) {
      path.lineTo(screenPoints[0].x, screenPoints[0].y);
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
  if (scene && typeof scene.invalidateAllTransforms === "function") {
    scene.invalidateAllTransforms();
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

class ShapeRef {
  scene;
  id;
  constructor(scene, id) {
    this.scene = scene;
    this.id = id;
  }
  translate(x, y, duration = 0, easing = "linear") {
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        const current = shape.translation;
        const keyframes = [
          { time: 0, value: current },
          { time: 1, value: new Vec2({ x, y }), easing }
        ];
        this.scene.translateKeyframes(this.id, keyframes, duration);
      }
    } else {
      this.scene.translate(this.id, x, y, 0);
    }
    return this;
  }
  scale(sx, sy = sx, duration = 0, easing = "linear") {
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        const current = shape.scale;
        const keyframes = [
          { time: 0, value: current },
          { time: 1, value: new Vec2({ x: sx, y: sy }), easing }
        ];
        this.scene.scaleKeyframes(this.id, keyframes, duration);
      }
    } else {
      this.scene.scale(this.id, sx, sy, 0);
    }
    return this;
  }
  rotate(angle, duration = 0, easing = "linear") {
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        const current = shape.rotation;
        const keyframes = [
          { time: 0, value: current },
          { time: 1, value: angle, easing }
        ];
        this.scene.rotationKeyframes(this.id, keyframes, duration);
      }
    } else {
      this.scene.rotate(this.id, angle, 0);
    }
    return this;
  }
  stroke(color, duration = 0, easing = "linear") {
    const col = typeof color === "string" ? parseColor(color) : color;
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape || shape instanceof TextShape) {
        const current = shape.strokeColor;
        const keyframes = [
          { time: 0, value: current },
          { time: 1, value: col, easing }
        ];
        this.scene.strokeColorKeyframes(this.id, keyframes, duration);
      }
    } else {
      this.scene.strokeColor(this.id, col, 0);
    }
    return this;
  }
  fill(color, duration = 0, easing = "linear") {
    if (color === null) {
      this.scene.fillColor(this.id, null, 0);
    } else {
      const col = typeof color === "string" ? parseColor(color) : color;
      if (duration > 0) {
        const shape = this.scene.getShape(this.id);
        if (shape instanceof BaseShape || shape instanceof TextShape) {
          const current = shape.fillColor || new Color(0, 0, 0, 0);
          const keyframes = [
            { time: 0, value: current },
            { time: 1, value: col, easing }
          ];
          this.scene.fillColorKeyframes(this.id, keyframes, duration);
        }
      } else {
        this.scene.fillColor(this.id, col, 0);
      }
    }
    return this;
  }
  opacity(value, duration = 0, easing = "linear") {
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        const current = shape.opacity;
        const keyframes = [
          { time: 0, value: current },
          { time: 1, value, easing }
        ];
        this.scene.opacityKeyframes(this.id, keyframes, duration);
      }
    } else {
      this.scene.opacity(this.id, value, 0);
    }
    return this;
  }
  keyframes(config, duration) {
    const shape = this.scene.getShape(this.id);
    if (!shape)
      return this;
    const effectiveNow = this.scene.currentEffectiveTime();
    if (config.translation) {
      const keyframes = config.translation.map((kf) => ({
        time: kf.time,
        value: kf.value instanceof Vec2 ? kf.value : new Vec2(kf.value),
        easing: kf.easing
      }));
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        shape.setTranslationKeyframes?.(keyframes, duration, effectiveNow);
      }
    }
    if (config.scale) {
      const keyframes = config.scale.map((kf) => ({
        time: kf.time,
        value: kf.value instanceof Vec2 ? kf.value : new Vec2(kf.value),
        easing: kf.easing
      }));
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        shape.setScaleKeyframes?.(keyframes, duration, effectiveNow);
      }
    }
    if (config.rotation) {
      const keyframes = config.rotation.map((kf) => ({
        time: kf.time,
        value: kf.value,
        easing: kf.easing
      }));
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        shape.setRotationKeyframes?.(keyframes, duration, effectiveNow);
      }
    }
    if (config.strokeColor) {
      const keyframes = config.strokeColor.map((kf) => ({
        time: kf.time,
        value: typeof kf.value === "string" ? parseColor(kf.value) : kf.value,
        easing: kf.easing
      }));
      if (shape instanceof BaseShape || shape instanceof TextShape) {
        shape.setStrokeColorKeyframes?.(keyframes, duration, effectiveNow);
      }
    }
    if (config.fillColor) {
      const keyframes = config.fillColor.map((kf) => ({
        time: kf.time,
        value: kf.value === null ? new Color(0, 0, 0, 0) : typeof kf.value === "string" ? parseColor(kf.value) : kf.value,
        easing: kf.easing
      }));
      if (shape instanceof BaseShape || shape instanceof TextShape) {
        shape.setFillColorKeyframes?.(keyframes, duration, effectiveNow);
      }
    }
    if (config.opacity) {
      const keyframes = config.opacity.map((kf) => ({
        time: kf.time,
        value: kf.value,
        easing: kf.easing
      }));
      if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
        shape.setOpacityKeyframes?.(keyframes, duration, effectiveNow);
      }
    }
    return this;
  }
  delay(seconds) {
    this.scene.pause(seconds);
    return this;
  }
  lineDash(dashArray) {
    this.scene.lineDash(this.id, dashArray);
    return this;
  }
  lineCap(cap) {
    this.scene.lineCap(this.id, cap);
    return this;
  }
  lineJoin(join) {
    this.scene.lineJoin(this.id, join);
    return this;
  }
  vertexColors(colors) {
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
  pointSize(size) {
    this.scene.pointSize(this.id, size);
    return this;
  }
  lineWidth(width) {
    return this.pointSize(width);
  }
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
  translate(id, x, y, _duration = 0) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.translation = new Vec2({ x, y });
    }
  }
  scale(id, sx, sy = sx, _duration = 0) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.scale = new Vec2({ x: sx, y: sy });
    }
  }
  rotate(id, angle, _duration = 0) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.rotation = angle;
    }
  }
  strokeColor(id, color, _duration = 0) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      shape.strokeColor = color;
    }
  }
  fillColor(id, color, _duration = 0) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      shape.fillColor = color;
    }
  }
  opacity(id, value, _duration = 0) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.opacity = value;
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
  translateKeyframes(id, keyframes, duration) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    const startTime = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.setTranslationKeyframes?.(keyframes, duration, startTime);
    }
  }
  scaleKeyframes(id, keyframes, duration) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    const startTime = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.setScaleKeyframes?.(keyframes, duration, startTime);
    }
  }
  rotationKeyframes(id, keyframes, duration) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    const startTime = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.setRotationKeyframes?.(keyframes, duration, startTime);
    }
  }
  strokeColorKeyframes(id, keyframes, duration) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    const startTime = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      shape.setStrokeColorKeyframes?.(keyframes, duration, startTime);
    }
  }
  fillColorKeyframes(id, keyframes, duration) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    const startTime = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape) {
      shape.setFillColorKeyframes?.(keyframes, duration, startTime);
    }
  }
  opacityKeyframes(id, keyframes, duration) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    const startTime = this.currentEffectiveTime();
    if (shape instanceof BaseShape || shape instanceof TextShape || shape instanceof ImageShape) {
      shape.setOpacityKeyframes?.(keyframes, duration, startTime);
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
  pause(seconds) {
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
  async wait(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
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
  pointSize(id, size) {
    const shape = this.shapes.get(id);
    if (!shape)
      return;
    if (shape instanceof BaseShape) {
      shape.pointSize = size;
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
function clearScene() {
  scene.shapes.clear();
  scene.removalSet.clear();
  scene.pauseStartReal = null;
  scene.pauseDuration = null;
  scene.effectiveTimeAtPauseStart = null;
  scene.totalPausedTime = 0;
}
function testBasicShapes() {
  clearScene();
  console.log("Test 1: Basic Shapes");
  scene.F((x) => Math.sin(x)).stroke("#ff0000").scale(0.5).reveal();
  scene.Circle(5).stroke("#00ff00").translate(5, 0).reveal();
  scene.Square(4).stroke("#0000ff").translate(-5, 5).reveal();
  scene.RegularPolygon(3, 6).stroke("#ffff00").translate(5, -5).reveal();
  scene.Line(-8, -8, -2, -2).stroke("#ff00ff").reveal();
  scene.ParametricCurve((t) => 16 * Math.sin(t) ** 3, (t) => 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t), 0, 2 * Math.PI).stroke("#ff8800").translate(-5, -5).scale(0.3).reveal();
  scene.Star(4, 2, 5).stroke("#00ffff").translate(5, 5).reveal();
}
function testTransformations() {
  clearScene();
  console.log("Test 2: Transformations (immediate)");
  const square = scene.Square(3).stroke("#ffffff").reveal();
  square.translate(2, 2).scale(1.5, 0.5).rotate(Math.PI / 4);
  scene.Circle(2).stroke("#ff00ff").translate(-3, -3).scale(2).rotate(Math.PI / 2).reveal();
}
function testStyling() {
  clearScene();
  console.log("Test 3: Styling");
  scene.Circle(4).fill("rgba(255,0,0,0.5)").stroke("#ffffff").reveal();
  scene.Line(-8, -8, 8, 8).stroke("#00ff00").lineDash([10, 5]).lineWidth(3).reveal();
  scene.Square(5).translate(5, 5).stroke("#0000ff").lineCap("round").lineJoin("round").lineDash([5, 2]).reveal();
}
function testPerVertexColors() {
  clearScene();
  console.log("Test 4: Per-Vertex Colors");
  const line = scene.Line(-8, 0, 8, 0).stroke("#ffffff").scale(1, 1).reveal();
  const colors = [];
  for (let i = 0;i < NUM_VERTICES; i++) {
    const hue = i / NUM_VERTICES * 360;
    const c = new Color(Math.floor(128 + 127 * Math.sin(hue * Math.PI / 180)), Math.floor(128 + 127 * Math.sin((hue + 120) * Math.PI / 180)), Math.floor(128 + 127 * Math.sin((hue + 240) * Math.PI / 180)));
    colors.push(c);
  }
  line.vertexColors(colors);
  const circle = scene.Circle(5).translate(0, 3).stroke("#ffffff").reveal();
  const circleColors = [];
  for (let i = 0;i < NUM_VERTICES; i++) {
    circleColors.push(Color.random());
  }
  circle.vertexColors(circleColors);
}
function testSimpleAnimations() {
  clearScene();
  console.log("Test 5: Simple Animations");
  const ball = scene.Circle(2).fill("#ffaa00").stroke("#ffffff");
  ball.translate(-8, 0).translate(8, 0, 2000, "easeOutBounce").translate(-8, 0, 2000, "easeInOutQuad").reveal();
  const square = scene.Square(3).stroke("#00aaff").translate(0, 5).reveal();
  square.rotate(0).rotate(2 * Math.PI, 3000, "easeInOutElastic").reveal();
  const heart = scene.ParametricCurve((t) => 16 * Math.sin(t) ** 3, (t) => 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t), 0, 2 * Math.PI).stroke("#ff66aa").scale(0.3).translate(-5, -5).reveal();
  heart.scale(0.3, 0.3, 0).scale(1.2, 1.2, 2000, "easeInOutSine").scale(0.3, 0.3, 2000, "easeInOutSine").reveal();
}
function testKeyframes() {
  clearScene();
  console.log("Test 6: Keyframe Animations");
  const star = scene.Star(3, 1.5, 5).fill("#ffaa00").stroke("#ffffff").reveal();
  star.keyframes({
    translation: [
      { time: 0, value: { x: -8, y: -8 } },
      { time: 0.3, value: { x: 0, y: -8 }, easing: "easeOutQuad" },
      { time: 0.6, value: { x: 8, y: 0 }, easing: "easeInOutCubic" },
      { time: 1, value: { x: -8, y: 8 }, easing: "easeInElastic" }
    ],
    rotation: [
      { time: 0, value: 0 },
      { time: 0.5, value: Math.PI },
      { time: 1, value: 2 * Math.PI }
    ],
    scale: [
      { time: 0, value: { x: 0.5, y: 0.5 } },
      { time: 0.2, value: { x: 1.5, y: 1.5 } },
      { time: 0.8, value: { x: 0.8, y: 0.8 } },
      { time: 1, value: { x: 1, y: 1 } }
    ],
    opacity: [
      { time: 0, value: 1 },
      { time: 0.3, value: 0.3 },
      { time: 0.7, value: 1 },
      { time: 1, value: 0.5 }
    ]
  }, 4000).reveal();
}
function testMorph() {
  clearScene();
  console.log("Test 7: Morph");
  const circle = scene.Circle(4).stroke("#ff0000").translate(-5, 0).reveal();
  const square = scene.Square(6).stroke("#0000ff").translate(5, 0).reveal();
  const morph = circle.morph(square, 3000);
  morph.stroke("#ffffff");
}
function testText() {
  clearScene();
  console.log("Test 8: TextShape");
  scene.Text("Hello jsketch!", "24px Arial", { x: -5, y: 5 }).fill("#ffaa00").stroke("#ffffff").rotate(0.2).reveal();
  const txt = scene.Text("Keyframe Text", "18px monospace", { x: 0, y: -5 }).fill("#00aaff").reveal();
  txt.keyframes({
    translation: [
      { time: 0, value: { x: -8, y: -5 } },
      { time: 0.5, value: { x: 8, y: -5 } },
      { time: 1, value: { x: -8, y: -5 } }
    ],
    rotation: [
      { time: 0, value: 0 },
      { time: 1, value: 2 * Math.PI }
    ],
    scale: [
      { time: 0, value: { x: 0.5, y: 0.5 } },
      { time: 0.3, value: { x: 2, y: 2 } },
      { time: 0.7, value: { x: 1, y: 1 } },
      { time: 1, value: { x: 0.5, y: 0.5 } }
    ]
  }, 4000).reveal();
}
function testAdvancedPrimitives() {
  clearScene();
  console.log("Test 10: Advanced Primitives");
  scene.QuadraticBezier({ x: -8, y: -8 }, { x: 0, y: 8 }, { x: 8, y: -8 }).stroke("#ff00ff").scale(0.8).reveal();
  scene.CubicBezier({ x: -8, y: 8 }, { x: -4, y: -8 }, { x: 4, y: 8 }, { x: 8, y: -8 }).stroke("#00ffff").translate(0, 2).reveal();
  scene.Arc({ x: -4, y: -4 }, 3, 0, Math.PI, false).stroke("#ffff00").lineDash([5, 3]).reveal();
  scene.Ellipse({ x: 4, y: 4 }, 3, 1.5, Math.PI / 4, 0, 2 * Math.PI, false).stroke("#ffaa00").fill("rgba(255,170,0,0.3)").reveal();
}
async function testPause() {
  clearScene();
  console.log("Test 11: Pause / Delay");
  const square = scene.Square(3).fill("#ff0000").translate(-5, 0).reveal();
  square.translate(5, 0, 2000);
  await scene.wait(1);
  const circle = scene.Circle(2).fill("#00ff00").translate(0, -5).reveal();
  circle.translate(0, 5, 2000);
}
function testConcurrent() {
  clearScene();
  console.log("Test 12: Concurrent Animations");
  for (let i = 0;i < 5; i++) {
    const y = -8 + i * 4;
    const star = scene.Star(2, 1, 5).fill(Color.random()).stroke("#ffffff").translate(-8, y);
    star.keyframes({
      translation: [
        { time: 0, value: { x: -8, y } },
        { time: 1, value: { x: 8, y } }
      ],
      rotation: [
        { time: 0, value: 0 },
        { time: 1, value: 2 * Math.PI }
      ]
    }, 3000 + i * 500).reveal();
  }
}
function testEdgeCases() {
  clearScene();
  console.log("Test 13: Edge Cases");
  scene.Circle(2).fill("#ff0000").translate(5, 5).translate(-5, -5, 0).reveal();
  scene.Square(3).stroke("#00ff00").scale(-1, 1).translate(3, 0).reveal();
  scene.Line(0, 0, 1000, 1000).stroke("#0000ff").reveal();
  scene.RegularPolygon(3, 5).fill(null).stroke("#ffff00").reveal();
}
function testStress() {
  clearScene();
  console.log("Test 14: Stress Test (100 shapes)");
  for (let i = 0;i < 100; i++) {
    const x = (Math.random() - 0.5) * 18;
    const y = (Math.random() - 0.5) * 18;
    const size = 0.5 + Math.random() * 2;
    const shapeType = Math.floor(Math.random() * 3);
    let shape;
    if (shapeType === 0) {
      shape = scene.Circle(size).fill(Color.random()).stroke("#ffffff").reveal();
    } else if (shapeType === 1) {
      shape = scene.Square(size * 2).fill(Color.random()).stroke("#ffffff").reveal();
    } else {
      shape = scene.Star(size, size / 2, 5).fill(Color.random()).stroke("#ffffff").reveal();
    }
    shape.translate(x, y).rotate(Math.random() * Math.PI).reveal();
    if (Math.random() > 0.5) {
      shape.keyframes({
        translation: [
          { time: 0, value: { x, y } },
          { time: 1, value: { x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10 } }
        ],
        rotation: [
          { time: 0, value: 0 },
          { time: 1, value: 2 * Math.PI }
        ]
      }, 5000).reveal();
    }
  }
}
async function runAllTests() {
  console.clear();
  console.log("RECORDING");
  scene.startRecording();
  console.log("=== Starting jsketch Test Suite ===");
  testBasicShapes();
  await scene.wait(5);
  testTransformations();
  await scene.wait(5);
  testStyling();
  await scene.wait(5);
  testPerVertexColors();
  await scene.wait(5);
  testSimpleAnimations();
  await scene.wait(5);
  testKeyframes();
  await scene.wait(5);
  testMorph();
  await scene.wait(5);
  testText();
  await scene.wait(5);
  testAdvancedPrimitives();
  await scene.wait(5);
  await testPause();
  await scene.wait(5);
  testConcurrent();
  await scene.wait(5);
  testEdgeCases();
  await scene.wait(5);
  testStress();
  await scene.wait(5);
  console.log("=== Test Suite Completed ===");
  scene.stopRecording();
  console.log("RECORDING STOPED");
}
window.runAllTests = runAllTests;
