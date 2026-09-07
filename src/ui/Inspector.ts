import type { Store } from "../state/store";
import type { Viewport } from "../scene/Viewport";
import type { HeatmapMode, SimParams, ToolId } from "../state/types";

const TOOL_COPY: Record<ToolId, { title: string; body: string }> = {
  pile: { title: "Aufschütten", body: "Kreis = Pinselradius. Ziehen, um Sand anzuhäufen." },
  dig: { title: "Graben", body: "Kreis = Pinselradius. Sand abtragen — gut für Rinnen." },
  smooth: { title: "Glätten", body: "Kreis = Pinselradius. Mittelwert über die Nachbarschaft." },
  dam: { title: "Damm / Wand", body: "Kreis = Pinselradius. Steiler als Aufschütten." },
  tamp: { title: "Feststampfen", body: "Drückt Sand fest: lokale Kohäsion steigt, Erosion hält schlechter." },
  groove: { title: "Rinne vorzeichnen", body: "Ziehen zeichnet eine V-Rinne mit leichten Ufern — Wasser folgt später." },
  flatten: { title: "Einebnen", body: "Pinsel ebnet die Fläche unter dem Finger. Unten: ganze Wanne." },
  pour: { title: "Gießen", body: "Der Kreis auf dem Sand zeigt die Tropfstelle. Halten zum Gießen." },
  source: { title: "Quelle", body: "Kreis unter dem Finger: Tippen setzt, Ziehen verschiebt." },
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
    private viewport: Viewport,
    private onTexture: (prompt: string) => void,
  ) {
    this.el = host;
    this.render();
    let sig = "";
    store.subscribe(() => {
      const st = store.state;
      const next = `${st.tool}|${st.advancedOpen}|${st.selectedSourceId}|${st.galleryOpen}|${st.heatmap}`;
      if (next !== sig) {
        sig = next;
        this.render();
      }
    });
  }

  private render(): void {
    const s = this.store.state;
    const copy = TOOL_COPY[s.tool];
    const src = this.viewport.sources.find((x) => x.id === s.selectedSourceId);

    this.el.innerHTML = `
      <section class="inspector-card">
        <p class="kicker">Werkzeug</p>
        <h3>${copy.title}</h3>
        <p class="lede">${copy.body}</p>
        ${
          s.tool === "source"
            ? `
          <div class="row">
            <button class="btn" data-del ${src ? "" : "disabled"}>Quelle löschen</button>
          </div>
          ${src ? slider("Durchfluss Quelle", 0.2, 6, 0.1, src.rate, "sourceRate") : ""}`
            : `
          ${s.tool === "pour" ? slider("Durchfluss", 0.25, 4, 0.05, s.pourRate, "pourRate") : ""}
          ${s.tool !== "pour" ? slider("Radius", 0.02, 0.16, 0.005, s.brushRadius, "brushRadius") : ""}
          ${s.tool !== "pour" ? slider("Stärke", 0.3, 2.2, 0.05, s.brushStrength, "brushStrength") : ""}
          ${s.tool === "flatten" ? `<div class="row"><button class="btn" data-flatten>Ganze Wanne</button></div>` : ""}`
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
            <label class="field">
              <span>Heatmap</span>
              <select data-heat>
                <option value="off" ${s.heatmap === "off" ? "selected" : ""}>Aus</option>
                <option value="flow" ${s.heatmap === "flow" ? "selected" : ""}>Fluss</option>
                <option value="depth" ${s.heatmap === "depth" ? "selected" : ""}>Tiefe</option>
              </select>
            </label>
            <fieldset class="seg">
              <legend class="visually-hidden">Heatmap</legend>
              ${segBtn("off", "Aus", s.heatmap)}
              ${segBtn("flow", "Fluss", s.heatmap)}
              ${segBtn("depth", "Tiefe", s.heatmap)}
            </fieldset>
          </div>`
            : ""
        }
        <div class="tex">
          <label class="field">
            <span>Sandtextur</span>
            <input type="text" value="${escapeHtml(s.texturePrompt)}" data-prompt maxlength="80" placeholder="z. B. grober roter Laterit" />
          </label>
          <button class="btn primary" data-tex>Textur erzeugen</button>
        </div>
      </section>
    `;

    this.el.querySelector("[data-adv]")?.addEventListener("click", () => {
      this.store.patch({ advancedOpen: !this.store.state.advancedOpen });
    });
    this.el.querySelector("[data-reset-water]")?.addEventListener("click", () => {
      this.viewport.resetWater();
    });
    this.el.querySelector("[data-reset-all]")?.addEventListener("click", () => {
      this.viewport.resetScene();
    });
    this.el.querySelector("[data-flatten]")?.addEventListener("click", () => {
      void this.viewport.flattenAll();
    });
    this.el.querySelector("[data-del]")?.addEventListener("click", async () => {
      await this.viewport.pushHistory();
      this.viewport.removeSelectedSource();
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
    this.el.querySelectorAll<HTMLButtonElement>("[data-heat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.store.patch({ heatmap: btn.dataset.heat as HeatmapMode });
      });
    });
    this.el.querySelector<HTMLSelectElement>("select[data-heat]")?.addEventListener("change", (e) => {
      this.store.patch({ heatmap: (e.target as HTMLSelectElement).value as HeatmapMode });
    });
  }

  private onSlider(input: HTMLInputElement): void {
    const key = input.dataset.key!;
    const value = Number(input.value);
    if (key === "pourRate") this.store.patch({ pourRate: value });
    else if (key === "brushRadius") this.store.patch({ brushRadius: value });
    else if (key === "brushStrength") this.store.patch({ brushStrength: value });
    else if (key === "sourceRate") this.viewport.setSelectedRate(value);
    else {
      this.store.setParams({ [key]: value } as Partial<SimParams>);
      this.viewport.applyParams();
    }
    const em = input.previousElementSibling?.querySelector("em");
    if (em) em.textContent = format(value);
  }
}

function segBtn(mode: HeatmapMode, label: string, current: HeatmapMode): string {
  return `<button type="button" class="seg-btn ${current === mode ? "is-active" : ""}" data-heat="${mode}">${label}</button>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
