import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { GeneratedMaps } from "../assets/AssetService";
import { SimClient, type SimFrame, type SimSnapshot } from "../sim/SimClient";
import type { BrushKind } from "../sim/types";
import { packMapsRgba, resampleMask, stoneIslandUvRadius, unpackRgba } from "../sim/mapsContract";
import { getPreset, resampleHeight, type CameraPose } from "../sim/presets";
import { History } from "../state/history";
import type { Store } from "../state/store";
import { effectiveHeight01 } from "./heightDisplace";
import {
  autoQualityToast,
  isIosWebKit,
  nextLowerQuality,
  particleDrawCount,
  pixelRatioFor,
  qualityAntialias,
  qualityProfile,
  rendererPowerPreference,
  tickAutoQuality,
} from "../state/quality";
import {
  HEIGHT_WORLD,
  QUALITY_GRID,
  isMobile,
  type QualityId,
  type ToolId,
  type WaterSource,
} from "../state/types";
import { CrossSectionView } from "../ui/crossSection";
import { allowOneFingerOrbit, claimSourceGesture, pinGrabBeatsOrbit } from "../ui/sourceGesture";
import { isShapeTool, strokeWaypoints, toolBrushKind } from "../ui/tools";
import { isLapse, stepsThisFrame } from "../ui/transport";
import {
  AimCursor,
  pickDeformedSand,
  samplePackedHeight,
  type AimCursorState,
  type AimHit,
} from "../ui/AimCursor";
import {
  applySourceMarkerStyle,
  createSourceMarker,
  pickNearestSourceId,
  pointerPixelDelta,
  shouldStartSourceDrag,
  sourcePickRadiusPx,
  sourcePinPlantedY,
  sourcePinWorld,
} from "../ui/sourcePins";
import { gpuTexelBudget } from "../assets/texturePaths";
import {
  copyField,
  decayHeightTrail,
  extractTerrain,
  stepHeightTrail,
  TRAIL_DECAY,
  TRAIL_FADE,
  TRAIL_GAIN,
} from "./heightTrail";
import { createHardTexture, createMapsTexture, uploadHard, uploadPacked } from "./mapsTexture";
import { FlowParticles } from "./Particles";
import { PropsLite, type PropLite } from "./PropsLite";
import { SandMesh } from "./SandMesh";
import { applyTrayWood, createTray, type TrayHandle } from "./Tray";
import { WaterMesh } from "./WaterMesh";

