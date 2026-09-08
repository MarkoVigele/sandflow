import { persistOnboardDone, type Store } from "../state/store";
import { ONBOARD_STEPS, onboardAdvanceClick } from "./onboard";

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
    const copy = ONBOARD_STEPS[step];
    this.el.innerHTML = `
      <aside class="coach" role="dialog" aria-label="Kurzanleitung" aria-live="polite">
        <p class="kicker">${copy.kicker}</p>
        <h3>${copy.title}</h3>
        <p>${copy.body}</p>
        <div class="row">
          <button type="button" class="btn primary" data-next>${step === 3 ? "Los" : "Weiter"}</button>
          <button type="button" class="btn" data-skip>Überspringen</button>
        </div>
      </aside>
    `;
    this.el.querySelector("[data-next]")?.addEventListener("click", () => this.advance());
    this.el.querySelector("[data-skip]")?.addEventListener("click", () => this.finish());
  }

  private advance(): void {
    const next = onboardAdvanceClick(this.store.state.onboardStep);
    if (next.onboardStep === 0) {
      this.finish();
      return;
    }
    this.store.patch(next);
  }

  private finish(): void {
    persistOnboardDone();
    this.store.patch({ onboardStep: 0, playing: true });
  }
}
