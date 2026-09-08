import * as THREE from "three";
import waterVert from "../shaders/water.vert.glsl?raw";
import waterFrag from "../shaders/water.frag.glsl?raw";
import { DEFAULT_RELIEF, HEIGHT_PIVOT, type QualityId } from "../state/types";
import { waterQualityIndex, waterQualityTier } from "./waterQuality";

export class WaterMesh {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;

  constructor(
    traySize: number,
    maps: THREE.DataTexture,
    quality: QualityId,
    heightScale: number,
  ) {
    const tier = waterQualityTier(quality);
    const geo = new THREE.PlaneGeometry(traySize, traySize, tier.meshSegs, tier.meshSegs);
    geo.rotateX(-Math.PI / 2);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      premultipliedAlpha: false,
      uniforms: {
        uMaps: { value: maps },
        uHeightScale: { value: heightScale },
        uRelief: { value: DEFAULT_RELIEF },
        uPivot: { value: HEIGHT_PIVOT },
        uTexel: { value: 1 / Math.max(1, maps.image.width) },
        uTraySize: { value: traySize },
        uSunDir: { value: new THREE.Vector3(0.62, 0.58, 0.38).normalize() },
        uSunColor: { value: new THREE.Color(1.0, 0.9, 0.72) },
        uTime: { value: 0 },
        uQuality: { value: waterQualityIndex(quality) },
        uWaveDisplace: { value: tier.waveDisplace },
        uWaveOctaves: { value: tier.waveOctaves },
        uBeerStrength: { value: tier.beerStrength },
        uFresnelScale: { value: tier.fresnelScale },
        uFoamDetail: { value: tier.foamDetail },
        uSpecPower: { value: tier.specPower },
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
    this.material.uniforms.uTexel.value = 1 / Math.max(1, maps.image.width);
  }

  setQuality(quality: QualityId, traySize: number): void {
    const tier = waterQualityTier(quality);
    this.mesh.geometry.dispose();
    const geo = new THREE.PlaneGeometry(traySize, traySize, tier.meshSegs, tier.meshSegs);
    geo.rotateX(-Math.PI / 2);
    this.mesh.geometry = geo;
    this.material.uniforms.uQuality.value = waterQualityIndex(quality);
    this.material.uniforms.uWaveDisplace.value = tier.waveDisplace;
    this.material.uniforms.uWaveOctaves.value = tier.waveOctaves;
    this.material.uniforms.uBeerStrength.value = tier.beerStrength;
    this.material.uniforms.uFresnelScale.value = tier.fresnelScale;
    this.material.uniforms.uFoamDetail.value = tier.foamDetail;
    this.material.uniforms.uSpecPower.value = tier.specPower;
  }

  setHeightScale(scale: number): void {
    this.material.uniforms.uHeightScale.value = scale;
  }

  setRelief(relief: number): void {
    this.material.uniforms.uRelief.value = relief;
  }

  setSun(dir: THREE.Vector3, color: THREE.Color): void {
    this.material.uniforms.uSunDir.value.copy(dir);
    this.material.uniforms.uSunColor.value.copy(color);
  }

  tick(t: number): void {
    this.material.uniforms.uTime.value = t;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
