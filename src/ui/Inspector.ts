import type { SimApi } from "../sim/api";
import type { Store } from "../state/store";
import type { SimParams, ToolId } from "../state/types";

const TOOL_COPY: Record<ToolId, { title: string; body: string }> = {
  pile: { title: "Aufschütten", body: "Ziehen, um Sand anzuhäufen. Radius und Stärke unten." },
  dig: { title: "Graben", body: "Sand abtragen — gut für Rinnen, bevor du gießt." },
  smooth: { title: "Glätten", body: "Mittelwert über die Nachbarschaft. Nimmt Kanten." },
  dam: { title: "Damm / Wand", body: "Steiler als Aufschütten. Hält Wasser eine Weile." },
  pour: { title: "Gießen", body: "Finger oder Taste halten. Menge über Durchfluss." },
  source: {
    title: "Quelle",
    body: "Tippen setzt eine Quelle. Ziehen verschiebt sie. Unten löschen oder den Durchfluss ändern.",
  },
};

function slider(
  name: string,
  min: number,
  max: number,
  step: number,
  value: number,
  key: string,
): string {
  return `
    <label class="slider">
      <span>${name}<em>${format(value)}</em></span>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-key="${key}" />
    </label>`;
}

function format(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export class Inspector {
  el: HTMLElement;
  constructor(
    private store: Store,
    host: HTMLElement,
    private api: SimApi,
    private onTexture: (prompt: string) => void,
  ) {
    this.el = host;
    this.render();
    let sig = "";
    store.subscribe(() => {
      const st = store.state;
      const next = `${st.tool}|${st.advancedOpen}|${st.selectedSourceId}|${st.galleryOpen}`;
      if (next !== sig) {
        sig = next;
        this.render();
      }
    });
  }

  private render(): void {
    const s = this.store.state;
    const copy = TOOL_COPY[s.tool];
    const src = this.api.getSources().find((x) => x.id === s.selectedSourceId);

    this.el.innerHTML = `
      <section class="inspector-card">
        <p class="kicker">Kontext</p>
        <h3>${copy.title}</h3>
        <p class="lede">${copy.body}</p>
        ${
          s.tool === "source"
            ? `
          <div class="row source-actions">
            <button class="btn" data-del ${src ? "" : "disabled"}>Quelle löschen</button>
          </div>
          ${src ? slider("Durchfluss Quelle", 0.2, 6, 0.1, src.rate, "sourceRate") : `<p class="hint">Keine Quelle gewählt — auf die Wanne tippen.</p>`}`
            : `
          ${s.tool === "pour" ? slider("Durchfluss", 0.25, 4, 0.05, s.pourRate, "pourRate") : ""}
          ${s.tool !== "pour" ? slider("Radius", 0.02, 0.16, 0.005, s.brushRadius, "brushRadius") : ""}
          ${s.tool !== "pour" ? slider("Stärke", 0.3, 2.2, 0.05, s.brushStrength, "brushStrength") : ""}`
        }
        <div class="row">
          <button class="btn" data-reset-water>Nur Wasser</button>
          <button class="btn" data-reset-all>Szene neu</button>
        </div>
        <button class="adv-toggle" data-adv>${s.advancedOpen ? "Erweitert schließen" : "Erweitert"}</button>
        ${
          s.advancedOpen
            ? `
          <div class="adv">
            ${slider("Körnung", 0.1, 1, 0.01, s.params.grain, "grain")}
            ${slider("Kohäsion", 0.0, 0.85, 0.01, s.params.cohesion, "cohesion")}
            ${slider("Infiltration", 0.0, 0.05, 0.001, s.params.infiltration, "infiltration")}
            ${slider("Erosionsrate", 0.05, 1, 0.01, s.params.erosionRate, "erosionRate")}
            ${slider("Sedimentkapazität", 0.08, 1, 0.01, s.params.sedimentCapacity, "sedimentCapacity")}
            ${slider("Ablagerung", 0.05, 0.8, 0.01, s.params.deposition, "deposition")}
          </div>`
            : ""
        }
        <div class="tex">
          <label class="field">
            <span>Sandtextur</span>
            <input type="text" value="${escapeHtml(s.texturePrompt)}" data-prompt maxlength="80" placeholder="z. B. grober roter Laterit" />
          </label>
          <button class="btn primary" data-tex>Textur erzeugen</button>
          <p class="hint">Lokal aus der Beschreibung. Ein späterer Dienst kann dieselbe Stelle nutzen.</p>
        </div>
      </section>
    `;

    this.el.querySelector("[data-adv]")?.addEventListener("click", () => {
      this.store.patch({ advancedOpen: !this.store.state.advancedOpen });
    });
    this.el.querySelector("[data-reset-water]")?.addEventListener("click", () => {
      this.api.resetWater();
    });
    this.el.querySelector("[data-reset-all]")?.addEventListener("click", () => {
      this.api.resetScene();
    });
    this.el.querySelector("[data-del]")?.addEventListener("click", () => {
      void this.api.removeSelectedSource();
    });
    this.el.querySelector("[data-tex]")?.addEventListener("click", () => {
      const prompt =
        this.el.querySelector<HTMLInputElement>("[data-prompt]")?.value ?? s.texturePrompt;
      this.store.patch({ texturePrompt: prompt });
      this.onTexture(prompt);
    });
    this.el.querySelectorAll<HTMLInputElement>("input[type=range]").forEach((input) => {
      input.addEventListener("input", () => this.onSlider(input));
    });
  }

  private onSlider(input: HTMLInputElement): void {
    const key = input.dataset.key!;
    const value = Number(input.value);
    if (key === "pourRate") this.store.patch({ pourRate: value });
    else if (key === "brushRadius") this.store.patch({ brushRadius: value });
    else if (key === "brushStrength") this.store.patch({ brushStrength: value });
    else if (key === "sourceRate") this.api.setSelectedRate(value);
    else {
      this.store.setParams({ [key]: value } as Partial<SimParams>);
      this.api.applyParams();
    }
    const em = input.previousElementSibling?.querySelector("em");
    if (em) em.textContent = format(value);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
