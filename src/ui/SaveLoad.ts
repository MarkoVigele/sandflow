import type { SimApi } from "../sim/api";
import {
  downloadDataUrl,
  downloadText,
  encodeScene,
  packMaps,
  parseScene,
  toJson,
  unpackMaps,
} from "../state/persist";
import type { Store } from "../state/store";

export class SaveLoad {
  readonly fileInput: HTMLInputElement;

  constructor(
    private store: Store,
    private api: SimApi,
    private toast: (msg: string) => void,
  ) {
    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = "application/json";
    this.fileInput.hidden = true;
    this.fileInput.addEventListener("change", () => void this.loadFromPicker());
  }

  openPicker(): void {
    this.fileInput.click();
  }

  async save(): Promise<void> {
    const snap = await this.api.snapshot();
    if (!snap) {
      this.toast("Speichern wartet noch auf die Simulation.");
      return;
    }
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
    this.toast("Szene als JSON gespeichert.");
  }

  async loadFromPicker(): Promise<void> {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = "";
    if (!file) return;
    try {
      const scene = parseScene(await file.text());
      const maps = unpackMaps(scene);
      this.api.applyLoadedScene({
        params: scene.params,
        presetId: scene.presetId,
        texturePrompt: scene.texturePrompt,
        sources: scene.sources,
        size: scene.size,
        terrain: maps.terrain,
        water: maps.water,
        wetness: maps.wetness,
      });
      this.toast("Szene geladen.");
    } catch {
      this.toast("Datei konnte nicht gelesen werden.");
    }
  }

  screenshot(): void {
    const png = this.api.screenshotPng();
    if (!png) {
      this.toast("Screenshot wartet noch auf die Ansicht.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadDataUrl(`sandflow-${stamp}.png`, png);
    this.toast("PNG heruntergeladen.");
  }
}
