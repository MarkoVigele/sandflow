import * as THREE from "three";
import waterVert from "../shaders/water.vert.glsl?raw";
import waterFrag from "../shaders/water.frag.glsl?raw";
import type { QualityId } from "../state/types";
import { applyLookUniforms, LOOK } from "./look";

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
    env?: THREE.Texture,
  ) {
    const segs = MESH_SEGS[quality];
    const geo = new THREE.PlaneGeometry(traySize, traySize, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const fallbackEnv = new THREE.DataTexture(new Uint8Array([140, 148, 160, 255]), 1, 1);
    fallbackEnv.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMaps: { value: maps },
        uEnv: { value: env ?? fallbackEnv },
        uHeightScale: { value: heightScale },
        uTexel: { value: 1 / maps.image.width },
        uSunDir: { value: LOOK.sunDir.clone() },
        uSunColor: { value: LOOK.sunColor.clone() },
        uAmbient: { value: LOOK.ambient.clone() },
        uTime: { value: 0 },
        uEnvAmt: { value: LOOK.envIntensity },
      },
      vertexShader: waterVert,
      fragmentShader: waterFrag,
    });
    applyLookUniforms(this.material);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 2;
    this.mesh.name = "water";
  }

  setMaps(maps: THREE.DataTexture): void {
    this.material.uniforms.uMaps.value = maps;
    this.material.uniforms.uTexel.value = 1 / maps.image.width;
  }

  setEnv(tex: THREE.Texture): void {
    this.material.uniforms.uEnv.value = tex;
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
