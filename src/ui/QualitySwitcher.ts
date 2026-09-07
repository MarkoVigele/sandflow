import type { Store } from "../state/store";
import { QUALITY_LABEL, type QualityId } from "../state/types";

const LEVELS: { id: QualityId; label: string }[] = [
  { id: "low", label: "Niedrig" },
  { id: "medium", label: "Mittel" },
  { id: "high", label: "Hoch" },
  { id: "ultra", label: "Ultra" },
];

export class QualitySwitcher {
  el: HTMLElement;
  constructor(
    private store: Store,
    host: HTMLElement,
    private onChange: (q: QualityId) => void,
    private onAuto: () => void,
  ) {
    this.el = host;
    this.render();
  }

  private render(): void {
    const s = this.store.state;
    const selected = s.autoQuality ? "auto" : s.quality;
    this.el.innerHTML = `
      <label class="quality">
        <span>Qualität</span>
        <select aria-label="Qualität">
          <option value="auto" ${selected === "auto" ? "selected" : ""}>Auto · ${QUALITY_LABEL[s.quality]}</option>
          ${LEVELS.map((l) => `<option value="${l.id}" ${selected === l.id ? "selected" : ""}>${l.label}</option>`).join("")}
        </select>
      </label>
    `;
    this.el.querySelector("select")?.addEventListener("change", (e) => {
      const value = (e.target as HTMLSelectElement).value;
      if (value === "auto") {
        this.store.patch({ autoQuality: true, menuOpen: null });
        this.onAuto();
        return;
      }
      this.store.patch({ quality: value as QualityId, autoQuality: false, menuOpen: null });
      this.onChange(value as QualityId);
    });
  }
}
