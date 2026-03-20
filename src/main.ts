import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";

// ========== Configuration ==========
const CONFIG = {
  scaleX: 10,
  scaleY: 10,
  scaleZ: 10,
  gridStep: 1,
  defaultLineWidth: 2,
  defaultFont: "14px sans-serif",  // changed: not `as const` to allow other fonts
} as const;

const NUM_VERTICES = 400;

// ========== Easing Functions ==========
type EasingFunction = (t: number) => number;
const EASINGS: Record<string, EasingFunction> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => (--t) * t * t + 1,
  easeInOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - (--t) * t * t * t,
  easeInOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t),
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => (1 - Math.cos(Math.PI * t)) / 2,
  easeInElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI);
  },
  easeOutElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1;
  },
  easeInOutElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    if ((t *= 2) < 1) {
      return -0.5 * Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI);
    }
    return 0.5 * Math.pow(2, -10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI) + 1;
  },
  easeInBounce: (t) => 1 - EASINGS.easeOutBounce(1 - t),
  easeOutBounce: (t) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  },
  easeInOutBounce: (t) =>
    t < 0.5
      ? (1 - EASINGS.easeOutBounce(1 - 2 * t)) / 2
      : (1 + EASINGS.easeOutBounce(2 * t - 1)) / 2,
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ========== Keyframe Animation ==========
interface Keyframe<T> {
  time: number; // 0..1
  value: T;
  easing?: EasingFunction | string;
}

class KeyframeAnimation<T> {
  private keyframes: Keyframe<T>[];
  private duration: number;
  private startTime: number;
  private _finished = false;

  constructor(keyframes: Keyframe<T>[], duration: number, startTime: number) {
    if (keyframes.length === 0) throw new Error("Keyframes cannot be empty");
    // Validate times are in [0,1]
    for (const kf of keyframes) {
      if (kf.time < 0 || kf.time > 1)
        throw new Error("Keyframe time must be between 0 and 1");
    }
    this.keyframes = [...keyframes].sort((a, b) => a.time - b.time);
    if (this.keyframes[0].time !== 0) {
      this.keyframes.unshift({ time: 0, value: this.keyframes[0].value });
    }
    if (this.keyframes[this.keyframes.length - 1].time !== 1) {
      this.keyframes.push({
        time: 1,
        value: this.keyframes[this.keyframes.length - 1].value,
      });
    }
    this.duration = duration;
    this.startTime = startTime;
  }

  isFinished(now: number): boolean {
    return now - this.startTime >= this.duration;
  }

  sample(now: number): T {
    const elapsed = now - this.startTime;
    if (elapsed >= this.duration) {
      this._finished = true;
      return this.keyframes[this.keyframes.length - 1].value;
    }
    const progress = elapsed / this.duration;
    let i = 0;
    while (i < this.keyframes.length - 1 && this.keyframes[i + 1].time < progress) i++;
    const from = this.keyframes[i];
    const to = this.keyframes[i + 1];
    const segmentT = (progress - from.time) / (to.time - from.time);
    let easedT = segmentT;
    if (to.easing) {
      const easingFn = typeof to.easing === "string" ? EASINGS[to.easing] : to.easing;
      if (easingFn) easedT = easingFn(segmentT);
    }
    if (from.value instanceof THREE.Vector3 && to.value instanceof THREE.Vector3) {
      return (from.value as THREE.Vector3).clone().lerp(to.value as THREE.Vector3, easedT) as T;
    } else if (from.value instanceof THREE.Color && to.value instanceof THREE.Color) {
      return (from.value as THREE.Color).clone().lerp(to.value as THREE.Color, easedT) as T;
    } else {
      return lerp(from.value as number, to.value as number, easedT) as T;
    }
  }

  get finished(): boolean {
    return this._finished;
  }
}

// ========== Drawable Base ==========
abstract class Drawable {
  public readonly id: number;
  public active = true;
  protected obj: THREE.Object3D;

  constructor(id: number, obj: THREE.Object3D) {
    this.id = id;
    this.obj = obj;
  }

  abstract update(now: number): void;

  getObject3D(): THREE.Object3D {
    return this.obj;
  }

  dispose(): void {
    // Overridden by subclasses that need cleanup
  }
}

// ========== Shape Base with Resource Management ==========
interface KeyframeAnimations {
  translation: KeyframeAnimation<THREE.Vector3> | null;
  scale: KeyframeAnimation<THREE.Vector3> | null;
  rotation: KeyframeAnimation<number> | null;
  strokeColor: KeyframeAnimation<THREE.Color> | null;
  fillColor: KeyframeAnimation<THREE.Color> | null;
  opacity: KeyframeAnimation<number> | null;
  drawProgress: KeyframeAnimation<number> | null;
}

type AnimationPromise = { promise: Promise<void>; resolve: () => void };

abstract class BaseShape extends Drawable {
  protected group: THREE.Group;
  protected fillMesh: THREE.Mesh | null = null;
  protected strokeLines: THREE.Line | THREE.LineSegments | null = null;
  protected vertices: THREE.Vector3[];
  private _drawProgress = 1;

  public strokeColor: THREE.Color;
  public fillColor: THREE.Color | null;
  public opacity: number;
  public lineWidth: number;
  public closed: boolean;

  protected keyframes: KeyframeAnimations = {
    translation: null,
    scale: null,
    rotation: null,
    strokeColor: null,
    fillColor: null,
    opacity: null,
    drawProgress: null,
  };

  private animationPromises: Partial<Record<keyof KeyframeAnimations, AnimationPromise>> = {};

