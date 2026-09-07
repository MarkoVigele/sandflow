import { persistOnboardDone, type Store } from "../state/store";
import { SPEEDS, speedLabel } from "../state/types";
import type { QualityId } from "../state/types";
import { ICONS } from "./icons";
import { QualitySwitcher } from "./QualitySwitcher";

export class TopBar {
  el: HTMLElement;
  constructor(
    private store: Store,
    host: HTMLElement,
    private actions: {
      onQuality: (q: QualityId) => void;
      onAutoQuality: () => void;
      onSave: () => void;
      onLoad: () => void;
      onShot: () => void;
      onUndo: () => void;
      onRedo: () => void;
      onStep: () => void;
      onResetScene: () => void;
      onResetWater: () => void;
      onShareLink: () => void;
      onShareJson: () => void;
    },
  ) {
    this.el = host;
    this.render();
    let sig = "";
    store.subscribe(() => {
      const st = store.state;
      const next = `${st.playing}|${st.speed}|${st.quality}|${st.autoQuality}|${st.onboardStep}|${st.menuOpen}`;
      if (next !== sig) {
        sig = next;
        this.render();
      }
    });
  }

  private render(): void {
    const s = this.store.state;
    const lapse = s.speed >= 4;
    const speedIndex = Math.max(0, SPEEDS.indexOf(s.speed));
    this.el.innerHTML = `
      <div class="brand">
        <span class="mark">Sf</span>
        <div>
          <strong>Sandflow</strong>
          <small>Labor · V1</small>
        </div>
      </div>
      <div class="top-actions">
        <button class="chip" data-presets>Vorlagen</button>
        <div class="q-slot"></div>
        <div class="transport">
          <button class="icon-btn ${s.onboardStep === 3 ? "is-hint" : ""}" data-play title="${s.playing ? "Pause" : "Abspielen"}">${s.playing ? ICONS.pause : ICONS.play}</button>
          <button class="icon-btn" data-step title="Einzelschritt">${ICONS.step}</button>
          <label class="speed">
            <span>Tempo ${speedLabel(s.speed)}</span>
            <input type="range" min="0" max="${SPEEDS.length - 1}" step="1" value="${speedIndex}" data-speed aria-label="Simulationstempo" />
          </label>
          <button class="chip ${lapse ? "is-on" : ""}" data-lapse title="Zeitraffer 8×">${lapse && s.speed >= 8 ? "Zeitraffer an" : "Zeitraffer"}</button>
        </div>
        <button class="icon-btn" data-undo title="Rückgängig">${ICONS.undo}</button>
        <button class="icon-btn" data-redo title="Wiederholen">${ICONS.redo}</button>
        <div class="menu-wrap">
          <button class="icon-btn ${s.menuOpen === "reset" ? "is-open" : ""}" data-reset-menu title="Zurücksetzen">${ICONS.reset}</button>
          ${
            s.menuOpen === "reset"
              ? `<div class="menu" role="menu">
                  <button data-reset-all>Szene zurücksetzen</button>
                  <button data-reset-water>Nur Wasser</button>
                </div>`
              : ""
          }
        </div>
        <div class="menu-wrap">
          <button class="icon-btn ${s.menuOpen === "share" ? "is-open" : ""}" data-share-menu title="Teilen">${ICONS.share}</button>
          ${
            s.menuOpen === "share"
              ? `<div class="menu" role="menu">
                  <button data-share-link>Link kopieren</button>
                  <button data-share-json>Share-JSON herunterladen</button>
                </div>`
              : ""
          }
        </div>
        <button class="icon-btn" data-save title="Szene speichern">${ICONS.save}</button>
        <button class="icon-btn" data-load title="Szene laden">${ICONS.load}</button>
        <button class="icon-btn" data-shot title="Bild speichern">${ICONS.shot}</button>
        <button class="chip ghost" data-about>Über</button>
      </div>
    `;

    const slot = this.el.querySelector<HTMLElement>(".q-slot")!;
    new QualitySwitcher(this.store, slot, this.actions.onQuality, this.actions.onAutoQuality);

    this.el.querySelector("[data-presets]")?.addEventListener("click", () => {
      this.store.patch({ galleryOpen: true, menuOpen: null });
    });
    this.el.querySelector("[data-play]")?.addEventListener("click", () => {
      const playing = !this.store.state.playing;
      if (playing && this.store.state.onboardStep === 3) {
        persistOnboardDone();
        this.store.patch({ playing: true, onboardStep: 0, menuOpen: null });
        return;
      }
      this.store.patch({ playing, menuOpen: null });
    });
    this.el.querySelector("[data-step]")?.addEventListener("click", () => {
      this.store.patch({ playing: false, menuOpen: null });
      this.actions.onStep();
    });
    this.el.querySelector<HTMLInputElement>("[data-speed]")?.addEventListener("input", (e) => {
      const i = Number((e.target as HTMLInputElement).value);
      this.store.patch({ speed: SPEEDS[i] ?? 1 });
    });
    this.el.querySelector("[data-lapse]")?.addEventListener("click", () => {
      const next = this.store.state.speed >= 8 ? 1 : 8;
      this.store.patch({ speed: next, playing: true, menuOpen: null });
    });
    this.el.querySelector("[data-undo]")?.addEventListener("click", this.actions.onUndo);
    this.el.querySelector("[data-redo]")?.addEventListener("click", this.actions.onRedo);
    this.el.querySelector("[data-reset-menu]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.store.patch({ menuOpen: this.store.state.menuOpen === "reset" ? null : "reset" });
    });
    this.el.querySelector("[data-share-menu]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.store.patch({ menuOpen: this.store.state.menuOpen === "share" ? null : "share" });
    });
    this.el.querySelector("[data-reset-all]")?.addEventListener("click", () => {
      this.store.patch({ menuOpen: null });
      this.actions.onResetScene();
    });
    this.el.querySelector("[data-reset-water]")?.addEventListener("click", () => {
      this.store.patch({ menuOpen: null });
      this.actions.onResetWater();
    });
    this.el.querySelector("[data-share-link]")?.addEventListener("click", () => {
      this.store.patch({ menuOpen: null });
      this.actions.onShareLink();
    });
    this.el.querySelector("[data-share-json]")?.addEventListener("click", () => {
      this.store.patch({ menuOpen: null });
      this.actions.onShareJson();
    });
    this.el.querySelector("[data-save]")?.addEventListener("click", this.actions.onSave);
    this.el.querySelector("[data-load]")?.addEventListener("click", this.actions.onLoad);
    this.el.querySelector("[data-shot]")?.addEventListener("click", this.actions.onShot);
    this.el.querySelector("[data-about]")?.addEventListener("click", () => {
      this.store.patch({ aboutOpen: true, menuOpen: null });
    });
  }
}
