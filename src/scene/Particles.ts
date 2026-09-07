import * as THREE from "three";

export class FlowParticles {
  points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private positions: Float32Array;
  private max: number;

  constructor(max = 280) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.PointsMaterial({
      color: 0xb7d4de,
      size: 0.045,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  update(
    particles: Float32Array,
    traySize: number,
    heightScale: number,
    enabled: boolean,
  ): void {
    if (!enabled) {
      this.geo.setDrawRange(0, 0);
      this.points.visible = false;
      return;
    }
    this.points.visible = true;
    const count = Math.min(this.max, particles.length / 3);
    for (let i = 0; i < count; i++) {
      const u = particles[i * 3];
      const v = particles[i * 3 + 1];
      const h = particles[i * 3 + 2];
      this.positions[i * 3] = (u - 0.5) * traySize;
      this.positions[i * 3 + 1] = h * heightScale + 0.02;
      this.positions[i * 3 + 2] = (v - 0.5) * traySize;
    }
    const attr = this.geo.getAttribute("position") as THREE.BufferAttribute;
    attr.needsUpdate = true;
    this.geo.setDrawRange(0, count);
  }

  dispose(): void {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
