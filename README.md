# Sandflow

Sandflow ist unser kleines Labor im Browser: Wasser sucht sich einen Weg durch Sand. Erst dünne Adern, dann ein Bett, später ein verzweigtes Netz mit Ablagerungen. Wir halten Version 1 bewusst schlank — spielbar, nicht aufgeblasen.

**Live:** [markovigele.github.io/sandflow](https://markovigele.github.io/sandflow/)

WebGL2, am besten Chrome oder Firefox. Telefon geht, Mittel reicht dort meist.

## Was wir gebaut haben

- Erosion in einer 3D-Wanne: Wasser gräbt, lagert ab, Ufer rutschen nach.
- Quellen, die auf dem Sand sitzen. **Tippen wählt, Ziehen verschiebt** — auch wenn die Kamera aktiv ist.
- Werkzeuge für Sand, Beton, Kiesel und Gießen. Beton bleibt hart, Kiesel sitzen auf einer kleinen Hartinsel.
- Qualität von Niedrig bis Ultra, plus **Auto**. Auto bleibt an, bis wir eine feste Stufe wählen.
- Vorlagen von der flachen Wanne bis Staudamm, inkl. Regenhang.
- Tempo 0,25×–8×, Zeitraffer, optionale Höhenspur, PNG neben Play.
- Speichern als JSON, Teilen per Link oder Share-JSON — ohne Cloud.
- Farbkarte (Strömung / Nässe) und ein Querschnitt rechts in der Leiste.

Beim ersten Start: Kamera drehen → Gießen oder Quelle ziehen → Graben und Beton.

## Steuern

### Quelle ziehen

Werkzeug **Quelle**. Tippen auf den Pin wählt ihn. Ziehen schiebt ihn über den Sand. Freier Sand setzt eine neue Quelle. Menge und Löschen liegen rechts (am Telefon unten). Vorlagen wie Regenhang sprühen als Regenband.

### Werkzeuge

Links die Symbolleiste. Linke Taste oder ein Finger zeichnet. Der goldene Ring ist die Pinselgröße.

| Werkzeug | Was es tut |
| --- | --- |
| Hügel, Graben, Glätten, Damm | Sand aufschütten, wegnehmen, weichziehen, steil setzen |
| Stampfen | Sand fest drücken, Wasser nimmt ihn weniger mit |
| Rinne | Furche mit leichten Ufern vorzeichnen |
| Einebnen | Fläche glattziehen, oder die ganze Wanne. Beton bleibt |
| Beton | Platte oder Mauer, erodiert nicht. Taste `B` |
| Kiesel | Kleine Steine. Taste `K` |
| Radierer | Kiesel und Beton weg. Sand und Wasser bleiben. Taste `R` |
| Gießen | Taste oder Finger halten — es tropft unter dem Ring |
| Quelle | Tippen wählt, Ziehen verschiebt |
| Kamera | Ein Finger dreht. Quellenstifte bleiben greifbar |

Rechtsklick, Rad oder Mitteltaste (zwei Finger am Telefon) drehen und zoomen. **Kamera** braucht nur einen Finger. `1`–`9` wählen die ersten Werkzeuge. `[` / `]` ändern die Pinselgröße.

Oben: Vorlagen, Qualität, Play/Pause (Leertaste), **Bild**, Tempo, **Zeitraffer**, **Spur**. Zurücksetzen (Szene oder nur Wasser), Teilen, Speichern, Laden, Rückgängig (`Strg+Z` / `Strg+Y`). Am Telefon bleiben Transport und Bild sichtbar, der Rest liegt unter **Mehr**.

### Qualität

Oben das Auswahlfeld. Vorgabe: **Mittel** am Telefon, **Hoch** am Rechner.

| Stufe | Gitter |
| --- | --- |
| Niedrig | 128² |
| Mittel | 256² |
| Hoch | 512² |
| Ultra | 768² |

**Auto** senkt eine Stufe, wenn wir zwei Sekunden unter 40 Bildern/s bleiben (kurzer Hinweis). Eine feste Wahl schaltet Auto aus. Partikel, Schatten und Schärfe folgen der Stufe. Niedrig bleibt mobil-sicher.

Wenn es hakelt: eine Stufe tiefer, Tempo 0,5×, weniger Quellen, Ultra meiden.

## Vorlagen

- **Flache Wanne** — ebenes Bett, Quelle oben. Adern entstehen von allein.
- **Sanfte Schräge** — Gefälle, das Wasser bleibt in der Spur und gräbt nach.
- **Vorgegrabenes Bett** — ein Rinnsal liegt schon da, Ufer werden später angefressen.
- **Zwei Quellen** — zwei Zuläufe treffen sich in einer Mulde.
- **Mini-Canyon** — steile Wände, tiefes Bett.
- **Delta / Verzweigung** — ein Zulauf teilt sich in mehrere Arme.
- **Referenz-Rinne** — tiefes, klares Bett als Vergleichsspur.
- **Dünne Adern** — viele feine Rinnen auf der Schräge.
- **Betonkanal** — Labor-Rinne mit Betonwänden und Sandsohle. Die Wände erodieren nicht.
- **Delta ins Becken** — Sanddelta läuft in ein Beton-Auffangbecken.
- **Treppenüberlauf** — gestufte Betonkaskade, unten ein Sandfang.
- **Betonwehr** — ein Wehr quert die Sandstrecke, Überlauf darunter.
- **Regenhang** — Schräge unter Regen, Betonrinnen fangen Adern, unten eine Pfütze.
- **Staudamm** — Betonstaumauer, See oben, Überlauf nagt unten am Sand.

## Lokal

```bash
npm install
npm run dev
```

Adresse steht in der Konsole (meist `http://localhost:5173`).

```bash
npm run build
```

Der Build landet in `docs/` (relativer Basispfad, GitHub Pages). Ein leeres `.nojekyll` liegt mit im Output.

## Speichern und teilen

**Speichern** nimmt Höhe, Wasser, Quellen und Material in voller Genauigkeit mit. **Teilen** schreibt einen kompakten Zustand in den URL-Hash (`#sf2.…`) oder als Share-JSON — ohne Cloud. Der Link trägt Vorlage, Quellen, Tempo, Kamera, Kiesel und ein grobes Höhenfeld (64²). Sehr lange Links lassen das Gelände weg. **Bild** speichert ein PNG aus der aktuellen Kamera.

Trocken- und Nass-Sand liegen unter `public/textures/` und mischen sich nach Feuchte. Der Rahmen ist Holz (`wood-rim.jpg`), Beton in der Wanne `concrete-albedo.jpg`.

## Was wir noch offen lassen

- WebGPU — wir bleiben bei WebGL2.
- Externe Bild-API — nur Platzhalter (`VITE_ASSET_API`), sonst lokal.
- Volle Requisiten — nur leichte Kiesel, keine Möbel.
- Feineres Teilen — Hash bleibt grob, volles Gelände nur im JSON.
- Physik jenseits des Kerns — kein Nassbruch, keine echte Trübung.

## Architektur (kurz, für Agenten)

Vite + TypeScript + Three.js. Simulation im Worker, Oberfläche im Hauptthread.

| Ordner | Rolle |
| --- | --- |
| `src/ui/` | Toolbar, Quelle ziehen, Onboarding, Inspector, Tasten |
| `src/sim/` | Worker (`erosion.worker.ts`) über `SimClient` |
| `src/scene/` | Wanne, Wasser, Kamera, Zielring |
| `src/state/` | Store, Qualität, Share-Hash, Persistenz |
| `src/assets/` | Texturen und Ableitungen |

Smoke: `npm run sim:smoke`, `hydraulic:smoke`, `tools:smoke`, `ui:smoke`, `share:smoke`, `assets:smoke`, `water:smoke`, `flowfx:smoke`, dann `npm run build`. Mehr Lage: `AGENTS.md`.
