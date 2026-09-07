# Sandflow

Sandflow ist unser kleines Labor im Browser: Wasser sucht sich einen Weg durch Sand. Erst dünne Adern, dann ein Bett, später ein verzweigtes Netz mit Ablagerungen. Version 1 ist der spielbare Kern — bewusst schlank, aber ernst gemeint.

## Starten

```bash
npm install
npm run dev
```

Die lokale Adresse steht in der Konsole (meist `http://localhost:5173`). WebGL2-fähiger Browser, am besten Chrome oder Firefox. Für die Veröffentlichung:

```bash
npm run build
```

Der Build landet in `docs/` (relativer Basispfad, bereit für GitHub Pages). Ein leeres `.nojekyll` liegt mit im Output.

## Steuern

| Aktion | Desktop | Touch |
| --- | --- | --- |
| Werkzeug | Linke Taste / ziehen | Ein Finger |
| Gießen | Taste halten | Finger halten |
| Kamera drehen / zoomen | Rechte Taste, Rad, Mitteltaste | Zwei Finger. Oder Werkzeug **Kamera** für einen Finger |
| Play / Pause | Leertaste oder Transportleiste | Transportleiste |
| Werkzeuge 1–6 | Tasten `1`–`6` | Symbolleiste |
| Rückgängig / Wiederholen | `Strg+Z` / `Strg+Y` | Symbole oben |

Oben: Presets, Qualität, Tempo (0,25×–4×), Speichern, Laden, Screenshot. Rechts (am Telefon unten): Kontext zum aktiven Werkzeug. Unter **Erweitert** liegen Körnung, Kohäsion, Infiltration, Erosionsrate und Sedimentkapazität.

## Presets

- **Flache Wanne** — ebenes Bett, Quelle oben. Adern entstehen von allein.
- **Sanfte Schräge** — Gefälle, das Wasser bleibt in der Spur und gräbt nach.
- **Vorgegrabenes Bett** — ein Rinnsal liegt schon da, Ufer werden später angefressen.
- **Zwei Quellen** — zwei Zuläufe treffen sich in einer Mulde.

## Performance

- **Mittel** ist die Vorgabe auf dem Telefon, **Hoch** am Rechner.
- Gitter: Niedrig 128², Mittel 256², Hoch/Ultra 512². Schatten und Partikel nur auf Hoch und Ultra.
- Fällt die Bildrate auf dem Telefon unter 25, rutscht die Qualität eine Stufe runter.
- Wenn es hakelt: Qualität senken, Tempo auf 0,5×, weniger Quellen, Ultra meiden.

## Speichern

JSON nimmt Höhe, Wasser, Quellen und Materialparameter mit. PNG ist ein Blick aus der aktuellen Kamera. Die Sandtextur kommt aus einer kurzen Beschreibung (lokal erzeugt). Ein externer Dienst kann später an dieselbe Stelle.

## Was V1 nicht ist

Kein WebGPU, kein fremdes Bild-API, keine Heatmaps, keine Teilen-Links, keine komplette Requisitenbibliothek. Das kommt später — erst muss das Wasser glaubwürdig graben.
