import { createAssetService } from "../assets/AssetService";
import { labTexelBudget } from "../assets/texturePaths";
import { propsFromShare, propsToShare } from "../scene/PropsLite";
import { Viewport } from "../scene/Viewport";
import { resampleMask } from "../sim/mapsContract";
import type { SimSnapshot } from "../sim/SimClient";
import { decodeHeightBytes, lumaToHeight } from "../sim/heightmap";
import {
  downloadBlob,
  downloadDataUrl,
  downloadText,
  encodeScene,
  isPngDataUrl,
  packMaps,
  screenshotFilename,
  toJson,
  unpackMaps,
} from "../state/persist";
import { getPreset, resampleHeight } from "../sim/presets";
import {
  buildSharePayload,
  compactShareForHash,
  decodeShareScene,
  parseAnyScene,
  parseShareHash,
  sanitizeQuality,
  SHARE_FILE_GRID,
  shareHref,
  type SharePayload,
} from "../state/share";
import { persistOnboardDone, Store } from "../state/store";
import { QUALITY_GRID, SPEEDS } from "../state/types";
import { qualityProfile } from "../state/quality";
import { interpretHotkey, nudgeBrushRadius } from "./hotkeys";
import { CompareBar } from "./CompareBar";
import { Inspector } from "./Inspector";
import { Onboarding } from "./Onboarding";
import { PresetGallery } from "./PresetGallery";
import { SourceTip } from "./SourceTip";
import { StatsPanel } from "./StatsPanel";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";
import { applyPlay } from "./transport";
import { ICONS } from "./icons";

