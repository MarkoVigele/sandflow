import type { Store } from "../state/store";
import type { ToolId } from "../state/types";
import { ICONS } from "./icons";
import { SOURCE_TOOL_TIP } from "./sourceGesture";
import { TOOLBAR_TOOLS } from "./tools";

export class Toolbar {
  el: HTMLElement;
  constructor(private store: Store, host: HTMLElement) {
    this.el = host;
    this.render();
    let sig = "";
    store.subscribe(() => {
      const next = `${store.state.tool}|${store.state.cameraMode}|${store.state.onboardStep}`;
      if (next !== sig) {
        sig = next;
        this.render();
      }
    });
  }

  private render(): void {
    const { tool, cameraMode, onboardStep } = this.store.state;
    this.el.innerHTML = `
      <div class="toolbar-inner" role="toolbar" aria-label="Werkzeuge">
        ${TOOLBAR_TOOLS.map(
          (t) => `
          <button class="tool ${tool === t.id && !cameraMode ? "is-active" : ""} ${hintClass(t.id, onboardStep)}" data-tool="${t.id}" title="${t.id === "source" ? SOURCE_TOOL_TIP : t.hint}" ${t.id === "source" ? `data-source-tip="${SOURCE_TOOL_TIP}"` : ""} aria-pressed="${tool === t.id}">
            <span class="icon">${ICONS[t.id]}</span>
            <span class="tool-label">${t.label}</span>
          </button>`,
        ).join("")}
        <button class="tool ${cameraMode ? "is-active" : ""}" data-cam="1" title="Ein-Finger-Kamera" aria-pressed="${cameraMode}">
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

function hintClass(id: string, step: number): string {
  if (step === 1 && (id === "pile" || id === "dig" || id === "groove" || id === "flatten" || id === "stone")) return "is-hint";
  if (step === 2 && id === "source") return "is-hint";
  return "";
}
