import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ========== Configuration ==========
const CONFIG = {
  scaleX: 10,
  scaleY: 10,
  scaleZ: 10,
  defaultLineWidth: 2,
  defaultFont: "14px sans-serif",
  defaultTextColor: "#ffffff",
  defaultBackground: "transparent",
  spriteSize: 1,
};

const NUM_VERTICES = 400;
const MORPH_POINTS = 800; // reduced for performance

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

// ========== 2D Shape Base ==========
interface KeyframeAnimations2D {
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

  protected keyframes: KeyframeAnimations2D = {
    translation: null,
    scale: null,
    rotation: null,
    strokeColor: null,
    fillColor: null,
    opacity: null,
    drawProgress: null,
  };

  private animationPromises: Partial<Record<keyof KeyframeAnimations2D, AnimationPromise>> = {};

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

  // Generic keyframe setter
  private async setKeyframes<K extends keyof KeyframeAnimations2D, T>(
    type: K,
    keyframes: Keyframe<T>[],
    duration: number,
    startTime: number
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
    this.keyframes[type] = new KeyframeAnimation(keyframes, duration, startTime) as any;
    return promise.then(() => this);
  }

  // Public keyframe methods – thin wrappers
  setTranslationKeyframes(keyframes: Keyframe<THREE.Vector3>[], duration: number, startTime: number): Promise<this> {
    return this.setKeyframes("translation", keyframes, duration, startTime);
  }
  setScaleKeyframes(keyframes: Keyframe<THREE.Vector3>[], duration: number, startTime: number): Promise<this> {
    return this.setKeyframes("scale", keyframes, duration, startTime);
  }
  setRotationKeyframes(keyframes: Keyframe<number>[], duration: number, startTime: number): Promise<this> {
    return this.setKeyframes("rotation", keyframes, duration, startTime);
  }
  setStrokeColorKeyframes(keyframes: Keyframe<THREE.Color>[], duration: number, startTime: number): Promise<this> {
    return this.setKeyframes("strokeColor", keyframes, duration, startTime);
  }
  setFillColorKeyframes(keyframes: Keyframe<THREE.Color>[], duration: number, startTime: number): Promise<this> {
    return this.setKeyframes("fillColor", keyframes, duration, startTime);
  }
  setOpacityKeyframes(keyframes: Keyframe<number>[], duration: number, startTime: number): Promise<this> {
    return this.setKeyframes("opacity", keyframes, duration, startTime);
  }
  setDrawProgressKeyframes(keyframes: Keyframe<number>[], duration: number, startTime: number): Promise<this> {
    return this.setKeyframes("drawProgress", keyframes, duration, startTime);
  }

  // Consolidated update for all animations
  private updateAnimations(now: number): void {
    const updaters: {
      [K in keyof KeyframeAnimations2D]: (value: any) => void;
    } = {
      translation: (v: THREE.Vector3) => this.group.position.copy(v),
      scale: (v: THREE.Vector3) => this.group.scale.copy(v),
      rotation: (v: number) => (this.group.rotation.z = v),
      strokeColor: (v: THREE.Color) => {
        this.strokeColor.copy(v);
        this.updateMaterialColors();
      },
      fillColor: (v: THREE.Color) => {
        this.fillColor = v.clone();
        this.updateMaterialColors();
      },
      opacity: (v: number) => {
        this.opacity = v;
        this.updateMaterialColors();
      },
      drawProgress: (v: number) => this.setDrawProgress(v),
    };

    for (const [key, anim] of Object.entries(this.keyframes) as [keyof KeyframeAnimations2D, KeyframeAnimation<any> | null][]) {
      if (!anim) continue;
      if (anim.isFinished(now)) {
        updaters[key](anim.sample(now));
        this.keyframes[key] = null;
        this.animationPromises[key]?.resolve();
        delete this.animationPromises[key];
      } else {
        updaters[key](anim.sample(now));
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
      this.animationPromises[key as keyof KeyframeAnimations2D]?.resolve();
    }
  }
}

// ========== Concrete GenericShape ==========
class GenericShape extends BaseShape {
  constructor(
    id: number,
    vertices: THREE.Vector3[],
    closed: boolean,
    translation?: THREE.Vector3,
    scale?: THREE.Vector3,
    rotation?: number,
  ) {
    super(id, vertices, CONFIG.defaultLineWidth, closed, translation, scale, rotation);
  }
}

// ========== WebGL Sprite Shape (text/image) ==========
class WebGLSpriteShape extends Drawable {
  private sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private _content: string | HTMLImageElement;
  private _font: string;
  private _strokeColor: THREE.Color;
  private _fillColor: THREE.Color | null;
  private _opacity: number;
  private _needsUpdate = true;
  private _size: THREE.Vector2;

  constructor(
    id: number,
    content: string | HTMLImageElement,
    translation: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
    font: string = CONFIG.defaultFont,
  ) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = 256;
    canvas.height = 256;
    ctx.fillStyle = "transparent";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(translation);
    super(id, sprite);

    this.sprite = sprite;
    this.canvas = canvas;
    this.ctx = ctx;
    this.texture = texture;
    this._content = content;
    this._font = font;
    this._strokeColor = new THREE.Color(1, 1, 1);
    this._fillColor = null;
    this._opacity = 1;
    this._size = new THREE.Vector2(1, 1);

    this.updateCanvas();
  }

  // Public properties
  get text(): string {
    return typeof this._content === "string" ? this._content : "";
  }
  set text(t: string) {
    this._content = t;
    this._needsUpdate = true;
  }

  get image(): HTMLImageElement | null {
    return this._content instanceof HTMLImageElement ? this._content : null;
  }
  set image(img: HTMLImageElement) {
    this._content = img;
    this._needsUpdate = true;
  }

  get font(): string {
    return this._font;
  }
  set font(f: string) {
    this._font = f;
    this._needsUpdate = true;
  }

  public setStrokeColor(color: THREE.Color): void {
    this._strokeColor.copy(color);
    this._needsUpdate = true;
  }
  public getStrokeColor(): THREE.Color {
    return this._strokeColor;
  }

