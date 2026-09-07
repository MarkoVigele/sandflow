import type { Store } from "../state/store";
import type { QualityId } from "../state/types";

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
  ) {
    this.el = host;
    this.render();
  }

  private render(): void {
    const q = this.store.state.quality;
    this.el.innerHTML = `
      <label class="quality">
        <span>Qualität</span>
        <select aria-label="Qualität">
          ${LEVELS.map((l) => `<option value="${l.id}" ${l.id === q ? "selected" : ""}>${l.label}</option>`).join("")}
        </select>
      </label>
    `;
    this.el.querySelector("select")?.addEventListener("change", (e) => {
      const value = (e.target as HTMLSelectElement).value as QualityId;
      this.store.patch({ quality: value, autoQuality: false });
      this.onChange(value);
    });
  }
}
