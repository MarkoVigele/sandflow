import * as THREE from "three";
import particleVert from "../shaders/particles.vert.glsl?raw";
import particleFrag from "../shaders/particles.frag.glsl?raw";

const MAX_DEFAULT = 280;

function samplePacked(
  packed: Float32Array,
  size: number,
  u: number,
  v: number,
  channel: number,
): number {
  const x = Math.max(0, Math.min(size - 1, Math.round(u * (size - 1))));
  const y = Math.max(0, Math.min(size - 1, Math.round(v * (size - 1))));
  return packed[(y * size + x) * 4 + channel] ?? 0;
}

/** Visual-only fallback if the sim particle list is empty but flow exists. */
function stubFromFlow(packed: Float32Array, size: number, max: number): Float32Array {
  const n = size * size;
  const stride = size > 300 ? 7 : 5;
  const picked: number[] = [];
  for (let i = 0; i < n && picked.length < max; i += stride) {
    const flow = packed[i * 4 + 3];
    const water = packed[i * 4 + 1];
    if (flow > 0.014 && water > 0.004) picked.push(i);
  }
  const out = new Float32Array(picked.length * 3);
  for (let k = 0; k < picked.length; k++) {
    const i = picked[k];
    const x = i % size;
    const y = (i - x) / size;
    out[k * 3] = x / Math.max(1, size - 1);
    out[k * 3 + 1] = y / Math.max(1, size - 1);
    out[k * 3 + 2] = packed[i * 4] + packed[i * 4 + 1];
  }
  return out;
}

export class FlowParticles {
  points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private positions: Float32Array;
  private kinds: Float32Array;
  private seeds: Float32Array;
  private flows: Float32Array;
  private max: number;
  private material: THREE.ShaderMaterial;

  constructor(max = MAX_DEFAULT) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.kinds = new Float32Array(max);
    this.seeds = new Float32Array(max);
    this.flows = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute("aKind", new THREE.BufferAttribute(this.kinds, 1));
    this.geo.setAttribute("aSeed", new THREE.BufferAttribute(this.seeds, 1));
    this.geo.setAttribute("aFlow", new THREE.BufferAttribute(this.flows, 1));
    this.geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uSize: { value: 5.4 },
      },
      vertexShader: particleVert,
      fragmentShader: particleFrag,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.points.name = "flow-particles";
  }

  update(
    particles: Float32Array,
    traySize: number,
    heightScale: number,
    enabled: boolean,
    packed?: Float32Array | null,
    size?: number,
  ): void {
    if (!enabled) {
      this.geo.setDrawRange(0, 0);
      this.points.visible = false;
      return;
    }

    let src = particles;
    if ((!src || src.length < 3) && packed && size) {
      src = stubFromFlow(packed, size, Math.min(90, this.max));
    }
    if (!src || src.length < 3) {
      this.geo.setDrawRange(0, 0);
      this.points.visible = false;
      return;
    }

    this.points.visible = true;
    const count = Math.min(this.max, (src.length / 3) | 0);
    for (let i = 0; i < count; i++) {
      const u = src[i * 3];
      const v = src[i * 3 + 1];
      const h = src[i * 3 + 2];
      const flow = packed && size ? samplePacked(packed, size, u, v, 3) : 0.04;
      const splash = flow > 0.05 ? 1 : i % 3 === 0 ? 0 : 1;
      this.positions[i * 3] = (u - 0.5) * traySize;
      this.positions[i * 3 + 1] = h * heightScale + (splash ? 0.03 : 0.012);
      this.positions[i * 3 + 2] = (v - 0.5) * traySize;
      this.kinds[i] = splash;
      this.seeds[i] = (i * 0.618033) % 1;
      this.flows[i] = flow;
    }
    (this.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("aKind") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("aSeed") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("aFlow") as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, count);
  }

  tick(t: number, pixelRatio: number): void {
    this.material.uniforms.uTime.value = t;
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}
