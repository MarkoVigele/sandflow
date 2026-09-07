import { persistOnboardDone, type Store } from "../state/store";
import { ICONS } from "./icons";
import { QualitySwitcher } from "./QualitySwitcher";
import type { QualityId } from "../state/types";

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export class TopBar {
  el: HTMLElement;
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
      const next = `${st.playing}|${st.speed}|${st.quality}|${st.onboardStep}`;
      if (next !== sig) {
        sig = next;
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
          <button class="icon-btn ${s.onboardStep === 3 ? "is-hint" : ""}" data-play title="${s.playing ? "Pause" : "Abspielen"}">${s.playing ? ICONS.pause : ICONS.play}</button>
          <button class="icon-btn" data-step title="Schritt">${ICONS.step}</button>
          <label class="speed">
            <span>${s.speed}×</span>
            <input type="range" min="0" max="4" step="1" value="${SPEEDS.indexOf(s.speed)}" data-speed />
          </label>
        </div>
        <button class="icon-btn" data-undo title="Rückgängig">${ICONS.undo}</button>
        <button class="icon-btn" data-redo title="Wiederholen">${ICONS.redo}</button>
        <button class="icon-btn" data-save title="Szene speichern">${ICONS.save}</button>
        <button class="icon-btn" data-load title="Szene laden">${ICONS.load}</button>
        <button class="icon-btn" data-shot title="Screenshot">${ICONS.shot}</button>
        <button class="chip ghost" data-about>Über</button>
      </div>
    `;

    const slot = this.el.querySelector<HTMLElement>(".q-slot")!;
    new QualitySwitcher(this.store, slot, this.actions.onQuality);

    this.el.querySelector("[data-presets]")?.addEventListener("click", () => {
      this.store.patch({ galleryOpen: true });
    });
    this.el.querySelector("[data-play]")?.addEventListener("click", () => {
      const playing = !this.store.state.playing;
      if (playing && this.store.state.onboardStep === 3) {
        persistOnboardDone();
        this.store.patch({ playing: true, onboardStep: 0 });
        return;
      }
      this.store.patch({ playing });
    });
    this.el.querySelector("[data-step]")?.addEventListener("click", () => {
      this.store.patch({ playing: false });
      this.actions.onStep();
    });
    this.el.querySelector<HTMLInputElement>("[data-speed]")?.addEventListener("input", (e) => {
      const i = Number((e.target as HTMLInputElement).value);
      this.store.patch({ speed: SPEEDS[i] });
    });
    this.el.querySelector("[data-undo]")?.addEventListener("click", this.actions.onUndo);
    this.el.querySelector("[data-redo]")?.addEventListener("click", this.actions.onRedo);
    this.el.querySelector("[data-save]")?.addEventListener("click", this.actions.onSave);
    this.el.querySelector("[data-load]")?.addEventListener("click", this.actions.onLoad);
    this.el.querySelector("[data-shot]")?.addEventListener("click", this.actions.onShot);
    this.el.querySelector("[data-about]")?.addEventListener("click", () => {
      this.store.patch({ aboutOpen: true });
    });
  }
}