export const TRAY_SIZE = 8;
export const HEIGHT_SCALE = HEIGHT_WORLD;

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly sim: SimClient;
  readonly history = new History();

  sources: WaterSource[] = [];
  lastPacked: Float32Array | null = null;
  lastHard: Float32Array | null = null;
  lastSize = 0;
  waterVolume = 0;
  erodedSand = 0;
  fps = 0;
  autoDropped = false;
  onToast: (msg: string) => void = () => {};

  private store: Store;
  private host: HTMLElement;
  private maps: THREE.DataTexture;
  private hardTex: THREE.DataTexture;
  private sand: SandMesh;
  private tray: TrayHandle;
  private water: WaterMesh;
  private particles: FlowParticles;
  private sun: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDown = false;
  private strokeActive = false;
  private draggingSource: string | null = null;
  private pendingSource: { id: string; x: number; y: number; pointerType: string } | null = null;
  private sourceGroup = new THREE.Group();
  private markers = new Map<string, THREE.Group>();
  private raf = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private lowFpsMs = 0;
  private stepAccum = 0;
  private clock = new THREE.Clock();
  private aim = new AimCursor();
  private propsLite = new PropsLite();
  private labMaps: GeneratedMaps | null = null;
  private labGpuSize = 0;
  private propsUndo: PropLite[][] = [];
  private propsRedo: PropLite[][] = [];
  private lastPointer: { clientX: number; clientY: number } | null = null;
  private lastStroke: { u: number; v: number } | null = null;
  private unsubStore: () => void = () => {};
  private onUi: () => void;
  private section: CrossSectionView;
  /** Hook: keep one-finger orbit off while a source pin is claimed. */
  private orbitLockedBySource = false;
  private hidden = false;
  private contextLost = false;
  private trailTex!: THREE.DataTexture;
  private trail = new Float32Array(0);
  private prevHeight = new Float32Array(0);
  private workHeight = new Float32Array(0);
  private trailSize = 0;
  private iosWebKit = isIosWebKit();

  constructor(host: HTMLElement, store: Store, onUi: () => void) {
    this.host = host;
    this.store = store;
    this.onUi = onUi;

    const canvas = document.createElement("canvas");
    host.appendChild(canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: qualityAntialias(store.state.quality, isMobile(), this.iosWebKit),
      alpha: false,
      powerPreference: rendererPowerPreference(this.iosWebKit),
      stencil: false,
      depth: true,
      failIfMajorPerformanceCaveat: false,
    });
    this.renderer.setPixelRatio(
      pixelRatioFor(store.state.quality, window.devicePixelRatio || 1, isMobile(), this.iosWebKit),
    );
    this.renderer.setClearColor(0x14110e, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.12, 80);
    this.camera.position.set(5.1, 7.4, 5.2);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.48, 0);
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

    this.scene.fog = new THREE.Fog(0x1c1a17, 16, 32);
    this.scene.background = new THREE.Color(0x1c1a17);

    this.hemi = new THREE.HemisphereLight(0xe8eef3, 0x5c5348, 0.56);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0d8, 0.86);
    this.sun.position.set(4.2, 9.6, 3.8);
    this.sun.target.position.set(0, 0.7, 0);
    this.sun.castShadow = false;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 28;
    this.sun.shadow.camera.left = -7;
    this.sun.shadow.camera.right = 7;
    this.sun.shadow.camera.top = 7;
    this.sun.shadow.camera.bottom = -7;
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.radius = 4.6;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0xc5d2e0, 0.28);
    this.fill.position.set(-5.4, 5.2, -3.6);
    this.fill.target.position.set(0, 0.55, 0);
    this.fill.castShadow = false;
    this.scene.add(this.fill);
    this.scene.add(this.fill.target);

    this.tray = createTray(TRAY_SIZE);
    this.scene.add(this.tray.group);

    const q = store.state.quality;
    const grid = QUALITY_GRID[q];
    this.maps = createMapsTexture(grid);
    this.hardTex = createHardTexture(grid);
    this.sand = new SandMesh(TRAY_SIZE, this.maps, q, this.heightScale);
    this.sand.setHard(this.hardTex);
    this.allocTrail(grid);
    this.water = new WaterMesh(TRAY_SIZE, this.maps, q, this.heightScale);
    this.particles = new FlowParticles();
    this.scene.add(this.sand.mesh, this.water.mesh, this.particles.points, this.propsLite.group);
    this.section = new CrossSectionView(host);
    this.sand.setHeatMode(store.state.heatmap);
    this.section.setOpen(store.state.sectionOpen);
    store.subscribe(() => {
      this.sand.setHeatMode(this.store.state.heatmap);
      this.section.setOpen(this.store.state.sectionOpen);
    });
    this.sourceGroup.name = "sources";
    this.scene.add(this.sourceGroup);

    this.scene.add(this.aim.group);
    this.syncAimHost();
    this.unsubStore = this.store.subscribe(() => {
      this.syncAimHost();
      if (this.store.state.cameraMode) this.aim.hide();
      else if (this.lastPointer) {
        const hit = this.hitFromClient(this.lastPointer.clientX, this.lastPointer.clientY);
        if (hit) this.refreshAim(hit);
        else this.aim.hide();
      }
    });

    this.applyRelief();
    this.applyWaves();
    this.syncSunUniforms();

    this.sim = new SimClient();
    this.sim.onFrame((frame) => this.applyFrame(frame));

    this.applyQuality(q, false);
    this.loadPreset(store.state.presetId, false);

    canvas.addEventListener("pointerdown", this.onPointerDown, true);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored, false);
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("pageshow", this.onPageShow);
    this.resize();
    this.loop();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  applyGeneratedMaps(maps: GeneratedMaps): void {
    this.labMaps = maps;
    const q = this.store.state.quality;
    this.labGpuSize = gpuTexelBudget(q);
    this.sand.applyMaps(maps, q);
    if (maps.wood) applyTrayWood(this.tray, maps.wood, maps.woodNormal, maps.woodRough, q);
  }

  applyParams(): void {
    this.sim.setParams(this.store.state.params);
    this.sand.setGrain(this.store.state.params.grain);
    this.applyRelief();
    this.applyWaves();
  }

  get heightScale(): number {
    return HEIGHT_WORLD;
  }

  get relief(): number {
    return this.store.state.relief;
  }

  applyHeightScale(): void {
    this.applyRelief();
  }

  applyRelief(relief = this.store.state.relief): void {
    this.sand.setHeightScale(HEIGHT_WORLD);
    this.water.setHeightScale(HEIGHT_WORLD);
    this.sand.setRelief(relief);
    this.water.setRelief(relief);
  }

  applyWaves(amp = this.store.state.waves): void {
    this.water.setWaves(amp);
  }

  private syncSunUniforms(): void {
    const look = qualityProfile(this.store.state.quality);
    const dir = this.sun.position.clone().sub(this.sun.target.position).normalize();
    const fillDir = this.fill.position.clone().sub(this.fill.target.position).normalize();
    const sunColor = this.sun.color.clone().multiplyScalar(0.72);
    const fillColor = this.fill.color.clone().multiplyScalar(look.lookFill);
    const ambient = new THREE.Color(0.26, 0.25, 0.23);
    this.sand.setSun(dir, sunColor, ambient, fillDir, fillColor);
    this.water.setSun(dir, sunColor);
  }

  applyQuality(quality: QualityId, resample = true): void {
    const profile = qualityProfile(quality);
    this.renderer.shadowMap.enabled = profile.shadows;
    this.sun.castShadow = profile.shadows;
    const map = Math.max(1, profile.shadowMap || 1);
    this.sun.shadow.mapSize.set(map, map);
    this.renderer.setPixelRatio(
      pixelRatioFor(quality, window.devicePixelRatio || 1, isMobile(), this.iosWebKit),
    );
    this.sim.setParticleBudget(profile.particles);
    this.particles.setBudget(profile.particles);
    this.sand.setQuality(quality, TRAY_SIZE);
    this.water.setQuality(quality, TRAY_SIZE);
    this.propsLite.setQuality(quality);
    this.fill.intensity = 0.18 + profile.lookFill * 0.35;
    this.syncSunUniforms();
    const gpuSize = gpuTexelBudget(quality);
    if (this.labMaps && gpuSize !== this.labGpuSize) {
      this.labGpuSize = gpuSize;
      this.sand.applyMaps(this.labMaps, quality);
    }
    if (this.labMaps?.wood) {
      applyTrayWood(this.tray, this.labMaps.wood, this.labMaps.woodNormal, this.labMaps.woodRough, quality);
    }

    const grid = profile.grid;
    if (this.lastPacked && resample && this.lastSize > 0 && this.lastSize !== grid) {
      const { terrain, water, wetness, flow } = unpackRgba(this.lastPacked, this.lastSize);
      const t2 = resampleHeight(terrain, this.lastSize, grid);
      const w2 = resampleHeight(water, this.lastSize, grid);
      const n2 = resampleHeight(wetness, this.lastSize, grid);
      const f2 = resampleHeight(flow, this.lastSize, grid);
      const h2 = this.lastHard ? resampleMask(this.lastHard, this.lastSize, grid) : undefined;
      this.maps.dispose();
      this.hardTex.dispose();
      this.maps = createMapsTexture(grid);
      this.hardTex = createHardTexture(grid);
      this.sand.setMaps(this.maps);
      this.sand.setHard(this.hardTex);
      this.water.setMaps(this.maps);
      const packed = packMapsRgba(t2, w2, n2, f2);
      this.lastPacked = packed;
      this.lastSize = grid;
      uploadPacked(this.maps, packed, grid);
      this.seedTrail(packed, grid);
      if (h2) {
        this.lastHard = h2;
        uploadHard(this.hardTex, h2, grid);
      }
      this.sim.replaceTerrain(t2, this.sources, w2, n2, h2);
      this.syncSourcePins();
      this.paintSection();
    } else if (!this.lastPacked || this.maps.image.width !== grid) {
      this.maps.dispose();
      this.hardTex.dispose();
      this.maps = createMapsTexture(grid);
      this.hardTex = createHardTexture(grid);
      this.sand.setMaps(this.maps);
      this.sand.setHard(this.hardTex);
      this.water.setMaps(this.maps);
      this.allocTrail(grid);
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
    this.hardTex.dispose();
    this.maps = createMapsTexture(grid);
    this.hardTex = createHardTexture(grid);
    this.sand.setMaps(this.maps);
    this.sand.setHard(this.hardTex);
    this.water.setMaps(this.maps);
    this.lastHard = built.hardmask ? built.hardmask.slice() : new Float32Array(grid * grid);
    if (this.lastHard) uploadHard(this.hardTex, this.lastHard, grid);
    const empty = new Float32Array(grid * grid);
    const packed = packMapsRgba(built.terrain, empty, empty, empty);
    this.lastPacked = packed;
    this.lastSize = grid;
    uploadPacked(this.maps, packed, grid);
    this.seedTrail(packed, grid);
    this.sim.init(grid, this.store.state.params, built.terrain, this.sources, {
      hardmask: built.hardmask,
    });
    this.syncSourcePins();
    this.paintSection();
    this.applyCamera(preset.camera);
    this.setProps([]);
    this.store.patch({ presetId: id, selectedSourceId: this.sources[0]?.id ?? null });
    if (recordHistory) {
      this.history.clear();
      this.propsUndo.length = 0;
      this.propsRedo.length = 0;
    }
    this.onUi();
  }

  applyCamera(pose?: CameraPose): void {
    if (!pose) return;
    this.camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    this.controls.target.set(pose.target[0], pose.target[1], pose.target[2]);
    this.controls.update();
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
      this.hardTex.dispose();
      this.maps = createMapsTexture(snap.size);
      this.hardTex = createHardTexture(snap.size);
      this.sand.setMaps(this.maps);
      this.sand.setHard(this.hardTex);
      this.water.setMaps(this.maps);
    }
    this.sim.init(snap.size, this.store.state.params, snap.terrain, this.sources, {
      water: snap.water,
      wetness: snap.wetness,
      sediment: snap.sediment,
      cohesion: snap.cohesion,
      hardmask: snap.hardmask ?? new Float32Array(snap.size * snap.size),
    });
    const packed = packMapsRgba(
      snap.terrain,
      snap.water,
      snap.wetness,
      new Float32Array(snap.size * snap.size),
    );
    this.lastPacked = packed;
    this.lastHard = (snap.hardmask ?? new Float32Array(snap.size * snap.size)).slice();
    this.lastSize = snap.size;
    uploadPacked(this.maps, packed, snap.size);
    uploadHard(this.hardTex, this.lastHard, snap.size);
    this.seedTrail(packed, snap.size);
    this.syncSourcePins();
    this.paintSection();
    this.onUi();
  }

  async pushHistory(): Promise<void> {
    const snap = await this.snapshot();
    this.history.push(snap);
    this.propsUndo.push(this.listProps());
    this.propsRedo.length = 0;
    this.onUi();
  }

  async undo(): Promise<void> {
    const current = await this.snapshot();
    const prev = this.history.undo(current);
    const prevProps = this.propsUndo.pop();
    if (prevProps) {
      this.propsRedo.push(this.listProps());
      this.setProps(prevProps);
    }
    if (prev) this.applySnapshot(prev);
  }

  async redo(): Promise<void> {
    const current = await this.snapshot();
    const next = this.history.redo(current);
    const nextProps = this.propsRedo.pop();
    if (nextProps) {
      this.propsUndo.push(this.listProps());
      this.setProps(nextProps);
    }
    if (next) this.applySnapshot(next);
  }

  listProps(): PropLite[] {
    return this.propsLite.list();
  }

  setProps(props: PropLite[]): void {
    this.propsLite.setAll(props, (u, v) => this.sampleHeight(u, v), TRAY_SIZE, this.heightScale);
  }

  cameraPose(): CameraPose {
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
    };
  }

  resetScene(): void {
    this.loadPreset(this.store.state.presetId, true);
  }

  resetWater(): void {
    this.sim.resetWater();
  }

  /** Pin-drag agent hook: keep one-finger orbit off while a source is moved. */
  lockOrbitForSource(active: boolean): void {
    this.orbitLockedBySource = active;
    if (active) this.applyOneFingerOrbit(false);
  }

  private applyOneFingerOrbit(allow: boolean): void {
    this.controls.mouseButtons.LEFT = allow ? THREE.MOUSE.ROTATE : (-1 as unknown as THREE.MOUSE);
    this.controls.touches.ONE = allow ? THREE.TOUCH.ROTATE : (-1 as unknown as THREE.TOUCH);
    this.controls.enableRotate = allow || !this.sourceGestureActive();
  }

  sourceGestureActive(): boolean {
    return !!this.draggingSource || !!this.pendingSource || this.orbitLockedBySource;
  }

  replaceSources(sources: WaterSource[]): void {
    for (const s of this.sources) this.sim.removeSource(s.id);
    this.sources = sources.map((s) => ({ ...s }));
    for (const s of this.sources) this.sim.addSource(s);
    this.rebuildMarkers();
    this.store.patch({ selectedSourceId: this.sources[0]?.id ?? null });
    this.onUi();
  }

  async flattenAll(): Promise<void> {
    await this.pushHistory();
    this.sim.flattenAll();
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
    const onboard = this.store.state.onboardStep === 2 ? { onboardStep: 3 as const } : {};
    this.store.patch({ selectedSourceId: src.id, ...onboard });
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
    this.pauseLoop();
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener("pageshow", this.onPageShow);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.unsubStore();
    this.sim.dispose();
    this.sand.dispose();
    for (const tex of this.tray.maps) tex.dispose();
    this.water.dispose();
    this.particles.dispose();
    this.aim.dispose();
    this.propsLite.dispose();
    this.maps.dispose();
    this.hardTex.dispose();
    this.trailTex?.dispose();
    this.section.dispose();
    this.renderer.dispose();
  }

  private allocTrail(size: number): void {
    this.trailTex?.dispose();
    this.trailTex = createHardTexture(size);
    this.trail = new Float32Array(size * size);
    this.prevHeight = new Float32Array(size * size);
    this.workHeight = new Float32Array(size * size);
    this.trailSize = size;
    this.sand.setTrail(this.trailTex);
    this.sand.setTrailAmount(0);
  }

  private seedTrail(packed: Float32Array, size: number): void {
    if (size !== this.trailSize) this.allocTrail(size);
    else this.trail.fill(0);
    extractTerrain(packed, size, this.prevHeight);
    uploadHard(this.trailTex, this.trail, size);
    this.sand.setTrailAmount(0);
  }

  private syncTrail(packed: Float32Array, size: number): void {
    if (size !== this.trailSize) {
      this.seedTrail(packed, size);
      return;
    }
    extractTerrain(packed, size, this.workHeight);
    const lapse = isLapse(this.store.state.speed);
    const show = this.store.state.trailFade;
    if (show && lapse) {
      stepHeightTrail(this.trail, this.workHeight, this.prevHeight, TRAIL_FADE, TRAIL_GAIN);
    } else {
      decayHeightTrail(this.trail, TRAIL_DECAY);
    }
    copyField(this.workHeight, this.prevHeight);
    uploadHard(this.trailTex, this.trail, size);
    this.sand.setTrailAmount(show ? 1 : 0);
  }

  private applyFrame(frame: SimFrame): void {
    if (this.maps.image.width && frame.size !== this.maps.image.width) return;
    this.lastPacked = frame.packed;
    this.lastSize = frame.size;
    this.waterVolume = frame.waterVolume;
    this.erodedSand = frame.erodedSand;
    uploadPacked(this.maps, frame.packed, frame.size);
    this.syncTrail(frame.packed, frame.size);
    if (frame.hard) {
      this.lastHard = frame.hard;
      uploadHard(this.hardTex, frame.hard, frame.size);
    }
    const q = this.store.state.quality;
    const incoming = frame.particles ? (frame.particles.length / 4) | 0 : 0;
    const draw = particleDrawCount(incoming, q);
    this.particles.update(
      frame.particles,
      TRAY_SIZE,
      this.heightScale,
      draw > 0,
      this.relief,
      draw,
    );
    this.syncSourcePins();
    this.paintSection();
  }

  private paintSection(): void {
    const src = this.sources.find((s) => s.id === this.store.state.selectedSourceId);
    this.section.paint(this.lastPacked, this.lastSize, src?.y ?? 0.5);
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
    this.syncMarkerStyles();
  }

  /** Re-plant every pin on the current heightfield so erosion cannot leave them hovering. */
  private syncSourcePins(): void {
    for (const [id, m] of this.markers) {
      const s = this.sources.find((x) => x.id === id);
      if (s) this.placeMarker(m, s);
    }
    this.syncMarkerStyles();
  }

  private syncMarkerStyles(): void {
    const selected = this.store.state.selectedSourceId;
    for (const [id, m] of this.markers) {
      applySourceMarkerStyle(m, id === selected, id === this.draggingSource);
    }
  }

  private placeMarker(m: THREE.Group, s: WaterSource): void {
    const h = this.sampleHeight(s.x, s.y);
    const world = sourcePinWorld(s.x, s.y, h, TRAY_SIZE, this.heightScale);
    m.position.copy(world);
    m.position.y = sourcePinPlantedY(h, this.heightScale);
  }

  private sampleHeight(u: number, v: number): number {
    return effectiveHeight01(samplePackedHeight(this.lastPacked, this.lastSize, u, v), this.relief);
  }

  private hitUv(ev: PointerEvent): AimHit | null {
    return this.hitFromClient(ev.clientX, ev.clientY);
  }

  private hitFromClient(clientX: number, clientY: number): AimHit | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return pickDeformedSand(
      this.raycaster.ray.origin,
      this.raycaster.ray.direction,
      TRAY_SIZE,
      this.heightScale,
      (u, v) => this.sampleHeight(u, v),
    );
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

  private refreshAim(hit: AimHit, ev?: PointerEvent): void {
    if (ev) this.lastPointer = { clientX: ev.clientX, clientY: ev.clientY };
    this.aim.show(hit, this.aimState());
  }

  private syncAimHost(): void {
    this.host.classList.toggle("is-aiming", !this.store.state.cameraMode);
  }

  private pickSource(ev: PointerEvent): string | null {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.updateMatrixWorld();
    return pickNearestSourceId(
      ev.clientX,
      ev.clientY,
      rect,
      this.camera,
      this.sources,
      (u, v) => this.sampleHeight(u, v),
      TRAY_SIZE,
      this.heightScale,
      sourcePickRadiusPx(ev.pointerType, this.store.state.cameraMode || this.store.state.tool === "source"),
    );
  }

  private toolAt(tool: ToolId, u: number, v: number): void {
    const { brushRadius, brushStrength, pourRate } = this.store.state;
    if (tool === "pour") {
      this.sim.pour(u, v, 0.045 * pourRate);
      return;
    }
    if (tool === "source") return;
    if (tool === "stone") {
      this.placeStone(u, v);
      return;
    }
    if (tool === "erase") {
      this.propsLite.removeNear(u, v, brushRadius);
    }
    const kind = toolBrushKind(tool);
    if (kind) {
      this.strokeBrush(kind, u, v, brushRadius, brushStrength);
    }
    if (this.store.state.onboardStep === 1 && isShapeTool(tool)) {
      this.store.patch({ onboardStep: 2, tool: "source" });
    }
  }

  private strokeBrush(kind: BrushKind, u: number, v: number, radius: number, strength: number): void {
    const pts = strokeWaypoints(this.lastStroke, { u, v }, radius);
    for (const p of pts) this.sim.brush(kind, p.u, p.v, radius, strength);
    this.lastStroke = { u, v };
  }

  private placeStone(u: number, v: number): void {
    if (this.lastStroke) {
      const dist = Math.hypot(u - this.lastStroke.u, v - this.lastStroke.v);
      if (dist < Math.max(0.018, this.store.state.brushRadius * 0.55)) return;
    }
    this.lastStroke = { u, v };
    const scale = THREE.MathUtils.clamp(0.034 + this.store.state.brushRadius * 0.55, 0.03, 0.14);
    const used = scale * (0.82 + Math.random() * 0.36);
    const kind = (Math.floor(Math.random() * 3) % 3) as 0 | 1 | 2;
    this.propsLite.add(
      {
        id: `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
        u,
        v,
        scale: used,
        rot: Math.random() * Math.PI * 2,
        kind,
      },
      (uu, vv) => this.sampleHeight(uu, vv),
      TRAY_SIZE,
      this.heightScale,
    );
    const grid = this.lastSize || qualityProfile(this.store.state.quality).grid;
    this.sim.brush("stone", u, v, stoneIslandUvRadius(used, grid, TRAY_SIZE), 1);
  }

  private onPointerDown = async (ev: PointerEvent): Promise<void> => {
    if (ev.button === 2 || ev.button === 1) return;
    const tool = this.store.state.tool;
    const hitSource = tool === "source" || this.store.state.cameraMode ? this.pickSource(ev) : null;
    const claim = claimSourceGesture({
      tool,
      cameraMode: this.store.state.cameraMode,
      hitSourceId: hitSource,
      draggingSource: this.draggingSource ?? this.pendingSource?.id ?? null,
    });
    if (pinGrabBeatsOrbit(claim)) {
      ev.stopImmediatePropagation();
      this.lockOrbitForSource(true);
    }
    if (claim.orbit) return;
    this.pointerDown = true;
    this.canvas.setPointerCapture(ev.pointerId);

    if (claim.sourceId) {
      this.pendingSource = {
        id: claim.sourceId,
        x: ev.clientX,
        y: ev.clientY,
        pointerType: ev.pointerType,
      };
      this.lockOrbitForSource(true);
      this.store.patch({ selectedSourceId: claim.sourceId });
      this.syncMarkerStyles();
      this.onUi();
      const hit = this.hitUv(ev);
      if (hit) this.refreshAim(hit, ev);
      return;
    }

    if (tool === "source") {
      const hit = this.hitUv(ev);
      if (hit) {
        await this.pushHistory();
        this.addSourceAt(hit.u, hit.v);
        this.refreshAim(hit, ev);
      }
      return;
    }

    const hit = this.hitUv(ev);
    if (!hit) return;
    await this.pushHistory();
    this.strokeActive = true;
    this.lastStroke = null;
    this.toolAt(tool, hit.u, hit.v);
    this.refreshAim(hit, ev);
  };

  private onPointerMove = (ev: PointerEvent): void => {
    this.lastPointer = { clientX: ev.clientX, clientY: ev.clientY };
    const hit = this.hitUv(ev);
    if (hit) this.refreshAim(hit, ev);
    else {
      this.aim.hide();
    }

    if (!this.pointerDown) return;

    if (this.pendingSource && !this.draggingSource) {
      const delta = pointerPixelDelta(
        { x: this.pendingSource.x, y: this.pendingSource.y },
        { x: ev.clientX, y: ev.clientY },
      );
      if (shouldStartSourceDrag(delta, this.pendingSource.pointerType)) {
        this.draggingSource = this.pendingSource.id;
        this.pendingSource = null;
        this.lockOrbitForSource(true);
        void this.pushHistory();
        this.syncMarkerStyles();
      }
    }

    if (this.draggingSource && hit) {
      const s = this.sources.find((x) => x.id === this.draggingSource);
      if (s) {
        s.x = hit.u;
        s.y = hit.v;
        this.sim.moveSource(s.id, s.x, s.y);
        const m = this.markers.get(s.id);
        if (m) this.placeMarker(m, s);
        this.syncMarkerStyles();
      }
      return;
    }

    if (this.pendingSource) return;

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
    this.pendingSource = null;
    this.lockOrbitForSource(false);
    this.lastStroke = null;
    this.syncMarkerStyles();
    if (ev.pointerType === "touch" || ev.pointerType === "pen") {
      this.hideAim();
    } else if (this.lastPointer) {
      const hit = this.hitFromClient(this.lastPointer.clientX, this.lastPointer.clientY);
      if (hit) this.refreshAim(hit);
      else this.hideAim();
    }
  };

  private onPointerLeave = (ev: PointerEvent): void => {
    this.onPointerUp(ev);
    this.hideAim();
  };

  private hideAim(): void {
    this.lastPointer = null;
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
    if (this.hidden || this.contextLost) {
      this.raf = 0;
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.controls.update();
    this.clampCamera();

    this.applyOneFingerOrbit(allowOneFingerOrbit(this.store.state.cameraMode, this.sourceGestureActive()));

    this.syncSourcePins();

    if (this.store.state.playing) {
      const tick = stepsThisFrame(this.store.state.speed, this.stepAccum);
      this.stepAccum = tick.accum;
      if (tick.steps > 0) this.sim.step(tick.steps);
    }

    this.water.tick(t);
    if (this.lastPointer && !this.store.state.cameraMode) {
      const hit = this.hitFromClient(this.lastPointer.clientX, this.lastPointer.clientY);
      if (hit) this.refreshAim(hit);
      else this.aim.hide();
    }
    this.aim.tick(t, this.strokeActive || !!this.draggingSource);
    this.propsLite.settle((u, v) => this.sampleHeight(u, v), TRAY_SIZE, this.heightScale);
    this.paintSection();
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
    tgt.y = Math.max(0.4, Math.min(2.2, tgt.y));

    const minY = Math.max(0.62, tgt.y + 0.38);
    if (this.camera.position.y < minY) this.camera.position.y = minY;

    const floor = 0.08;
    if (this.camera.position.y < floor) this.camera.position.y = floor;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.16;
  }

  private maybeAutoQuality(): void {
    if (!this.store.state.autoQuality) return;
    const tick = tickAutoQuality(this.fps, this.lowFpsMs);
    this.lowFpsMs = tick.lowFpsMs;
    if (!tick.shouldDrop) return;
    const next = nextLowerQuality(this.store.state.quality);
    if (!next) return;
    this.autoDropped = true;
    this.store.patch({ quality: next });
    this.applyQuality(next, true);
    this.onToast(autoQualityToast(next));
    this.onUi();
  }

  private pauseLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.clock.stop();
  }

  private resumeLoop(): void {
    if (this.hidden || this.contextLost) return;
    this.clock.start();
    this.clock.getDelta();
    if (!this.raf) this.loop();
  }

  private onVisibility = (): void => {
    if (typeof document !== "undefined" && document.hidden) this.enterBackground();
    else this.leaveBackground();
  };

  private onPageHide = (): void => {
    this.enterBackground();
  };

  private onPageShow = (): void => {
    this.leaveBackground();
  };

  private enterBackground(): void {
    this.hidden = true;
    this.pauseLoop();
  }

  private leaveBackground(): void {
    this.hidden = false;
    this.resumeLoop();
  }

  private onContextLost = (ev: Event): void => {
    ev.preventDefault();
    this.contextLost = true;
    this.pauseLoop();
    this.onToast("WebGL-Kontext verloren — warte auf Wiederherstellung.");
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    const q = this.store.state.quality;
    this.renderer.setPixelRatio(
      pixelRatioFor(q, window.devicePixelRatio || 1, isMobile(), this.iosWebKit),
    );
    this.resize();
    if (this.lastPacked && this.lastSize) {
      uploadPacked(this.maps, this.lastPacked, this.lastSize);
    }
    if (this.lastHard && this.lastSize) {
      uploadHard(this.hardTex, this.lastHard, this.lastSize);
    }
    this.renderer.shadowMap.enabled = qualityProfile(q).shadows;
    this.onToast("WebGL-Kontext wiederhergestellt.");
    this.resumeLoop();
  };
}


