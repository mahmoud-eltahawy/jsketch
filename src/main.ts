import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { Recorder, RecorderStatus } from "canvas-record";

// ========== Configuration ==========
const CONFIG = {
  scaleX: 10,
  scaleY: 10,
  scaleZ: 10,
  gridStep: 1,
  defaultLineWidth: 2,
  defaultFont: "14px sans-serif",
};

const NUM_VERTICES = 400;

// ========== Easing Functions ==========
type EasingFunction = (t: number) => number;

const easePower = (power: number) => (t: number) => Math.pow(t, power);
const easeOut = (fn: EasingFunction) => (t: number) => 1 - fn(1 - t);
const easeInOut = (fn: EasingFunction) => (t: number) =>
  t < 0.5 ? fn(t * 2) / 2 : 1 - fn(2 - 2 * t) / 2;

const EASINGS: Record<string, EasingFunction> = {
  linear: (t) => t,
  easeInQuad: easePower(2),
  easeOutQuad: easeOut(easePower(2)),
  easeInOutQuad: easeInOut(easePower(2)),
  easeInCubic: easePower(3),
  easeOutCubic: easeOut(easePower(3)),
  easeInOutCubic: easeInOut(easePower(3)),
  easeInQuart: easePower(4),
  easeOutQuart: easeOut(easePower(4)),
  easeInOutQuart: easeInOut(easePower(4)),
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

  dispose(): void {}
}

// ========== Shape Base ==========
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
  public getVertices(): THREE.Vector3[] { return this.vertices; }
  public getStrokeColor(): THREE.Color { return this.strokeColor; }
  public getFillColor(): THREE.Color | null { return this.fillColor; }
  public getOpacity(): number { return this.opacity; }
  public getLineWidth(): number { return this.lineWidth; }
  public getClosed(): boolean { return this.closed; }
  public getDrawProgress(): number { return this._drawProgress; }
  public setDrawProgress(progress: number): void {
    this._drawProgress = Math.max(0, Math.min(1, progress));
    this.rebuildGeometry();
  }
  public getGroup(): THREE.Group { return this.group; }

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
    this.disposeFillMesh();
    this.disposeStrokeLines();

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

  private async _startAnimation<K extends keyof KeyframeAnimations>(
    type: K,
    setKeyframes: () => void,
  ): Promise<this> {
    if (this.animationPromises[type]) {
      this.animationPromises[type]!.resolve();
      delete this.animationPromises[type];
    }
    let resolve: () => void;
    const promise = new Promise<void>((res) => {
      resolve = res;
    });
    this.animationPromises[type] = { promise, resolve: resolve! };
    setKeyframes();
    return promise.then(() => this);
  }

  setTranslationKeyframes(
    keyframes: Keyframe<THREE.Vector3>[],
    duration: number,
    startTime: number,
  ): Promise<this> {
    return this._startAnimation("translation", () => {
      this.keyframes.translation = new KeyframeAnimation(keyframes, duration, startTime);
    });
  }

  setScaleKeyframes(
    keyframes: Keyframe<THREE.Vector3>[],
    duration: number,
    startTime: number,
  ): Promise<this> {
    return this._startAnimation("scale", () => {
      this.keyframes.scale = new KeyframeAnimation(keyframes, duration, startTime);
    });
  }

  setRotationKeyframes(
    keyframes: Keyframe<number>[],
    duration: number,
    startTime: number,
  ): Promise<this> {
    return this._startAnimation("rotation", () => {
      this.keyframes.rotation = new KeyframeAnimation(keyframes, duration, startTime);
    });
  }

  setStrokeColorKeyframes(
    keyframes: Keyframe<THREE.Color>[],
    duration: number,
    startTime: number,
  ): Promise<this> {
    return this._startAnimation("strokeColor", () => {
      this.keyframes.strokeColor = new KeyframeAnimation(keyframes, duration, startTime);
    });
  }

  setFillColorKeyframes(
    keyframes: Keyframe<THREE.Color>[],
    duration: number,
    startTime: number,
  ): Promise<this> {
    return this._startAnimation("fillColor", () => {
      this.keyframes.fillColor = new KeyframeAnimation(keyframes, duration, startTime);
    });
  }

  setOpacityKeyframes(
    keyframes: Keyframe<number>[],
    duration: number,
    startTime: number,
  ): Promise<this> {
    return this._startAnimation("opacity", () => {
      this.keyframes.opacity = new KeyframeAnimation(keyframes, duration, startTime);
    });
  }

  setDrawProgressKeyframes(
    keyframes: Keyframe<number>[],
    duration: number,
    startTime: number,
  ): Promise<this> {
    return this._startAnimation("drawProgress", () => {
      this.keyframes.drawProgress = new KeyframeAnimation(keyframes, duration, startTime);
    });
  }

  private updateAnimations(now: number): void {
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
    this.group.clear();
    for (const key in this.animationPromises) {
      this.animationPromises[key as keyof KeyframeAnimations]?.resolve();
    }
  }
}