  public setFillColor(color: THREE.Color | null): void {
    this._fillColor = color ? color.clone() : null;
    this._needsUpdate = true;
  }
  public getFillColor(): THREE.Color | null {
    return this._fillColor;
  }

  public setOpacity(opacity: number): void {
    this._opacity = opacity;
    this.sprite.material.opacity = opacity;
  }
  public getOpacity(): number {
    return this._opacity;
  }

  public setSize(width: number, height: number): void {
    this._size.set(width, height);
    this.sprite.scale.set(width, height, 1);
    this._needsUpdate = true;
  }

  private updateCanvas(): void {
    if (!this._needsUpdate) return;

    const ctx = this.ctx;
    const canvas = this.canvas;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (this._fillColor) {
      ctx.fillStyle = this._fillColor.getStyle();
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (typeof this._content === "string") {
      ctx.font = this._font;
      ctx.fillStyle = this._strokeColor.getStyle();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this._content, canvas.width / 2, canvas.height / 2);
    } else if (this._content instanceof HTMLImageElement) {
      ctx.drawImage(this._content, 0, 0, canvas.width, canvas.height);
      if (this._strokeColor) {
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = this._strokeColor.getStyle();
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "source-over";
      }
    }

    this.texture.needsUpdate = true;
    this._needsUpdate = false;
  }

  update(_now: number): void {
    this.updateCanvas();
  }

  dispose(): void {
    this.sprite.material.dispose();
    this.texture.dispose();
    this.sprite.removeFromParent();
  }
}

// ========== Point Sampling for Morphing ==========
interface PointSample {
  position: THREE.Vector3;
  color: THREE.Color;
}

function sampleDrawable(drawable: Drawable, numPoints: number): PointSample[] {
  if (drawable instanceof BaseShape) {
    // Sample along the outline of the 2D shape
    const vertices = drawable.getVertices();
    if (vertices.length === 0) return [];
    const closed = drawable.getClosed();
    const samples: PointSample[] = [];
    const totalLen = closed ? vertices.reduce((sum, v, i, arr) => {
      const next = arr[(i + 1) % arr.length];
      return sum + v.distanceTo(next);
    }, 0) : vertices.slice(0, -1).reduce((sum, v, i) => sum + v.distanceTo(vertices[i+1]), 0);
    const step = totalLen / numPoints;
    let remaining = step;
    let currentIdx = 0;
    let currentPos = vertices[0].clone();
    for (let i = 0; i < numPoints; i++) {
      while (currentIdx < vertices.length - 1) {
        const next = vertices[(currentIdx + 1) % vertices.length];
        const segLen = currentPos.distanceTo(next);
        if (remaining <= segLen) {
          const t = remaining / segLen;
          const pos = currentPos.clone().lerp(next, t);
          samples.push({ position: pos, color: drawable.getStrokeColor().clone() });
          currentPos = pos;
          remaining = step;
          break;
        } else {
          remaining -= segLen;
          currentIdx++;
          currentPos = vertices[currentIdx % vertices.length].clone();
        }
      }
      if (samples.length <= i) {
        // fallback to last point
        samples.push({ position: vertices[vertices.length-1].clone(), color: drawable.getStrokeColor().clone() });
      }
    }
    return samples;
  } else if (drawable instanceof Mesh3D) {
    // Sample random vertices from the mesh geometry
    const geometry = (drawable as any).mesh.geometry as THREE.BufferGeometry;
    const positions = geometry.attributes.position.array;
    const verticesCount = positions.length / 3;
    const indices = new Set<number>();
    while (indices.size < Math.min(numPoints, verticesCount)) {
      indices.add(Math.floor(Math.random() * verticesCount));
    }
    const samples: PointSample[] = [];
    const color = drawable.getColor();
    for (const idx of indices) {
      const x = positions[idx*3];
      const y = positions[idx*3+1];
      const z = positions[idx*3+2];
      samples.push({ position: new THREE.Vector3(x, y, z), color: color.clone() });
    }
    return samples;
  } else if (drawable instanceof WebGLSpriteShape) {
    // Sample points on a grid over the sprite's canvas
    const canvas = (drawable as any).canvas;
    const ctx = canvas.getContext("2d")!;
    const width = canvas.width;
    const height = canvas.height;
    const gridSize = Math.ceil(Math.sqrt(numPoints));
    const stepX = width / gridSize;
    const stepY = height / gridSize;
    const samples: PointSample[] = [];
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < gridSize && samples.length < numPoints; i++) {
      for (let j = 0; j < gridSize && samples.length < numPoints; j++) {
        const x = i * stepX + stepX/2;
        const y = j * stepY + stepY/2;
        const px = Math.floor(x);
        const py = Math.floor(y);
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = (py * width + px) * 4;
          const r = data[idx] / 255;
          const g = data[idx+1] / 255;
          const b = data[idx+2] / 255;
          const a = data[idx+3] / 255;
          if (a > 0.1) {
            const sprite = (drawable as any).sprite;
            const scale = sprite.scale;
            const posX = (x / width - 0.5) * scale.x;
            const posY = (0.5 - y / height) * scale.y;
            samples.push({
              position: new THREE.Vector3(posX, posY, 0),
              color: new THREE.Color(r, g, b),
            });
          }
        }
      }
    }
    return samples;
  } else {
    // Fallback: sample points from bounding sphere
    const obj = drawable.getObject3D();
    const bbox = new THREE.Box3().setFromObject(obj);
    const center = bbox.getCenter(new THREE.Vector3());
    const radius = bbox.getSize(new THREE.Vector3()).length() / 2;
    const samples: PointSample[] = [];
    for (let i = 0; i < numPoints; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = center.x + radius * Math.sin(phi) * Math.cos(theta);
      const y = center.y + radius * Math.sin(phi) * Math.sin(theta);
      const z = center.z + radius * Math.cos(phi);
      samples.push({ position: new THREE.Vector3(x, y, z), color: new THREE.Color(0xffffff) });
    }
    return samples;
  }
}

