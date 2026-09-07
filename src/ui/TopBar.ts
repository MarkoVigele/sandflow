import type { Store } from "../state/store";
import { ICONS } from "./icons";
import { QualitySwitcher } from "./QualitySwitcher";
import type { QualityId } from "../state/types";

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export class TopBar {
  el: HTMLElement;
  private moreOpen = false;
  constructor(
    private store: Store,
    host: HTMLElement,
    private actions: {
      onQuality: (q: QualityId) => void;
      onSave: () => void;
      onLoad: () => void;
      onShot: () => void;
      onUndo: () => void;
      onRedo: () => void;
      onStep: () => void;
    },
  ) {
    this.el = host;
    this.render();
    let sig = "";
    store.subscribe(() => {
      const st = store.state;
      const next = `${st.playing}|${st.speed}|${st.quality}|${st.canUndo}|${st.canRedo}`;
      if (next !== sig) {
        sig = next;
        this.render();
      }
    });
    document.addEventListener("click", (e) => {
      if (!this.moreOpen) return;
      if (!this.el.contains(e.target as Node)) {
        this.moreOpen = false;
        this.render();
      }
    });
  }

  private render(): void {
    const s = this.store.state;
    this.el.innerHTML = `
      <div class="brand">
        <span class="mark">Sf</span>
        <div>
          <strong>Sandflow</strong>
          <small>Labor · V1</small>
        </div>
      </div>
      <div class="top-actions">
        <button class="chip" data-presets>Presets</button>
        <div class="q-slot"></div>
        <div class="transport">
          <button class="icon-btn" data-play title="${s.playing ? "Pause" : "Abspielen"}" aria-label="${s.playing ? "Pause" : "Abspielen"}">${s.playing ? ICONS.pause : ICONS.play}</button>
          <button class="icon-btn desktop-only" data-step title="Schritt" aria-label="Schritt">${ICONS.step}</button>
          <label class="speed">
            <span>${s.speed}×</span>
            <input type="range" min="0" max="4" step="1" value="${SPEEDS.indexOf(s.speed)}" data-speed aria-label="Tempo" />
          </label>
        </div>
        <div class="chrome-extra">
          <button class="icon-btn" data-undo title="Rückgängig" aria-label="Rückgängig" ${s.canUndo ? "" : "disabled"}>${ICONS.undo}</button>
          <button class="icon-btn" data-redo title="Wiederholen" aria-label="Wiederholen" ${s.canRedo ? "" : "disabled"}>${ICONS.redo}</button>
          <button class="icon-btn" data-save title="Szene speichern" aria-label="Speichern">${ICONS.save}</button>
          <button class="icon-btn" data-load title="Szene laden" aria-label="Laden">${ICONS.load}</button>
          <button class="icon-btn" data-shot title="Screenshot" aria-label="Screenshot">${ICONS.shot}</button>
          <button class="chip ghost" data-about>Über</button>
        </div>
        <div class="more-wrap">
          <button class="chip more-btn" data-more aria-expanded="${this.moreOpen}">Mehr</button>
          <div class="more-sheet ${this.moreOpen ? "is-open" : ""}" role="menu">
            <button data-undo ${s.canUndo ? "" : "disabled"}>${ICONS.undo}<span>Rückgängig</span></button>
            <button data-redo ${s.canRedo ? "" : "disabled"}>${ICONS.redo}<span>Wiederholen</span></button>
            <button data-step>${ICONS.step}<span>Schritt</span></button>
            <button data-save>${ICONS.save}<span>Speichern (JSON)</span></button>
            <button data-load>${ICONS.load}<span>Laden</span></button>
            <button data-shot>${ICONS.shot}<span>Screenshot (PNG)</span></button>
            <button data-about><span>Über &amp; Anleitung</span></button>
          </div>
        </div>
      </div>
    `;

    const slot = this.el.querySelector<HTMLElement>(".q-slot")!;
    new QualitySwitcher(this.store, slot, this.actions.onQuality);

    const closeMore = (): void => {
      if (!this.moreOpen) return;
      this.moreOpen = false;
      this.render();
    };

    this.el.querySelector("[data-presets]")?.addEventListener("click", () => {
      this.moreOpen = false;
      this.store.patch({ galleryOpen: true });
    });
    this.el.querySelector("[data-play]")?.addEventListener("click", () => {
      this.store.patch({ playing: !this.store.state.playing });
    });
    this.el.querySelectorAll("[data-step]").forEach((el) => {
      el.addEventListener("click", () => {
        closeMore();
        this.store.patch({ playing: false });
        this.actions.onStep();
      });
    });
    this.el.querySelector<HTMLInputElement>("[data-speed]")?.addEventListener("input", (e) => {
      const i = Number((e.target as HTMLInputElement).value);
      this.store.patch({ speed: SPEEDS[i] });
    });
    this.el.querySelectorAll("[data-undo]").forEach((el) => {
      el.addEventListener("click", () => {
        closeMore();
        this.actions.onUndo();
      });
    });
    this.el.querySelectorAll("[data-redo]").forEach((el) => {
      el.addEventListener("click", () => {
        closeMore();
        this.actions.onRedo();
      });
    });
    this.el.querySelectorAll("[data-save]").forEach((el) => {
      el.addEventListener("click", () => {
        closeMore();
        this.actions.onSave();
      });
    });
    this.el.querySelectorAll("[data-load]").forEach((el) => {
      el.addEventListener("click", () => {
        closeMore();
        this.actions.onLoad();
      });
    });
    this.el.querySelectorAll("[data-shot]").forEach((el) => {
      el.addEventListener("click", () => {
        closeMore();
        this.actions.onShot();
      });
    });
    this.el.querySelectorAll("[data-about]").forEach((el) => {
      el.addEventListener("click", () => {
        this.moreOpen = false;
        this.store.patch({ aboutOpen: true });
      });
    });
    this.el.querySelector("[data-more]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.moreOpen = !this.moreOpen;
      this.render();
    });
  }
}