// ========== Generic Shape ==========
class GenericShape extends BaseShape {
  constructor(
    id: number,
    vertexGen: (t: number) => THREE.Vector3,
    closed: boolean,
    translation?: THREE.Vector3,
    scale?: THREE.Vector3,
    rotation?: number,
  ) {
    const vertices = Array.from({ length: NUM_VERTICES }, (_, i) => vertexGen(i / (NUM_VERTICES - 1)));
    super(id, vertices, CONFIG.defaultLineWidth, closed, translation, scale, rotation);
  }
}

// ========== CSS2D Shape ==========
class CSS2DShape extends Drawable {
  private element: HTMLElement;
  private label: CSS2DObject;
  private _strokeColor: THREE.Color;
  private _fillColor: THREE.Color | null;
  private _opacity: number;

  constructor(
    id: number,
    content: string | HTMLImageElement,
    translation: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
    font: string = CONFIG.defaultFont,
  ) {
    const div = document.createElement("div");
    div.style.color = "white";
    div.style.font = font;
    div.style.background = "transparent";
    div.style.padding = "2px";

    if (typeof content === "string") {
      div.textContent = content;
    } else {
      const img = document.createElement("img");
      img.src = (content as HTMLImageElement).src;
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
      div.appendChild(img);
    }

    const label = new CSS2DObject(div);
    label.position.copy(translation);
    super(id, label);
    this.label = label;
    this.element = div;
    this._strokeColor = new THREE.Color(1, 1, 1);
    this._fillColor = null;
    this._opacity = 1;
  }

  get text(): string {
    if (this.element.firstChild && this.element.firstChild.nodeType === Node.TEXT_NODE) {
      return this.element.textContent || "";
    }
    return "";
  }
  set text(t: string) {
    this.clearContent();
    this.element.textContent = t;
  }

  get image(): HTMLImageElement | null {
    const img = this.element.querySelector("img");
    return img || null;
  }
  set image(img: HTMLImageElement) {
    this.clearContent();
    const newImg = document.createElement("img");
    newImg.src = img.src;
    newImg.style.maxWidth = "100%";
    newImg.style.maxHeight = "100%";
    this.element.appendChild(newImg);
  }

  private clearContent() {
    while (this.element.firstChild) {
      this.element.removeChild(this.element.firstChild);
    }
  }

  get font(): string {
    return this.element.style.font;
  }
  set font(f: string) {
    this.element.style.font = f;
  }

  public setStrokeColor(color: THREE.Color): void {
    this._strokeColor.copy(color);
    this.element.style.color = color.getStyle();
  }

  public getStrokeColor(): THREE.Color {
    return this._strokeColor;
  }

  public setFillColor(color: THREE.Color | null): void {
    this._fillColor = color ? color.clone() : null;
    this.element.style.background = color ? color.getStyle() : "transparent";
  }

  public getFillColor(): THREE.Color | null {
    return this._fillColor;
  }

  public setOpacity(opacity: number): void {
    this._opacity = opacity;
    this.element.style.opacity = opacity.toString();
  }

  public getOpacity(): number {
    return this._opacity;
  }

  update(_now: number): void {}

  dispose(): void {
    this.label.removeFromParent();
  }
}

