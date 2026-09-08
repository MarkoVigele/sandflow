import * as THREE from "three";
import sandVert from "../shaders/sand.vert.glsl?raw";
import sandFrag from "../shaders/sand.frag.glsl?raw";
import type { HeatmapMode, QualityId } from "../state/types";
import { canvasTexture } from "./mapsTexture";
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
        uSunDir: { value: new THREE.Vector3(0.45, 0.82, 0.28).normalize() },
        uSunColor: { value: new THREE.Color(1.0, 0.91, 0.76) },
        uAmbient: { value: new THREE.Color(0.24, 0.21, 0.17) },
        uReceiveShadow: { value: 0 },
        uGrain: { value: 0.55 },
        uHeatMode: { value: 0 },
      },
      vertexShader: sandVert,
      fragmentShader: sandFrag,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = "sand";
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

  applyMaps(maps: GeneratedMaps): void {
    this.albedo?.dispose();
    this.albedoWet?.dispose();
    this.normal?.dispose();
    this.rough?.dispose();
    this.albedo = canvasTexture(maps.albedo);
    this.albedoWet = canvasTexture(maps.albedoWet ?? maps.albedo);
    this.normal = canvasTexture(maps.normal);
    this.normal.colorSpace = THREE.LinearSRGBColorSpace;
    this.rough = canvasTexture(maps.roughness);
    this.rough.colorSpace = THREE.LinearSRGBColorSpace;
    this.material.uniforms.uAlbedo.value = this.albedo;
    this.material.uniforms.uAlbedoWet.value = this.albedoWet;
    this.material.uniforms.uNormal.value = this.normal;
    this.material.uniforms.uRough.value = this.rough;
  }

  setGrain(grain: number): void {
    this.material.uniforms.uGrain.value = grain;
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
