import { DONATE_HREF, DONATE_LABEL, DONATE_NOTE, donateMarkup } from "./donate";

function fail(msg: string): never {
  throw new Error(msg);
}

if (!DONATE_HREF.startsWith("https://donate.stripe.com/")) {
  fail("donate must use a Stripe Payment Link");
}
if (!DONATE_HREF.includes("client_reference_id=sandflow")) {
  fail("Payment Link needs client_reference_id=sandflow");
}
if (/pk_|sk_|rk_/.test(DONATE_HREF)) fail("no Stripe API keys in the donate href");
if (DONATE_LABEL !== "Projekt unterstützen") fail(`label, got ${DONATE_LABEL}`);
if (DONATE_NOTE !== "Demos bleiben free. Wenn du willst, kannst du das Studio kurz unterstützen.") {
  fail(`note, got ${DONATE_NOTE}`);
}
if (/Freiwillige Spende/.test(`${DONATE_LABEL} ${DONATE_NOTE}`)) {
  fail("old spend-ab-1-euro copy must not remain");
}
if (/[—–]/.test(`${DONATE_LABEL}${DONATE_NOTE}`)) fail("donate copy must not use Gedankenstriche");

const html = donateMarkup();
if (!html.includes(`href="${DONATE_HREF}"`)) fail("markup href");
if (!html.includes('target="_blank"')) fail("target=_blank");
if (!html.includes('rel="noopener"')) fail("rel=noopener");
if (html.includes("js.stripe.com") || html.includes("Stripe(")) fail("no Stripe.js embed");

console.log(
  JSON.stringify({
    label: DONATE_LABEL,
    note: DONATE_NOTE,
    href: DONATE_HREF,
  }),
);
console.log("donate ui smoke ok");
