import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { GeneratedMaps } from "../assets/AssetService";
import { SimClient, type SimFrame, type SimSnapshot } from "../sim/SimClient";
import { getPreset, resampleHeight } from "../sim/presets";
import { History } from "../state/history";
import type { Store } from "../state/store";
import {
  QUALITY_GRID,
  isMobile,
  type QualityId,
  type ToolId,
  type WaterSource,
} from "../state/types";
import { createLabEnvironment, type LabEnvironment } from "../assets/labEnv";
import { createMapsTexture, uploadPacked } from "./mapsTexture";
import { LOOK } from "./look";
import { FlowParticles } from "./Particles";
import { SandMesh } from "./SandMesh";
import { createSourceMarker, createTray } from "./Tray";
import { WaterMesh } from "./WaterMesh";

export const TRAY_SIZE = 8;
export const HEIGHT_SCALE = 3.6;

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly sim: SimClient;
  readonly history = new History();

  sources: WaterSource[] = [];
  lastPacked: Float32Array | null = null;
  lastSize = 0;
  waterVolume = 0;
  erodedSand = 0;
  fps = 0;
  autoDropped = false;

  private store: Store;
  private host: HTMLElement;
  private maps: THREE.DataTexture;
  private sand: SandMesh;
  private water: WaterMesh;
  private particles: FlowParticles;
  private sun: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private labEnv: LabEnvironment;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDown = false;
  private strokeActive = false;
  private draggingSource: string | null = null;
  private sourceGroup = new THREE.Group();
  private markers = new Map<string, THREE.Group>();
  private raf = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private lowFpsMs = 0;
  private stepAccum = 0;
  private clock = new THREE.Clock();
  private cursorRing: THREE.Mesh;
  private onUi: () => void;

  constructor(host: HTMLElement, store: Store, onUi: () => void) {
    this.host = host;
    this.store = store;
    this.onUi = onUi;

    const canvas = document.createElement("canvas");
    host.appendChild(canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: store.state.quality !== "low",
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, store.state.quality === "ultra" ? 2 : 1.5));
    this.renderer.setClearColor(LOOK.bg, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LOOK.exposure;
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.12, 80);
    this.camera.position.set(6.4, 5.6, 6.8);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.55, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 3.2;
    this.controls.maxDistance = 15;
    this.controls.minPolarAngle = 0.22;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.14;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = {
      LEFT: -1 as unknown as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.touches = {
      ONE: -1 as unknown as THREE.TOUCH,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };

    this.scene.fog = new THREE.Fog(LOOK.bg, LOOK.fogNear, LOOK.fogFar);
    this.scene.background = new THREE.Color(LOOK.bg);

    this.labEnv = createLabEnvironment(this.renderer);
    this.scene.environment = this.labEnv.envMap;
    this.scene.environmentIntensity = LOOK.envIntensity;

    this.hemi = new THREE.HemisphereLight(LOOK.hemiSky, LOOK.hemiGround, LOOK.hemiIntensity);
    this.scene.add(this.hemi);

    this.fill = new THREE.DirectionalLight(LOOK.fillColor, LOOK.fillIntensity);
    this.fill.position.set(-5.4, 4.2, -3.6);
    this.fill.castShadow = false;
    this.scene.add(this.fill);

    this.sun = new THREE.DirectionalLight(LOOK.sunColor, LOOK.sunIntensity);
    this.sun.position.copy(LOOK.sunDir).multiplyScalar(14);
    this.sun.castShadow = false;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 28;
    this.sun.shadow.camera.left = -7;
    this.sun.shadow.camera.right = 7;
    this.sun.shadow.camera.top = 7;
    this.sun.shadow.camera.bottom = -7;
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.radius = 3.2;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.scene.add(createTray(TRAY_SIZE));

    const q = store.state.quality;
    const grid = QUALITY_GRID[q];
    this.maps = createMapsTexture(grid);
    this.sand = new SandMesh(TRAY_SIZE, this.maps, q, HEIGHT_SCALE, this.labEnv.latlong);
    this.water = new WaterMesh(TRAY_SIZE, this.maps, q, HEIGHT_SCALE, this.labEnv.latlong);
    this.particles = new FlowParticles();
    this.scene.add(this.sand.mesh, this.water.mesh, this.particles.points);
    this.sourceGroup.name = "sources";
    this.scene.add(this.sourceGroup);

    const ringGeo = new THREE.RingGeometry(0.16, 0.2, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.cursorRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xd4b483,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    this.cursorRing.visible = false;
    this.scene.add(this.cursorRing);

    this.sim = new SimClient();
    this.sim.onFrame((frame) => this.applyFrame(frame));

    this.applyQuality(q, false);
    this.loadPreset(store.state.presetId, false);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerUp);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("resize", this.resize);
    this.resize();
    this.loop();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  applyGeneratedMaps(maps: GeneratedMaps): void {
    this.sand.applyMaps(maps);
  }

  applyParams(): void {
    this.sim.setParams(this.store.state.params);
    this.sand.setGrain(this.store.state.params.grain);
  }

  applyQuality(quality: QualityId, resample = true): void {
    const shadows = quality === "high" || quality === "ultra";
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.set(quality === "ultra" ? 2048 : 1024, quality === "ultra" ? 2048 : 1024);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, quality === "low" ? 1 : quality === "ultra" ? 2 : 1.5),
    );
    this.sand.setQuality(quality, TRAY_SIZE);
    this.water.setQuality(quality, TRAY_SIZE);

    const grid = QUALITY_GRID[quality];
    if (this.lastPacked && resample && this.lastSize !== grid) {
      const { terrain, water, wetness } = this.splitPacked(this.lastPacked, this.lastSize);
      const t2 = resampleHeight(terrain, this.lastSize, grid);
      const w2 = resampleHeight(water, this.lastSize, grid);
      const n2 = resampleHeight(wetness, this.lastSize, grid);
      this.maps.dispose();
      this.maps = createMapsTexture(grid);
      this.sand.setMaps(this.maps);
      this.water.setMaps(this.maps);
      this.sim.replaceTerrain(t2, this.sources, w2, n2);
    } else if (!this.lastPacked) {
      this.maps.dispose();
      this.maps = createMapsTexture(grid);
      this.sand.setMaps(this.maps);
      this.water.setMaps(this.maps);
    }
  }

  loadPreset(id: string, recordHistory = true): void {
    const grid = QUALITY_GRID[this.store.state.quality];
    const preset = getPreset(id);
    const built = preset.build(grid);
    this.sources = built.sources.map((s) => ({ ...s }));
    this.erodedSand = 0;
    this.rebuildMarkers();
    this.maps.dispose();
    this.maps = createMapsTexture(grid);
    this.sand.setMaps(this.maps);
    this.water.setMaps(this.maps);
    this.sim.init(grid, this.store.state.params, built.terrain, this.sources);
    this.store.patch({ presetId: id, selectedSourceId: this.sources[0]?.id ?? null });
    if (recordHistory) this.history.clear();
    this.onUi();
  }

  async snapshot(): Promise<SimSnapshot> {
    return this.sim.requestSnapshot();
  }

  applySnapshot(snap: SimSnapshot): void {
    this.sources = snap.sources.map((s) => ({ ...s }));
    this.erodedSand = snap.erodedSand;
    this.rebuildMarkers();
    if (snap.size !== this.maps.image.width) {
      this.maps.dispose();
      this.maps = createMapsTexture(snap.size);
      this.sand.setMaps(this.maps);
      this.water.setMaps(this.maps);
    }
    this.sim.init(snap.size, this.store.state.params, snap.terrain, this.sources, {
      water: snap.water,
      wetness: snap.wetness,
      sediment: snap.sediment,
    });
    this.onUi();
  }

  async pushHistory(): Promise<void> {
    const snap = await this.snapshot();
    this.history.push(snap);
    this.onUi();
  }

  async undo(): Promise<void> {
    const current = await this.snapshot();
    const prev = this.history.undo(current);
    if (prev) this.applySnapshot(prev);
  }

  async redo(): Promise<void> {
    const current = await this.snapshot();
    const next = this.history.redo(current);
    if (next) this.applySnapshot(next);
  }

  resetScene(): void {
    this.loadPreset(this.store.state.presetId, true);
  }

  resetWater(): void {
    this.sim.resetWater();
  }

  addSourceAt(u: number, v: number): void {
    const src: WaterSource = {
      id: `s-${Date.now().toString(36)}`,
      x: u,
      y: v,
      rate: 1.5,
    };
    this.sources.push(src);
    this.sim.addSource(src);
    this.store.patch({ selectedSourceId: src.id });
    this.rebuildMarkers();
    this.onUi();
  }

  removeSelectedSource(): void {
    const id = this.store.state.selectedSourceId;
    if (!id) return;
    this.sources = this.sources.filter((s) => s.id !== id);
    this.sim.removeSource(id);
    this.store.patch({ selectedSourceId: this.sources[0]?.id ?? null });
    this.rebuildMarkers();
    this.onUi();
  }

  setSelectedRate(rate: number): void {
    const id = this.store.state.selectedSourceId;
    const s = this.sources.find((x) => x.id === id);
    if (!s) return;
    s.rate = rate;
    this.sim.setSourceRate(id!, rate);
    this.onUi();
  }

  screenshotPng(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.sim.dispose();
    this.sand.dispose();
    this.water.dispose();
    this.particles.dispose();
    this.maps.dispose();
    this.labEnv.dispose();
    this.renderer.dispose();
  }

  private applyFrame(frame: SimFrame): void {
    this.lastPacked = frame.packed;
    this.lastSize = frame.size;
    this.waterVolume = frame.waterVolume;
    this.erodedSand = frame.erodedSand;
    uploadPacked(this.maps, frame.packed, frame.size);
    const q = this.store.state.quality;
    this.particles.update(
      frame.particles,
      TRAY_SIZE,
      HEIGHT_SCALE,
      q === "high" || q === "ultra",
      frame.packed,
      frame.size,
    );
  }

  private splitPacked(packed: Float32Array, size: number) {
    const n = size * size;
    const terrain = new Float32Array(n);
    const water = new Float32Array(n);
    const wetness = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      terrain[i] = packed[i * 4];
      water[i] = packed[i * 4 + 1];
      wetness[i] = packed[i * 4 + 2];
    }
    return { terrain, water, wetness };
  }

  private rebuildMarkers(): void {
    for (const m of this.markers.values()) this.sourceGroup.remove(m);
    this.markers.clear();
    for (const s of this.sources) {
      const m = createSourceMarker();
      this.placeMarker(m, s);
      m.userData.id = s.id;
      this.sourceGroup.add(m);
      this.markers.set(s.id, m);
    }
  }

  private placeMarker(m: THREE.Group, s: WaterSource): void {
    const h = this.sampleHeight(s.x, s.y);
    m.position.set((s.x - 0.5) * TRAY_SIZE, h * HEIGHT_SCALE, (s.y - 0.5) * TRAY_SIZE);
  }

  private sampleHeight(u: number, v: number): number {
    if (!this.lastPacked) return 0.42;
    const size = this.lastSize;
    const x = Math.max(0, Math.min(size - 1, Math.round(u * (size - 1))));
    const y = Math.max(0, Math.min(size - 1, Math.round(v * (size - 1))));
    return this.lastPacked[(y * size + x) * 4] ?? 0.42;
  }

  private hitUv(ev: PointerEvent): { u: number; v: number; world: THREE.Vector3 } | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.sand.mesh, false);
    if (!hits.length || !hits[0].uv) return null;
    return { u: hits[0].uv.x, v: hits[0].uv.y, world: hits[0].point };
  }

  private pickSource(ev: PointerEvent): string | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const objs = [...this.markers.values()];
    const hits = this.raycaster.intersectObjects(objs, true);
    if (!hits.length) return null;
    let o: THREE.Object3D | null = hits[0].object;
    while (o && !o.userData.id) o = o.parent;
    return (o?.userData.id as string) ?? null;
  }

  private toolAt(tool: ToolId, u: number, v: number): void {
    const { brushRadius, brushStrength, pourRate } = this.store.state;
    if (tool === "pour") {
      this.sim.pour(u, v, 0.085 * pourRate);
      return;
    }
    if (tool === "source") return;
    this.sim.brush(tool, u, v, brushRadius, brushStrength);
  }

  private onPointerDown = async (ev: PointerEvent): Promise<void> => {
    if (ev.button === 2 || ev.button === 1) return;
    if (this.store.state.cameraMode) return;
    const tool = this.store.state.tool;
    this.pointerDown = true;
    this.canvas.setPointerCapture(ev.pointerId);

    if (tool === "source") {
      const id = this.pickSource(ev);
      if (id) {
        this.draggingSource = id;
        this.store.patch({ selectedSourceId: id });
        await this.pushHistory();
        this.onUi();
        return;
      }
      const hit = this.hitUv(ev);
      if (hit) {
        await this.pushHistory();
        this.addSourceAt(hit.u, hit.v);
      }
      return;
    }

    const hit = this.hitUv(ev);
    if (!hit) return;
    await this.pushHistory();
    this.strokeActive = true;
    this.toolAt(tool, hit.u, hit.v);
    this.updateCursor(hit);
  };

  private onPointerMove = (ev: PointerEvent): void => {
    const hit = this.hitUv(ev);
    if (hit) this.updateCursor(hit);
    else this.cursorRing.visible = false;

    if (!this.pointerDown) return;

    if (this.draggingSource && hit) {
      const s = this.sources.find((x) => x.id === this.draggingSource);
      if (s) {
        s.x = hit.u;
        s.y = hit.v;
        this.sim.moveSource(s.id, s.x, s.y);
        const m = this.markers.get(s.id);
        if (m) this.placeMarker(m, s);
      }
      return;
    }

    if (this.strokeActive && hit) {
      this.toolAt(this.store.state.tool, hit.u, hit.v);
    }
  };

  private onPointerUp = (ev: PointerEvent): void => {
    if (this.canvas.hasPointerCapture(ev.pointerId)) {
      this.canvas.releasePointerCapture(ev.pointerId);
    }
    this.pointerDown = false;
    this.strokeActive = false;
    this.draggingSource = null;
  };

  private updateCursor(hit: { u: number; v: number; world: THREE.Vector3 }): void {
    const r = this.store.state.brushRadius * TRAY_SIZE;
    this.cursorRing.scale.setScalar(Math.max(0.35, r / 0.18));
    this.cursorRing.position.copy(hit.world);
    this.cursorRing.position.y += 0.02;
    this.cursorRing.visible = this.store.state.tool !== "source" && !this.store.state.cameraMode;
  }

  private resize = (): void => {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.controls.update();
    this.clampCamera();

    const cam = this.store.state.cameraMode;
    this.controls.mouseButtons.LEFT = cam ? THREE.MOUSE.ROTATE : (-1 as unknown as THREE.MOUSE);
    this.controls.touches.ONE = cam ? THREE.TOUCH.ROTATE : (-1 as unknown as THREE.TOUCH);

    for (const [id, m] of this.markers) {
      const s = this.sources.find((x) => x.id === id);
      if (s) this.placeMarker(m, s);
      const sphere = m.userData.drop as THREE.Mesh;
      if (sphere) {
        const sel = id === this.store.state.selectedSourceId;
        sphere.scale.setScalar(sel ? 1.25 : 1);
      }
    }

    if (this.store.state.playing) {
      const speed = this.store.state.speed;
      if (speed < 1) {
        this.stepAccum += speed;
        if (this.stepAccum >= 1) {
          this.sim.step(1);
          this.stepAccum = 0;
        }
      } else {
        this.sim.step(Math.round(speed));
      }
    }

    this.sand.tick(t);
    this.water.tick(t);
    this.particles.tick(t, this.renderer.getPixelRatio());
    this.renderer.render(this.scene, this.camera);

    this.fpsFrames++;
    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsFrames = 0;
      this.fpsAccum = 0;
      this.maybeAutoQuality();
    }
  };

  stepOnce(): void {
    this.sim.step(1);
  }

  private clampCamera(): void {
    if (this.camera.position.y < 0.45) this.camera.position.y = 0.45;
    const tgt = this.controls.target;
    const lim = TRAY_SIZE * 0.45;
    tgt.x = Math.max(-lim, Math.min(lim, tgt.x));
    tgt.z = Math.max(-lim, Math.min(lim, tgt.z));
    tgt.y = Math.max(0.15, Math.min(2.2, tgt.y));
  }

  private maybeAutoQuality(): void {
    if (!this.store.state.autoQuality || this.autoDropped) return;
    if (!isMobile()) return;
    if (this.fps > 0 && this.fps < 25) {
      this.lowFpsMs += 500;
      if (this.lowFpsMs >= 2000) {
        const order: QualityId[] = ["ultra", "high", "medium", "low"];
        const i = order.indexOf(this.store.state.quality);
        if (i < order.length - 1) {
          const next = order[i + 1];
          this.autoDropped = true;
          this.store.patch({ quality: next });
          this.applyQuality(next, true);
          this.onUi();
        }
      }
    } else {
      this.lowFpsMs = 0;
    }
  }
}

