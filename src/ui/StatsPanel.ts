import type { Store } from "../state/store";
import type { Viewport } from "../scene/Viewport";

export class StatsPanel {
  el: HTMLElement;
  private timer = 0;
  constructor(
    private store: Store,
    host: HTMLElement,
    private viewport: Viewport,
  ) {
    this.el = host;
    this.render();
    store.subscribe(() => this.render());
    this.timer = window.setInterval(() => this.paint(), 400);
  }

  dispose(): void {
    window.clearInterval(this.timer);
  }

  private render(): void {
    const open = this.store.state.statsOpen;
    this.el.innerHTML = `
      <button class="stats-toggle" data-tog aria-expanded="${open}">Livewerte</button>
      <dl class="stats-body ${open ? "is-open" : ""}">
        <div><dt>Wasser</dt><dd data-w>—</dd></div>
        <div><dt>Erodierter Sand</dt><dd data-e>—</dd></div>
        <div><dt>FPS</dt><dd data-f>—</dd></div>
        <div><dt>Gitter</dt><dd data-g>—</dd></div>
      </dl>
    `;
    this.el.querySelector("[data-tog]")?.addEventListener("click", () => {
      this.store.patch({ statsOpen: !this.store.state.statsOpen });
    });
    this.paint();
  }

  private paint(): void {
    const w = this.el.querySelector("[data-w]");
    const e = this.el.querySelector("[data-e]");
    const f = this.el.querySelector("[data-f]");
    const g = this.el.querySelector("[data-g]");
    if (!w || !e || !f || !g) return;
    w.textContent = this.viewport.waterVolume.toFixed(1);
    e.textContent = this.viewport.erodedSand.toFixed(1);
    f.textContent = this.viewport.fps ? this.viewport.fps.toFixed(0) : "—";
    g.textContent = `${this.viewport.lastSize || "—"}²`;
  }
}
