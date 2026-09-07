import * as THREE from "three";
import sandVert from "../shaders/sand.vert.glsl?raw";
import sandFrag from "../shaders/sand.frag.glsl?raw";
import type { QualityId } from "../state/types";
import { canvasTexture, linearCanvasTexture } from "./mapsTexture";
import { paintSandMaps, type GeneratedMaps } from "../assets/AssetService";
import { parseSandPalette } from "../assets/lookPrompts";
import { applyLookUniforms, LOOK } from "./look";

const MESH_SEGS: Record<QualityId, number> = {
  low: 96,
  medium: 160,
  high: 224,
  ultra: 320,
};

function pixel(r: number, g: number, b: number, a = 255): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1);
  t.needsUpdate = true;
  return t;
}

export class SandMesh {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  private albedo?: THREE.CanvasTexture;
  private wetAlbedo?: THREE.CanvasTexture;
  private normal?: THREE.CanvasTexture;
  private rough?: THREE.CanvasTexture;
  private height?: THREE.CanvasTexture;

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

    const fallbackAlbedo = pixel(214, 178, 122);
    const fallbackWet = pixel(108, 82, 52);
    const fallbackNormal = pixel(128, 128, 255);
    fallbackNormal.colorSpace = THREE.LinearSRGBColorSpace;
    const fallbackRough = pixel(220, 90, 220);
    fallbackRough.colorSpace = THREE.LinearSRGBColorSpace;
    const fallbackHeight = pixel(128, 128, 128);
    fallbackHeight.colorSpace = THREE.LinearSRGBColorSpace;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMaps: { value: maps },
        uAlbedo: { value: fallbackAlbedo },
        uWetAlbedo: { value: fallbackWet },
        uNormal: { value: fallbackNormal },
        uRough: { value: fallbackRough },
        uHeight: { value: fallbackHeight },
        uEnv: { value: env ?? fallbackAlbedo },
        uHeightScale: { value: heightScale },
        uTexel: { value: 1 / maps.image.width },
        uSunDir: { value: LOOK.sunDir.clone() },
        uSunColor: { value: LOOK.sunColor.clone() },
        uAmbient: { value: LOOK.ambient.clone() },
        uReceiveShadow: { value: 0 },
        uGrain: { value: 0.55 },
        uEnvAmt: { value: LOOK.envIntensity },
        uTime: { value: 0 },
      },
      vertexShader: sandVert,
      fragmentShader: sandFrag,
    });
    applyLookUniforms(this.material);
    this.applyMaps({
      ...paintSandMaps(96, parseSandPalette("feiner Quarzsand, warm, trocken"), 0x51a7d),
      prompt: "preview",
      composedPrompt: "preview",
      provider: "preview",
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

  setEnv(tex: THREE.Texture): void {
    this.material.uniforms.uEnv.value = tex;
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
    this.wetAlbedo?.dispose();
    this.normal?.dispose();
    this.rough?.dispose();
    this.height?.dispose();
    this.albedo = canvasTexture(maps.albedo);
    this.wetAlbedo = canvasTexture(maps.wetAlbedo ?? maps.albedo);
    this.normal = linearCanvasTexture(maps.normal);
    this.rough = linearCanvasTexture(maps.roughness);
    this.height = linearCanvasTexture(maps.height ?? maps.roughness);
    this.material.uniforms.uAlbedo.value = this.albedo;
    this.material.uniforms.uWetAlbedo.value = this.wetAlbedo;
    this.material.uniforms.uNormal.value = this.normal;
    this.material.uniforms.uRough.value = this.rough;
    this.material.uniforms.uHeight.value = this.height;
  }

  setGrain(grain: number): void {
    this.material.uniforms.uGrain.value = grain;
  }

  tick(t: number): void {
    this.material.uniforms.uTime.value = t;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.albedo?.dispose();
    this.wetAlbedo?.dispose();
    this.normal?.dispose();
    this.rough?.dispose();
    this.height?.dispose();
  }
}