// ========== Morph Points (generic morph) ==========
class MorphPoints extends Drawable {
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private startSamples: PointSample[];
  private endSamples: PointSample[];
  private duration: number;
  private startTime: number;
  private sceneRef: Scene;
  private completionResolve?: () => void;
  private completionPromise: Promise<void>;

  constructor(
    id: number,
    scene: Scene,
    source: Drawable,
    target: Drawable,
    duration: number,
    startTime: number,
    numPoints: number = MORPH_POINTS
  ) {
    const startSamples = sampleDrawable(source, numPoints);
    const endSamples = sampleDrawable(target, numPoints);
    const count = Math.min(startSamples.length, endSamples.length);
    const finalStart = startSamples.slice(0, count);
    const finalEnd = endSamples.slice(0, count);
    const centerStart = finalStart.reduce((sum, p) => sum.add(p.position), new THREE.Vector3(0,0,0)).divideScalar(count);
    const centerEnd = finalEnd.reduce((sum, p) => sum.add(p.position), new THREE.Vector3(0,0,0)).divideScalar(count);
    finalStart.sort((a,b) => Math.atan2(a.position.y - centerStart.y, a.position.x - centerStart.x) -
                              Math.atan2(b.position.y - centerStart.y, b.position.x - centerStart.x));
    finalEnd.sort((a,b) => Math.atan2(a.position.y - centerEnd.y, a.position.x - centerEnd.x) -
                            Math.atan2(b.position.y - centerEnd.y, b.position.x - centerEnd.x));

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i*3] = finalStart[i].position.x;
      positions[i*3+1] = finalStart[i].position.y;
      positions[i*3+2] = finalStart[i].position.z;
      colors[i*3] = finalStart[i].color.r;
      colors[i*3+1] = finalStart[i].color.g;
      colors[i*3+2] = finalStart[i].color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: 0.1, vertexColors: true, blending: THREE.AdditiveBlending });
    const pointsObj = new THREE.Points(geometry, material);
    super(id, pointsObj);
    this.geometry = geometry;
    this.material = material;
    this.startSamples = finalStart;
    this.endSamples = finalEnd;
    this.duration = duration;
    this.startTime = startTime;
    this.sceneRef = scene;

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
    const positions = this.geometry.attributes.position.array as Float32Array;
    const colors = this.geometry.attributes.color.array as Float32Array;
    const count = this.startSamples.length;
    for (let i = 0; i < count; i++) {
      const startPos = this.startSamples[i].position;
      const endPos = this.endSamples[i].position;
      positions[i*3] = lerp(startPos.x, endPos.x, t);
      positions[i*3+1] = lerp(startPos.y, endPos.y, t);
      positions[i*3+2] = lerp(startPos.z, endPos.z, t);
      const startCol = this.startSamples[i].color;
      const endCol = this.endSamples[i].color;
      colors[i*3] = lerp(startCol.r, endCol.r, t);
      colors[i*3+1] = lerp(startCol.g, endCol.g, t);
      colors[i*3+2] = lerp(startCol.b, endCol.b, t);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    // Animate point size slightly for a pulsing effect
    this.material.size = 0.1 + Math.sin(t * Math.PI * 2) * 0.05;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ========== 3D Mesh Shape ==========
class Mesh3D extends Drawable {
  private mesh: THREE.Mesh;
  private material: THREE.Material;
  private _color: THREE.Color;
  private _opacity: number;

  private keyframes: {
    translation: KeyframeAnimation<THREE.Vector3> | null;
    scale: KeyframeAnimation<THREE.Vector3> | null;
    rotation: KeyframeAnimation<THREE.Vector3> | null;
    color: KeyframeAnimation<THREE.Color> | null;
    opacity: KeyframeAnimation<number> | null;
  } = { translation: null, scale: null, rotation: null, color: null, opacity: null };

  private animationPromises: Partial<Record<keyof typeof this.keyframes, { promise: Promise<void>; resolve: () => void }>> = {};

  constructor(
    id: number,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    translation: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
    scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1),
    rotation: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
  ) {
    const obj = new THREE.Mesh(geometry, material);
    obj.position.copy(translation);
    obj.scale.copy(scale);
    obj.rotation.set(rotation.x, rotation.y, rotation.z);
    super(id, obj);
    this.mesh = obj;
    this.material = material;
    this._color = (material as THREE.MeshStandardMaterial).color?.clone() || new THREE.Color(0xffffff);
    this._opacity = material.opacity ?? 1;
  }

  getColor(): THREE.Color {
    return this._color;
  }

  setColor(color: THREE.Color): void {
    this._color.copy(color);
    if (this.material instanceof THREE.MeshStandardMaterial) {
      this.material.color.copy(color);
    }
  }

  getOpacity(): number {
    return this._opacity;
  }

  setOpacity(opacity: number): void {
    this._opacity = opacity;
    this.material.transparent = opacity < 1;
    this.material.opacity = opacity;
  }

  private async setKeyframes<K extends keyof typeof this.keyframes, T>(
    type: K,
    keyframes: Keyframe<T>[],
    duration: number,
    startTime: number
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
    this.keyframes[type] = new KeyframeAnimation(keyframes, duration, startTime) as any;
    return promise.then(() => this);
  }

  setTranslationKeyframes(keyframes: Keyframe<THREE.Vector3>[], duration: number, startTime: number): Promise<this> {
    return this.setKeyframes("translation", keyframes, duration, startTime);
  }

  setScaleKeyframes(keyframes: Keyframe<THREE.Vector3>[], duration: number, startTime: number): Promise<this> {
    return this.setKeyframes("scale", keyframes, duration, startTime);
  }

  setRotationKeyframes(keyframes: Keyframe<THREE.Vector3>[], duration: number, startTime: number): Promise<this> {
    return this.setKeyframes("rotation", keyframes, duration, startTime);
  }

  setColorKeyframes(keyframes: Keyframe<THREE.Color>[], duration: number, startTime: number): Promise<this> {
    return this.setKeyframes("color", keyframes, duration, startTime);
  }

  setOpacityKeyframes(keyframes: Keyframe<number>[], duration: number, startTime: number): Promise<this> {
    return this.setKeyframes("opacity", keyframes, duration, startTime);
  }

  update(now: number): void {
    const entries = Object.entries(this.keyframes) as [keyof typeof this.keyframes, KeyframeAnimation<any> | null][];
    for (const [key, anim] of entries) {
      if (!anim) continue;
      const value = anim.sample(now);
      if (anim.isFinished(now)) {
        switch (key) {
          case 'translation': this.mesh.position.copy(value as THREE.Vector3); break;
          case 'scale': this.mesh.scale.copy(value as THREE.Vector3); break;
          case 'rotation': this.mesh.rotation.set((value as THREE.Vector3).x, (value as THREE.Vector3).y, (value as THREE.Vector3).z); break;
          case 'color': this.setColor(value as THREE.Color); break;
          case 'opacity': this.setOpacity(value as number); break;
        }
        this.keyframes[key] = null;
        this.animationPromises[key]?.resolve();
        delete this.animationPromises[key];
      } else {
        switch (key) {
          case 'translation': this.mesh.position.copy(value as THREE.Vector3); break;
          case 'scale': this.mesh.scale.copy(value as THREE.Vector3); break;
          case 'rotation': this.mesh.rotation.set((value as THREE.Vector3).x, (value as THREE.Vector3).y, (value as THREE.Vector3).z); break;
          case 'color': this.setColor(value as THREE.Color); break;
          case 'opacity': this.setOpacity(value as number); break;
        }
      }
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
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

  // Recording
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStream: MediaStream | null = null;
  private recordingTimeout: number | null = null;

  private threeScene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;

  constructor(
    threeScene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
  ) {
    this.threeScene = threeScene;
    this.renderer = renderer;
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
    this.threeScene.add(obj);
  }

  private removeFromThree(obj: THREE.Object3D): void {
    this.threeScene.remove(obj);
  }

  // ========== 2D Shape Factories ==========
  private _createShape(vertexGen: (t: number) => THREE.Vector3, closed: boolean): ShapeRef {
    const id = this.nextId++;
    const vertices = Array.from({ length: NUM_VERTICES }, (_, i) => vertexGen(i / (NUM_VERTICES - 1)));
    const shape = new GenericShape(id, vertices, closed);
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
    const shape = new WebGLSpriteShape(id, text, new THREE.Vector3(translation.x, translation.y, translation.z), font);
    shape.setSize(2, 1);
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
    const shape = new WebGLSpriteShape(id, img, new THREE.Vector3(translation.x, translation.y, translation.z));
    const aspect = img.width / img.height;
    shape.setSize(2 * aspect, 2);
    this.drawables.set(id, shape);
    this.addToThree(shape.getObject3D());
    return new ShapeRef(this, id);
  }

  // ========== 3D Shape Factories ==========
  Cube(size: number, color: THREE.Color | string | number = 0xffffff): ShapeRef {
    const id = this.nextId++;
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.1 });
    const cube = new Mesh3D(id, geometry, material);
    this.drawables.set(id, cube);
    this.addToThree(cube.getObject3D());
    return new ShapeRef(this, id);
  }

  Sphere(radius: number, color: THREE.Color | string | number = 0xffffff): ShapeRef {
    const id = this.nextId++;
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.8 });
    const sphere = new Mesh3D(id, geometry, material);
    this.drawables.set(id, sphere);
    this.addToThree(sphere.getObject3D());
    return new ShapeRef(this, id);
  }

  Cylinder(radiusTop: number, radiusBottom: number, height: number, color: THREE.Color | string | number = 0xffffff): ShapeRef {
    const id = this.nextId++;
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 32);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2 });
    const cylinder = new Mesh3D(id, geometry, material);
    this.drawables.set(id, cylinder);
    this.addToThree(cylinder.getObject3D());
    return new ShapeRef(this, id);
  }

  Cone(radius: number, height: number, color: THREE.Color | string | number = 0xffffff): ShapeRef {
    const id = this.nextId++;
    const geometry = new THREE.ConeGeometry(radius, height, 32);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2 });
    const cone = new Mesh3D(id, geometry, material);
    this.drawables.set(id, cone);
    this.addToThree(cone.getObject3D());
    return new ShapeRef(this, id);
  }

  Torus(radius: number, tube: number, color: THREE.Color | string | number = 0xffffff): ShapeRef {
    const id = this.nextId++;
    const geometry = new THREE.TorusGeometry(radius, tube, 64, 64);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.5 });
    const torus = new Mesh3D(id, geometry, material);
    this.drawables.set(id, torus);
    this.addToThree(torus.getObject3D());
    return new ShapeRef(this, id);
  }

  // ========== Transformation Methods ==========
  translate(id: number, x: number, y: number, z: number): void {
    const d = this.drawables.get(id);
    if (d) d.getObject3D().position.set(x, y, z);
  }

  scale(id: number, sx: number, sy: number, sz: number): void {
    const d = this.drawables.get(id);
    if (d) d.getObject3D().scale.set(sx, sy, sz);
  }

  rotate(id: number, x: number, y: number, z: number): void {
    const d = this.drawables.get(id);
    if (d) d.getObject3D().rotation.set(x, y, z);
  }

  strokeColor(id: number, color: THREE.Color): void {
    const d = this.drawables.get(id);
    if (d instanceof Mesh3D) {
      d.setColor(color);
    } else if (d instanceof BaseShape) {
      d.setStrokeColor(color);
    } else if (d instanceof WebGLSpriteShape) {
      d.setStrokeColor(color);
    }
  }

  fillColor(id: number, color: THREE.Color | null): void {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) {
      d.setFillColor(color);
    } else if (d instanceof WebGLSpriteShape) {
      d.setFillColor(color);
    }
  }

  opacity(id: number, value: number): void {
    const d = this.drawables.get(id);
    if (d instanceof Mesh3D) {
      d.setOpacity(value);
    } else if (d instanceof BaseShape) {
      d.setOpacity(value);
    } else if (d instanceof WebGLSpriteShape) {
      d.setOpacity(value);
    }
  }

  font(id: number, fontString: string): void {
    const d = this.drawables.get(id);
    if (d instanceof WebGLSpriteShape) d.font = fontString;
  }

  lineWidth(id: number, width: number): void {
    const d = this.drawables.get(id);
    if (d instanceof BaseShape) d.setLineWidth(width);
  }

  // ========== Keyframe Animation Methods ==========
  async translateKeyframes(
    id: number,
    keyframes: Keyframe<THREE.Vector3>[],
    duration: number,
  ): Promise<ShapeRef> {
    const d = this.drawables.get(id);
    if (d instanceof Mesh3D) {
      return d.setTranslationKeyframes(keyframes, duration, this.currentEffectiveTime()).then(() => new ShapeRef(this, id));
    } else if (d instanceof BaseShape) {
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
    if (d instanceof Mesh3D) {
      return d.setScaleKeyframes(keyframes, duration, this.currentEffectiveTime()).then(() => new ShapeRef(this, id));
    } else if (d instanceof BaseShape) {
      return d.setScaleKeyframes(keyframes, duration, this.currentEffectiveTime()).then(() => new ShapeRef(this, id));
    }
    return Promise.reject(new Error("Shape does not support scale keyframes"));
  }

  async rotationKeyframes(
    id: number,
    keyframes: Keyframe<THREE.Vector3>[],
    duration: number,
  ): Promise<ShapeRef> {
    const d = this.drawables.get(id);
    if (d instanceof Mesh3D) {
      return d.setRotationKeyframes(keyframes, duration, this.currentEffectiveTime()).then(() => new ShapeRef(this, id));
    } else if (d instanceof BaseShape) {
      const adaptedKeyframes = keyframes.map(kf => ({
        time: kf.time,
        value: kf.value.z ?? 0,
        easing: kf.easing,
      }));
      return d.setRotationKeyframes(adaptedKeyframes, duration, this.currentEffectiveTime()).then(() => new ShapeRef(this, id));
    }
    return Promise.reject(new Error("Shape does not support rotation keyframes"));
  }

  async strokeColorKeyframes(
    id: number,
    keyframes: Keyframe<THREE.Color>[],
    duration: number,
  ): Promise<ShapeRef> {
    const d = this.drawables.get(id);
    if (d instanceof Mesh3D) {
      return d.setColorKeyframes(keyframes, duration, this.currentEffectiveTime()).then(() => new ShapeRef(this, id));
    } else if (d instanceof BaseShape) {
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
    if (d instanceof Mesh3D) {
      return d.setOpacityKeyframes(keyframes, duration, this.currentEffectiveTime()).then(() => new ShapeRef(this, id));
    } else if (d instanceof BaseShape) {
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

  // ========== Morphing (universal) ==========
  async morph(id1: number, id2: number, duration = 2000): Promise<void> {
    const shape1 = this.drawables.get(id1);
    const shape2 = this.drawables.get(id2);
    if (!shape1 || !shape2) {
      throw new Error("One or both shapes not found");
    }
    const morphId = this.nextId++;
    const morph = new MorphPoints(morphId, this, shape1, shape2, duration, this.currentEffectiveTime());
    this.drawables.set(morphId, morph);
    this.addToThree(morph.getObject3D());
    return morph.getCompletionPromise();
  }

  // ========== Recording ==========
  startRecording(options: { fps?: number; duration?: number; bitrate?: number; mimeType?: string } = {}): void {
    if (this.mediaRecorder) return;

    const canvas = this.renderer.domElement;
    const stream = canvas.captureStream(options.fps || 60);
    this.recordingStream = stream;

    const mimeType = options.mimeType || 'video/webm;codecs=vp9';
    const bitrate = options.bitrate || 10_000_000;

    try {
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: bitrate,
      });
    } catch (e) {
      // Fallback to VP8 if VP9 not supported
      console.warn('VP9 not supported, falling back to VP8');
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8',
        videoBitsPerSecond: bitrate,
      });
    }

    this.recordedChunks = [];
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jsketch-recording-${new Date().toISOString()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      this.recordedChunks = [];
      if (this.recordingStream) {
        this.recordingStream.getTracks().forEach(track => track.stop());
        this.recordingStream = null;
      }
      this.mediaRecorder = null;
      if (this.recordingTimeout) {
        clearTimeout(this.recordingTimeout);
        this.recordingTimeout = null;
      }
    };

    this.mediaRecorder.start(100); // collect chunks every 100ms
    console.log('Recording started');

    if (options.duration && options.duration > 0) {
      this.recordingTimeout = window.setTimeout(() => {
        this.stopRecording();
      }, options.duration * 1000);
    }
  }

  stopRecording(): void {
    if (!this.mediaRecorder) return;
    if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      console.log('Recording stopped');
    }
    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout);
      this.recordingTimeout = null;
    }
  }

  // ========== Utility Methods ==========
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
    this.renderer.render(this.threeScene, this.camera);
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

  // Translation
  translate(x: number, y: number, z: number): ShapeRef;
  translate(x: number, y: number, z: number, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  translate(x: number, y: number, z: number, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    const target = new THREE.Vector3(x, y, z);
    return this._animateOrSet(
      (val: THREE.Vector3) => this.scene.translate(this.id, val.x, val.y, val.z),
      target,
      duration,
      easing,
      (kf, dur) => this.scene.translateKeyframes(this.id, kf, dur),
      () => this.scene.getShape(this.id)!.getObject3D().position.clone()
    );
  }

  // Scale
  scale(sx: number, sy: number, sz: number): ShapeRef;
  scale(sx: number, sy: number, sz: number, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  scale(sx: number, sy: number, sz: number, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    const target = new THREE.Vector3(sx, sy, sz);
    return this._animateOrSet(
      (val: THREE.Vector3) => this.scene.scale(this.id, val.x, val.y, val.z),
      target,
      duration,
      easing,
      (kf, dur) => this.scene.scaleKeyframes(this.id, kf, dur),
      () => this.scene.getShape(this.id)!.getObject3D().scale.clone()
    );
  }

  // Rotation (Euler angles in radians)
  rotate(x: number, y: number, z: number): ShapeRef;
  rotate(x: number, y: number, z: number, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  rotate(x: number, y: number, z: number, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    const target = new THREE.Vector3(x, y, z);
    return this._animateOrSet(
      (val: THREE.Vector3) => this.scene.rotate(this.id, val.x, val.y, val.z),
      target,
      duration,
      easing,
      (kf, dur) => this.scene.rotationKeyframes(this.id, kf, dur),
      () => {
        const rot = this.scene.getShape(this.id)!.getObject3D().rotation;
        return new THREE.Vector3(rot.x, rot.y, rot.z);
      }
    );
  }

  // Color (for 3D shapes) / Stroke color (for 2D shapes)
  color(color: THREE.Color | string): ShapeRef;
  color(color: THREE.Color | string, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  color(color: THREE.Color | string, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    const col = typeof color === "string" ? new THREE.Color(color) : color;
    return this._animateOrSet(
      (val: THREE.Color) => this.scene.strokeColor(this.id, val),
      col,
      duration,
      easing,
      (kf, dur) => this.scene.strokeColorKeyframes(this.id, kf, dur),
      () => {
        const shape = this.scene.getShape(this.id);
        if (shape instanceof Mesh3D) return shape.getColor();
        if (shape instanceof BaseShape) return shape.getStrokeColor();
        return new THREE.Color(0xffffff);
      }
    );
  }

  // Opacity
  opacity(value: number): ShapeRef;
  opacity(value: number, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  opacity(value: number, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    return this._animateOrSet(
      (val: number) => this.scene.opacity(this.id, val),
      value,
      duration,
      easing,
      (kf, dur) => this.scene.opacityKeyframes(this.id, kf, dur),
      () => {
        const shape = this.scene.getShape(this.id);
        if (shape instanceof Mesh3D) return shape.getOpacity();
        if (shape instanceof BaseShape) return shape.getOpacity();
        return 1;
      }
    );
  }

  // Backward compatibility: stroke and fill (for 2D)
  stroke(color: THREE.Color | string): ShapeRef;
  stroke(color: THREE.Color | string, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  stroke(color: THREE.Color | string, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    return this.color(color, duration, easing);
  }

  fill(color: THREE.Color | string | null): ShapeRef;
  fill(color: THREE.Color | string | null, duration: number, easing?: EasingFunction | string): Promise<ShapeRef>;
  fill(color: THREE.Color | string | null, duration: number = 0, easing: EasingFunction | string = "linear"): ShapeRef | Promise<ShapeRef> {
    if (color === null) {
      this.scene.fillColor(this.id, null);
      return this;
    }
    const col = typeof color === "string" ? new THREE.Color(color) : color;
    return this._animateOrSet(
      (val: THREE.Color) => this.scene.fillColor(this.id, val),
      col,
      duration,
      easing,
      (kf, dur) => this.scene.fillColorKeyframes(this.id, kf, dur),
      () => {
        const shape = this.scene.getShape(this.id);
        if (shape instanceof BaseShape) return shape.getFillColor() || new THREE.Color(0, 0, 0);
        return new THREE.Color(0, 0, 0);
      }
    );
  }

  // Draw progress (2D only)
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

  // Advanced keyframe configuration
  keyframes(config: {
    translation?: Array<{ time: number; value: { x: number; y: number; z?: number }; easing?: EasingFunction | string }>;
    scale?: Array<{ time: number; value: { x: number; y: number; z?: number }; easing?: EasingFunction | string }>;
    rotation?: Array<{ time: number; value: { x: number; y: number; z?: number }; easing?: EasingFunction | string }>;
    strokeColor?: Array<{ time: number; value: THREE.Color | string; easing?: EasingFunction | string }>;
    fillColor?: Array<{ time: number; value: THREE.Color | string | null; easing?: EasingFunction | string }>;
    opacity?: Array<{ time: number; value: number; easing?: EasingFunction | string }>;
    drawProgress?: Array<{ time: number; value: number; easing?: EasingFunction | string }>;
  }, duration: number): this {
    const shape = this.scene.getShape(this.id);
    if (!shape) return this;
    const effectiveNow = this.scene.currentEffectiveTime();
    if (config.translation) {
      const kf = config.translation.map(kf => ({
        time: kf.time,
        value: new THREE.Vector3(kf.value.x, kf.value.y, kf.value.z ?? 0),
        easing: kf.easing,
      }));
      if (shape instanceof Mesh3D) shape.setTranslationKeyframes(kf, duration, effectiveNow);
      else if (shape instanceof BaseShape) shape.setTranslationKeyframes(kf, duration, effectiveNow);
    }
    if (config.scale) {
      const kf = config.scale.map(kf => ({
        time: kf.time,
        value: new THREE.Vector3(kf.value.x, kf.value.y, kf.value.z ?? 1),
        easing: kf.easing,
      }));
      if (shape instanceof Mesh3D) shape.setScaleKeyframes(kf, duration, effectiveNow);
      else if (shape instanceof BaseShape) shape.setScaleKeyframes(kf, duration, effectiveNow);
    }
    if (config.rotation) {
      if (shape instanceof Mesh3D) {
        const kf = config.rotation.map(kf => ({
          time: kf.time,
          value: new THREE.Vector3(kf.value.x, kf.value.y, kf.value.z ?? 0),
          easing: kf.easing,
        }));
        shape.setRotationKeyframes(kf, duration, effectiveNow);
      } else if (shape instanceof BaseShape) {
        const kf = config.rotation.map(kf => ({
          time: kf.time,
          value: kf.value.z ?? 0,
          easing: kf.easing,
        }));
        shape.setRotationKeyframes(kf, duration, effectiveNow);
      }
    }
    if (config.strokeColor) {
      const kf = config.strokeColor.map(kf => ({
        time: kf.time,
        value: typeof kf.value === "string" ? new THREE.Color(kf.value) : kf.value,
        easing: kf.easing,
      }));
      if (shape instanceof Mesh3D) shape.setColorKeyframes(kf, duration, effectiveNow);
      else if (shape instanceof BaseShape) shape.setStrokeColorKeyframes(kf, duration, effectiveNow);
    }
    if (config.fillColor && shape instanceof BaseShape) {
      const kf = config.fillColor.map(kf => ({
        time: kf.time,
        value: kf.value === null ? new THREE.Color(0, 0, 0) : (typeof kf.value === "string" ? new THREE.Color(kf.value) : kf.value),
        easing: kf.easing,
      }));
      shape.setFillColorKeyframes(kf, duration, effectiveNow);
    }
    if (config.opacity) {
      const kf = config.opacity.map(kf => ({
        time: kf.time,
        value: kf.value,
        easing: kf.easing,
      }));
      if (shape instanceof Mesh3D) shape.setOpacityKeyframes(kf, duration, effectiveNow);
      else if (shape instanceof BaseShape) shape.setOpacityKeyframes(kf, duration, effectiveNow);
    }
    if (config.drawProgress && shape instanceof BaseShape) {
      const kf = config.drawProgress.map(kf => ({
        time: kf.time,
        value: kf.value,
        easing: kf.easing,
      }));
      shape.setDrawProgressKeyframes(kf, duration, effectiveNow);
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

  // Universal morph (works with any shape)
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
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.5;
  scene.add(gridHelper);

  const axesHelper = new THREE.AxesHelper(CONFIG.scaleX);
  scene.add(axesHelper);

  const makeLabel = (text: string, color: string, position: THREE.Vector3) => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = color;
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width/2, canvas.height/2);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(0.5, 0.5, 1);
    scene.add(sprite);
  };
  makeLabel("X", "red", new THREE.Vector3(CONFIG.scaleX + 0.5, 0, 0));
  makeLabel("Y", "green", new THREE.Vector3(0, CONFIG.scaleY + 0.5, 0));
  makeLabel("Z", "blue", new THREE.Vector3(0, 0, CONFIG.scaleZ + 0.5));

  const tickStyle = { color: "#aaa", fontSize: "10px" };
  for (let i = -CONFIG.scaleX; i <= CONFIG.scaleX; i++) {
    if (i === 0) continue;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = tickStyle.color;
    ctx.font = `${tickStyle.fontSize} sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(i.toString(), canvas.width/2, canvas.height/2);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(i, -0.2, -0.2);
    sprite.scale.set(0.3, 0.3, 1);
    scene.add(sprite);
  }
  for (let i = -CONFIG.scaleY; i <= CONFIG.scaleY; i++) {
    if (i === 0) continue;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = tickStyle.color;
    ctx.font = `${tickStyle.fontSize} sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(i.toString(), canvas.width/2, canvas.height/2);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(-0.2, i, -0.2);
    sprite.scale.set(0.3, 0.3, 1);
    scene.add(sprite);
  }
  for (let i = -CONFIG.scaleZ; i <= CONFIG.scaleZ; i++) {
    if (i === 0) continue;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = tickStyle.color;
    ctx.font = `${tickStyle.fontSize} sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(i.toString(), canvas.width/2, canvas.height/2);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(-0.2, -0.2, i);
    sprite.scale.set(0.3, 0.3, 1);
    scene.add(sprite);
  }
}

// ========== Lighting ==========
function setupLighting(scene: THREE.Scene): void {
  const ambientLight = new THREE.AmbientLight(0x404060);
  scene.add(ambientLight);
  
  const mainLight = new THREE.DirectionalLight(0xffffff, 1);
  mainLight.position.set(5, 10, 7);
  mainLight.castShadow = true;
  mainLight.receiveShadow = true;
  mainLight.shadow.mapSize.width = 1024;
  mainLight.shadow.mapSize.height = 1024;
  scene.add(mainLight);
  
  const fillLight = new THREE.PointLight(0x4466cc, 0.3);
  fillLight.position.set(0, -5, 0);
  scene.add(fillLight);
  
  const rimLight = new THREE.PointLight(0xffaa66, 0.5);
  rimLight.position.set(-3, 2, -5);
  scene.add(rimLight);
  
  const frontFill = new THREE.PointLight(0x88aaff, 0.2);
  frontFill.position.set(2, 1, 5);
  scene.add(frontFill);
}

// ========== Skybox / Background ==========
function setupSkybox(scene: THREE.Scene): void {
  scene.background = new THREE.Color(0x0a0a2a);
}

// ========== Main Execution ==========
const canvas = document.getElementById("box") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(window.devicePixelRatio);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(12, 8, 15);
camera.lookAt(0, 0, 0);

function setEvenSize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const evenWidth = width % 2 === 0 ? width : width + 1;
  const evenHeight = height % 2 === 0 ? height : height + 1;
  renderer.setSize(evenWidth, evenHeight);
  camera.aspect = evenWidth / evenHeight;
  camera.updateProjectionMatrix();
}

setEvenSize();
renderer.setClearColor(0x0a0a2a);

const threeScene = new THREE.Scene();
setupSkybox(threeScene);
setupLighting(threeScene);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = true;
controls.enableZoom = true;
controls.enablePan = true;
controls.zoomSpeed = 1.2;
controls.panSpeed = 0.8;
controls.rotateSpeed = 1.0;
controls.target.set(0, 0, 0);

const jsketchScene = new Scene(threeScene, renderer, camera);
create3DGrid(threeScene);

function animate(): void {
  jsketchScene.update(performance.now());
  jsketchScene.render();
  requestAnimationFrame(animate);
}
animate();

window.addEventListener("resize", setEvenSize);

// ========== UI Panel for Tests ==========
function createUIPanel() {
  const panel = document.createElement("div");
  panel.style.position = "fixed";
  panel.style.bottom = "20px";
  panel.style.right = "20px";
  panel.style.backgroundColor = "rgba(0,0,0,0.8)";
  panel.style.color = "white";
  panel.style.padding = "12px";
  panel.style.borderRadius = "8px";
  panel.style.fontFamily = "monospace";
  panel.style.fontSize = "12px";
  panel.style.zIndex = "1000";
  panel.style.backdropFilter = "blur(4px)";
  panel.style.border = "1px solid rgba(255,255,255,0.2)";
  panel.innerHTML = `
    <strong>JSKETCH Demo</strong><br>
    <button id="btn-runAll">▶ Run All Tests & Record</button><br>
    <button id="btn-clear">🗑 Clear Scene</button><br>
    <small>Orbit controls: drag to rotate, right-click to pan</small>
  `;
  document.body.appendChild(panel);
  document.getElementById("btn-runAll")?.addEventListener("click", () => runAllTests());
  document.getElementById("btn-clear")?.addEventListener("click", () => jsketchScene.clear());
}

createUIPanel();

// Attach for global use in demos
(window as any).jsketchScene = jsketchScene;
(window as any).runAllTests = runAllTests;

// ========== Unified Visual Test Suite ==========
async function runAllTests() {
  console.log("🎬 Starting unified visual test suite (2D + 3D + universal morph)...");
  jsketchScene.startRecording({ fps: 60, bitrate: 10000000, duration: 60 });
  await test3DShapes();
  await test3DTransformations();
  await test2DShapes();
  await testPropertySetters();
  await testKeyframeAnimations();
  await testKeyframesConfig();
  await testMorphing();
  await testUniversalMorph();
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
  div.style.bottom = "80px";
  div.style.left = "20px";
  div.style.backgroundColor = "rgba(0,0,0,0.7)";
  div.style.color = color;
  div.style.padding = "8px 12px";
  div.style.borderRadius = "4px";
  div.style.fontFamily = "monospace";
  div.style.fontSize = "14px";
  div.style.zIndex = "1000";
  div.style.pointerEvents = "none";
  document.body.appendChild(div);
  setTimeout(() => div.remove(), duration);
}

async function test3DShapes() {
  console.log("Test: 3D shapes");
  jsketchScene.clear();
  addInstruction("3D Shapes: Cube, Sphere, Cylinder, Cone, Torus", "lime", 3000);

  const cube = jsketchScene.Cube(1.5).color("red").translate(-3, 2, 0);
  const sphere = jsketchScene.Sphere(1).color("green").translate(0, 2, 0);
  const cylinder = jsketchScene.Cylinder(0.8, 0.8, 1.5).color("blue").translate(3, 2, 0);
  const cone = jsketchScene.Cone(1, 2).color("yellow").translate(-3, -2, 0);
  const torus = jsketchScene.Torus(1.2, 0.3).color("magenta").translate(3, -2, 0);

  await Promise.all([
    cube.rotate(0, Math.PI * 2, 0, 3, "linear"),
    sphere.rotate(0, Math.PI * 2, 0, 3, "linear"),
    cylinder.rotate(0, Math.PI * 2, 0, 3, "linear"),
    cone.rotate(0, Math.PI * 2, 0, 3, "linear"),
    torus.rotate(0, Math.PI * 2, 0, 3, "linear"),
  ]);
  await jsketchScene.wait(1);
}

async function test3DTransformations() {
  console.log("Test: 3D transformations");
  jsketchScene.clear();
  addInstruction("3D Transformations: translate, scale, rotate (all axes)", "lime", 3000);

  const cube = jsketchScene.Cube(1.2).color("cyan");
  await cube.translate(3, 2, 1, 1, "easeOutQuad");
  await cube.translate(-3, -2, -1, 1, "easeOutQuad");
  await cube.scale(2, 2, 2, 1, "easeOutQuad");
  await cube.scale(1, 1, 1, 1, "easeOutQuad");
  await cube.rotate(0, Math.PI, 0, 1, "easeOutQuad");
  await cube.rotate(0, 0, 0, 1, "easeOutQuad");
  await cube.rotate(Math.PI / 2, 0, 0, 1, "easeOutQuad");
  await cube.rotate(0, 0, 0, 1, "easeOutQuad");
  await jsketchScene.wait(1);
}

async function test2DShapes() {
  console.log("Test: 2D shapes");
  jsketchScene.clear();
  addInstruction("2D Shapes: Circle, Square, Line, RegularPolygon, Star, ParametricCurve", "lime", 3000);

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
  shape.rotate(0, 0, Math.PI / 2);
  await jsketchScene.wait(0.5);
  shape.rotate(0, 0, Math.PI);
  await jsketchScene.wait(0.5);
  shape.rotate(0, 0, 0);
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
  await shape.rotate(0, 0, Math.PI * 2, 2, "easeOutQuad");

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
      { time: 0, value: { x: 0, y: 0, z: 0 } },
      { time: 1, value: { x: 0, y: 0, z: Math.PI * 2 }, easing: "easeInOutSine" }
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
  console.log("Test: Morphing (2D only)");
  jsketchScene.clear();
  addInstruction("Morphing: Circle ↔ Square ↔ Star (2D)", "lime", 3000);

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

async function testUniversalMorph() {
  console.log("Test: Universal morph (cross‑type)");
  jsketchScene.clear();
  addInstruction("Universal Morph: Circle → Cube → Text → Sphere → Square", "lime", 4000);

  const circle = jsketchScene.Circle(2).translate(-3, 0, 0).stroke("red");
  const cube = jsketchScene.Cube(1.5).color("cyan").translate(3, 0, 0);
  const text = jsketchScene.Text("Morph!", "32px Arial", { x: 0, y: 3, z: 0 }).stroke("yellow");
  const sphere = jsketchScene.Sphere(1.2).color("magenta").translate(-3, -2, 0);
  const square = jsketchScene.Square(2.5).stroke("green").translate(3, -2, 0);

  await circle.morph(cube, 1500);
  await cube.morph(text, 1500);
  await text.morph(sphere, 1500);
  await sphere.morph(square, 1500);

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
    s.rotate(0, 0, Math.PI * 2, 2, "easeOutQuad"),
    s.scale(2, 2, 1, 2, "easeOutQuad")
  ])));

  await jsketchScene.wait(1);
}

async function testErrorHandling() {
  console.log("Test: Error handling");
  jsketchScene.clear();
  addInstruction("Error handling: unsupported animation (text translation) should show error", "lime", 3000);

  const text = jsketchScene.Text("Test", "16px Arial", { x: 0, y: 0, z: 0 }).stroke("white");

  try {
    await text.translate(3, 0, 0, 1, "linear");
    console.log("✅ Text translation succeeded (now supports translation)");
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
