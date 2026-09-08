import { persistOnboardDone, type Store } from "../state/store";
import { SPEEDS, speedLabel } from "../state/types";
import type { QualityId } from "../state/types";
import { ICONS } from "./icons";
import { QualitySwitcher } from "./QualitySwitcher";
import { applyPlay, lapseSpeed, speedFromIndex, speedIndex } from "./transport";

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
    const idx = speedIndex(s.speed);
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
          <label class="speed">
            <span>Tempo ${speedLabel(s.speed)}</span>
            <input type="range" min="0" max="${SPEEDS.length - 1}" step="1" value="${idx}" data-speed aria-label="Simulationstempo" />
          </label>
        </div>
        <div class="top-desktop">
          <button class="icon-btn" data-step title="Einzelschritt">${ICONS.step}</button>
          <button class="chip ${lapse ? "is-on" : ""}" data-lapse title="Zeitraffer 8×">${lapse && s.speed >= 8 ? "Zeitraffer an" : "Zeitraffer"}</button>
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
        <div class="menu-wrap top-more">
          <button class="icon-btn ${s.menuOpen === "more" ? "is-open" : ""}" data-more-menu title="Mehr">${ICONS.more}</button>
          ${
            s.menuOpen === "more"
              ? `<div class="menu menu-more" role="menu">
                  <button data-step>Einzelschritt</button>
                  <button data-lapse>${lapse && s.speed >= 8 ? "Zeitraffer aus" : "Zeitraffer 8×"}</button>
                  <button data-undo>Rückgängig</button>
                  <button data-redo>Wiederholen</button>
                  <button data-reset-all>Szene zurücksetzen</button>
                  <button data-reset-water>Nur Wasser</button>
                  <button data-share-link>Link kopieren</button>
                  <button data-share-json>Share-JSON</button>
                  <button data-save>Szene speichern</button>
                  <button data-load>Szene laden</button>
                  <button data-shot>Bild speichern</button>
                  <button data-about>Über</button>
                </div>`
              : ""
          }
        </div>
      </div>
    `;

    const slot = this.el.querySelector<HTMLElement>(".q-slot")!;
    new QualitySwitcher(this.store, slot, this.actions.onQuality, this.actions.onAutoQuality);

    this.el.querySelector("[data-presets]")?.addEventListener("click", () => {
      this.store.patch({ galleryOpen: true, menuOpen: null });
    });
    this.el.querySelector("[data-play]")?.addEventListener("click", () => {
      const next = applyPlay(!this.store.state.playing, this.store.state.onboardStep);
      if (next.persistOnboard) persistOnboardDone();
      this.store.patch({ playing: next.playing, onboardStep: next.onboardStep, menuOpen: null });
    });
    this.el.querySelectorAll("[data-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.store.patch({ playing: false, menuOpen: null });
        this.actions.onStep();
      });
    });
    this.el.querySelector<HTMLInputElement>("[data-speed]")?.addEventListener("input", (e) => {
      this.store.patch({ speed: speedFromIndex(Number((e.target as HTMLInputElement).value)) });
    });
    this.el.querySelectorAll("[data-lapse]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.store.patch({ speed: lapseSpeed(this.store.state.speed), playing: true, menuOpen: null });
      });
    });
    this.el.querySelector("[data-more-menu]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.store.patch({ menuOpen: this.store.state.menuOpen === "more" ? null : "more" });
    });
    this.el.querySelectorAll("[data-undo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.store.patch({ menuOpen: null });
        this.actions.onUndo();
      });
    });
    this.el.querySelectorAll("[data-redo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.store.patch({ menuOpen: null });
        this.actions.onRedo();
      });
    });
    this.el.querySelector("[data-reset-menu]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.store.patch({ menuOpen: this.store.state.menuOpen === "reset" ? null : "reset" });
    });
    this.el.querySelector("[data-share-menu]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.store.patch({ menuOpen: this.store.state.menuOpen === "share" ? null : "share" });
    });
    this.el.querySelectorAll("[data-reset-all]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.store.patch({ menuOpen: null });
        this.actions.onResetScene();
      });
    });
    this.el.querySelectorAll("[data-reset-water]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.store.patch({ menuOpen: null });
        this.actions.onResetWater();
      });
    });
    this.el.querySelectorAll("[data-share-link]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.store.patch({ menuOpen: null });
        this.actions.onShareLink();
      });
    });
    this.el.querySelectorAll("[data-share-json]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.store.patch({ menuOpen: null });
        this.actions.onShareJson();
      });
    });
    this.el.querySelectorAll("[data-save]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.store.patch({ menuOpen: null });
        this.actions.onSave();
      });
    });
    this.el.querySelectorAll("[data-load]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.store.patch({ menuOpen: null });
        this.actions.onLoad();
      });
    });
    this.el.querySelectorAll("[data-shot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.store.patch({ menuOpen: null });
        this.actions.onShot();
      });
    });
    this.el.querySelectorAll("[data-about]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.store.patch({ aboutOpen: true, menuOpen: null });
      });
    });
  }
}
