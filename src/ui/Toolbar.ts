import type { Store } from "../state/store";
import type { ToolId } from "../state/types";
import { ICONS } from "./icons";
import { isOnboardHint } from "./onboard";
import { SOURCE_TOOL_TIP } from "./sourceGesture";
import { TOOLBAR_TOOLS, toolHotkeyDigit } from "./tools";

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
        ${TOOLBAR_TOOLS.map((t) => {
          const digit = toolHotkeyDigit(t.id);
          const shortcut = digit ? ` Taste ${digit}` : letterHint(t.id);
          const hint = t.id === "source" ? SOURCE_TOOL_TIP : t.hint;
          const label = `${t.label}. ${hint}.${shortcut}`;
          return `
          <button type="button" class="tool ${tool === t.id && !cameraMode ? "is-active" : ""} ${isOnboardHint(t.id, onboardStep) ? "is-hint" : ""}" data-tool="${t.id}" title="${hint}${shortcut}" ${t.id === "source" ? `data-source-tip="${SOURCE_TOOL_TIP}"` : ""} aria-label="${escapeAttr(label)}" aria-pressed="${tool === t.id && !cameraMode}"${digit ? ` aria-keyshortcuts="${digit}"` : ""}>
            <span class="icon" aria-hidden="true">${ICONS[t.id]}</span>
            <span class="tool-label">${t.label}</span>
          </button>`;
        }).join("")}
        <button type="button" class="tool ${cameraMode ? "is-active" : ""} ${isOnboardHint("camera", onboardStep) ? "is-hint" : ""}" data-cam="1" title="Mit einem Finger drehen. Quellenstifte bleiben greifbar." aria-label="Kamera. Ein-Finger-Orbit. Quellenstifte bleiben greifbar." aria-pressed="${cameraMode}">
          <span class="icon" aria-hidden="true">${ICONS.camera}</span>
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

function letterHint(id: string): string {
  if (id === "concrete") return " Taste B";
  if (id === "stone") return " Taste K";
  if (id === "erase") return " Taste R";
  return "";
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
