import type { Store } from "../state/store";
import { ICONS } from "./icons";

const STORAGE_KEY = "sandflow.v1.onboarding";

export function shouldOpenOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "1";
  } catch {
    return true;
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private mode */
  }
}

const STEPS: { kicker: string; title: string; body: string }[] = [
  {
    kicker: "Willkommen",
    title: "Ein kleines Labor im Browser",
    body: "Wasser sucht sich Wege durch Sand: erst dünne Adern, dann ein Bett, später ein verzweigtes Netz mit Ablagerungen. Version 1 ist der spielbare Kern.",
  },
  {
    kicker: "Werkzeuge",
    title: "Sand formen, gießen, Quelle setzen",
    body: "Am Rechner links, am Telefon unten. Ein Finger oder die linke Taste arbeitet auf der Wanne. Quelle: tippen setzt, ziehen verschiebt, im Kontextfeld löschen.",
  },
  {
    kicker: "Kamera",
    title: "Drehen, ohne das Werkzeug zu verlieren",
    body: "Rechte Taste, Mausrad oder zwei Finger. Unter Kamera geht das Drehen auch mit einem Finger. Play, Tempo und Qualität liegen oben.",
  },
  {
    kicker: "Sichern",
    title: "Presets, Speichern, Screenshot",
    body: "Vier Ausgangslagen unter Presets. JSON nimmt die Szene mit, PNG den Blick aus der Kamera. Livewerte (FPS, Wassermenge) lassen sich einklappen.",
  },
];

export class Onboarding {
  constructor(
    private store: Store,
    private host: HTMLElement,
  ) {
    this.render();
    let sig = "";
    this.store.subscribe(() => {
      const st = this.store.state;
      const next = `${st.onboardingOpen}|${st.onboardingStep}`;
      if (next !== sig) {
        sig = next;
        this.render();
      }
    });
  }

  private render(): void {
    const open = this.store.state.onboardingOpen;
    const step = Math.max(0, Math.min(STEPS.length - 1, this.store.state.onboardingStep));
    const last = step === STEPS.length - 1;
    const copy = STEPS[step];

    this.host.innerHTML = open
      ? `
      <div class="overlay is-open" data-backdrop>
        <div class="sheet onboarding" role="dialog" aria-labelledby="onb-title">
          <header class="sheet-head">
            <div>
              <p class="kicker">${copy.kicker} · ${step + 1}/${STEPS.length}</p>
              <h2 id="onb-title">${copy.title}</h2>
            </div>
            <button class="icon-btn" data-skip title="Überspringen">${ICONS.close}</button>
          </header>
          <p class="onb-body">${copy.body}</p>
          <ol class="onb-dots" aria-hidden="true">
            ${STEPS.map((_, i) => `<li class="${i === step ? "is-on" : ""}"></li>`).join("")}
          </ol>
          <div class="onb-actions">
            <button class="btn" data-back ${step === 0 ? "disabled" : ""}>Zurück</button>
            <button class="btn primary" data-next>${last ? "Loslegen" : "Weiter"}</button>
          </div>
        </div>
      </div>`
      : "";

    this.host.querySelector("[data-skip]")?.addEventListener("click", () => this.close());
    this.host.querySelector("[data-back]")?.addEventListener("click", () => {
      this.store.patch({ onboardingStep: Math.max(0, step - 1) });
    });
    this.host.querySelector("[data-next]")?.addEventListener("click", () => {
      if (last) this.close();
      else this.store.patch({ onboardingStep: step + 1 });
    });
  }

  private close(): void {
    markOnboardingSeen();
    this.store.patch({ onboardingOpen: false, onboardingStep: 0 });
  }
}
