import * as THREE from "three";

/** Soft lab interior: cool ceiling window, warm bench bounce. No HDR file. */
export function paintLabLatLong(width = 256, height = 128): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  const data = img.data;

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    const elev = 1 - v * 2;
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const az = (u - 0.5) * Math.PI * 2;

      let r = 42;
      let g = 38;
      let b = 34;

      if (elev > 0.12) {
        const sky = (elev - 0.12) / 0.88;
        r = 118 + sky * 62;
        g = 128 + sky * 48;
        b = 142 + sky * 28;
        const window = Math.exp(-Math.pow((az - 0.55) / 0.42, 2)) * Math.exp(-Math.pow((elev - 0.62) / 0.28, 2));
        r += window * 150;
        g += window * 128;
        b += window * 86;
      } else if (elev > -0.08) {
        r = 72;
        g = 62;
        b = 52;
      } else {
        const floor = (-elev - 0.08) / 0.92;
        r = 48 + floor * 38;
        g = 38 + floor * 22;
        b = 28 + floor * 10;
      }

      const i = (y * width + x) * 4;
      data[i] = Math.min(255, r);
      data[i + 1] = Math.min(255, g);
      data[i + 2] = Math.min(255, b);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export interface LabEnvironment {
  latlong: THREE.CanvasTexture;
  envMap: THREE.Texture;
  dispose: () => void;
}

export function createLabEnvironment(renderer: THREE.WebGLRenderer): LabEnvironment {
  const canvas = paintLabLatLong();
  const latlong = new THREE.CanvasTexture(canvas);
  latlong.mapping = THREE.EquirectangularReflectionMapping;
  latlong.colorSpace = THREE.SRGBColorSpace;
  latlong.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(latlong).texture;
  pmrem.dispose();

  return {
    latlong,
    envMap,
    dispose: () => {
      latlong.dispose();
      envMap.dispose();
    },
  };
}