// ========== Morphing Shape ==========
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
  private resampled1: THREE.Vector3[];
  private resampled2: THREE.Vector3[];
  private count: number;

  constructor(
    id: number,
    scene: Scene,
    shape1: BaseShape,
    shape2: BaseShape,
    duration: number,
    startTime: number,
  ) {
    const group = new THREE.Group();
    super(id, group);

    this.shape1 = shape1;
    this.shape2 = shape2;
    this.duration = duration;
    this.startTime = startTime;
    this.sceneRef = scene;

    const count = Math.max(shape1.getVertices().length, shape2.getVertices().length);
    this.count = count;
    this.resampled1 = resamplePolyline(shape1.getVertices(), shape1.getClosed(), count);
    this.resampled2 = resamplePolyline(shape2.getVertices(), shape2.getClosed(), count);

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

    for (let i = 0; i < this.count; i++) {
      const x = lerp(this.resampled1[i].x, this.resampled2[i].x, t);
      const y = lerp(this.resampled1[i].y, this.resampled2[i].y, t);
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = 0;
    }
    this.geometry.attributes.position.needsUpdate = true;

    this.line.position.copy(this.shape1.getGroup().position).lerp(this.shape2.getGroup().position, t);
    this.line.scale.copy(this.shape1.getGroup().scale).lerp(this.shape2.getGroup().scale, t);
    this.line.rotation.z = lerp(this.shape1.getGroup().rotation.z, this.shape2.getGroup().rotation.z, t);

    const col = this.shape1.getStrokeColor().clone().lerp(this.shape2.getStrokeColor(), t);
    this.material.color.copy(col);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ========== Polyline Resampling ==========
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

  private canvasRecorder: Recorder | null = null;
  private recordingTimeout: number | null = null;

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

  private _createShape(vertexGen: (t: number) => THREE.Vector3, closed: boolean): ShapeRef {
    const id = this.nextId++;
    const shape = new GenericShape(id, vertexGen, closed);
    this.drawables.set(id, shape);
    this.addToThree(shape.getObject3D());
    return new ShapeRef(this, id);
  }

  Circle(radius: number): ShapeRef {
    return this._createShape((t) => {
      const angle = t * 2 * Math.PI;
      return new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), 0);
    }, true);
  }

  Square(sideLength: number): ShapeRef {
    const half = sideLength / 2;
    const corners = [
      new THREE.Vector3(-half, -half, 0),
      new THREE.Vector3(half, -half, 0),
      new THREE.Vector3(half, half, 0),
      new THREE.Vector3(-half, half, 0),
    ];
    const perimeter: { start: THREE.Vector3; end: THREE.Vector3; len: number }[] = [];
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      perimeter.push({ start: a, end: b, len: a.distanceTo(b) });
    }
    const totalLen = perimeter.reduce((sum, seg) => sum + seg.len, 0);

    return this._createShape((t) => {
      const target = t * totalLen;
      let accum = 0;
      for (const seg of perimeter) {
        if (target <= accum + seg.len) {
          const u = (target - accum) / seg.len;
          return seg.start.clone().lerp(seg.end, u);
        }
        accum += seg.len;
      }
      return corners[0].clone();
    }, true);
  }

  Line(startX: number, startY: number, endX: number, endY: number): ShapeRef {
    return this._createShape((t) => {
      const x = lerp(startX, endX, t);
      const y = lerp(startY, endY, t);
      return new THREE.Vector3(x, y, 0);
    }, false);
  }

  RegularPolygon(radius: number, sides: number): ShapeRef {
    const corners: THREE.Vector3[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * 2 * Math.PI;
      corners.push(new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), 0));
    }
    const perimeter: { start: THREE.Vector3; end: THREE.Vector3; len: number }[] = [];
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      perimeter.push({ start: a, end: b, len: a.distanceTo(b) });
    }
    const totalLen = perimeter.reduce((sum, seg) => sum + seg.len, 0);

    return this._createShape((t) => {
      const target = t * totalLen;
      let accum = 0;
      for (const seg of perimeter) {
        if (target <= accum + seg.len) {
          const u = (target - accum) / seg.len;
          return seg.start.clone().lerp(seg.end, u);
        }
        accum += seg.len;
      }
      return corners[0].clone();
    }, true);
  }

  Star(outerRadius: number, innerRadius: number, points: number): ShapeRef {
    return this._createShape((t) => {
      const angle = t * 2 * Math.PI;
      const sector = Math.floor(angle / (Math.PI / points));
      const r = sector % 2 === 0 ? outerRadius : innerRadius;
      return new THREE.Vector3(r * Math.cos(angle), r * Math.sin(angle), 0);
    }, true);
  }

  ParametricCurve(
    fx: (t: number) => number,
    fy: (t: number) => number,
    tMin = 0,
    tMax = 1,
  ): ShapeRef {
    return this._createShape((u) => {
      const t = tMin + u * (tMax - tMin);
      return new THREE.Vector3(fx(t), fy(t), 0);
    }, false);
  }

  Text(text: string, font: string = CONFIG.defaultFont, translation = { x: 0, y: 0, z: 0 }): ShapeRef {
    const id = this.nextId++;
    const shape = new CSS2DShape(id, text, new THREE.Vector3(translation.x, translation.y, translation.z), font);
    this.drawables.set(id, shape);
    this.addToThree(shape.getObject3D());
    return new ShapeRef(this, id);
  }

  Image(image: HTMLImageElement | ImageBitmap, translation = { x: 0, y: 0, z: 0 }): ShapeRef {
    let img: HTMLImageElement;
    if (image instanceof ImageBitmap) {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      img = new Image();
      img.src = canvas.toDataURL();
    } else {
      img = image;
    }
    const id = this.nextId++;
    const shape = new CSS2DShape(id, img, new THREE.Vector3(translation.x, translation.y, translation.z));
    this.drawables.set(id, shape);
    this.addToThree(shape.getObject3D());
    return new ShapeRef(this, id);
  }

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
    } else if (d instanceof CSS2DShape) {
      d.setStrokeColor(color);
    }
  }

  fillColor(id: number, color: THREE.Color | null): void {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) {
      d.setFillColor(color);
    } else if (d instanceof CSS2DShape) {
      d.setFillColor(color);
    }
  }

  opacity(id: number, value: number): void {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) {
      d.setOpacity(value);
    } else if (d instanceof CSS2DShape) {
      d.setOpacity(value);
    }
  }

  font(id: number, fontString: string): void {
    const d = this.drawables.get(id);
    if (d instanceof CSS2DShape) d.font = fontString;
  }

  lineWidth(id: number, width: number): void {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) d.setLineWidth(width);
  }

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

  remove(id: number): void {
    this.removalSet.add(id);
  }

  markForRemoval(id: number): void {
    this.removalSet.add(id);
  }

  pause(seconds: number): this {
    const now = performance.now();
    if (this.pauseStartReal !== null) {
      const elapsed = now - this.pauseStartReal;
      if (elapsed < this.pauseDuration!) {
        const remaining = this.pauseDuration! - elapsed;
        this.pauseDuration = remaining + seconds * 1000;
        this.pauseStartReal = now;
      } else {
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

  startRecording(options: { fps?: number; duration?: number; mimeType?: string; bitrate?: number } = {}): void {
    if (this.canvasRecorder) return;

    const fps = options.fps ?? 60;
    const duration = options.duration ?? Infinity;
    const bitrate = options.bitrate ?? 10_000_000;

    const gl = this.renderer.getContext() as WebGLRenderingContext | WebGL2RenderingContext;
    if (!gl) {
      console.error("No WebGL context found");
      return;
    }

    const mimeType = options.mimeType ?? "video/mp4";
    let extension = "mp4";
    if (mimeType.includes("webm")) extension = "webm";
    if (mimeType.includes("gif")) extension = "gif";

    this.canvasRecorder = new Recorder(gl, {
      name: "jsketch-recording",
      duration,
      frameRate: fps,
      download: true,
      extension,
      encoderOptions: {
        bitrate,
        // bitrateMode: "variable", // optional; some encoders may not support it
      },
      onStatusChange: (status) => {
        if (status === RecorderStatus.Stopped) {
          this.canvasRecorder = null;
          if (this.recordingTimeout) clearTimeout(this.recordingTimeout);
        }
      },
    });

    this.canvasRecorder.start();

    if (options.duration && options.duration > 0) {
      this.recordingTimeout = window.setTimeout(() => {
        this.stopRecording();
      }, options.duration * 1000);
    }
  }

  stopRecording(): void {
    if (!this.canvasRecorder) return;

    try {
      this.canvasRecorder.stop();
    } catch (err: any) {
      console.error("Recording failed:", err);
    } finally {
      this.canvasRecorder = null;
      if (this.recordingTimeout) {
        clearTimeout(this.recordingTimeout);
        this.recordingTimeout = null;
      }
    }
  }

  update(now: number): void {
    if (this.pauseStartReal !== null) {
      const elapsedPause = now - this.pauseStartReal;
      if (elapsedPause < this.pauseDuration!) {
        return;
      } else {
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

    if (this.canvasRecorder && this.canvasRecorder.status === RecorderStatus.Recording) {
      this.canvasRecorder.step();
    }
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

// ========== Shape Reference ==========
class ShapeRef {
  private scene: Scene;
  private id: number;

  constructor(scene: Scene, id: number) {
    this.scene = scene;
    this.id = id;
  }

  private _animateOrSet<T>(
    immediateSetter: (val: T) => void,
    value: T,
    duration: number,
    easing: EasingFunction | string,
    animMethod: (keyframes: Keyframe<T>[], duration: number) => Promise<ShapeRef>,
    getCurrent: () => T,
    transform?: (val: T) => any
  ): ShapeRef | Promise<ShapeRef> {
    if (duration > 0) {
      const current = getCurrent();
      const keyframes: Keyframe<T>[] = [
        { time: 0, value: current },
        { time: 1, value: transform ? transform(value) : value, easing },
      ];
      return animMethod(keyframes, duration);
    } else {
      immediateSetter(value);
      return this;
    }
  }

  translate(x: number, y: number, z?: number): ShapeRef;
  translate(x: number, y: number, z: number, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  translate(x: number, y: number, z: number = 0, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    const shape = this.scene.getShape(this.id);
    if (!(shape instanceof BaseShape) && !(shape instanceof CSS2DShape)) {
      return Promise.reject(new Error("Shape does not support translation animation"));
    }
    const target = new THREE.Vector3(x, y, z);
    return this._animateOrSet(
      (val: THREE.Vector3) => this.scene.translate(this.id, val.x, val.y, val.z),
      target,
      duration,
      easing,
      (kf, dur) => this.scene.translateKeyframes(this.id, kf, dur),
      () => shape!.getObject3D().position.clone()
    );
  }

  scale(sx: number, sy?: number, sz?: number): ShapeRef;
  scale(sx: number, sy: number, sz: number, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  scale(sx: number, sy: number = sx, sz: number = 1, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    const shape = this.scene.getShape(this.id);
    if (!(shape instanceof BaseShape) && !(shape instanceof CSS2DShape)) {
      return Promise.reject(new Error("Shape does not support scale animation"));
    }
    const target = new THREE.Vector3(sx, sy, sz);
    return this._animateOrSet(
      (val: THREE.Vector3) => this.scene.scale(this.id, val.x, val.y, val.z),
      target,
      duration,
      easing,
      (kf, dur) => this.scene.scaleKeyframes(this.id, kf, dur),
      () => shape!.getObject3D().scale.clone()
    );
  }

  rotate(angle: number): ShapeRef;
  rotate(angle: number, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  rotate(angle: number, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    const shape = this.scene.getShape(this.id);
    if (!(shape instanceof BaseShape) && !(shape instanceof CSS2DShape)) {
      return Promise.reject(new Error("Shape does not support rotation animation"));
    }
    return this._animateOrSet(
      (val: number) => this.scene.rotate(this.id, val),
      angle,
      duration,
      easing,
      (kf, dur) => this.scene.rotationKeyframes(this.id, kf, dur),
      () => shape!.getObject3D().rotation.z
    );
  }

  stroke(color: THREE.Color | string): ShapeRef;
  stroke(color: THREE.Color | string, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  stroke(color: THREE.Color | string, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    const col = typeof color === "string" ? new THREE.Color(color) : color;
    const shape = this.scene.getShape(this.id);
    if (!(shape instanceof BaseShape) && !(shape instanceof CSS2DShape)) {
      return Promise.reject(new Error("Shape does not support stroke color animation"));
    }
    return this._animateOrSet(
      (val: THREE.Color) => this.scene.strokeColor(this.id, val),
      col,
      duration,
      easing,
      (kf, dur) => this.scene.strokeColorKeyframes(this.id, kf, dur),
      () => (shape as any).getStrokeColor().clone()
    );
  }

  fill(color: THREE.Color | string | null): ShapeRef;
  fill(color: THREE.Color | string | null, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  fill(color: THREE.Color | string | null, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    if (color === null) {
      this.scene.fillColor(this.id, null);
      return this;
    }
    const col = typeof color === "string" ? new THREE.Color(color) : color;
    const shape = this.scene.getShape(this.id);
    if (!(shape instanceof BaseShape) && !(shape instanceof CSS2DShape)) {
      return Promise.reject(new Error("Shape does not support fill color animation"));
    }
    return this._animateOrSet(
      (val: THREE.Color) => this.scene.fillColor(this.id, val),
      col,
      duration,
      easing,
      (kf, dur) => this.scene.fillColorKeyframes(this.id, kf, dur),
      () => (shape as any).getFillColor() || new THREE.Color(0, 0, 0)
    );
  }

  opacity(value: number): ShapeRef;
  opacity(value: number, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  opacity(value: number, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    const shape = this.scene.getShape(this.id);
    if (!(shape instanceof BaseShape) && !(shape instanceof CSS2DShape)) {
      return Promise.reject(new Error("Shape does not support opacity animation"));
    }
    return this._animateOrSet(
      (val: number) => this.scene.opacity(this.id, val),
      value,
      duration,
      easing,
      (kf, dur) => this.scene.opacityKeyframes(this.id, kf, dur),
      () => (shape as any).getOpacity()
    );
  }

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

  font(fontString: string): this {
    this.scene.font(this.id, fontString);
    return this;
  }
  lineWidth(width: number): this {
    this.scene.lineWidth(this.id, width);
    return this;
  }

  morph(other: ShapeRef, duration = 2000): Promise<void> {
    return this.scene.morph(this.id, other.id, duration);
  }

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
const labelRenderer = new CSS2DRenderer();

// Create camera first
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(10, 10, 15);
camera.lookAt(0, 0, 0);

// Helper function to set even size (now camera is defined)
function setEvenSize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const evenWidth = width % 2 === 0 ? width : width + 1;
  const evenHeight = height % 2 === 0 ? height : height + 1;
  renderer.setSize(evenWidth, evenHeight);
  labelRenderer.setSize(evenWidth, evenHeight);
  camera.aspect = evenWidth / evenHeight;
  camera.updateProjectionMatrix();
}

setEvenSize();
renderer.setClearColor(0x000000);

const sceneObj = new THREE.Scene();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = true;
controls.enableZoom = true;
controls.enablePan = true;
controls.zoomSpeed = 1.2;
controls.minDistance = 0.2;
controls.panSpeed = 0.8;

labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.top = "0px";
labelRenderer.domElement.style.left = "0px";
labelRenderer.domElement.style.pointerEvents = "none";
document.body.appendChild(labelRenderer.domElement);

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

window.addEventListener("resize", setEvenSize);

// ========== Unified Visual Test Suite ==========

async function runAllTests() {
  console.log("🎬 Starting unified visual test suite...");
  jsketchScene.startRecording(); // optional: start recording the whole suite
  await testAllShapes();
  await testPropertySetters();
  await testKeyframeAnimations();
  await testKeyframesConfig();
  await testMorphing();
  await testDrawProgress();
  await testPauseResume();
  await testMultipleAnimations();
  await testErrorHandling();
  await testTextAndImage();
  jsketchScene.stopRecording();
  console.log("✅ All visual tests completed.");
}

function addInstruction(text: string, color: string = "white", duration: number = 2000) {
  const div = document.createElement("div");
  div.textContent = text;
  div.style.position = "absolute";
  div.style.bottom = "20px";
  div.style.left = "20px";
  div.style.backgroundColor = "rgba(0,0,0,0.7)";
  div.style.color = color;
  div.style.padding = "8px 12px";
  div.style.borderRadius = "4px";
  div.style.fontFamily = "monospace";
  div.style.fontSize = "14px";
  div.style.zIndex = "1000";
  document.body.appendChild(div);
  setTimeout(() => div.remove(), duration);
}

async function testAllShapes() {
  console.log("Test: All shape types");
  jsketchScene.clear();
  addInstruction("All shape types: Circle, Square, Line, RegularPolygon, Star, ParametricCurve", "lime", 3000);

  const shapes = [
    { factory: () => jsketchScene.Circle(1.5).stroke("red").fill("red").opacity(0.5), pos: [-4, 3, 0], name: "Circle" },
    { factory: () => jsketchScene.Square(2).stroke("green").fill("green").opacity(0.5), pos: [0, 3, 0], name: "Square" },
    { factory: () => jsketchScene.Line(-2, 1, 2, 1).stroke("cyan").lineWidth(3), pos: [4, 3, 0], name: "Line" },
    { factory: () => jsketchScene.RegularPolygon(1.5, 5).stroke("orange").fill("orange").opacity(0.5), pos: [-4, 0, 0], name: "Polygon" },
    { factory: () => jsketchScene.Star(1.5, 0.8, 5).stroke("yellow").fill("yellow").opacity(0.5), pos: [0, 0, 0], name: "Star" },
    { factory: () => jsketchScene.ParametricCurve(t => 2 * Math.cos(t * 2 * Math.PI), t => 2 * Math.sin(t * 2 * Math.PI), 0, 1).stroke("magenta"), pos: [4, 0, 0], name: "Curve" },
  ];

  shapes.forEach(({ factory, pos, name }) => {
    const shape = factory();
    shape.translate(pos[0], pos[1], pos[2]);
    jsketchScene.Text(name, "12px Arial", { x: pos[0], y: pos[1] - 1.2, z: 0 }).stroke("white");
  });

  await jsketchScene.wait(3);
}

async function testPropertySetters() {
  console.log("Test: Property setters");
  jsketchScene.clear();
  addInstruction("Property setters: translate, scale, rotate, stroke, fill, opacity, font, lineWidth", "lime", 3000);

  const shape = jsketchScene.Circle(1).stroke("white").fill("blue").opacity(0.8);
  shape.translate(0, 2, 0);
  await jsketchScene.wait(1);

  addInstruction("Translate: moving right", "yellow", 1000);
  shape.translate(3, 2, 0);
  await jsketchScene.wait(1);
  shape.translate(-3, 2, 0);
  await jsketchScene.wait(1);

  addInstruction("Scale: growing", "yellow", 1000);
  shape.scale(2, 2, 1);
  await jsketchScene.wait(1);
  shape.scale(1, 1, 1);
  await jsketchScene.wait(1);

  addInstruction("Rotate: spinning", "yellow", 1000);
  shape.rotate(Math.PI / 2);
  await jsketchScene.wait(0.5);
  shape.rotate(Math.PI);
  await jsketchScene.wait(0.5);
  shape.rotate(0);
  await jsketchScene.wait(0.5);

  addInstruction("Stroke color: cycling", "yellow", 1000);
  shape.stroke("red");
  await jsketchScene.wait(0.5);
  shape.stroke("green");
  await jsketchScene.wait(0.5);
  shape.stroke("blue");
  await jsketchScene.wait(0.5);
  shape.stroke("white");

  addInstruction("Fill color: to yellow", "yellow", 1000);
  shape.fill("yellow");
  await jsketchScene.wait(1);
  shape.fill("blue");

  addInstruction("Opacity: fade out/in", "yellow", 1000);
  shape.opacity(0.2);
  await jsketchScene.wait(0.5);
  shape.opacity(1);
  await jsketchScene.wait(0.5);

  const line = jsketchScene.Line(-2, -2, 2, -2).stroke("cyan").lineWidth(1);
  addInstruction("Line width: thickening", "yellow", 1000);
  line.lineWidth(5);
  await jsketchScene.wait(1);
  line.lineWidth(1);
  await jsketchScene.wait(1);

  const text = jsketchScene.Text("Font test", "16px Arial", { x: 0, y: -2, z: 0 }).stroke("white");
  addInstruction("Font: changing size", "yellow", 1000);
  text.font("32px Arial");
  await jsketchScene.wait(1);
  text.font("16px Arial");

  await jsketchScene.wait(1);
}

async function testKeyframeAnimations() {
  console.log("Test: Keyframe animations");
  jsketchScene.clear();
  addInstruction("Keyframe animations: translation, scale, rotation, color, opacity", "lime", 3000);

  const shape = jsketchScene.RegularPolygon(1.5, 6).stroke("white").fill("blue");

  addInstruction("Translation: move in a square", "yellow", 2000);
  await shape.translate(3, 0, 0, 1, "easeInOutQuad");
  await shape.translate(3, 3, 0, 1, "easeInOutQuad");
  await shape.translate(0, 3, 0, 1, "easeInOutQuad");
  await shape.translate(0, 0, 0, 1, "easeInOutQuad");

  addInstruction("Scale: pulse", "yellow", 2000);
  await shape.scale(2, 2, 1, 0.5, "easeOutQuad");
  await shape.scale(1, 1, 1, 0.5, "easeOutQuad");
  await shape.scale(2, 2, 1, 0.5, "easeOutQuad");
  await shape.scale(1, 1, 1, 0.5, "easeOutQuad");

  addInstruction("Rotation: full spin", "yellow", 2000);
  await shape.rotate(Math.PI * 2, 2, "easeOutQuad");

  addInstruction("Stroke & Fill color: rainbow", "yellow", 3000);
  await Promise.all([
    shape.stroke("red", 1, "linear"),
    shape.fill("red", 1, "linear")
  ]);
  await Promise.all([
    shape.stroke("green", 1, "linear"),
    shape.fill("green", 1, "linear")
  ]);
  await Promise.all([
    shape.stroke("blue", 1, "linear"),
    shape.fill("blue", 1, "linear")
  ]);

  addInstruction("Opacity: fade out/in", "yellow", 2000);
  await shape.opacity(0.2, 1, "easeOutQuad");
  await shape.opacity(1, 1, "easeOutQuad");

  await jsketchScene.wait(1);
}

async function testKeyframesConfig() {
  console.log("Test: Keyframes config object");
  jsketchScene.clear();
  addInstruction("Keyframes config: simultaneous translation, scale, rotation, color", "lime", 3000);

  const shape = jsketchScene.RegularPolygon(1.5, 6).stroke("white").fill("blue");
  shape.translate(-3, 0, 0);

  const config = {
    translation: [
      { time: 0, value: { x: -3, y: 0, z: 0 } },
      { time: 0.5, value: { x: 0, y: 3, z: 0 }, easing: "easeOutQuad" },
      { time: 1, value: { x: 3, y: 0, z: 0 }, easing: "easeInQuad" }
    ],
    scale: [
      { time: 0, value: { x: 1, y: 1, z: 1 } },
      { time: 0.5, value: { x: 2, y: 2, z: 1 }, easing: "easeOutElastic" },
      { time: 1, value: { x: 1, y: 1, z: 1 }, easing: "easeInOutQuad" }
    ],
    rotation: [
      { time: 0, value: 0 },
      { time: 1, value: Math.PI * 2, easing: "easeInOutSine" }
    ],
    strokeColor: [
      { time: 0, value: "white" },
      { time: 0.5, value: "red", easing: "easeOutQuad" },
      { time: 1, value: "blue" }
    ],
    fillColor: [
      { time: 0, value: "blue" },
      { time: 0.5, value: "yellow", easing: "easeOutQuad" },
      { time: 1, value: "green" }
    ],
    opacity: [
      { time: 0, value: 1 },
      { time: 0.5, value: 0.3, easing: "linear" },
      { time: 1, value: 1 }
    ]
  };

  shape.keyframes(config, 3000);
  await jsketchScene.wait(3);
  await jsketchScene.wait(1);
}

async function testMorphing() {
  console.log("Test: Morphing");
  jsketchScene.clear();
  addInstruction("Morphing: Circle ↔ Square ↔ Star", "lime", 3000);

  const circle = jsketchScene.Circle(2).translate(-3, 0, 0).stroke("red");
  const square = jsketchScene.Square(3).translate(3, 0, 0).stroke("green");
  const star = jsketchScene.Star(2, 1, 5).translate(0, 3, 0).stroke("yellow");

  addInstruction("Morph: Circle → Square", "yellow", 1500);
  await circle.morph(square, 1500);
  addInstruction("Morph: Square → Star", "yellow", 1500);
  await square.morph(star, 1500);
  addInstruction("Morph: Star → Circle", "yellow", 1500);
  await star.morph(circle, 1500);

  await jsketchScene.wait(1);
}

async function testDrawProgress() {
  console.log("Test: Draw progress");
  jsketchScene.clear();
  addInstruction("Draw progress: shapes being drawn stroke by stroke", "lime", 3000);

  const shapes = [
    jsketchScene.Circle(2).stroke("red").translate(-4, 2, 0),
    jsketchScene.Square(2.5).stroke("green").translate(0, 2, 0),
    jsketchScene.Star(2, 1, 5).stroke("yellow").translate(4, 2, 0),
    jsketchScene.Line(-3, -2, 3, -2).stroke("cyan").translate(0, -2, 0),
  ];

  await Promise.all(shapes.map(s => s.draw(2000, "easeOutQuad")));
  await jsketchScene.wait(1);
}

async function testPauseResume() {
  console.log("Test: Pause/Resume");
  jsketchScene.clear();
  addInstruction("Pause/Resume: animation will pause for 2 seconds", "lime", 3000);

  const shape = jsketchScene.Circle(1.5).stroke("white").fill("red");
  const movePromise = shape.translate(5, 0, 0, 5, "linear");

  await jsketchScene.wait(1);
  addInstruction("Pausing for 2 seconds...", "yellow", 2000);
  jsketchScene.pause(2);
  await jsketchScene.wait(2.5);
  addInstruction("Resumed", "lime", 1000);
  await movePromise;
  await jsketchScene.wait(1);
}

async function testMultipleAnimations() {
  console.log("Test: Multiple simultaneous animations");
  jsketchScene.clear();
  addInstruction("Multiple simultaneous animations: rotating and scaling", "lime", 3000);

  const shapes = [];
  for (let i = -3; i <= 3; i++) {
    const shape = jsketchScene.Square(1)
      .translate(i, 0, 0)
      .stroke(`hsl(${((i + 3) * 60) % 360}, 100%, 50%)`)
      .fill(`hsl(${((i + 3) * 60) % 360}, 100%, 50%)`)
      .opacity(0.6);
    shapes.push(shape);
  }

  await Promise.all(shapes.map(s => Promise.all([
    s.rotate(Math.PI * 2, 2, "easeOutQuad"),
    s.scale(2, 2, 1, 2, "easeOutQuad")
  ])));

  await jsketchScene.wait(1);
}

async function testErrorHandling() {
  console.log("Test: Error handling");
  jsketchScene.clear();
  addInstruction("Error handling: morph with text (should show error in console)", "lime", 3000);

  const shape = jsketchScene.Circle(2).stroke("red");
  const text = jsketchScene.Text("Not a shape", "16px Arial", { x: 2, y: 0, z: 0 }).stroke("white");

  try {
    await shape.morph(text);
    console.error("❌ Morph should have thrown an error!");
  } catch (e: any) {
    console.log("✅ Caught expected error:", e.message);
  }

  try {
    await text.translate(3, 0, 0, 1, "linear");
  } catch (e: any) {
    console.log("✅ Unsupported animation correctly rejected:", e.message);
  }

  await jsketchScene.wait(2);
}

async function testTextAndImage() {
  console.log("Test: Text and Image");
  jsketchScene.clear();
  addInstruction("Text and Image: with opacity, stroke, fill, and translation", "lime", 3000);

  const text = jsketchScene.Text("Hello 3D!", "32px Arial", { x: -3, y: 2, z: 0 })
    .stroke("lime")
    .fill("green")
    .opacity(0.8);

  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "purple";
  ctx.fillRect(0, 0, 200, 200);
  ctx.fillStyle = "white";
  ctx.font = "20px Arial";
  ctx.fillText("JSKETCH", 40, 100);
  const img = new Image();
  await new Promise(resolve => { img.onload = resolve; img.src = canvas.toDataURL(); });
  const image = jsketchScene.Image(img, { x: 3, y: -2, z: 0 }).opacity(0.9);

  addInstruction("Text: moving left/right", "yellow", 2000);
  text.translate(-3, 2, 0);
  await jsketchScene.wait(0.5);
  text.translate(-1, 2, 0);
  await jsketchScene.wait(0.5);
  text.translate(-3, 2, 0);
  await jsketchScene.wait(0.5);

  addInstruction("Image: moving left/right", "yellow", 2000);
  image.translate(3, -2, 0);
  await jsketchScene.wait(0.5);
  image.translate(1, -2, 0);
  await jsketchScene.wait(0.5);
  image.translate(3, -2, 0);
  await jsketchScene.wait(0.5);

  addInstruction("Text: stroke/fill changes", "yellow", 1000);
  text.stroke("cyan");
  text.fill("yellow");
  await jsketchScene.wait(1);
  text.stroke("lime");
  text.fill("green");
  await jsketchScene.wait(1);

  addInstruction("Image: opacity fade", "yellow", 1000);
  image.opacity(0.4);
  await jsketchScene.wait(1);
  image.opacity(0.9);

  await jsketchScene.wait(1);
}

(window as any).runAllTests = runAllTests;
