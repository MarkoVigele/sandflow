import * as THREE from "three";
import sandVert from "../shaders/sand.vert.glsl?raw";
import sandFrag from "../shaders/sand.frag.glsl?raw";
import { qualityProfile } from "../state/quality";
import { DEFAULT_RELIEF, HEIGHT_PIVOT, type HeatmapMode, type QualityId } from "../state/types";
import { canvasTexture } from "./mapsTexture";
import { fitCanvas } from "../assets/deriveMaps";
import { gpuAnisotropy, gpuTexelBudget, sandUvScale } from "../assets/texturePaths";
import type { GeneratedMaps } from "../assets/AssetService";
import { lookAoSteps } from "./look";

const MESH_SEGS: Record<QualityId, number> = {
  low: 96,
  medium: 160,
  high: 224,
  ultra: 320,
};

export class SandMesh {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  private albedo?: THREE.CanvasTexture;
  private albedoWet?: THREE.CanvasTexture;
  private concrete?: THREE.CanvasTexture;
  private normal?: THREE.CanvasTexture;
  private rough?: THREE.CanvasTexture;

  constructor(
    traySize: number,
    maps: THREE.DataTexture,
    quality: QualityId,
    heightScale: number,
  ) {
    const segs = MESH_SEGS[quality];
    const geo = new THREE.PlaneGeometry(traySize, traySize, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const fallbackAlbedo = new THREE.DataTexture(new Uint8Array([196, 162, 112, 255]), 1, 1);
    fallbackAlbedo.needsUpdate = true;
    const fallbackConcrete = new THREE.DataTexture(new Uint8Array([138, 136, 130, 255]), 1, 1);
    fallbackConcrete.needsUpdate = true;
    const fallbackHard = new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
    fallbackHard.needsUpdate = true;
    const fallbackTrail = new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
    fallbackTrail.needsUpdate = true;
    const fallbackNormal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    fallbackNormal.needsUpdate = true;
    const fallbackRough = new THREE.DataTexture(new Uint8Array([220, 220, 220, 255]), 1, 1);
    fallbackRough.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMaps: { value: maps },
        uAlbedo: { value: fallbackAlbedo },
        uAlbedoWet: { value: fallbackAlbedo },
        uHard: { value: fallbackHard },
        uTrail: { value: fallbackTrail },
        uTrailAmt: { value: 0 },
        uConcrete: { value: fallbackConcrete },
        uNormal: { value: fallbackNormal },
        uRough: { value: fallbackRough },
        uHeightScale: { value: heightScale },
        uRelief: { value: DEFAULT_RELIEF },
        uPivot: { value: HEIGHT_PIVOT },
        uTexel: { value: 1 / maps.image.width },
        uTraySize: { value: traySize },
        uSunDir: { value: new THREE.Vector3(0.42, 0.82, 0.38).normalize() },
        uSunColor: { value: new THREE.Color(1.0, 0.91, 0.76) },
        uFillDir: { value: new THREE.Vector3(-0.38, 0.55, -0.32).normalize() },
        uFillColor: { value: new THREE.Color(0.22, 0.24, 0.27) },
        uAmbient: { value: new THREE.Color(0.22, 0.21, 0.19) },
        uReceiveShadow: { value: 0 },
        uGrain: { value: 0.55 },
        uAoSteps: { value: lookAoSteps(quality) },
        uLookGrain: { value: qualityProfile(quality).lookGrain },
        uHeightMicro: { value: qualityProfile(quality).lookHeightMicro },
        uTime: { value: 0 },
        uCaustic: { value: qualityProfile(quality).lookCaustic },
        uUvScale: { value: sandUvScale(0.55) },
        uHeatMode: { value: 0 },
      },
      vertexShader: sandVert,
      fragmentShader: sandFrag,
    });

    this.material.polygonOffset = true;
    this.material.polygonOffsetFactor = -1;
    this.material.polygonOffsetUnits = -1;

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = "sand";
    this.mesh.renderOrder = 1;
  }

  setMaps(maps: THREE.DataTexture): void {
    this.material.uniforms.uMaps.value = maps;
    this.material.uniforms.uTexel.value = 1 / maps.image.width;
  }

  setHard(hard: THREE.DataTexture): void {
    this.material.uniforms.uHard.value = hard;
  }

  setTrail(trail: THREE.DataTexture): void {
    this.material.uniforms.uTrail.value = trail;
  }

  setTrailAmount(amount: number): void {
    this.material.uniforms.uTrailAmt.value = amount;
  }

  setQuality(quality: QualityId, traySize: number): void {
    const segs = MESH_SEGS[quality];
    this.mesh.geometry.dispose();
    const geo = new THREE.PlaneGeometry(traySize, traySize, segs, segs);
    geo.rotateX(-Math.PI / 2);
    this.mesh.geometry = geo;
    const shadows = qualityProfile(quality).shadows;
    this.material.uniforms.uReceiveShadow.value = shadows ? 1 : 0;
    this.material.uniforms.uAoSteps.value = lookAoSteps(quality);
    this.material.uniforms.uLookGrain.value = qualityProfile(quality).lookGrain;
    this.material.uniforms.uHeightMicro.value = qualityProfile(quality).lookHeightMicro;
    this.material.uniforms.uCaustic.value = qualityProfile(quality).lookCaustic;
    this.mesh.receiveShadow = shadows;
  }

  applyMaps(maps: GeneratedMaps, quality: QualityId = "high"): void {
    this.albedo?.dispose();
    this.albedoWet?.dispose();
    this.normal?.dispose();
    this.rough?.dispose();
    const size = gpuTexelBudget(quality);
    const aniso = gpuAnisotropy(quality);
    this.albedo = canvasTexture(fitCanvas(maps.albedo, size), aniso);
    this.albedoWet = canvasTexture(fitCanvas(maps.albedoWet ?? maps.albedo, size), aniso);
    this.normal = canvasTexture(fitCanvas(maps.normal, size), aniso);
    this.normal.colorSpace = THREE.LinearSRGBColorSpace;
    this.rough = canvasTexture(fitCanvas(maps.roughness, size), aniso);
    this.rough.colorSpace = THREE.LinearSRGBColorSpace;
    this.material.uniforms.uAlbedo.value = this.albedo;
    this.material.uniforms.uAlbedoWet.value = this.albedoWet;
    this.material.uniforms.uNormal.value = this.normal;
    this.material.uniforms.uRough.value = this.rough;
    if (maps.concrete) {
      this.concrete?.dispose();
      this.concrete = canvasTexture(fitCanvas(maps.concrete, size), aniso);
      this.material.uniforms.uConcrete.value = this.concrete;
    }
    this.material.uniforms.uUvScale.value = sandUvScale(this.material.uniforms.uGrain.value);
  }

  setHeightScale(scale: number): void {
    this.material.uniforms.uHeightScale.value = scale;
  }

  setRelief(relief: number): void {
    this.material.uniforms.uRelief.value = relief;
  }

  setSun(
    dir: THREE.Vector3,
    color: THREE.Color,
    ambient: THREE.Color,
    fillDir?: THREE.Vector3,
    fillColor?: THREE.Color,
  ): void {
    this.material.uniforms.uSunDir.value.copy(dir);
    this.material.uniforms.uSunColor.value.copy(color);
    this.material.uniforms.uAmbient.value.copy(ambient);
    if (fillDir) this.material.uniforms.uFillDir.value.copy(fillDir);
    if (fillColor) this.material.uniforms.uFillColor.value.copy(fillColor);
  }

  setGrain(grain: number): void {
    this.material.uniforms.uGrain.value = grain;
    this.material.uniforms.uUvScale.value = sandUvScale(grain);
  }

  setHeatMode(mode: HeatmapMode): void {
    this.material.uniforms.uHeatMode.value = mode === "off" ? 0 : mode === "depth" ? 2 : 1;
  }

  tick(t: number): void {
    this.material.uniforms.uTime.value = t;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.albedo?.dispose();
    this.albedoWet?.dispose();
    this.concrete?.dispose();
    this.normal?.dispose();
    this.rough?.dispose();
  }
}