  constructor(
    id: number,
    vertices: THREE.Vector3[],
    lineWidth = CONFIG.defaultLineWidth,
    closed = false,
    translation: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
    scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1),
    rotation = 0,
  ) {
    const group = new THREE.Group();
    super(id, group);
    this.group = group;
    this.vertices = vertices;
    this.strokeColor = new THREE.Color(Math.random(), Math.random(), Math.random());
    this.fillColor = null;
    this.opacity = 1.0;
    this.lineWidth = lineWidth;
    this.closed = closed;

    this.group.position.copy(translation);
    this.group.scale.copy(scale);
    this.group.rotation.z = rotation;
    this.rebuildGeometry();
  }

  // Getters
  public getVertices(): THREE.Vector3[] {
    return this.vertices;
  }

  public getStrokeColor(): THREE.Color {
    return this.strokeColor;
  }

  public getFillColor(): THREE.Color | null {
    return this.fillColor;
  }

  public getOpacity(): number {
    return this.opacity;
  }

  public getLineWidth(): number {
    return this.lineWidth;
  }

  public getClosed(): boolean {
    return this.closed;
  }

  public getDrawProgress(): number {
    return this._drawProgress;
  }

  public setDrawProgress(progress: number): void {
    this._drawProgress = Math.max(0, Math.min(1, progress));
    this.rebuildGeometry();
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  // Setters
  public setStrokeColor(color: THREE.Color): void {
    this.strokeColor.copy(color);
    this.updateMaterialColors();
  }

  public setFillColor(color: THREE.Color | null): void {
    this.fillColor = color ? color.clone() : null;
    this.rebuildGeometry();
  }

  public setOpacity(opacity: number): void {
    this.opacity = opacity;
    this.updateMaterialColors();
  }

  public setLineWidth(width: number): void {
    this.lineWidth = width;
    if (this.strokeLines) {
      (this.strokeLines.material as THREE.LineBasicMaterial).linewidth = width;
    }
  }

  protected rebuildGeometry(): void {
    // Dispose old geometries
    this.disposeFillMesh();
    this.disposeStrokeLines();

    // Fill
    if (this.fillColor && this.vertices.length >= 3 && this._drawProgress === 1) {
      const points = this.vertices.map((v) => new THREE.Vector2(v.x, v.y));
      const shape = new THREE.Shape(points);
      const geometry = new THREE.ShapeGeometry(shape);
      const material = new THREE.MeshBasicMaterial({
        color: this.fillColor,
        transparent: true,
        opacity: this.opacity,
        side: THREE.DoubleSide,
      });
      this.fillMesh = new THREE.Mesh(geometry, material);
      this.fillMesh.position.z = 0;
      this.group.add(this.fillMesh);
    }

    // Stroke
    if (this.vertices.length > 0) {
      let numPoints = Math.max(2, Math.floor(this.vertices.length * this._drawProgress));
      if (numPoints < 2) numPoints = 0;

      let points: THREE.Vector3[] = [];
      if (numPoints > 0) {
        points = this.vertices.slice(0, numPoints);
        if (this.closed && numPoints === this.vertices.length) {
          points.push(points[0].clone());
        }
      }

      if (points.length >= 2) {
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const lineMaterial = new THREE.LineBasicMaterial({
          color: this.strokeColor,
          linewidth: this.lineWidth,
        });
        this.strokeLines = new THREE.Line(lineGeometry, lineMaterial);
        this.group.add(this.strokeLines);
      }
    }
  }

  protected updateMaterialColors(): void {
    if (this.strokeLines) {
      (this.strokeLines.material as THREE.LineBasicMaterial).color.copy(this.strokeColor);
    }
    if (this.fillMesh) {
      const mat = this.fillMesh.material as THREE.MeshBasicMaterial;
      if (this.fillColor) mat.color.copy(this.fillColor);
      mat.opacity = this.opacity;
    }
  }

  private disposeFillMesh(): void {
    if (this.fillMesh) {
      this.group.remove(this.fillMesh);
      this.fillMesh.geometry.dispose();
      (this.fillMesh.material as THREE.Material).dispose();
      this.fillMesh = null;
    }
  }

  private disposeStrokeLines(): void {
    if (this.strokeLines) {
      this.group.remove(this.strokeLines);
      this.strokeLines.geometry.dispose();
      (this.strokeLines.material as THREE.Material).dispose();
      this.strokeLines = null;
    }
  }

  // Animation promise management
  private async startAnimation<K extends keyof KeyframeAnimations>(
    type: K,
    setKeyframes: () => void,
  ): Promise<this> {
    // Cancel previous animation for this type
    if (this.animationPromises[type]) {
      this.animationPromises[type]!.resolve();
      delete this.animationPromises[type];
    }
    // Create a new promise that will resolve when the animation finishes
    let resolve: () => void;
    const promise = new Promise<void>((res) => {
      resolve = res;
    });
    this.animationPromises[type] = { promise, resolve: resolve! };
    // Start the animation
    setKeyframes();
    return promise.then(() => this);
  }

  // Public animation methods
  setTranslationKeyframes(
    keyframes: Keyframe<THREE.Vector3>[],
    duration: number,
    startTime: number,
  ): Promise<this> {
    return this.startAnimation("translation", () => {
      this.keyframes.translation = new KeyframeAnimation(keyframes, duration, startTime);
    });
  }

  setScaleKeyframes(
    keyframes: Keyframe<THREE.Vector3>[],
    duration: number,
    startTime: number,
  ): Promise<this> {
    return this.startAnimation("scale", () => {
      this.keyframes.scale = new KeyframeAnimation(keyframes, duration, startTime);
    });
  }

  setRotationKeyframes(
    keyframes: Keyframe<number>[],
    duration: number,
    startTime: number,
  ): Promise<this> {
    return this.startAnimation("rotation", () => {
      this.keyframes.rotation = new KeyframeAnimation(keyframes, duration, startTime);
    });
  }

  setStrokeColorKeyframes(
    keyframes: Keyframe<THREE.Color>[],
    duration: number,
    startTime: number,
  ): Promise<this> {
    return this.startAnimation("strokeColor", () => {
      this.keyframes.strokeColor = new KeyframeAnimation(keyframes, duration, startTime);
    });
  }

  setFillColorKeyframes(
    keyframes: Keyframe<THREE.Color>[],
    duration: number,
    startTime: number,
  ): Promise<this> {
    return this.startAnimation("fillColor", () => {
      this.keyframes.fillColor = new KeyframeAnimation(keyframes, duration, startTime);
    });
  }

  setOpacityKeyframes(
    keyframes: Keyframe<number>[],
    duration: number,
    startTime: number,
  ): Promise<this> {
    return this.startAnimation("opacity", () => {
      this.keyframes.opacity = new KeyframeAnimation(keyframes, duration, startTime);
    });
  }

  setDrawProgressKeyframes(
    keyframes: Keyframe<number>[],
    duration: number,
    startTime: number,
  ): Promise<this> {
    return this.startAnimation("drawProgress", () => {
      this.keyframes.drawProgress = new KeyframeAnimation(keyframes, duration, startTime);
    });
  }

  private updateAnimations(now: number): void {
    // Translation
    if (this.keyframes.translation) {
      if (this.keyframes.translation.isFinished(now)) {
        this.group.position.copy(this.keyframes.translation.sample(now));
        this.keyframes.translation = null;
        this.animationPromises.translation?.resolve();
        delete this.animationPromises.translation;
      } else {
        this.group.position.copy(this.keyframes.translation.sample(now));
      }
    }
    // Scale
    if (this.keyframes.scale) {
      if (this.keyframes.scale.isFinished(now)) {
        this.group.scale.copy(this.keyframes.scale.sample(now));
        this.keyframes.scale = null;
        this.animationPromises.scale?.resolve();
        delete this.animationPromises.scale;
      } else {
        this.group.scale.copy(this.keyframes.scale.sample(now));
      }
    }
    // Rotation
    if (this.keyframes.rotation) {
      if (this.keyframes.rotation.isFinished(now)) {
        this.group.rotation.z = this.keyframes.rotation.sample(now);
        this.keyframes.rotation = null;
        this.animationPromises.rotation?.resolve();
        delete this.animationPromises.rotation;
      } else {
        this.group.rotation.z = this.keyframes.rotation.sample(now);
      }
    }
    // Stroke color
    if (this.keyframes.strokeColor) {
      if (this.keyframes.strokeColor.isFinished(now)) {
        this.strokeColor.copy(this.keyframes.strokeColor.sample(now));
        this.keyframes.strokeColor = null;
        this.animationPromises.strokeColor?.resolve();
        delete this.animationPromises.strokeColor;
        this.updateMaterialColors();
      } else {
        this.strokeColor.copy(this.keyframes.strokeColor.sample(now));
        this.updateMaterialColors();
      }
    }
    // Fill color
    if (this.keyframes.fillColor) {
      if (this.keyframes.fillColor.isFinished(now)) {
        this.fillColor = this.keyframes.fillColor.sample(now);
        this.keyframes.fillColor = null;
        this.animationPromises.fillColor?.resolve();
        delete this.animationPromises.fillColor;
        this.updateMaterialColors();
      } else {
        this.fillColor = this.keyframes.fillColor.sample(now);
        this.updateMaterialColors();
      }
    }
    // Opacity
    if (this.keyframes.opacity) {
      if (this.keyframes.opacity.isFinished(now)) {
        this.opacity = this.keyframes.opacity.sample(now);
        this.keyframes.opacity = null;
        this.animationPromises.opacity?.resolve();
        delete this.animationPromises.opacity;
        this.updateMaterialColors();
      } else {
        this.opacity = this.keyframes.opacity.sample(now);
        this.updateMaterialColors();
      }
    }
    // Draw progress
    if (this.keyframes.drawProgress) {
      if (this.keyframes.drawProgress.isFinished(now)) {
        this.setDrawProgress(this.keyframes.drawProgress.sample(now));
        this.keyframes.drawProgress = null;
        this.animationPromises.drawProgress?.resolve();
        delete this.animationPromises.drawProgress;
      } else {
        this.setDrawProgress(this.keyframes.drawProgress.sample(now));
      }
    }
  }

  public update(now: number): void {
    this.updateAnimations(now);
  }

  public dispose(): void {
    this.disposeFillMesh();
    this.disposeStrokeLines();
    this.group.clear(); // removes all children
    // Cancel any pending promises
    for (const key in this.animationPromises) {
      this.animationPromises[key as keyof KeyframeAnimations]?.resolve();
    }
  }
}

