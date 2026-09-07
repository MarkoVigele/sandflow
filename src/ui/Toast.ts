export function showToast(msg: string): void {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 4200);
}
