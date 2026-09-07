import type { Store } from "../state/store";
import type { ToolId } from "../state/types";
import { ICONS } from "./icons";

const TOOLS: { id: ToolId; label: string; hint: string; key: string }[] = [
  { id: "pile", label: "Aufschütten", hint: "Sand anhäufen", key: "1" },
  { id: "dig", label: "Graben", hint: "Sand abtragen", key: "2" },
  { id: "smooth", label: "Glätten", hint: "Unebenheiten ziehen", key: "3" },
  { id: "dam", label: "Damm", hint: "Steile Wand setzen", key: "4" },
  { id: "pour", label: "Gießen", hint: "Halten zum Gießen", key: "5" },
  { id: "source", label: "Quelle", hint: "Setzen, ziehen, löschen", key: "6" },
];

export class Toolbar {
  el: HTMLElement;
  constructor(
    private store: Store,
    host: HTMLElement,
  ) {
    this.el = host;
    this.render();
    let sig = "";
    store.subscribe(() => {
      const next = `${store.state.tool}|${store.state.cameraMode}`;
      if (next !== sig) {
        sig = next;
        this.render();
      }
    });
  }

  private render(): void {
    const { tool, cameraMode } = this.store.state;
    this.el.innerHTML = `
      <div class="toolbar-inner" role="toolbar" aria-label="Werkzeuge">
        ${TOOLS.map(
          (t) => `
          <button class="tool ${tool === t.id && !cameraMode ? "is-active" : ""}" data-tool="${t.id}" title="${t.hint} (${t.key})" aria-pressed="${tool === t.id && !cameraMode}" aria-label="${t.label}">
            <span class="icon">${ICONS[t.id]}</span>
            <span class="tool-label">${t.label}</span>
          </button>`,
        ).join("")}
        <button class="tool ${cameraMode ? "is-active" : ""}" data-cam="1" title="Ein-Finger-Kamera" aria-pressed="${cameraMode}" aria-label="Kamera">
          <span class="icon">${ICONS.camera}</span>
          <span class="tool-label">Kamera</span>
        </button>
      </div>
    `;
    this.el.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.store.patch({ tool: btn.dataset.tool as ToolId, cameraMode: false });
      });
    });
    this.el.querySelector<HTMLButtonElement>("[data-cam]")?.addEventListener("click", () => {
      this.store.patch({ cameraMode: !this.store.state.cameraMode });
    });
  }
}