// ========== Concrete Shapes ==========
class CircleShape extends BaseShape {
  constructor(id: number, radius: number) {
    const vertices: THREE.Vector3[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const angle = (i / NUM_VERTICES) * 2 * Math.PI;
      vertices.push(new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), 0));
    }
    super(id, vertices, CONFIG.defaultLineWidth, true);
  }
}

class SquareShape extends BaseShape {
  constructor(id: number, sideLength: number) {
    const half = sideLength / 2;
    const corners = [
      new THREE.Vector3(-half, -half, 0),
      new THREE.Vector3(half, -half, 0),
      new THREE.Vector3(half, half, 0),
      new THREE.Vector3(-half, half, 0),
    ];
    const vertices = resamplePolyline(corners, true, NUM_VERTICES);
    super(id, vertices, CONFIG.defaultLineWidth, true);
  }
}

class LineShape extends BaseShape {
  constructor(id: number, startX: number, startY: number, endX: number, endY: number) {
    const vertices: THREE.Vector3[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      vertices.push(new THREE.Vector3(lerp(startX, endX, t), lerp(startY, endY, t), 0));
    }
    super(id, vertices, CONFIG.defaultLineWidth, false);
  }
}

class RegularPolygonShape extends BaseShape {
  constructor(id: number, radius: number, sides: number) {
    const corners: THREE.Vector3[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * 2 * Math.PI;
      corners.push(new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), 0));
    }
    const vertices = resamplePolyline(corners, true, NUM_VERTICES);
    super(id, vertices, CONFIG.defaultLineWidth, true);
  }
}

class StarShape extends BaseShape {
  constructor(id: number, outerRadius: number, innerRadius: number, points: number) {
    const vertices: THREE.Vector3[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / NUM_VERTICES;
      const angle = t * 2 * Math.PI;
      const sector = Math.floor(angle / (Math.PI / points));
      const r = sector % 2 === 0 ? outerRadius : innerRadius;
      vertices.push(new THREE.Vector3(r * Math.cos(angle), r * Math.sin(angle), 0));
    }
    super(id, vertices, CONFIG.defaultLineWidth, true);
  }
}

class ParametricCurveShape extends BaseShape {
  constructor(
    id: number,
    fx: (t: number) => number,
    fy: (t: number) => number,
    tMin = 0,
    tMax = 1,
  ) {
    const vertices: THREE.Vector3[] = [];
    for (let i = 0; i < NUM_VERTICES; i++) {
      const t = i / (NUM_VERTICES - 1);
      const param = tMin + t * (tMax - tMin);
      vertices.push(new THREE.Vector3(fx(param), fy(param), 0));
    }
    super(id, vertices, CONFIG.defaultLineWidth, false);
  }
}

// ========== Text and Image Shapes ==========
class TextShape extends Drawable {
  private element: HTMLDivElement;
  private label: CSS2DObject;
  public strokeColor: THREE.Color;
  public fillColor: THREE.Color | null;
  public opacity: number;
  private _font: string;
  private _text: string;

  constructor(
    id: number,
    text: string,
    font: string = CONFIG.defaultFont,
    translation: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
  ) {
    const div = document.createElement("div");
    div.textContent = text;
    div.style.color = "white";
    div.style.font = font;
    div.style.background = "transparent";
    div.style.padding = "2px";
    const label = new CSS2DObject(div);
    label.position.copy(translation);
    super(id, label);
    this.label = label;
    this.element = div;
    this._text = text;
    this._font = font;
    this.strokeColor = new THREE.Color(1, 1, 1);
    this.fillColor = null;
    this.opacity = 1;
  }

  get text(): string {
    return this._text;
  }
  set text(t: string) {
    this._text = t;
    this.element.textContent = t;
  }

  get font(): string {
    return this._font;
  }
  set font(f: string) {
    this._font = f;
    this.element.style.font = f;
  }

  public setStrokeColor(color: THREE.Color): void {
    this.strokeColor.copy(color);
    this.element.style.color = color.getStyle();
  }

  public setFillColor(color: THREE.Color | null): void {
    this.fillColor = color;
    if (color) this.element.style.background = color.getStyle();
    else this.element.style.background = "transparent";
  }

  public setOpacity(opacity: number): void {
    this.opacity = opacity;
    this.element.style.opacity = opacity.toString();
  }

  update(_now: number): void {}

  dispose(): void {
    this.label.removeFromParent();
    // CSS2DObject doesn't need explicit disposal
  }
}

class ImageShape extends Drawable {
  public opacity: number;
  private texture: THREE.Texture;

  constructor(
    id: number,
    image: HTMLImageElement | ImageBitmap,
    translation: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
  ) {
    const texture = new THREE.CanvasTexture(image);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(translation);
    sprite.scale.set(image.width / 100, image.height / 100, 1);
    super(id, sprite);
    this.texture = texture;
    this.opacity = 1;
  }

  public setOpacity(opacity: number): void {
    this.opacity = opacity;
    (this.getObject3D() as THREE.Sprite).material.opacity = opacity;
  }

  update(_now: number): void {}

  dispose(): void {
    this.texture.dispose();
    (this.getObject3D() as THREE.Sprite).material.dispose();
  }
}

