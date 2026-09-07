import * as THREE from "three";
import waterVert from "../shaders/water.vert.glsl?raw";
import waterFrag from "../shaders/water.frag.glsl?raw";
import type { QualityId } from "../state/types";

const MESH_SEGS: Record<QualityId, number> = {
  low: 80,
  medium: 128,
  high: 192,
  ultra: 256,
};

export class WaterMesh {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;

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
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMaps: { value: maps },
        uHeightScale: { value: heightScale },
        uSunDir: { value: new THREE.Vector3(0.45, 0.82, 0.28).normalize() },
        uSunColor: { value: new THREE.Color(1.0, 0.92, 0.78) },
        uTime: { value: 0 },
      },
      vertexShader: waterVert,
      fragmentShader: waterFrag,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 2;
    this.mesh.name = "water";
  }

  setMaps(maps: THREE.DataTexture): void {
    this.material.uniforms.uMaps.value = maps;
  }

  setQuality(quality: QualityId, traySize: number): void {
    this.mesh.geometry.dispose();
    const segs = MESH_SEGS[quality];
    const geo = new THREE.PlaneGeometry(traySize, traySize, segs, segs);
    geo.rotateX(-Math.PI / 2);
    this.mesh.geometry = geo;
  }

  tick(t: number): void {
    this.material.uniforms.uTime.value = t;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
