import { MAP_G_WATER, MAP_R_TERRAIN } from "../sim/mapsContract";

export type SliceSample = {
  terrain: number[];
  water: number[];
};

function sampleAt(packed: Float32Array, size: number, u: number, v: number): { h: number; w: number } {
  const x = Math.max(0, Math.min(size - 1, Math.round(u * (size - 1))));
  const y = Math.max(0, Math.min(size - 1, Math.round(v * (size - 1))));
  const o = (y * size + x) * 4;
  return { h: packed[o + MAP_R_TERRAIN] ?? 0, w: packed[o + MAP_G_WATER] ?? 0 };
}

/** Horizontal slice through the tray (constant v). Cheap heatmap companion. */
export function sampleCrossSection(
  packed: Float32Array | null,
  size: number,
  v = 0.5,
  samples = 96,
): SliceSample {
  const terrain: number[] = [];
  const water: number[] = [];
  if (!packed || size < 2 || packed.length < size * size * 4) {
    return { terrain, water };
  }
  const n = Math.max(8, Math.min(256, samples | 0));
  const vv = Math.max(0, Math.min(1, v));
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const s = sampleAt(packed, size, u, vv);
    terrain.push(s.h);
    water.push(Math.max(0, s.w));
  }
  return { terrain, water };
}

export function paintCrossSection(
  ctx: CanvasRenderingContext2D,
  slice: SliceSample,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  const n = slice.terrain.length;
  if (n < 2) return;

  let minH = Infinity;
  let maxH = -Infinity;
  for (let i = 0; i < n; i++) {
    const bed = slice.terrain[i];
    const top = bed + slice.water[i];
    if (bed < minH) minH = bed;
    if (top > maxH) maxH = top;
  }
  const span = Math.max(0.08, maxH - minH);
  const pad = 4;
  const innerH = Math.max(8, height - pad * 2);
  const yOf = (h: number) => pad + (1 - (h - minH) / span) * innerH;

  ctx.fillStyle = "rgba(20, 17, 14, 0.72)";
  ctx.fillRect(0, 0, width, height);

  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * width;
    ctx.lineTo(x, yOf(slice.terrain[i]));
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = "#8d7350";
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * width;
    const y = yOf(slice.terrain[i] + slice.water[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = n - 1; i >= 0; i--) {
    const x = (i / (n - 1)) * width;
    ctx.lineTo(x, yOf(slice.terrain[i]));
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(106, 168, 186, 0.55)";
  ctx.fill();

  ctx.strokeStyle = "rgba(212, 180, 131, 0.35)";
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
}

export class CrossSectionView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;

  constructor(host: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "section-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
  }

  setOpen(open: boolean): void {
    this.canvas.classList.toggle("is-open", open);
  }

  paint(packed: Float32Array | null, size: number, v = 0.5): void {
    if (!this.canvas.classList.contains("is-open")) return;
    const ctx = this.ctx;
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(80, this.canvas.clientWidth || 240);
    const h = Math.max(48, this.canvas.clientHeight || 72);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintCrossSection(ctx, sampleCrossSection(packed, size, v), w, h);
  }

  dispose(): void {
    this.canvas.remove();
  }
}