// ========== Morphing Shape (Optimized) ==========
class MorphShape extends Drawable {
  private shape1: BaseShape;
  private shape2: BaseShape;
  private duration: number;
  private startTime: number;
  private sceneRef: Scene;
  private completionResolve?: () => void;
  private completionPromise: Promise<void>;
  private geometry: THREE.BufferGeometry;
  private material: THREE.LineBasicMaterial;
  private line: THREE.Line;
  private positions: Float32Array;

  constructor(
    id: number,
    scene: Scene,
    shape1: BaseShape,
    shape2: BaseShape,
    duration: number,
    startTime: number,
  ) {
    // Create an empty group for the morph
    const group = new THREE.Group();
    super(id, group);

    this.shape1 = shape1;
    this.shape2 = shape2;
    this.duration = duration;
    this.startTime = startTime;
    this.sceneRef = scene;

    // Precompute resampled vertices for both shapes at the start
    const count = Math.max(shape1.getVertices().length, shape2.getVertices().length);
    this.positions = new Float32Array(count * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry = geometry;
    this.material = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: CONFIG.defaultLineWidth });
    this.line = new THREE.Line(geometry, this.material);
    group.add(this.line);

    this.completionPromise = new Promise((resolve) => {
      this.completionResolve = resolve;
    });
  }

  getCompletionPromise(): Promise<void> {
    return this.completionPromise;
  }

  update(now: number): void {
    const elapsed = now - this.startTime;
    let t = Math.min(elapsed / this.duration, 1);
    if (t >= 1) {
      this.completionResolve?.();
      this.sceneRef.markForRemoval(this.id);
      return;
    }

    const count = this.positions.length / 3;
    const resampled1 = resamplePolyline(this.shape1.getVertices(), this.shape1.getClosed(), count);
    const resampled2 = resamplePolyline(this.shape2.getVertices(), this.shape2.getClosed(), count);

    // Interpolate vertex positions
    for (let i = 0; i < count; i++) {
      const x = lerp(resampled1[i].x, resampled2[i].x, t);
      const y = lerp(resampled1[i].y, resampled2[i].y, t);
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = 0;
    }
    this.geometry.attributes.position.needsUpdate = true;

    // Interpolate transform properties (using getGroup())
    this.line.position.copy(this.shape1.getGroup().position).lerp(this.shape2.getGroup().position, t);
    this.line.scale.copy(this.shape1.getGroup().scale).lerp(this.shape2.getGroup().scale, t);
    this.line.rotation.z = lerp(this.shape1.getGroup().rotation.z, this.shape2.getGroup().rotation.z, t);

    // Interpolate color
    const col = this.shape1.getStrokeColor().clone().lerp(this.shape2.getStrokeColor(), t);
    this.material.color.copy(col);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ========== Utility: Polyline Resampling ==========
function resamplePolyline(
  vertices: THREE.Vector3[],
  closed: boolean,
  numPoints: number,
): THREE.Vector3[] {
  if (vertices.length === 0) return [];
  if (vertices.length === 1) return Array(numPoints).fill(vertices[0].clone());

  const dist: number[] = [0];
  for (let i = 1; i < vertices.length; i++) {
    const dx = vertices[i].x - vertices[i - 1].x;
    const dy = vertices[i].y - vertices[i - 1].y;
    dist.push(dist[i - 1] + Math.hypot(dx, dy));
  }

  if (closed) {
    const dx = vertices[0].x - vertices[vertices.length - 1].x;
    const dy = vertices[0].y - vertices[vertices.length - 1].y;
    const closingLen = Math.hypot(dx, dy);
    const total = dist[dist.length - 1] + closingLen;

    const segments: { start: THREE.Vector3; end: THREE.Vector3; len: number; cum: number }[] = [];
    for (let i = 0; i < vertices.length - 1; i++) {
      const len = dist[i + 1] - dist[i];
      segments.push({ start: vertices[i], end: vertices[i + 1], len, cum: dist[i + 1] });
    }
    segments.push({
      start: vertices[vertices.length - 1],
      end: vertices[0],
      len: closingLen,
      cum: total,
    });

    const result: THREE.Vector3[] = [];
    for (let i = 0; i < numPoints; i++) {
      const targetDist = (i / numPoints) * total;
      let segIndex = 0;
      while (segIndex < segments.length && segments[segIndex].cum < targetDist) segIndex++;
      if (segIndex >= segments.length) segIndex = segments.length - 1;
      const seg = segments[segIndex];
      const prevCum = segIndex === 0 ? 0 : segments[segIndex - 1].cum;
      const segT = (targetDist - prevCum) / seg.len;
      const x = lerp(seg.start.x, seg.end.x, segT);
      const y = lerp(seg.start.y, seg.end.y, segT);
      result.push(new THREE.Vector3(x, y, 0));
    }
    // Ensure last point equals first for closed shape (makes a closed loop)
    if (result.length > 0) result[result.length - 1] = result[0].clone();
    return result;
  } else {
    const total = dist[dist.length - 1];
    const result: THREE.Vector3[] = [];
    for (let i = 0; i < numPoints; i++) {
      const targetDist = (i / (numPoints - 1)) * total;
      let segIndex = 1;
      while (segIndex < dist.length && dist[segIndex] < targetDist) segIndex++;
      if (segIndex >= dist.length) segIndex = dist.length - 1;
      const prevDist = dist[segIndex - 1];
      const segT = (targetDist - prevDist) / (dist[segIndex] - prevDist);
      const x = lerp(vertices[segIndex - 1].x, vertices[segIndex].x, segT);
      const y = lerp(vertices[segIndex - 1].y, vertices[segIndex].y, segT);
      result.push(new THREE.Vector3(x, y, 0));
    }
    return result;
  }
}

// ========== Scene Management ==========
class Scene {
  private drawables = new Map<number, Drawable>();
  private nextId = 0;
  private removalSet = new Set<number>();
  private pauseStartReal: number | null = null;
  private pauseDuration: number | null = null;
  private totalPausedTime = 0;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingTimeout: number | null = null;

  // Reference to Three.js objects (injected)
  private renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private camera: THREE.PerspectiveCamera;

  constructor(renderer: THREE.WebGLRenderer, labelRenderer: CSS2DRenderer, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.labelRenderer = labelRenderer;
    this.camera = camera;
  }

  public currentEffectiveTime(): number {
    const now = performance.now();
    if (this.pauseStartReal !== null) {
      return now - this.totalPausedTime - (now - this.pauseStartReal);
    } else {
      return now - this.totalPausedTime;
    }
  }

  public getShape(id: number): Drawable | undefined {
    return this.drawables.get(id);
  }

  private addToThree(obj: THREE.Object3D): void {
    (window as any).scene.add(obj);
  }

  private removeFromThree(obj: THREE.Object3D): void {
    (window as any).scene.remove(obj);
  }

  // Factory methods
  Circle(radius: number): ShapeRef {
    const id = this.nextId++;
    const shape = new CircleShape(id, radius);
    this.drawables.set(id, shape);
    this.addToThree(shape.getObject3D());
    return new ShapeRef(this, id);
  }

  Square(sideLength: number): ShapeRef {
    const id = this.nextId++;
    const shape = new SquareShape(id, sideLength);
    this.drawables.set(id, shape);
    this.addToThree(shape.getObject3D());
    return new ShapeRef(this, id);
  }

  Line(startX: number, startY: number, endX: number, endY: number): ShapeRef {
    const id = this.nextId++;
    const shape = new LineShape(id, startX, startY, endX, endY);
    this.drawables.set(id, shape);
    this.addToThree(shape.getObject3D());
    return new ShapeRef(this, id);
  }

  RegularPolygon(radius: number, sides: number): ShapeRef {
    const id = this.nextId++;
    const shape = new RegularPolygonShape(id, radius, sides);
    this.drawables.set(id, shape);
    this.addToThree(shape.getObject3D());
    return new ShapeRef(this, id);
  }

  Star(outerRadius: number, innerRadius: number, points: number): ShapeRef {
    const id = this.nextId++;
    const shape = new StarShape(id, outerRadius, innerRadius, points);
    this.drawables.set(id, shape);
    this.addToThree(shape.getObject3D());
    return new ShapeRef(this, id);
  }

  ParametricCurve(
    fx: (t: number) => number,
    fy: (t: number) => number,
    tMin = 0,
    tMax = 1,
  ): ShapeRef {
    const id = this.nextId++;
    const shape = new ParametricCurveShape(id, fx, fy, tMin, tMax);
    this.drawables.set(id, shape);
    this.addToThree(shape.getObject3D());
    return new ShapeRef(this, id);
  }

  Text(text: string, font: string = CONFIG.defaultFont, translation = { x: 0, y: 0, z: 0 }): ShapeRef {
    const id = this.nextId++;
    const shape = new TextShape(
      id,
      text,
      font,
      new THREE.Vector3(translation.x, translation.y, translation.z),
    );
    this.drawables.set(id, shape);
    this.addToThree(shape.getObject3D());
    return new ShapeRef(this, id);
  }

  Image(image: HTMLImageElement | ImageBitmap, translation = { x: 0, y: 0, z: 0 }): ShapeRef {
    const id = this.nextId++;
    const shape = new ImageShape(
      id,
      image,
      new THREE.Vector3(translation.x, translation.y, translation.z),
    );
    this.drawables.set(id, shape);
    this.addToThree(shape.getObject3D());
    return new ShapeRef(this, id);
  }

  // Direct property setters
  translate(id: number, x: number, y: number, z = 0): void {
    const d = this.drawables.get(id);
    if (d) d.getObject3D().position.set(x, y, z);
  }

  scale(id: number, sx: number, sy = sx, sz = 1): void {
    const d = this.drawables.get(id);
    if (d) d.getObject3D().scale.set(sx, sy, sz);
  }

  rotate(id: number, angle: number): void {
    const d = this.drawables.get(id);
    if (d) d.getObject3D().rotation.z = angle;
  }

  strokeColor(id: number, color: THREE.Color): void {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) {
      d.setStrokeColor(color);
    } else if (d instanceof TextShape) {
      d.setStrokeColor(color);
    }
  }

  fillColor(id: number, color: THREE.Color | null): void {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) {
      d.setFillColor(color);
    } else if (d instanceof TextShape) {
      d.setFillColor(color);
    }
  }

  opacity(id: number, value: number): void {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) {
      d.setOpacity(value);
    } else if (d instanceof TextShape) {
      d.setOpacity(value);
    } else if (d instanceof ImageShape) {
      d.setOpacity(value);
    }
  }

  font(id: number, fontString: string): void {
    const d = this.drawables.get(id);
    if (d instanceof TextShape) d.font = fontString;
  }

  lineWidth(id: number, width: number): void {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) d.setLineWidth(width);
  }

  // Keyframe animations (return Promises)
  async translateKeyframes(
    id: number,
    keyframes: Keyframe<THREE.Vector3>[],
    duration: number,
  ): Promise<ShapeRef> {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) {
      return d.setTranslationKeyframes(keyframes, duration, this.currentEffectiveTime()).then(() => new ShapeRef(this, id));
    }
    return Promise.reject(new Error("Shape does not support translation keyframes"));
  }

  async scaleKeyframes(
    id: number,
    keyframes: Keyframe<THREE.Vector3>[],
    duration: number,
  ): Promise<ShapeRef> {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) {
      return d.setScaleKeyframes(keyframes, duration, this.currentEffectiveTime()).then(() => new ShapeRef(this, id));
    }
    return Promise.reject(new Error("Shape does not support scale keyframes"));
  }

  async rotationKeyframes(
    id: number,
    keyframes: Keyframe<number>[],
    duration: number,
  ): Promise<ShapeRef> {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) {
      return d.setRotationKeyframes(keyframes, duration, this.currentEffectiveTime()).then(() => new ShapeRef(this, id));
    }
    return Promise.reject(new Error("Shape does not support rotation keyframes"));
  }

  async strokeColorKeyframes(
    id: number,
    keyframes: Keyframe<THREE.Color>[],
    duration: number,
  ): Promise<ShapeRef> {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) {
      return d.setStrokeColorKeyframes(keyframes, duration, this.currentEffectiveTime()).then(() => new ShapeRef(this, id));
    }
    return Promise.reject(new Error("Shape does not support stroke color keyframes"));
  }

  async fillColorKeyframes(
    id: number,
    keyframes: Keyframe<THREE.Color>[],
    duration: number,
  ): Promise<ShapeRef> {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) {
      return d.setFillColorKeyframes(keyframes, duration, this.currentEffectiveTime()).then(() => new ShapeRef(this, id));
    }
    return Promise.reject(new Error("Shape does not support fill color keyframes"));
  }

  async opacityKeyframes(
    id: number,
    keyframes: Keyframe<number>[],
    duration: number,
  ): Promise<ShapeRef> {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) {
      return d.setOpacityKeyframes(keyframes, duration, this.currentEffectiveTime()).then(() => new ShapeRef(this, id));
    }
    return Promise.reject(new Error("Shape does not support opacity keyframes"));
  }

  async drawProgressKeyframes(
    id: number,
    keyframes: Keyframe<number>[],
    duration: number,
  ): Promise<ShapeRef> {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) {
      return d.setDrawProgressKeyframes(keyframes, duration, this.currentEffectiveTime()).then(() => new ShapeRef(this, id));
    }
    return Promise.reject(new Error("Shape does not support draw progress keyframes"));
  }

  // Morph
  morph(id1: number, id2: number, duration = 2000): Promise<void> {
    const shape1 = this.drawables.get(id1);
    const shape2 = this.drawables.get(id2);
    if (!(shape1 instanceof BaseShape) || !(shape2 instanceof BaseShape)) {
      throw new Error("Both shapes must be BaseShape for morphing");
    }
    const morphId = this.nextId++;
    const morph = new MorphShape(morphId, this, shape1, shape2, duration, this.currentEffectiveTime());
    this.drawables.set(morphId, morph);
    this.addToThree(morph.getObject3D());
    return morph.getCompletionPromise();
  }

  // Removal
  remove(id: number): void {
    this.removalSet.add(id);
  }

  markForRemoval(id: number): void {
    this.removalSet.add(id);
  }

  // Pause / Resume (accumulates)
  pause(seconds: number): this {
    const now = performance.now();
    if (this.pauseStartReal !== null) {
      // Already paused: extend the pause duration
      const elapsed = now - this.pauseStartReal;
      if (elapsed < this.pauseDuration!) {
        const remaining = this.pauseDuration! - elapsed;
        this.pauseDuration = remaining + seconds * 1000;
        this.pauseStartReal = now; // reset start to now
      } else {
        // The previous pause already ended? This shouldn't happen if we clear pause correctly.
        this.pauseStartReal = null;
        this.pauseDuration = null;
        this.totalPausedTime += elapsed;
      }
    } else {
      this.pauseStartReal = now;
      this.pauseDuration = seconds * 1000;
    }
    return this;
  }

  async wait(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  // Recording
  startRecording(options: { fps?: number; duration?: number; mimeType?: string } = {}): void {
    if (this.mediaRecorder) return;
    const fps = options.fps ?? 30;
    const mimeType = options.mimeType ?? "video/webm;codecs=vp9";
    const actualMimeType = MediaRecorder.isTypeSupported(mimeType) ? mimeType : "video/webm";
    const stream = this.renderer.domElement.captureStream(fps);
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: actualMimeType });
    this.recordedChunks = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recording-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      this.mediaRecorder = null;
      this.recordedChunks = [];
      if (this.recordingTimeout) {
        clearTimeout(this.recordingTimeout);
        this.recordingTimeout = null;
      }
    };
    this.mediaRecorder.start();
    if (options.duration) {
      this.recordingTimeout = window.setTimeout(() => this.stopRecording(), options.duration * 1000);
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
  }

  // Update and Render
  update(now: number): void {
    if (this.pauseStartReal !== null) {
      const elapsedPause = now - this.pauseStartReal;
      if (elapsedPause < this.pauseDuration!) {
        // Still paused: skip updates
        return;
      } else {
        // Pause finished
        const actualPause = Math.min(elapsedPause, this.pauseDuration!);
        this.totalPausedTime += actualPause;
        this.pauseStartReal = null;
        this.pauseDuration = null;
      }
    }
    const effectiveNow = now - this.totalPausedTime;
    for (const d of this.drawables.values()) d.update(effectiveNow);
    for (const id of this.removalSet) {
      const d = this.drawables.get(id);
      if (d) {
        d.dispose();
        this.removeFromThree(d.getObject3D());
        this.drawables.delete(id);
      }
    }
    this.removalSet.clear();
  }

  render(): void {
    this.renderer.render((window as any).scene, this.camera);
    this.labelRenderer.render((window as any).scene, this.camera);
  }

  clear(): void {
    for (const d of this.drawables.values()) {
      d.dispose();
      this.removeFromThree(d.getObject3D());
    }
    this.drawables.clear();
    this.removalSet.clear();
    this.nextId = 0;
  }
}

