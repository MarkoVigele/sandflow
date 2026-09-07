import { createAssetService } from "../assets/AssetService";
import { Viewport } from "../scene/Viewport";
import { resampleHeight } from "../sim/presets";
import {
  downloadDataUrl,
  downloadText,
  encodeScene,
  packMaps,
  parseScene,
  toJson,
  unpackMaps,
} from "../state/persist";
import { Store } from "../state/store";
import { QUALITY_GRID } from "../state/types";
import { Inspector } from "./Inspector";
import { PresetGallery } from "./PresetGallery";
import { StatsPanel } from "./StatsPanel";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";
import { ICONS } from "./icons";

export class App {
  readonly store = new Store();
  readonly viewport: Viewport;
  private assets = createAssetService();
  private fileInput: HTMLInputElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <header id="topbar" class="topbar"></header>
      <aside id="toolbar" class="toolbar"></aside>
      <main id="viewport" class="viewport"></main>
      <aside id="inspector" class="inspector"></aside>
      <aside id="stats" class="stats"></aside>
      <div id="gallery"></div>
      <div id="about"></div>
    `;

    const viewportHost = root.querySelector<HTMLElement>("#viewport")!;
    this.viewport = new Viewport(viewportHost, this.store, () => {
      /* store patches already notify */
    });

    new Toolbar(this.store, root.querySelector("#toolbar")!);
    new Inspector(
      this.store,
      root.querySelector("#inspector")!,
      this.viewport,
      (prompt) => void this.generateTexture(prompt),
    );
    new TopBar(this.store, root.querySelector("#topbar")!, {
      onQuality: (q) => this.viewport.applyQuality(q, true),
      onSave: () => void this.saveScene(),
      onLoad: () => this.fileInput.click(),
      onShot: () => this.screenshot(),
      onUndo: () => void this.viewport.undo(),
      onRedo: () => void this.viewport.redo(),
      onStep: () => this.viewport.stepOnce(),
    });
    new PresetGallery(this.store, root.querySelector("#gallery")!, (id) => {
      this.viewport.loadPreset(id, true);
    });
    new StatsPanel(this.store, root.querySelector("#stats")!, this.viewport);

    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = "application/json";
    this.fileInput.hidden = true;
    root.appendChild(this.fileInput);
    this.fileInput.addEventListener("change", () => void this.loadScene());

    this.bindAbout(root.querySelector("#about")!);
    this.bindKeys();
    void this.generateTexture(this.store.state.texturePrompt);

    if (!this.viewport.renderer.capabilities.isWebGL2) {
      this.toast("WebGL2 fehlt — Sandflow braucht einen aktuellen Browser.");
    }
  }

  private async generateTexture(prompt: string): Promise<void> {
    const maps = await this.assets.generate(prompt, 512);
    this.viewport.applyGeneratedMaps(maps);
  }

  private async saveScene(): Promise<void> {
    const snap = await this.viewport.snapshot();
    const packed = packMaps(snap.terrain, snap.water, snap.wetness);
    const file = encodeScene({
      name: `sandflow-${this.store.state.presetId}`,
      quality: this.store.state.quality,
      params: this.store.state.params,
      presetId: this.store.state.presetId,
      size: snap.size,
      ...packed,
      sources: snap.sources,
      texturePrompt: this.store.state.texturePrompt,
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadText(`sandflow-${stamp}.json`, toJson(file), "application/json");
  }

  private async loadScene(): Promise<void> {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = "";
    if (!file) return;
    try {
      const scene = parseScene(await file.text());
      const maps = unpackMaps(scene);
      const grid = QUALITY_GRID[this.store.state.quality];
      const terrain =
        scene.size === grid ? maps.terrain : resampleHeight(maps.terrain, scene.size, grid);
      const water =
        scene.size === grid ? maps.water : resampleHeight(maps.water, scene.size, grid);
      const wetness =
        scene.size === grid ? maps.wetness : resampleHeight(maps.wetness, scene.size, grid);
      this.store.patch({
        params: scene.params,
        presetId: scene.presetId,
        texturePrompt: scene.texturePrompt,
        selectedSourceId: scene.sources[0]?.id ?? null,
      });
      this.viewport.sources = scene.sources.map((s) => ({ ...s }));
      this.viewport.applySnapshot({
        size: grid,
        terrain,
        water,
        wetness,
        sediment: new Float32Array(grid * grid),
        sources: scene.sources,
        erodedSand: 0,
      });
      this.viewport.applyParams();
      void this.generateTexture(scene.texturePrompt);
    } catch {
      this.toast("Datei konnte nicht gelesen werden.");
    }
  }

  private screenshot(): void {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadDataUrl(`sandflow-${stamp}.png`, this.viewport.screenshotPng());
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
            <p>Texturen entstehen lokal aus einer kurzen Beschreibung. Ein externer Dienst kann später an dieselbe Stelle.</p>
          </div>
        </div>`
        : "";
      host.querySelector("[data-x]")?.addEventListener("click", () => {
        this.store.patch({ aboutOpen: false });
      });
      host.querySelector("[data-close]")?.addEventListener("click", (e) => {
        if (e.target === e.currentTarget) this.store.patch({ aboutOpen: false });
      });
    };
    paint();
    this.store.subscribe(paint);
  }

  private bindKeys(): void {
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === " ") {
        e.preventDefault();
        this.store.patch({ playing: !this.store.state.playing });
      }
      if ((e.metaKey || e.ctrlKey) && k === "z") {
        e.preventDefault();
        if (e.shiftKey) void this.viewport.redo();
        else void this.viewport.undo();
      }
      if ((e.metaKey || e.ctrlKey) && k === "y") {
        e.preventDefault();
        void this.viewport.redo();
      }
      const tools = ["pile", "dig", "smooth", "dam", "pour", "source"] as const;
      const n = Number(e.key);
      if (n >= 1 && n <= 6) this.store.patch({ tool: tools[n - 1], cameraMode: false });
    });
  }

  private toast(msg: string): void {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 4200);
  }
}
