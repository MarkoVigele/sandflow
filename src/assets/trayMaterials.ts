import * as THREE from "three";
import { fbm, hash2, mulberry32 } from "./noise";

function canvas(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

function toMaps(
  albedo: HTMLCanvasElement,
  roughness: HTMLCanvasElement,
  normal: HTMLCanvasElement,
): { albedo: THREE.CanvasTexture; roughness: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const a = new THREE.CanvasTexture(albedo);
  a.colorSpace = THREE.SRGBColorSpace;
  a.wrapS = a.wrapT = THREE.RepeatWrapping;
  a.anisotropy = 4;
  const r = new THREE.CanvasTexture(roughness);
  r.colorSpace = THREE.LinearSRGBColorSpace;
  r.wrapS = r.wrapT = THREE.RepeatWrapping;
  const n = new THREE.CanvasTexture(normal);
  n.colorSpace = THREE.LinearSRGBColorSpace;
  n.wrapS = n.wrapT = THREE.RepeatWrapping;
  a.needsUpdate = r.needsUpdate = n.needsUpdate = true;
  return { albedo: a, roughness: r, normal: n };
}

function paintWood(size = 256): {
  albedo: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
  normal: HTMLCanvasElement;
} {
  const albedo = canvas(size);
  const roughness = canvas(size);
  const normal = canvas(size);
  const aCtx = albedo.getContext("2d")!;
  const rCtx = roughness.getContext("2d")!;
  const nCtx = normal.getContext("2d")!;
  const aImg = aCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const nImg = nCtx.createImageData(size, size);
  const rand = mulberry32(0x51a7);
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const ring = fbm(u * 1.2, v * 14 + Math.sin(u * 18) * 0.15, 4, 17);
      const pore = hash2(x * 0.8, y * 2.4, 4);
      heights[y * size + x] = ring * 0.85 + pore * 0.15;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const h = heights[y * size + x];
      const dark = h > 0.62;
      const r = 148 + h * 58 + (rand() - 0.5) * 10;
      const g = 102 + h * 40 + (rand() - 0.5) * 8;
      const b = 62 + h * 20;
      aImg.data[i] = Math.max(0, Math.min(255, dark ? r * 0.78 : r));
      aImg.data[i + 1] = Math.max(0, Math.min(255, dark ? g * 0.76 : g));
      aImg.data[i + 2] = Math.max(0, Math.min(255, dark ? b * 0.72 : b));
      aImg.data[i + 3] = 255;

      const rough = dark ? 150 : 190 + h * 30;
      rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = Math.min(255, rough);
      rImg.data[i + 3] = 255;

      const xL = x === 0 ? size - 1 : x - 1;
      const xR = x === size - 1 ? 0 : x + 1;
      const yD = y === 0 ? size - 1 : y - 1;
      const yU = y === size - 1 ? 0 : y + 1;
      const nx = (heights[y * size + xL] - heights[y * size + xR]) * 1.8;
      const ny = (heights[yD * size + x] - heights[yU * size + x]) * 1.8;
      nImg.data[i] = Math.max(0, Math.min(255, 128 + nx * 180));
      nImg.data[i + 1] = Math.max(0, Math.min(255, 128 + ny * 180));
      nImg.data[i + 2] = 255;
      nImg.data[i + 3] = 255;
    }
  }
  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);
  return { albedo, roughness, normal };
}

function paintLabBench(size = 256): {
  albedo: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
  normal: HTMLCanvasElement;
} {
  const albedo = canvas(size);
  const roughness = canvas(size);
  const normal = canvas(size);
  const aCtx = albedo.getContext("2d")!;
  const rCtx = roughness.getContext("2d")!;
  const nCtx = normal.getContext("2d")!;
  const aImg = aCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const nImg = nCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = fbm(x / size * 4.5, y / size * 4.5, 3, 88);
      const speck = hash2(x * 1.3, y * 1.7, 12);
      const base = 28 + n * 10;
      const chip = speck > 0.985 ? 18 : speck > 0.96 ? -8 : 0;
      aImg.data[i] = Math.max(0, Math.min(255, base + 6 + chip));
      aImg.data[i + 1] = Math.max(0, Math.min(255, base + 3 + chip * 0.7));
      aImg.data[i + 2] = Math.max(0, Math.min(255, base + chip * 0.5));
      aImg.data[i + 3] = 255;

      const rough = 210 + n * 25 + (speck > 0.97 ? -40 : 0);
      rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = Math.min(255, rough);
      rImg.data[i + 3] = 255;

      nImg.data[i] = 128 + (speck - 0.5) * 18;
      nImg.data[i + 1] = 128 + (n - 0.5) * 14;
      nImg.data[i + 2] = 255;
      nImg.data[i + 3] = 255;
    }
  }
  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);
  return { albedo, roughness, normal };
}

export function createWoodMaterial(): THREE.MeshStandardMaterial {
  const painted = paintWood();
  const t = toMaps(painted.albedo, painted.roughness, painted.normal);
  const mat = new THREE.MeshStandardMaterial({
    map: t.albedo,
    roughnessMap: t.roughness,
    normalMap: t.normal,
    roughness: 0.78,
    metalness: 0.04,
    envMapIntensity: 0.45,
  });
  mat.normalScale.set(0.55, 0.55);
  t.albedo.repeat.set(1.4, 2.2);
  t.roughness.repeat.set(1.4, 2.2);
  t.normal.repeat.set(1.4, 2.2);
  mat.userData.maps = t;
  return mat;
}

export function createLabBenchMaterial(): THREE.MeshStandardMaterial {
  const painted = paintLabBench();
  const t = toMaps(painted.albedo, painted.roughness, painted.normal);
  const mat = new THREE.MeshStandardMaterial({
    map: t.albedo,
    roughnessMap: t.roughness,
    normalMap: t.normal,
    roughness: 0.88,
    metalness: 0.06,
    envMapIntensity: 0.3,
  });
  mat.normalScale.set(0.22, 0.22);
  mat.userData.maps = t;
  return mat;
}

export function createRimLipMaterial(): THREE.MeshStandardMaterial {
  const painted = paintWood();
  const t = toMaps(painted.albedo, painted.roughness, painted.normal);
  const mat = new THREE.MeshStandardMaterial({
    map: t.albedo,
    roughnessMap: t.roughness,
    color: 0xc4a06a,
    roughness: 0.52,
    metalness: 0.08,
    envMapIntensity: 0.55,
  });
  mat.userData.maps = t;
  return mat;
}

export function createUnderBedMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x3a3126,
    roughness: 0.94,
    metalness: 0.02,
    envMapIntensity: 0.2,
  });
}