// ========== Shape Reference (Fluent API with Consistent Promises) ==========
class ShapeRef {
  private scene: Scene;
  private id: number;

  constructor(scene: Scene, id: number) {
    this.scene = scene;
    this.id = id;
  }

  // Translation
  translate(x: number, y: number, z?: number): ShapeRef;
  translate(x: number, y: number, z: number, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  translate(x: number, y: number, z: number = 0, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape) {
        const current = shape.getObject3D().position.clone();
        const keyframes: Keyframe<THREE.Vector3>[] = [
          { time: 0, value: current },
          { time: 1, value: new THREE.Vector3(x, y, z), easing },
        ];
        return this.scene.translateKeyframes(this.id, keyframes, duration);
      } else {
        return Promise.reject(new Error("Shape does not support translation animation"));
      }
    } else {
      this.scene.translate(this.id, x, y, z);
      return this;
    }
  }

  // Scale
  scale(sx: number, sy?: number, sz?: number): ShapeRef;
  scale(sx: number, sy: number, sz: number, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  scale(sx: number, sy: number = sx, sz: number = 1, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape) {
        const current = shape.getObject3D().scale.clone();
        const keyframes: Keyframe<THREE.Vector3>[] = [
          { time: 0, value: current },
          { time: 1, value: new THREE.Vector3(sx, sy, sz), easing },
        ];
        return this.scene.scaleKeyframes(this.id, keyframes, duration);
      } else {
        return Promise.reject(new Error("Shape does not support scale animation"));
      }
    } else {
      this.scene.scale(this.id, sx, sy, sz);
      return this;
    }
  }

  // Rotation (2D around Z)
  rotate(angle: number): ShapeRef;
  rotate(angle: number, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  rotate(angle: number, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape) {
        const current = shape.getObject3D().rotation.z;
        const keyframes: Keyframe<number>[] = [
          { time: 0, value: current },
          { time: 1, value: angle, easing },
        ];
        return this.scene.rotationKeyframes(this.id, keyframes, duration);
      } else {
        return Promise.reject(new Error("Shape does not support rotation animation"));
      }
    } else {
      this.scene.rotate(this.id, angle);
      return this;
    }
  }

  // Stroke color
  stroke(color: THREE.Color | string): ShapeRef;
  stroke(color: THREE.Color | string, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  stroke(color: THREE.Color | string, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    const col = typeof color === "string" ? new THREE.Color(color) : color;
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape) {
        const current = shape.getStrokeColor().clone();
        const keyframes: Keyframe<THREE.Color>[] = [
          { time: 0, value: current },
          { time: 1, value: col, easing },
        ];
        return this.scene.strokeColorKeyframes(this.id, keyframes, duration);
      } else if (shape instanceof TextShape) {
        // TextShape doesn't support animation; reject
        return Promise.reject(new Error("TextShape does not support stroke color animation"));
      } else {
        return Promise.reject(new Error("Shape does not support stroke color animation"));
      }
    } else {
      this.scene.strokeColor(this.id, col);
      return this;
    }
  }

  // Fill color
  fill(color: THREE.Color | string | null): ShapeRef;
  fill(color: THREE.Color | string | null, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  fill(color: THREE.Color | string | null, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    if (color === null) {
      this.scene.fillColor(this.id, null);
      return this;
    }
    const col = typeof color === "string" ? new THREE.Color(color) : color;
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape) {
        const current = shape.getFillColor() || new THREE.Color(0, 0, 0);
        const keyframes: Keyframe<THREE.Color>[] = [
          { time: 0, value: current },
          { time: 1, value: col, easing },
        ];
        return this.scene.fillColorKeyframes(this.id, keyframes, duration);
      } else if (shape instanceof TextShape) {
        return Promise.reject(new Error("TextShape does not support fill color animation"));
      } else {
        return Promise.reject(new Error("Shape does not support fill color animation"));
      }
    } else {
      this.scene.fillColor(this.id, col);
      return this;
    }
  }

  // Opacity
  opacity(value: number): ShapeRef;
  opacity(value: number, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  opacity(value: number, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    if (duration > 0) {
      const shape = this.scene.getShape(this.id);
      if (shape instanceof BaseShape) {
        const current = shape.getOpacity();
        const keyframes: Keyframe<number>[] = [
          { time: 0, value: current },
          { time: 1, value, easing },
        ];
        return this.scene.opacityKeyframes(this.id, keyframes, duration);
      } else if (shape instanceof TextShape) {
        return Promise.reject(new Error("TextShape does not support opacity animation"));
      } else if (shape instanceof ImageShape) {
        return Promise.reject(new Error("ImageShape does not support opacity animation"));
      } else {
        return Promise.reject(new Error("Shape does not support opacity animation"));
      }
    } else {
      this.scene.opacity(this.id, value);
      return this;
    }
  }

  // Draw animation (only for BaseShape)
  draw(duration: number = 2000, easing: EasingFunction | string = "linear"): Promise<ShapeRef> {
    const shape = this.scene.getShape(this.id);
    if (shape instanceof BaseShape) {
      const keyframes: Keyframe<number>[] = [
        { time: 0, value: 0 },
        { time: 1, value: 1, easing },
      ];
      return this.scene.drawProgressKeyframes(this.id, keyframes, duration);
    } else {
      return Promise.reject(new Error("Shape does not support draw animation"));
    }
  }

  // Keyframes (synchronous – sets keyframes without waiting)
  keyframes(config: any, duration: number): this {
    const shape = this.scene.getShape(this.id);
    if (!shape || !(shape instanceof BaseShape)) return this;
    const effectiveNow = this.scene.currentEffectiveTime();
    if (config.translation) {
      const keyframes = config.translation.map((kf: any) => ({
        time: kf.time,
        value: new THREE.Vector3(kf.value.x, kf.value.y, kf.value.z ?? 0),
        easing: kf.easing,
      }));
      shape.setTranslationKeyframes(keyframes, duration, effectiveNow);
    }
    if (config.scale) {
      const keyframes = config.scale.map((kf: any) => ({
        time: kf.time,
        value: new THREE.Vector3(kf.value.x, kf.value.y, kf.value.z ?? 1),
        easing: kf.easing,
      }));
      shape.setScaleKeyframes(keyframes, duration, effectiveNow);
    }
    if (config.rotation) {
      const keyframes = config.rotation.map((kf: any) => ({
        time: kf.time,
        value: kf.value,
        easing: kf.easing,
      }));
      shape.setRotationKeyframes(keyframes, duration, effectiveNow);
    }
    if (config.strokeColor) {
      const keyframes = config.strokeColor.map((kf: any) => ({
        time: kf.time,
        value: typeof kf.value === "string" ? new THREE.Color(kf.value) : kf.value,
        easing: kf.easing,
      }));
      shape.setStrokeColorKeyframes(keyframes, duration, effectiveNow);
    }
    if (config.fillColor) {
      const keyframes = config.fillColor.map((kf: any) => ({
        time: kf.time,
        value: kf.value === null ? new THREE.Color(0, 0, 0) : (typeof kf.value === "string" ? new THREE.Color(kf.value) : kf.value),
        easing: kf.easing,
      }));
      shape.setFillColorKeyframes(keyframes, duration, effectiveNow);
    }
    if (config.opacity) {
      const keyframes = config.opacity.map((kf: any) => ({
        time: kf.time,
        value: kf.value,
        easing: kf.easing,
      }));
      shape.setOpacityKeyframes(keyframes, duration, effectiveNow);
    }
    if (config.drawProgress) {
      const keyframes = config.drawProgress.map((kf: any) => ({
        time: kf.time,
        value: kf.value,
        easing: kf.easing,
      }));
      shape.setDrawProgressKeyframes(keyframes, duration, effectiveNow);
    }
    return this;
  }

  // Miscellaneous setters
  font(fontString: string): this {
    this.scene.font(this.id, fontString);
    return this;
  }
  lineWidth(width: number): this {
    this.scene.lineWidth(this.id, width);
    return this;
  }

  // Morph
  morph(other: ShapeRef, duration = 2000): Promise<void> {
    return this.scene.morph(this.id, other.id, duration);
  }

  // Removal
  remove(): void {
    this.scene.remove(this.id);
  }
}