export class App {
  readonly store = new Store();
  readonly viewport: Viewport;
  private assets = createAssetService();
  private fileInput: HTMLInputElement;
  private heightInput: HTMLInputElement;
  private texToken = 0;
  private texKey = "";
  private lastShareHash: string | null = null;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <header id="topbar" class="topbar"></header>
      <aside id="toolbar" class="toolbar"></aside>
      <main id="viewport" class="viewport">
        <div id="compare"></div>
        <div id="onboard"></div>
        <div id="source-tip"></div>
      </main>
      <aside id="inspector" class="inspector"></aside>
      <aside id="stats" class="stats"></aside>
      <div id="gallery"></div>
      <div id="about"></div>
    `;

    const viewportHost = root.querySelector<HTMLElement>("#viewport")!;
    this.viewport = new Viewport(viewportHost, this.store, () => this.syncHistory());
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
      onUndo: () => void this.undo(),
      onRedo: () => void this.redo(),
      onStep: () => this.viewport.stepOnce(),
      onResetScene: () => {
        this.viewport.resetScene();
        this.toast("Szene zurückgesetzt.");
      },
      onResetWater: () => {
        this.viewport.resetWater();
        this.toast("Wasser geleert.");
      },
      onShareLink: () => void this.shareLink(),
      onShareJson: () => void this.shareJson(),
      onCompareCycle: () => {
        if (!this.store.state.hasCompare) this.toast("Erst Vorher merken, dann vergleichen.");
      },
      onExportHeight: () => this.exportHeight(),
    });
    new CompareBar(this.store, root.querySelector("#compare")!, {
      onCapture: () => this.captureBefore(),
      onExport: () => this.exportHeight(),
      onImport: () => this.heightInput.click(),
    });
    new PresetGallery(this.store, root.querySelector("#gallery")!, (id) => {
      this.viewport.loadPreset(id, true);
    });
    new StatsPanel(this.store, root.querySelector("#stats")!, this.viewport);
    new Onboarding(this.store, root.querySelector("#onboard")!);
    new SourceTip(this.store, root.querySelector("#source-tip")!);

    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = "application/json,.json";
    this.fileInput.hidden = true;
    root.appendChild(this.fileInput);
    this.fileInput.addEventListener("change", () => void this.loadScene());
    this.heightInput = document.createElement("input");
    this.heightInput.type = "file";
    this.heightInput.accept = "image/png,.png,.r32,application/octet-stream";
    this.heightInput.hidden = true;
    root.appendChild(this.heightInput);
    this.heightInput.addEventListener("change", () => void this.importHeight());

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
    const packed = packMaps(snap.terrain, snap.water, snap.wetness, snap.cohesion, snap.hardmask);
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
    this.toast("Szene gespeichert.");
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
      const quality = sanitizeQuality(scene.quality, this.store.state.quality);
      this.store.patch({ quality, autoQuality: false });
      this.viewport.applyQuality(quality, false);
      const grid = qualityProfile(quality).grid;
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
      const hardmask = maps.hardmask
        ? scene.size === grid
          ? maps.hardmask
          : resampleMask(maps.hardmask, scene.size, grid)
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
        hardmask: hardmask ?? new Float32Array(grid * grid),
        sources: scene.sources,
        erodedSand: 0,
      });
      this.viewport.applyParams();
      void this.loadLabTextures(scene.texturePrompt);
      this.toast("Szene geladen.");
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
      autoQuality: false,
      speed: SPEEDS.includes(share.speed) ? share.speed : 1,
      selectedSourceId: null,
    });
    this.viewport.applyQuality(quality, false);
    const grid = QUALITY_GRID[quality];
    const decoded = decodeShareScene(share, grid);
    if (decoded.terrain) {
      const hard =
        decoded.hardmask ??
        getPreset(share.preset).build(grid).hardmask ??
        new Float32Array(grid * grid);
      const snap: SimSnapshot = {
        size: grid,
        terrain: decoded.terrain,
        water: decoded.water ?? new Float32Array(grid * grid),
        wetness: new Float32Array(grid * grid),
        sediment: new Float32Array(grid * grid),
        cohesion: new Float32Array(grid * grid),
        hardmask: hard,
        sources: decoded.sources,
        erodedSand: 0,
      };
      this.viewport.applySnapshot(snap);
      this.store.patch({ selectedSourceId: decoded.sources[0]?.id ?? null });
    } else {
      this.viewport.loadPreset(share.preset, true);
      this.viewport.replaceSources(decoded.sources);
    }
    if (decoded.camera) this.viewport.applyCamera(decoded.camera);
    this.viewport.setProps(propsFromShare(share.props));
    this.viewport.applyParams();
    this.viewport.history.clear();
    this.syncHistory();
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
      hardmask: snap.hardmask,
      size: snap.size,
    };
  }

  private async shareLink(): Promise<void> {
    try {
      const { hash, omittedHeight } = compactShareForHash(await this.shareInput());
      const href = shareHref(hash);
      history.replaceState(null, "", `#${hash}`);
      this.lastShareHash = location.hash;
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

  private syncHistory(): void {
    if (!this.viewport) return;
    const next = this.viewport.history.flags();
    if (this.store.state.canUndo !== next.canUndo || this.store.state.canRedo !== next.canRedo) {
      this.store.patch(next);
    }
  }

  private async undo(): Promise<void> {
    await this.viewport.undo();
    this.syncHistory();
  }

  private async redo(): Promise<void> {
    await this.viewport.redo();
    this.syncHistory();
  }

  private captureBefore(): void {
    if (this.viewport.captureBefore()) this.toast("Vorher gespeichert — nach der Erosion vergleichen.");
    else this.toast("Noch kein Gelände zum Merken.");
  }

  private exportHeight(): void {
    const file = this.viewport.exportHeightPng();
    if (!file) {
      this.toast("Höhe konnte nicht gespeichert werden.");
      return;
    }
    const copy = new Uint8Array(file.bytes.byteLength);
    copy.set(file.bytes);
    downloadBlob(file.filename, new Blob([copy], { type: file.mime }));
    this.toast("Höhenkarte gespeichert (16-Bit-PNG).");
  }

