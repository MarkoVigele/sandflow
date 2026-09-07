import { createAssetService, type AssetProvider } from "../assets/AssetService";
import { Viewport } from "../scene/Viewport";
import type { SimApi } from "../sim/api";
import { Store } from "../state/store";
import { Inspector } from "./Inspector";
import { Onboarding, shouldOpenOnboarding } from "./Onboarding";
import { PresetGallery } from "./PresetGallery";
import { SaveLoad } from "./SaveLoad";
import { StatsPanel } from "./StatsPanel";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";
import { bindViewport } from "./bindSim";
import { ICONS } from "./icons";
import { showToast } from "./Toast";

export class App {
  readonly store = new Store();
  readonly viewport: Viewport;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <header id="topbar" class="topbar"></header>
      <aside id="toolbar" class="toolbar"></aside>
      <main id="viewport" class="viewport"></main>
      <aside id="inspector" class="inspector"></aside>
      <aside id="stats" class="stats"></aside>
      <div id="gallery"></div>
      <div id="about"></div>
      <div id="onboarding"></div>
    `;

    const viewportHost = root.querySelector<HTMLElement>("#viewport")!;
    this.viewport = new Viewport(viewportHost, this.store, () => this.syncHistory());
    const api = bindViewport(this.viewport, this.store);
    const assets = createAssetService();
    const files = new SaveLoad(this.store, api, showToast);
    root.appendChild(files.fileInput);

    if (shouldOpenOnboarding()) {
      this.store.patch({ onboardingOpen: true });
    }

    new Toolbar(this.store, root.querySelector("#toolbar")!);
    new Inspector(this.store, root.querySelector("#inspector")!, api, (prompt) => {
      void this.generateTexture(assets, api, prompt);
    });
    new TopBar(this.store, root.querySelector("#topbar")!, {
      onQuality: (q) => api.setQuality(q),
      onSave: () => void files.save(),
      onLoad: () => files.openPicker(),
      onShot: () => files.screenshot(),
      onUndo: () => void this.runHistory(() => api.undo()),
      onRedo: () => void this.runHistory(() => api.redo()),
      onStep: () => api.stepOnce(),
    });
    new PresetGallery(this.store, root.querySelector("#gallery")!, api.listPresets(), (id) => {
      api.loadPreset(id);
    });
    new StatsPanel(this.store, root.querySelector("#stats")!, api);
    new Onboarding(this.store, root.querySelector("#onboarding")!);

    this.bindAbout(root.querySelector("#about")!);
    this.bindKeys(api);
    void this.generateTexture(assets, api, this.store.state.texturePrompt);
    this.syncHistory();

    if (!this.viewport.renderer.capabilities.isWebGL2) {
      showToast("WebGL2 fehlt — Sandflow braucht einen aktuellen Browser.");
    }
  }

  private async generateTexture(
    assets: AssetProvider,
    api: SimApi,
    prompt: string,
  ): Promise<void> {
    try {
      const maps = await assets.generate(prompt, 512);
      api.applyGeneratedMaps(maps);
    } catch {
      showToast("Textur konnte nicht erzeugt werden.");
    }
  }

  private async runHistory(op: () => Promise<void>): Promise<void> {
    await op();
    this.syncHistory();
  }

  private syncHistory(): void {
    // Guard against being called during Viewport construction
    if (!this.viewport) return;
    const canUndo = this.viewport.history.canUndo;
    const canRedo = this.viewport.history.canRedo;
    if (canUndo !== this.store.state.canUndo || canRedo !== this.store.state.canRedo) {
      this.store.patch({ canUndo, canRedo });
    }
  }

  private bindAbout(host: HTMLElement): void {
    const paint = (): void => {
      host.innerHTML = this.store.state.aboutOpen
        ? `
        <div class="overlay is-open" data-close>
          <div class="sheet about" role="dialog" aria-label="Über Sandflow">
            <header class="sheet-head">
              <div>
                <p class="kicker">Sandflow</p>
                <h2>Ein kleines Labor im Browser</h2>
              </div>
              <button class="icon-btn" data-x>${ICONS.close}</button>
            </header>
            <p>Wasser sucht sich Wege durch Sand: erst dünne Adern, dann ein Bett, später ein verzweigtes Netz. V1 ist der Kern — spielbar, ohne Extra-Firlefanz.</p>
            <p>Rechtsklick oder zwei Finger drehen die Kamera. Ein Finger (oder die linke Taste) bedient das Werkzeug. Unter <em>Kamera</em> geht das Drehen auch mit einem Finger.</p>
            <p>Die Sandtextur entsteht lokal aus einer kurzen Beschreibung. Ein externer Dienst kann später an dieselbe Stelle.</p>
            <div class="row">
              <button class="btn primary" data-guide>Kurzanleitung</button>
            </div>
          </div>
        </div>`
        : "";
      host.querySelector("[data-x]")?.addEventListener("click", () => {
        this.store.patch({ aboutOpen: false });
      });
      host.querySelector("[data-close]")?.addEventListener("click", (e) => {
        if (e.target === e.currentTarget) this.store.patch({ aboutOpen: false });
      });
      host.querySelector("[data-guide]")?.addEventListener("click", () => {
        this.store.patch({ aboutOpen: false, onboardingOpen: true, onboardingStep: 0 });
      });
    };
    paint();
    this.store.subscribe(paint);
  }

  private bindKeys(api: SimApi): void {
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === " ") {
        e.preventDefault();
        this.store.patch({ playing: !this.store.state.playing });
      }
      if ((e.metaKey || e.ctrlKey) && k === "z") {
        e.preventDefault();
        if (e.shiftKey) void this.runHistory(() => api.redo());
        else void this.runHistory(() => api.undo());
      }
      if ((e.metaKey || e.ctrlKey) && k === "y") {
        e.preventDefault();
        void this.runHistory(() => api.redo());
      }
      const tools = ["pile", "dig", "smooth", "dam", "pour", "source"] as const;
      const n = Number(e.key);
      if (n >= 1 && n <= 6) this.store.patch({ tool: tools[n - 1], cameraMode: false });
    });
  }
}
