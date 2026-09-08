import { PRESETS } from "../sim/presets";
import type { Store } from "../state/store";
import { ICONS } from "./icons";

export class PresetGallery {
  el: HTMLElement;
  constructor(
    private store: Store,
    host: HTMLElement,
    private onPick: (id: string) => void,
  ) {
    this.el = host;
    this.render();
    store.subscribe(() => this.sync());
  }

  private render(): void {
    this.el.innerHTML = `
      <div class="overlay ${this.store.state.galleryOpen ? "is-open" : ""}" data-close>
        <div class="sheet gallery" role="dialog" aria-label="Vorlagen">
          <header class="sheet-head">
            <div>
              <p class="kicker">Labor</p>
              <h2>Vorlagen</h2>
            </div>
            <button class="icon-btn" data-x title="Schließen">${ICONS.close}</button>
          </header>
          <div class="cards">
            ${PRESETS.map(
              (p) => `
              <button class="card ${this.store.state.presetId === p.id ? "is-active" : ""}" data-id="${p.id}" aria-label="${p.title}">
                <span class="card-swatch swatch-${p.id}" aria-hidden="true"></span>
                <strong class="card-title">${p.title}</strong>
                <span class="card-blurb">${p.blurb}</span>
              </button>`,
            ).join("")}
          </div>
        </div>
      </div>
    `;
    this.el.querySelector("[data-x]")?.addEventListener("click", () => {
      this.store.patch({ galleryOpen: false });
    });
    this.el.querySelector("[data-close]")?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) this.store.patch({ galleryOpen: false });
    });
    this.el.querySelectorAll<HTMLButtonElement>("[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.onPick(btn.dataset.id!);
        this.store.patch({ galleryOpen: false });
      });
    });
  }

  private sync(): void {
    this.render();
  }
}
