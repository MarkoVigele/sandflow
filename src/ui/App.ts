import { createAssetService } from "../assets/AssetService";
import { labTexelBudget } from "../assets/texturePaths";
import { propsFromShare, propsToShare } from "../scene/PropsLite";
import { Viewport } from "../scene/Viewport";
import { resampleHeight } from "../sim/presets";
import type { SimSnapshot } from "../sim/SimClient";
import {
  downloadDataUrl,
  downloadText,
  encodeScene,
  packMaps,
  toJson,
  unpackMaps,
} from "../state/persist";
import {
  buildSharePayload,
  compactShareForHash,
  decodeHeightField,
  parseAnyScene,
  parseShareHash,
  sanitizeQuality,
  SHARE_FILE_GRID,
  shareCamera,
  shareHref,
  shareSources,
  type SharePayload,
} from "../state/share";
import { persistOnboardDone, Store } from "../state/store";
import { QUALITY_GRID, SPEEDS } from "../state/types";
import { LETTER_HOTKEYS, TOOL_HOTKEYS } from "./tools";
import { Inspector } from "./Inspector";
import { Onboarding } from "./Onboarding";
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
  private texToken = 0;
  private texKey = "";
  private lastShareHash: string | null = null;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <header id="topbar" class="topbar"></header>
      <aside id="toolbar" class="toolbar"></aside>
      <main id="viewport" class="viewport">
        <div id="onboard"></div>
      </main>
      <aside id="inspector" class="inspector"></aside>
      <aside id="stats" class="stats"></aside>
      <div id="gallery"></div>
      <div id="about"></div>
    `;

    const viewportHost = root.querySelector<HTMLElement>("#viewport")!;
    this.viewport = new Viewport(viewportHost, this.store, () => {
      /* store patches already notify */
    });
    this.viewport.onToast = (msg) => this.toast(msg);

    new Toolbar(this.store, root.querySelector("#toolbar")!);
    new Inspector(
      this.store,
      root.querySelector("#inspector")!,
      this.viewport,
      (prompt) => void this.loadLabTextures(prompt),
    );
    new TopBar(this.store, root.querySelector("#topbar")!, {
      onQuality: (q) => this.viewport.applyQuality(q, true),
      onAutoQuality: () => {
        this.viewport.autoDropped = false;
      },
      onSave: () => void this.saveScene(),
      onLoad: () => this.fileInput.click(),
      onShot: () => this.screenshot(),
      onUndo: () => void this.viewport.undo(),
      onRedo: () => void this.viewport.redo(),
      onStep: () => this.viewport.stepOnce(),
      onResetScene: () => this.viewport.resetScene(),
      onResetWater: () => this.viewport.resetWater(),
      onShareLink: () => void this.shareLink(),
      onShareJson: () => void this.shareJson(),
    });
    new PresetGallery(this.store, root.querySelector("#gallery")!, (id) => {
      this.viewport.loadPreset(id, true);
    });
    new StatsPanel(this.store, root.querySelector("#stats")!, this.viewport);
    new Onboarding(this.store, root.querySelector("#onboard")!);

    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = "application/json,.json";
    this.fileInput.hidden = true;
    root.appendChild(this.fileInput);
    this.fileInput.addEventListener("change", () => void this.loadScene());

    this.bindAbout(root.querySelector("#about")!);
    this.bindKeys();
    window.addEventListener("pointerdown", (e) => {
      if (!this.store.state.menuOpen) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest(".menu-wrap")) return;
      this.store.patch({ menuOpen: null });
    });
    if (parseShareHash(location.hash)) void this.bootFromHash();
    else void this.loadLabTextures(this.store.state.texturePrompt);
    window.addEventListener("hashchange", () => void this.bootFromHash());

    if (!this.viewport.renderer.capabilities.isWebGL2) {
      this.toast("WebGL2 fehlt — Sandflow braucht einen aktuellen Browser.");
    }
  }

  private async loadLabTextures(prompt: string): Promise<void> {
    const maxSize = labTexelBudget(this.store.state.quality);
    const key = `${prompt.trim().toLowerCase()}|${maxSize}`;
    if (key === this.texKey) return;
    const token = ++this.texToken;
    this.texKey = key;
    try {
      const maps = await this.assets.loadLab(prompt, maxSize);
      if (token !== this.texToken) return;
      this.viewport.applyGeneratedMaps(maps);
    } catch {
      if (token === this.texToken) this.texKey = "";
    }
  }

  private async saveScene(): Promise<void> {
    const snap = await this.viewport.snapshot();
    const packed = packMaps(snap.terrain, snap.water, snap.wetness, snap.cohesion);
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
      const loaded = parseAnyScene(await file.text());
      if (loaded.kind === "v2") {
        this.applyShare(loaded.share);
        this.toast("Share-JSON geladen.");
        return;
      }
      const scene = loaded.file;
      const maps = unpackMaps(scene);
      const grid = QUALITY_GRID[this.store.state.quality];
      const terrain =
        scene.size === grid ? maps.terrain : resampleHeight(maps.terrain, scene.size, grid);
      const water =
        scene.size === grid ? maps.water : resampleHeight(maps.water, scene.size, grid);
      const wetness =
        scene.size === grid ? maps.wetness : resampleHeight(maps.wetness, scene.size, grid);
      const cohesion = maps.cohesion
        ? scene.size === grid
          ? maps.cohesion
          : resampleHeight(maps.cohesion, scene.size, grid)
        : undefined;
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
        cohesion: cohesion ?? new Float32Array(grid * grid),
        sources: scene.sources,
        erodedSand: 0,
      });
      this.viewport.applyParams();
      void this.loadLabTextures(scene.texturePrompt);
    } catch {
      this.toast("Datei konnte nicht gelesen werden.");
    }
  }

  private async bootFromHash(): Promise<void> {
    const share = parseShareHash(location.hash);
    if (!share) return;
    if (this.lastShareHash === location.hash) return;
    this.lastShareHash = location.hash;
    this.applyShare(share);
    this.toast("Geteilte Szene geladen.");
  }

  private applyShare(share: SharePayload): void {
    const quality = sanitizeQuality(share.quality);
    const prompt = share.prompt || this.store.state.texturePrompt;
    this.store.patch({
      params: share.params,
      presetId: share.preset,
      texturePrompt: prompt,
      quality,
      speed: SPEEDS.includes(share.speed) ? share.speed : 1,
      selectedSourceId: null,
    });
    this.viewport.applyQuality(quality, false);
    const grid = QUALITY_GRID[quality];
    const terrain = decodeHeightField(share.h, share.hn, grid);
    const water = decodeHeightField(share.w, share.wn, grid);
    const sources = shareSources(share);
    if (terrain) {
      const snap: SimSnapshot = {
        size: grid,
        terrain,
        water: water ?? new Float32Array(grid * grid),
        wetness: new Float32Array(grid * grid),
        sediment: new Float32Array(grid * grid),
        cohesion: new Float32Array(grid * grid),
        sources,
        erodedSand: 0,
      };
      this.viewport.applySnapshot(snap);
      this.store.patch({ selectedSourceId: sources[0]?.id ?? null });
    } else {
      this.viewport.loadPreset(share.preset, true);
      this.viewport.replaceSources(sources);
    }
    const cam = shareCamera(share);
    if (cam) this.viewport.applyCamera(cam);
    this.viewport.setProps(propsFromShare(share.props));
    this.viewport.applyParams();
    void this.loadLabTextures(prompt);
  }

  private async shareInput() {
    const snap = await this.viewport.snapshot();
    return {
      presetId: this.store.state.presetId,
      quality: this.store.state.quality,
      speed: this.store.state.speed,
      params: this.store.state.params,
      sources: snap.sources,
      texturePrompt: this.store.state.texturePrompt,
      camera: this.viewport.cameraPose(),
      props: propsToShare(this.viewport.listProps()),
      terrain: snap.terrain,
      water: snap.water,
      size: snap.size,
    };
  }

  private async shareLink(): Promise<void> {
    try {
      const { hash, omittedHeight } = compactShareForHash(await this.shareInput());
      const href = shareHref(hash);
      history.replaceState(null, "", `#${hash}`);
      const ok = await copyText(href);
      this.toast(
        ok
          ? omittedHeight
            ? "Link kopiert — Gelände war zu groß, Vorlage bleibt."
            : "Link in die Zwischenablage kopiert."
          : omittedHeight
            ? "Link steht in der Adresszeile (ohne Gelände)."
            : "Link steht in der Adresszeile.",
      );
    } catch {
      this.toast("Teilen hat nicht geklappt.");
    }
  }

  private async shareJson(): Promise<void> {
    try {
      const payload = buildSharePayload(await this.shareInput(), SHARE_FILE_GRID, true);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      downloadText(`sandflow-share-${stamp}.json`, JSON.stringify(payload), "application/json");
      this.toast("Share-JSON gespeichert.");
    } catch {
      this.toast("Share-JSON hat nicht geklappt.");
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
            <p>Wasser sucht sich Wege durch Sand: erst dünne Adern, dann ein Bett, später ein verzweigtes Netz. V1.x ist der spielbare Kern — Zielring, Werkzeuge, Teilen, Kiesel, gebackene Texturen. WebGPU und eine volle Requisitenbibliothek bleiben später.</p>
            <p>Kurzanleitung: <strong>Sand formen</strong> → <strong>Quelle setzen</strong> → <strong>Abspielen</strong>.</p>
            <p>Rechtsklick oder zwei Finger drehen die Kamera. Ein Finger (oder die linke Taste) bedient das Werkzeug. Unter <em>Kamera</em> geht das Drehen auch mit einem Finger.</p>
            <p>Oben: <em>Tempo</em> und <em>Zeitraffer</em>, Qualität inkl. Auto, Szene oder nur Wasser zurücksetzen, Teilen per Link oder JSON. Kiesel sind kleine Steine — der Radierer nimmt sie weg.</p>
            <p>Unter <em>Erweitert</em> liegen Heatmap (Fluss oder Tiefe) und <em>Relief</em>, das die Höhen in der Wanne überhöht. Texturen entstehen lokal aus einer kurzen Beschreibung.</p>
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
        const playing = !this.store.state.playing;
        if (playing && this.store.state.onboardStep === 3) {
          persistOnboardDone();
          this.store.patch({ playing: true, onboardStep: 0 });
          return;
        }
        this.store.patch({ playing });
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
      const n = Number(e.key);
      if (n >= 1 && n <= TOOL_HOTKEYS.length) {
        this.store.patch({ tool: TOOL_HOTKEYS[n - 1], cameraMode: false, menuOpen: null });
      }
      const letter = LETTER_HOTKEYS[k];
      if (letter) {
        this.store.patch({ tool: letter, cameraMode: false, menuOpen: null });
      }
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

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