// ========== 3D Grid and Axes ==========
function create3DGrid(scene: THREE.Scene): void {
  const gridHelper = new THREE.GridHelper(CONFIG.scaleX * 2, 20, 0x888888, 0x444444);
  gridHelper.position.y = -CONFIG.scaleY / 2;
  scene.add(gridHelper);

  const axesHelper = new THREE.AxesHelper(CONFIG.scaleX);
  scene.add(axesHelper);

  const makeLabel = (text: string, color: string, position: THREE.Vector3) => {
    const div = document.createElement("div");
    div.textContent = text;
    div.style.color = color;
    div.style.fontSize = "14px";
    div.style.fontWeight = "bold";
    const label = new CSS2DObject(div);
    label.position.copy(position);
    scene.add(label);
  };
  makeLabel("X", "red", new THREE.Vector3(CONFIG.scaleX + 0.5, 0, 0));
  makeLabel("Y", "green", new THREE.Vector3(0, CONFIG.scaleY + 0.5, 0));
  makeLabel("Z", "blue", new THREE.Vector3(0, 0, CONFIG.scaleZ + 0.5));

  const tickStyle = { color: "#aaa", fontSize: "10px" };
  for (let i = -CONFIG.scaleX; i <= CONFIG.scaleX; i++) {
    if (i === 0) continue;
    const div = document.createElement("div");
    div.textContent = i.toString();
    div.style.cssText = `color: ${tickStyle.color}; font-size: ${tickStyle.fontSize};`;
    const label = new CSS2DObject(div);
    label.position.set(i, -0.2, -0.2);
    scene.add(label);
  }
  for (let i = -CONFIG.scaleY; i <= CONFIG.scaleY; i++) {
    if (i === 0) continue;
    const div = document.createElement("div");
    div.textContent = i.toString();
    div.style.cssText = `color: ${tickStyle.color}; font-size: ${tickStyle.fontSize};`;
    const label = new CSS2DObject(div);
    label.position.set(-0.2, i, -0.2);
    scene.add(label);
  }
  for (let i = -CONFIG.scaleZ; i <= CONFIG.scaleZ; i++) {
    if (i === 0) continue;
    const div = document.createElement("div");
    div.textContent = i.toString();
    div.style.cssText = `color: ${tickStyle.color}; font-size: ${tickStyle.fontSize};`;
    const label = new CSS2DObject(div);
    label.position.set(-0.2, -0.2, i);
    scene.add(label);
  }
}

