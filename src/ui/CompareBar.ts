import type { CompareMode } from "../sim/compare";
import type { Store } from "../state/store";
import { COMPARE_LABEL, compareHint, wipeFromClientX } from "./compare";

export class CompareBar {
  el: HTMLElement;
  private dragging = false;

  constructor(
    private store: Store,
    host: HTMLElement,
    private actions: {
      onCapture: () => void;
      onExport: () => void;
      onImport: () => void;
    },
  ) {
    this.el = host;
    this.render();
    let sig = "";
    store.subscribe(() => {
      const st = store.state;
      const next = `${st.compareMode}|${st.compareWipe.toFixed(3)}|${st.hasCompare}`;
      if (next !== sig) {
        sig = next;
        this.render();
      }
    });
  }

  private render(): void {
    const s = this.store.state;
    const mode = s.compareMode;
    const wipePct = (s.compareWipe * 100).toFixed(2);
    this.el.innerHTML = `
      <div class="compare-dock" role="region" aria-label="Vorher und Nachher">
        <div class="compare-row">
          <button type="button" class="btn compare-capture" data-capture>Vorher merken</button>
          <div class="compare-modes" role="group" aria-label="Vergleich">
            ${modeBtn("off", COMPARE_LABEL.off, mode)}
            ${modeBtn("wipe", COMPARE_LABEL.wipe, mode, !s.hasCompare)}
            ${modeBtn("before", COMPARE_LABEL.before, mode, !s.hasCompare)}
          </div>
          <button type="button" class="btn primary" data-export title="Aktuelle Höhenkarte als 16-Bit-PNG">Höhe PNG</button>
          <button type="button" class="btn" data-import title="PNG oder Rohhöhe laden">Höhe laden</button>
        </div>
        ${
          mode === "wipe"
            ? `<label class="compare-slider">
                <span>Trennung</span>
                <input type="range" min="0" max="1" step="0.01" value="${s.compareWipe}" data-wipe aria-label="Vergleich teilen" />
              </label>`
            : ""
        }
        <p class="compare-hint">${compareHint(s.hasCompare, mode)}</p>
      </div>
      ${
        mode === "wipe"
          ? `<div class="compare-wipe" style="left:${wipePct}%" data-wipe-line>
              <span class="compare-wipe-tag is-before">Vorher</span>
              <button type="button" class="compare-wipe-knob" data-wipe-knob aria-label="Trennung ziehen"></button>
              <span class="compare-wipe-tag is-after">Nachher</span>
            </div>`
          : mode === "before"
            ? `<div class="compare-badge">Vorher</div>`
            : ""
      }
    `;

    this.el.querySelector("[data-capture]")?.addEventListener("click", () => this.actions.onCapture());
    this.el.querySelector("[data-export]")?.addEventListener("click", () => this.actions.onExport());
    this.el.querySelector("[data-import]")?.addEventListener("click", () => this.actions.onImport());
    this.el.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.dataset.mode as CompareMode;
        this.store.patch({ compareMode: next, menuOpen: null });
      });
    });
    this.el.querySelector<HTMLInputElement>("[data-wipe]")?.addEventListener("input", (e) => {
      this.store.patch({ compareWipe: Number((e.target as HTMLInputElement).value) });
    });
    const knob = this.el.querySelector<HTMLElement>("[data-wipe-knob]");
    knob?.addEventListener("pointerdown", (e) => this.onWipeDown(e));
  }

  private onWipeDown(e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragging = true;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent): void => {
      if (!this.dragging) return;
      ev.preventDefault();
      ev.stopPropagation();
      const rect = this.el.getBoundingClientRect();
      this.store.patch({ compareWipe: wipeFromClientX(ev.clientX, rect.left, rect.width) });
    };
    const up = (ev: PointerEvent): void => {
      this.dragging = false;
      target.releasePointerCapture?.(ev.pointerId);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    move(e);
  }
}

function modeBtn(mode: CompareMode, label: string, current: CompareMode, disabled = false): string {
  return `<button type="button" class="chip ${current === mode ? "is-on" : ""}" data-mode="${mode}" ${
    disabled ? "disabled" : ""
  } aria-pressed="${current === mode}">${label}</button>`;
}