  private async importHeight(): Promise<void> {
    const file = this.heightInput.files?.[0];
    this.heightInput.value = "";
    if (!file) return;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const decoded = decodeHeightBytes(buf);
      if (decoded) {
        this.viewport.applyHeightmap(decoded.terrain, decoded.size);
        this.toast("Höhe geladen.");
        return;
      }
      const fromImage = await heightFromImageFile(file);
      if (fromImage) {
        this.viewport.applyHeightmap(fromImage.terrain, fromImage.size);
        this.toast("Höhe aus Bild geladen.");
        return;
      }
      this.toast("Höhe konnte nicht gelesen werden.");
    } catch {
      this.toast("Höhe konnte nicht gelesen werden.");
    }
  }

  private screenshot(): void {
    try {
      const url = this.viewport.screenshotPng();
      if (!isPngDataUrl(url)) {
        this.toast("Bild konnte nicht gespeichert werden.");
        return;
      }
      downloadDataUrl(screenshotFilename(), url);
      this.toast("Bild gespeichert.");
    } catch {
      this.toast("Bild konnte nicht gespeichert werden.");
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
            <p>Wasser sucht sich Wege durch Sand: erst dünne Adern, dann ein Bett, später ein verzweigtes Netz. V1.x ist der spielbare Kern — Zielring, Werkzeuge, Teilen, Kiesel, Beton, gebackene Texturen. WebGPU und eine volle Requisitenbibliothek bleiben später.</p>
            <p>Kurzanleitung: <strong>Kamera drehen</strong> → <strong>Gießen / Quelle ziehen</strong> → <strong>Graben und Beton</strong>. Pins sitzen auf dem Sand; Ziehen verschiebt sie auch im Kameramodus.</p>
            <p>Rechtsklick oder zwei Finger drehen die Kamera. Ein Finger (oder die linke Taste) bedient das Werkzeug. Unter <em>Kamera</em> geht das Drehen auch mit einem Finger.</p>
            <p>Oben neben Play: <em>Bild</em> (PNG der aktuellen Kamera), <em>Tempo</em>, <em>Zeitraffer</em> (8× Ticks), optionale <em>Spur</em> und <em>Vergleich</em> (Vorher merken, dann Teilen oder Vorher). <em>Höhe PNG</em> legt die aktuelle Höhenkarte als 16-Bit-Graustufenbild ab. Qualität inkl. Auto, Szene oder nur Wasser zurücksetzen, Teilen per Link oder JSON. <em>Beton</em> setzt Hartstoff (Platte oder Wand). Kiesel sind kleine Steine mit einer Hartinsel darunter — der Radierer nimmt Kiesel und Beton weg. Der Wannenrahmen ist Holz.</p>
            <p>Unter <em>Erweitert</em> liegen Farbkarte (Strömung oder Nässe) und <em>Relief</em>, das die Höhen in der Wanne überhöht. Texturen entstehen lokal aus einer kurzen Beschreibung.</p>
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
      const action = interpretHotkey(e);
      if (!action) return;
      if (action.type === "play" || action.type === "undo" || action.type === "redo" || action.type === "brush") {
        e.preventDefault();
      }
      if (action.type === "play") {
        const next = applyPlay(!this.store.state.playing, this.store.state.onboardStep);
        if (next.persistOnboard) persistOnboardDone();
        this.store.patch({ playing: next.playing, onboardStep: next.onboardStep });
        return;
      }
      if (action.type === "undo") {
        void this.undo();
        return;
      }
      if (action.type === "redo") {
        void this.redo();
        return;
      }
      if (action.type === "brush") {
        this.store.patch({ brushRadius: nudgeBrushRadius(this.store.state.brushRadius, action.delta) });
        return;
      }
      this.store.patch({ tool: action.tool, cameraMode: false, menuOpen: null });
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

async function heightFromImageFile(file: File): Promise<{ terrain: Float32Array; size: number } | null> {
  if (!file.type.startsWith("image/") && !file.name.toLowerCase().endsWith(".png")) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image"));
      el.src = url;
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w < 2 || h < 2) return null;
    const size = Math.min(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const rgba = ctx.getImageData(0, 0, size, size).data;
    return { terrain: lumaToHeight(rgba, size, size), size };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
