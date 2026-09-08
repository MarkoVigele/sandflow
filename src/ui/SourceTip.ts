import type { Store } from "../state/store";
import { SOURCE_TOOL_TIP, sourceTipVisible } from "./sourceGesture";

/** Persistent one-liner while the Source tool is active. Pin-drag agent can reuse the hook. */
export class SourceTip {
  el: HTMLElement;
  constructor(private store: Store, host: HTMLElement) {
    this.el = host;
    this.render();
    let sig = "";
    store.subscribe(() => {
      const next = `${store.state.tool}|${store.state.onboardStep}`;
      if (next !== sig) {
        sig = next;
        this.render();
      }
    });
  }

  private render(): void {
    const { tool, onboardStep } = this.store.state;
    if (!sourceTipVisible(tool, onboardStep)) {
      this.el.innerHTML = "";
      return;
    }
    this.el.innerHTML = `
      <p class="source-tip" data-source-tip role="status">${SOURCE_TOOL_TIP}</p>
    `;
  }
}
