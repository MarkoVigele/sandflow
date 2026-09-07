import * as THREE from "three";
import particleVert from "../shaders/particles.vert.glsl?raw";
import particleFrag from "../shaders/particles.frag.glsl?raw";

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
  private max: number;
  private material: THREE.ShaderMaterial;

  constructor(max = 280) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      premultipliedAlpha: false,
      uniforms: {
        uSize: { value: 2.4 },
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
  ): void {
    if (!enabled || !particles || particles.length < 3) {
      this.geo.setDrawRange(0, 0);
      this.points.visible = false;
      return;
    }
    let count = 0;
    const incoming = Math.min(this.max, (particles.length / 3) | 0);
    for (let i = 0; i < incoming; i++) {
      const u = particles[i * 3];
      const v = particles[i * 3 + 1];
      const h = particles[i * 3 + 2];
      if (!isFiniteUvHeight(u, v, h)) continue;
      this.positions[count * 3] = (u - 0.5) * traySize;
      const visualH = Math.min(Math.max(h, 0), 0.62);
      this.positions[count * 3 + 1] = visualH * heightScale + 0.01;
      this.positions[count * 3 + 2] = (v - 0.5) * traySize;
      count++;
    }
    if (count === 0) {
      this.geo.setDrawRange(0, 0);
      this.points.visible = false;
      return;
    }
    this.points.visible = true;
    const attr = this.geo.getAttribute("position") as THREE.BufferAttribute;
    attr.needsUpdate = true;
    this.geo.setDrawRange(0, count);
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}
