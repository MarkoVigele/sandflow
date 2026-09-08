import * as THREE from "three";

export function createHardTexture(size: number): THREE.DataTexture {
  const data = new Float32Array(size * size);
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.FloatType);
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.unpackAlignment = 1;
  return tex;
}

export function uploadHard(tex: THREE.DataTexture, hard: Float32Array, size: number): void {
  const image = tex.image as unknown as { data: Float32Array; width: number; height: number };
  if (image.width !== size) {
    tex.image = { data: hard, width: size, height: size } as unknown as typeof tex.image;
  } else {
    image.data = hard;
  }
  tex.needsUpdate = true;
}

export function createMapsTexture(size: number): THREE.DataTexture {
  const data = new Float32Array(size * size * 4);
  const tex = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  return tex;
}

export function uploadPacked(tex: THREE.DataTexture, packed: Float32Array, size: number): void {
  const image = tex.image as unknown as { data: Float32Array; width: number; height: number };
  if (image.width !== size) {
    tex.image = { data: packed, width: size, height: size } as unknown as typeof tex.image;
  } else {
    image.data = packed;
  }
  tex.needsUpdate = true;
}

export function canvasTexture(canvas: HTMLCanvasElement, anisotropy = 2): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.max(1, anisotropy);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