// ========== Main Execution ==========
const canvas = document.getElementById("box") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000);

const sceneObj = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(10, 10, 15);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = true;
controls.enableZoom = true;
controls.enablePan = true;
controls.zoomSpeed = 1.2;
controls.minDistance = 0.2;
controls.panSpeed = 0.8;

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.top = "0px";
labelRenderer.domElement.style.left = "0px";
labelRenderer.domElement.style.pointerEvents = "none";
document.body.appendChild(labelRenderer.domElement);

// Make scene globally accessible for the manager
(window as any).scene = sceneObj;

const jsketchScene = new Scene(renderer, labelRenderer, camera);
(window as any).jsketchScene = jsketchScene;

create3DGrid(sceneObj);

function animate(): void {
  jsketchScene.update(performance.now());
  jsketchScene.render();
  requestAnimationFrame(animate);
}
animate();

window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});

// ========== Test Suite ==========
async function testBasicShapes() {
  console.log("Test 1: Basic shapes creation and properties");
  jsketchScene.clear();

  jsketchScene.Circle(2).translate(-5, 3, 0).stroke("red").fill("red").opacity(0.3);
  jsketchScene.Square(2.5).translate(0, 3, 0).stroke("green").fill("green").opacity(0.3);
  jsketchScene.Line(-4, -2, 4, -2).stroke("cyan").lineWidth(3);
  jsketchScene.RegularPolygon(2, 5).translate(5, 3, 0).stroke("orange").fill("orange").opacity(0.3);
  jsketchScene.Star(2, 1, 5).translate(-5, -3, 0).stroke("yellow").fill("yellow").opacity(0.3);
  const parametric = jsketchScene.ParametricCurve(
    (t) => 3 * Math.cos(2 * Math.PI * t),
    (t) => 3 * Math.sin(2 * Math.PI * t),
    0, 1
  ).stroke("magenta").lineWidth(2);
  parametric.translate(5, -3, 0);

  await jsketchScene.wait(2);
  console.log("Test 1 completed");
}

