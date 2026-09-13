/** Stripe Payment Link only. No Stripe.js, no keys, no embed. */
export const DONATE_HREF =
  "https://donate.stripe.com/eVqfZif6m8veaTEftLeEo00?client_reference_id=sandflow";

export const DONATE_LABEL = "Projekt unterstützen";

export const DONATE_NOTE =
  "Demos bleiben free. Wenn du willst, kannst du das Studio kurz unterstützen.";

export function donateMarkup(): string {
  return `
    <a class="chip ghost donate-link" href="${DONATE_HREF}" target="_blank" rel="noopener">${DONATE_LABEL}</a>
    <p class="donate-note">${DONATE_NOTE}</p>
  `;
}

export function mountDonate(host: HTMLElement): void {
  host.innerHTML = donateMarkup();
}
