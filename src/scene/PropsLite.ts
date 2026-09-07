import * as THREE from "three";
import { surfaceWorld } from "../ui/AimCursor";
import type { ShareProp } from "../state/share";

export type PropKind = 0 | 1 | 2;

export interface PropLite {
  id: string;
  u: number;
  v: number;
  scale: number;
  rot: number;
  kind: PropKind;
}

const COLORS = [0x6b5a48, 0x7a6a55, 0x55483c];

export function cloneProps(list: PropLite[]): PropLite[] {
  return list.map((p) => ({ ...p }));
}

export function propsToShare(list: PropLite[]): ShareProp[] {
  return list.map((p) => ({ u: p.u, v: p.v, s: p.scale, r: p.rot, k: p.kind }));
}

export function propsFromShare(list: ShareProp[] | undefined): PropLite[] {
  if (!list?.length) return [];
  return list.map((p, i) => ({
    id: `p-share-${i}`,
    u: p.u,
    v: p.v,
    scale: Math.max(0.03, Math.min(0.16, p.s || 0.06)),
    rot: p.r || 0,
    kind: ((p.k | 0) % 3) as PropKind,
  }));
}

export class PropsLite {
  readonly group = new THREE.Group();
  private items = new Map<string, { prop: PropLite; mesh: THREE.Mesh }>();
  private geos: THREE.BufferGeometry[];
  private mats: THREE.MeshStandardMaterial[];

  constructor() {
    this.group.name = "props-lite";
    this.geos = [
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.OctahedronGeometry(1, 0),
    ];
    this.mats = COLORS.map(
      (color) =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.9,
          metalness: 0.03,
          flatShading: true,
        }),
    );
  }

  list(): PropLite[] {
    return cloneProps([...this.items.values()].map((x) => x.prop));
  }

  clear(): void {
    for (const { mesh } of this.items.values()) {
      this.group.remove(mesh);
    }
    this.items.clear();
  }

  setAll(props: PropLite[], heightAt: (u: number, v: number) => number, tray: number, heightScale: number): void {
    this.clear();
    for (const p of props) this.add(p, heightAt, tray, heightScale);
  }

  add(prop: PropLite, heightAt: (u: number, v: number) => number, tray: number, heightScale: number): void {
    if (this.items.has(prop.id)) this.remove(prop.id);
    const mesh = new THREE.Mesh(this.geos[prop.kind], this.mats[prop.kind]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.propId = prop.id;
    mesh.scale.setScalar(prop.scale);
    mesh.rotation.set(0.18 + prop.kind * 0.11, prop.rot, 0.08);
    this.place(mesh, prop, heightAt, tray, heightScale);
    this.group.add(mesh);
    this.items.set(prop.id, { prop: { ...prop }, mesh });
  }

  remove(id: string): boolean {
    const item = this.items.get(id);
    if (!item) return false;
    this.group.remove(item.mesh);
    this.items.delete(id);
    return true;
  }

  removeNear(u: number, v: number, radius: number): number {
    const gone: string[] = [];
    for (const [id, { prop }] of this.items) {
      if (Math.hypot(prop.u - u, prop.v - v) <= radius) gone.push(id);
    }
    for (const id of gone) this.remove(id);
    return gone.length;
  }

  settle(heightAt: (u: number, v: number) => number, tray: number, heightScale: number): void {
    for (const { prop, mesh } of this.items.values()) {
      this.place(mesh, prop, heightAt, tray, heightScale);
    }
  }

  dispose(): void {
    this.clear();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }

  private place(
    mesh: THREE.Mesh,
    prop: PropLite,
    heightAt: (u: number, v: number) => number,
    tray: number,
    heightScale: number,
  ): void {
    const world = surfaceWorld(prop.u, prop.v, heightAt(prop.u, prop.v), tray, heightScale);
    mesh.position.copy(world);
    mesh.position.y += prop.scale * 0.42;
  }
}