async function testKeyframeAnimations() {
  console.log("Test 2: Keyframe animations with various easings");
  jsketchScene.clear();

  const shape = jsketchScene.RegularPolygon(2, 6).stroke("white").fill("blue");
  await shape.translate(0, 0, 0, 3, "easeOutBounce");
  await shape.scale(3, 3, 1, 2, "easeInElastic");
  await shape.rotate(Math.PI * 2, 2, "easeOutQuad");
  await shape.opacity(0.2, 2, "easeInSine");

  const keyframes = {
    strokeColor: [
      { time: 0, value: "white" },
      { time: 0.5, value: "red", easing: "easeOutQuad" },
      { time: 1, value: "blue", easing: "linear" }
    ]
  };
  shape.keyframes(keyframes, 2);

  await jsketchScene.wait(2);
  console.log("Test 2 completed");
}

async function testMorphing() {
  console.log("Test 3: Morphing between different shapes");
  jsketchScene.clear();

  const circle = jsketchScene.Circle(2).translate(-4, 0, 0).stroke("red");
  const square = jsketchScene.Square(3).translate(4, 0, 0).stroke("green");
  const star = jsketchScene.Star(2.5, 1, 5).translate(0, 4, 0).stroke("yellow");
  const poly = jsketchScene.RegularPolygon(2, 8).translate(0, -4, 0).stroke("cyan");

  await Promise.all([circle.morph(square), star.morph(poly)]);
  console.log("Morphs completed");

  await jsketchScene.wait(1);
  console.log("Test 3 completed");
}

async function testTextAndImage() {
  console.log("Test 4: Text and Image shapes");
  jsketchScene.clear();

  const text = jsketchScene.Text("Hello 3D!", "24px Arial", { x: -3, y: 2, z: 0 })
    .stroke("lime")
    .fill("green")
    .opacity(0.2);
  const canvas = document.createElement("canvas");
  canvas.width = 100;
  canvas.height = 100;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "purple";
  ctx.fillRect(0, 0, 100, 100);
  ctx.fillStyle = "white";
  ctx.font = "20px Arial";
  ctx.fillText("IMG", 20, 50);
  const img = new Image();
  await new Promise((resolve) => {
    img.onload = resolve;
    img.src = canvas.toDataURL();
  });
  const image = jsketchScene.Image(img, { x: 3, y: -2, z: 0 });
  
  // Text animations will reject – we catch them to avoid test failure
  try {
    await text.stroke("orange", 2, "easeOutQuad");
  } catch (e) { console.log("Text stroke animation rejected (expected)"); }
  try {
    await text.opacity(0.8, 2, "linear");
  } catch (e) { console.log("Text opacity animation rejected (expected)"); }
  
  // Image translation animation is also not supported
  try {
    await image.translate(0, 0, 0, 3, "easeOutBounce");
  } catch (e) { console.log("Image translation animation rejected (expected)"); }

  await jsketchScene.wait(1);
  console.log("Test 4 completed");
}

async function testPauseResume() {
  console.log("Test 5: Pause/Resume functionality");
  jsketchScene.clear();

  const shape = jsketchScene.Circle(2).stroke("white").fill("red");
  const p1 = shape.translate(5, 0, 0, 4, "linear");
  const p2 = shape.scale(2, 2, 1, 4, "linear");

  await jsketchScene.wait(1);
  console.log("Pausing for 2 seconds...");
  jsketchScene.pause(2);
  await jsketchScene.wait(2);
  console.log("Resumed");
  await Promise.all([p1, p2]);
  console.log("Test 5 completed");
}

async function testMultipleAnimationsAndRemoval() {
  console.log("Test 6: Multiple simultaneous animations and removal");
  jsketchScene.clear();

  const shapes = [];
  const promises = [];
  for (let i = -4; i <= 4; i += 2) {
    const shape = jsketchScene.Square(1.5)
      .translate(i, 0, 0)
      .stroke(`hsl(${(i + 4) * 30}, 100%, 50%)`)
      .fill(`hsl(${(i + 4) * 30}, 100%, 50%)`)
      .opacity(0.3);
    const p = Promise.all([
      shape.rotate(Math.PI * 2, 3, "easeOutQuad"),
      shape.scale(1.5, 1.5, 1, 2, "easeInOutSine")
    ]);
    shapes.push(shape);
    promises.push(p);
  }
  await Promise.all(promises);
  console.log("Animations finished");

  await jsketchScene.wait(1);
  for (let i = 0; i < shapes.length; i += 2) shapes[i].remove();
  console.log("Removed every other shape");

  await jsketchScene.wait(2);
  console.log("Test 6 completed");
}

async function testErrorHandling() {
  console.log("Test 7: Error handling (invalid morph)");
  jsketchScene.clear();

  const shape = jsketchScene.Circle(2);
  const text = jsketchScene.Text("Not a shape");
  try {
    await shape.morph(text);
    console.error("Morph should have thrown an error!");
  } catch (e: any) {
    console.log("Caught expected error:", e.message);
  }
  await jsketchScene.wait(1);
  console.log("Test 7 completed");
}

async function testDrawAnimation() {
  console.log("Test 8: Draw animation");
  jsketchScene.clear();

  await Promise.all([
    jsketchScene.Circle(2).stroke("red").draw(),
    jsketchScene.Square(2.5).stroke("green").translate(4, 2, 0).draw(2000, "easeOutQuad"),
    jsketchScene.Line(-3, -2, 3, -2).stroke("cyan").draw(1500),
    jsketchScene.Star(2, 1, 5).stroke("yellow").translate(-3, -2, 0).draw(3000, "easeOutElastic")
  ]);
  console.log("All draw animations finished");

  await jsketchScene.wait(1);
  console.log("Test 8 completed");
}

(window as any).runAllTests = async function () {
  console.log("Starting comprehensive test suite...");
  await testBasicShapes();
  await testKeyframeAnimations();
  await testMorphing();
  await testTextAndImage();
  await testPauseResume();
  await testMultipleAnimationsAndRemoval();
  await testErrorHandling();
  await testDrawAnimation();
  console.log("All tests completed.");
};
