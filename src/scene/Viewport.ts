import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { GeneratedMaps } from "../assets/AssetService";
import { SimClient, type SimFrame, type SimSnapshot } from "../sim/SimClient";
import { MAP_R_TERRAIN, unpackRgba } from "../sim/mapsContract";
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
import { AimCursor, type AimCursorState, type AimHit } from "../ui/AimCursor";
import { createMapsTexture, uploadPacked } from "./mapsTexture";
import { FlowParticles } from "./Particles";
import { SandMesh } from "./SandMesh";
import { createSourceMarker, createTray } from "./Tray";
import { WaterMesh } from "./WaterMesh";

export const TRAY_SIZE = 8;
export const HEIGHT_SCALE = 2.5;

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
  private hemi: THREE.HemisphereLight;
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
  private aim = new AimCursor();
  private lastAimHit: AimHit | null = null;
  private unsubStore: () => void = () => {};
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
    this.renderer.setClearColor(0x14110e, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
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

    this.scene.fog = new THREE.Fog(0x14110e, 14, 28);
    this.scene.background = new THREE.Color(0x14110e);

    this.hemi = new THREE.HemisphereLight(0xc5d4e0, 0x5a4a36, 0.55);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffe6c4, 1.45);
    this.sun.position.set(6.2, 10.5, 3.8);
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
    this.sand = new SandMesh(TRAY_SIZE, this.maps, q, HEIGHT_SCALE);
    this.water = new WaterMesh(TRAY_SIZE, this.maps, q, HEIGHT_SCALE);
    this.particles = new FlowParticles();
    this.scene.add(this.sand.mesh, this.water.mesh, this.particles.points);
    this.sourceGroup.name = "sources";
    this.scene.add(this.sourceGroup);

    this.scene.add(this.aim.group);
    this.syncAimHost();
    this.unsubStore = this.store.subscribe(() => {
      this.syncAimHost();
      if (this.store.state.cameraMode) this.aim.hide();
      else if (this.lastAimHit) this.refreshAim(this.lastAimHit);
    });

    this.sim = new SimClient();
    this.sim.onFrame((frame) => this.applyFrame(frame));

    this.applyQuality(q, false);
    this.loadPreset(store.state.presetId, false);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
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
      const { terrain, water, wetness } = unpackRgba(this.lastPacked, this.lastSize);
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
    this.unsubStore();
    this.sim.dispose();
    this.sand.dispose();
    this.water.dispose();
    this.particles.dispose();
    this.aim.dispose();
    this.maps.dispose();
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
    );
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
    return this.lastPacked[(y * size + x) * 4 + MAP_R_TERRAIN] ?? 0.42;
  }

  private hitUv(ev: PointerEvent): AimHit | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.sand.mesh, false);
    if (!hits.length || !hits[0].uv) return null;
    const u = hits[0].uv.x;
    const v = hits[0].uv.y;
    return {
      u,
      v,
      world: this.surfacePoint(u, v),
      normal: this.sampleNormal(u, v),
    };
  }

  private surfacePoint(u: number, v: number): THREE.Vector3 {
    return new THREE.Vector3(
      (u - 0.5) * TRAY_SIZE,
      this.sampleHeight(u, v) * HEIGHT_SCALE,
      (v - 0.5) * TRAY_SIZE,
    );
  }

  private sampleNormal(u: number, v: number): THREE.Vector3 {
    const e = 0.014;
    const hL = this.sampleHeight(u - e, v);
    const hR = this.sampleHeight(u + e, v);
    const hD = this.sampleHeight(u, v - e);
    const hU = this.sampleHeight(u, v + e);
    const du = new THREE.Vector3(2 * e * TRAY_SIZE, (hR - hL) * HEIGHT_SCALE, 0);
    const dv = new THREE.Vector3(0, (hU - hD) * HEIGHT_SCALE, 2 * e * TRAY_SIZE);
    return new THREE.Vector3().crossVectors(dv, du).normalize();
  }

  private aimState(): AimCursorState {
    const s = this.store.state;
    return {
      tool: s.tool,
      cameraMode: s.cameraMode,
      brushRadius: s.brushRadius,
      pourRate: s.pourRate,
      traySize: TRAY_SIZE,
      active: this.strokeActive || !!this.draggingSource,
    };
  }

  private refreshAim(hit: AimHit): void {
    this.lastAimHit = hit;
    this.aim.show(hit, this.aimState());
  }

  private syncAimHost(): void {
    this.host.classList.toggle("is-aiming", !this.store.state.cameraMode);
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
      this.sim.pour(u, v, 0.045 * pourRate);
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
        const hit = this.hitUv(ev);
        if (hit) this.refreshAim(hit);
        return;
      }
      const hit = this.hitUv(ev);
      if (hit) {
        await this.pushHistory();
        this.addSourceAt(hit.u, hit.v);
        this.refreshAim(hit);
      }
      return;
    }

    const hit = this.hitUv(ev);
    if (!hit) return;
    await this.pushHistory();
    this.strokeActive = true;
    this.toolAt(tool, hit.u, hit.v);
    this.refreshAim(hit);
  };

  private onPointerMove = (ev: PointerEvent): void => {
    const hit = this.hitUv(ev);
    if (hit) this.refreshAim(hit);
    else this.hideAim();

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
    if (ev.pointerType === "touch" || ev.pointerType === "pen") {
      this.hideAim();
    } else if (this.lastAimHit) {
      this.refreshAim(this.lastAimHit);
    }
  };

  private onPointerLeave = (ev: PointerEvent): void => {
    this.onPointerUp(ev);
    this.hideAim();
  };

  private hideAim(): void {
    this.lastAimHit = null;
    this.aim.hide();
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

    this.water.tick(t);
    if (this.lastAimHit && !this.store.state.cameraMode) {
      const { u, v } = this.lastAimHit;
      this.refreshAim({
        u,
        v,
        world: this.surfacePoint(u, v),
        normal: this.sampleNormal(u, v),
      });
    }
    this.aim.tick(t, this.strokeActive || !!this.draggingSource);
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
    const tgt = this.controls.target;
    const lim = TRAY_SIZE * 0.42;
    tgt.x = Math.max(-lim, Math.min(lim, tgt.x));
    tgt.z = Math.max(-lim, Math.min(lim, tgt.z));
    tgt.y = Math.max(0.4, Math.min(1.7, tgt.y));

    const minY = Math.max(0.62, tgt.y + 0.38);
    if (this.camera.position.y < minY) this.camera.position.y = minY;

    const floor = 0.08;
    if (this.camera.position.y < floor) this.camera.position.y = floor;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.16;
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

