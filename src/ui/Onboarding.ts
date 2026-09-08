import { persistOnboardDone, type Store } from "../state/store";
import type { OnboardStep } from "../state/types";
import { SOURCE_TOOL_TIP } from "./sourceGesture";

const STEPS: Record<Exclude<OnboardStep, 0>, { kicker: string; title: string; body: string }> = {
  1: {
    kicker: "Schritt 1 von 3",
    title: "Sand formen",
    body: "Zieh mit Hügel oder Graben. Hügel und Rinnen geben dem Wasser später eine Spur.",
  },
  2: {
    kicker: "Schritt 2 von 3",
    title: "Quelle setzen",
    body: `${SOURCE_TOOL_TIP} Den Stift auf dem Sand halten und schieben, um sie zu verschieben.`,
  },
  3: {
    kicker: "Schritt 3 von 3",
    title: "Abspielen",
    body: "Starte die Simulation. Erst dünne Adern, dann ein Bett, später Verzweigungen. Tempo, Zeitraffer und Bild liegen oben neben Play.",
  },
};

export class Onboarding {
  el: HTMLElement;
  constructor(private store: Store, host: HTMLElement) {
    this.el = host;
    this.render();
    let sig = store.state.onboardStep;
    store.subscribe(() => {
      if (store.state.onboardStep !== sig) {
        sig = store.state.onboardStep;
        this.render();
      }
    });
  }

  private render(): void {
    const step = this.store.state.onboardStep;
    if (step === 0) {
      this.el.innerHTML = "";
      return;
    }
    const copy = STEPS[step];
    this.el.innerHTML = `
      <aside class="coach" role="dialog" aria-label="Kurzanleitung">
        <p class="kicker">${copy.kicker}</p>
        <h3>${copy.title}</h3>
        <p>${copy.body}</p>
        <div class="row">
          <button class="btn primary" data-next>${step === 3 ? "Los" : "Weiter"}</button>
          <button class="btn" data-skip>Überspringen</button>
        </div>
      </aside>
    `;
    this.el.querySelector("[data-next]")?.addEventListener("click", () => this.advance());
    this.el.querySelector("[data-skip]")?.addEventListener("click", () => this.finish());
  }

  private advance(): void {
    const step = this.store.state.onboardStep;
    if (step === 1) {
      this.store.patch({ onboardStep: 2, tool: "source", cameraMode: false });
      return;
    }
    if (step === 2) {
      this.store.patch({ onboardStep: 3 });
      return;
    }
    this.finish();
  }

  private finish(): void {
    persistOnboardDone();
    this.store.patch({ onboardStep: 0, playing: true });
  }
}
