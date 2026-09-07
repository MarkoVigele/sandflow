import * as THREE from "three";
import sandVert from "../shaders/sand.vert.glsl?raw";
import sandFrag from "../shaders/sand.frag.glsl?raw";
import type { QualityId } from "../state/types";
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

    this.material = new THREE.ShaderMaterial({
      lights: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.lights,
        {
          uMaps: { value: maps },
          uAlbedo: { value: null },
          uNormal: { value: null },
          uRough: { value: null },
          uHeightScale: { value: heightScale },
          uTexel: { value: 1 / maps.image.width },
          uSunDir: { value: new THREE.Vector3(0.45, 0.82, 0.28).normalize() },
          uSunColor: { value: new THREE.Color(1.0, 0.9, 0.72) },
          uAmbient: { value: new THREE.Color(0.22, 0.2, 0.17) },
          uReceiveShadow: { value: 0 },
          uGrain: { value: 0.55 },
        },
      ]),
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
    this.normal?.dispose();
    this.rough?.dispose();
    this.albedo = canvasTexture(maps.albedo);
    this.normal = canvasTexture(maps.normal);
    this.normal.colorSpace = THREE.LinearSRGBColorSpace;
    this.rough = canvasTexture(maps.roughness);
    this.rough.colorSpace = THREE.LinearSRGBColorSpace;
    this.material.uniforms.uAlbedo.value = this.albedo;
    this.material.uniforms.uNormal.value = this.normal;
    this.material.uniforms.uRough.value = this.rough;
  }

  setGrain(grain: number): void {
    this.material.uniforms.uGrain.value = grain;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.albedo?.dispose();
    this.normal?.dispose();
    this.rough?.dispose();
  }
}
