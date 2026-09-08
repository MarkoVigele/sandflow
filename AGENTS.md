# Agenten

Kurze Lage für uns und für Werkzeuge, die den Code anfassen. Die öffentliche Bedienung steht im [README](README.md).

- `src/ui/` — Bedienung. Quelle: Tippen wählt, Ziehen verschiebt (`sourceGesture.ts`). Onboarding: Kamera → Gießen/Quelle → Graben/Beton (`onboard.ts`).
- `src/sim/` — Erosion im Worker (`erosion.worker.ts`), angebunden über `SimClient`. Höchstens ein Schritt in der Luft, kein Aufholen.
- `src/scene/` — Three.js: Wanne, Wasser, Pins, Zielring auf dem verformten Sand.
- `src/state/` — Store, Qualität (Auto unter 40 fps / 2 s), Share-Hash `#sf2.…`.
- `src/assets/` — gebackene Texturen, lokale Ableitung.

Workflows unter `.github/workflows/` nicht ändern, wenn der Auftrag nur Doku ist.

Live: https://markovigele.github.io/sandflow/
