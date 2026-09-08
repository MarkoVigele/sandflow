import * as THREE from "three";
import sandVert from "../shaders/sand.vert.glsl?raw";
import sandFrag from "../shaders/sand.frag.glsl?raw";
import type { HeatmapMode, QualityId } from "../state/types";
import { canvasTexture } from "./mapsTexture";
import { fitCanvas } from "../assets/deriveMaps";
import { gpuAnisotropy, gpuTexelBudget, sandUvScale } from "../assets/texturePaths";
import type { GeneratedMaps } from "../assets/AssetService";

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
    const fallbackNormal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    fallbackNormal.needsUpdate = true;
    const fallbackRough = new THREE.DataTexture(new Uint8Array([220, 220, 220, 255]), 1, 1);
    fallbackRough.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMaps: { value: maps },
        uAlbedo: { value: fallbackAlbedo },
        uAlbedoWet: { value: fallbackAlbedo },
        uNormal: { value: fallbackNormal },
        uRough: { value: fallbackRough },
        uHeightScale: { value: heightScale },
        uTexel: { value: 1 / maps.image.width },
        uTraySize: { value: traySize },
        uSunDir: { value: new THREE.Vector3(0.62, 0.58, 0.38).normalize() },
        uSunColor: { value: new THREE.Color(1.0, 0.90, 0.72) },
        uAmbient: { value: new THREE.Color(0.16, 0.15, 0.13) },
        uReceiveShadow: { value: 0 },
        uGrain: { value: 0.55 },
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

  setQuality(quality: QualityId, traySize: number): void {
    const segs = MESH_SEGS[quality];
    this.mesh.geometry.dispose();
    const geo = new THREE.PlaneGeometry(traySize, traySize, segs, segs);
    geo.rotateX(-Math.PI / 2);
    this.mesh.geometry = geo;
    const shadows = quality === "high" || quality === "ultra";
    this.material.uniforms.uReceiveShadow.value = shadows ? 1 : 0;
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
    this.material.uniforms.uUvScale.value = sandUvScale(this.material.uniforms.uGrain.value);
  }

  setHeightScale(scale: number): void {
    this.material.uniforms.uHeightScale.value = scale;
  }

  setSun(dir: THREE.Vector3, color: THREE.Color, ambient: THREE.Color): void {
    this.material.uniforms.uSunDir.value.copy(dir);
    this.material.uniforms.uSunColor.value.copy(color);
    this.material.uniforms.uAmbient.value.copy(ambient);
  }

  setGrain(grain: number): void {
    this.material.uniforms.uGrain.value = grain;
    this.material.uniforms.uUvScale.value = sandUvScale(grain);
  }

  setHeatMode(mode: HeatmapMode): void {
    this.material.uniforms.uHeatMode.value = mode === "off" ? 0 : mode === "depth" ? 2 : 1;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.albedo?.dispose();
    this.albedoWet?.dispose();
    this.normal?.dispose();
    this.rough?.dispose();
  }
}
