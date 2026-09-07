import * as THREE from "three";
import heatVert from "../shaders/heatmap.vert.glsl?raw";
import heatFrag from "../shaders/heatmap.frag.glsl?raw";
import type { HeatmapMode, QualityId } from "../state/types";

const MESH_SEGS: Record<QualityId, number> = {
  low: 80,
  medium: 128,
  high: 160,
  ultra: 192,
};

export class HeatmapOverlay {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;

  constructor(traySize: number, maps: THREE.DataTexture, quality: QualityId, heightScale: number) {
    const segs = MESH_SEGS[quality];
    const geo = new THREE.PlaneGeometry(traySize, traySize, segs, segs);
    geo.rotateX(-Math.PI / 2);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uMaps: { value: maps },
        uHeightScale: { value: heightScale },
        uMode: { value: 0 },
      },
      vertexShader: heatVert,
      fragmentShader: heatFrag,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 4;
    this.mesh.name = "heatmap";
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
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

  setMode(mode: HeatmapMode): void {
    this.mesh.visible = mode !== "off";
    this.material.uniforms.uMode.value = mode === "depth" ? 2 : 1;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
