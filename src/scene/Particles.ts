import * as THREE from "three";
import particleVert from "../shaders/particles.vert.glsl?raw";
import particleFrag from "../shaders/particles.frag.glsl?raw";
import {
  KIND_FOAM,
  MAX_PARTICLES,
  PARTICLE_STRIDE,
  unpackParticleKind,
  unpackParticleLife,
} from "../sim/flowFx";
import { effectiveHeight01 } from "./heightDisplace";

function isFiniteUvHeight(u: number, v: number, h: number): boolean {
  return (
    Number.isFinite(u) &&
    Number.isFinite(v) &&
    Number.isFinite(h) &&
    u >= 0 &&
    u <= 1 &&
    v >= 0 &&
    v <= 1 &&
    h > -0.05 &&
    h < 4
  );
}

export class FlowParticles {
  points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private positions: Float32Array;
  private kinds: Float32Array;
  private lives: Float32Array;
  private max: number;
  private material: THREE.ShaderMaterial;

  constructor(max = MAX_PARTICLES) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.kinds = new Float32Array(max);
    this.lives = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute("aKind", new THREE.BufferAttribute(this.kinds, 1));
    this.geo.setAttribute("aLife", new THREE.BufferAttribute(this.lives, 1));
    this.geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      premultipliedAlpha: false,
      uniforms: {
        uSize: { value: 2.85 },
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
    relief = 1,
  ): void {
    if (!enabled || !particles || particles.length < 3) {
      this.geo.setDrawRange(0, 0);
      this.points.visible = false;
      return;
    }
    const stride = particles.length % PARTICLE_STRIDE === 0 ? PARTICLE_STRIDE : 3;
    let count = 0;
    const incoming = Math.min(this.max, (particles.length / stride) | 0);
    for (let i = 0; i < incoming; i++) {
      const u = particles[i * stride];
      const v = particles[i * stride + 1];
      const h = particles[i * stride + 2];
      if (!isFiniteUvHeight(u, v, h)) continue;
      this.positions[count * 3] = (u - 0.5) * traySize;
      const visualH = Math.min(Math.max(effectiveHeight01(h, relief), 0), 1.15);
      this.positions[count * 3 + 1] = visualH * heightScale + 0.01;
      this.positions[count * 3 + 2] = (v - 0.5) * traySize;
      if (stride === PARTICLE_STRIDE) {
        const attr = particles[i * stride + 3];
        this.kinds[count] = unpackParticleKind(attr);
        this.lives[count] = unpackParticleLife(attr);
      } else {
        this.kinds[count] = KIND_FOAM;
        this.lives[count] = 1;
      }
      count++;
    }
    if (count === 0) {
      this.geo.setDrawRange(0, 0);
      this.points.visible = false;
      return;
    }
    this.points.visible = true;
    (this.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("aKind") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("aLife") as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, count);
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}
