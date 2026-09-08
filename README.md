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
| Abspielen / Pause | Leertaste oder Transportleiste | Transportleiste |
| Werkzeuge 1–9 | Tasten `1`–`9` | Symbolleiste |
| Kiesel / Radierer | `K` / `R` | Symbolleiste |
| Rückgängig / Wiederholen | `Strg+Z` / `Strg+Y` | Symbole oben |

Oben: Vorlagen, Qualität (inkl. **Auto**), Tempo (0,25×–8×) und **Zeitraffer**, Zurücksetzen (Szene oder nur Wasser), Teilen, Speichern, Laden, Bild. Rechts (am Telefon unten): Kontext zum aktiven Werkzeug. Unter **Erweitert** liegen Körnung, Kohäsion, Infiltration, Erosionsrate, Sedimentkapazität und eine optionale Heatmap (Fluss oder Tiefe). Beim ersten Start führt eine Kurzanleitung in drei Schritten: Sand formen → Quelle → Abspielen.

## Vorlagen

- **Flache Wanne** — ebenes Bett, Quelle oben. Adern entstehen von allein.
- **Sanfte Schräge** — Gefälle, das Wasser bleibt in der Spur und gräbt nach.
- **Vorgegrabenes Bett** — ein Rinnsal liegt schon da, Ufer werden später angefressen.
- **Zwei Quellen** — zwei Zuläufe treffen sich in einer Mulde.
- **Mini-Canyon** — steile Wände, tiefes Bett.
- **Delta / Verzweigung** — ein Zulauf teilt sich in mehrere Arme.
- **Referenz-Rinne** — tiefes, klares Bett als Vergleichsspur.
- **Dünne Adern** — viele feine Rinnen auf der Schräge.

Zusätzliche Werkzeuge: **Feststampfen** (Kohäsion lokal), **Rinne** vorzeichnen, **Einebnen** (Pinsel oder ganze Wanne), **Kiesel** (kleine Steine) und **Radierer**.

## Performance

- **Mittel** ist die Vorgabe auf dem Telefon, **Hoch** am Rechner.
- **Auto** bleibt an, bis eine feste Stufe gewählt wird. Unter 25 Bildern/s rutscht die Qualität eine Stufe tiefer (Toast).
- Gitter: Niedrig 128², Mittel 256², Hoch/Ultra 512². Schatten und Partikel nur auf Hoch und Ultra.
- Wenn es hakelt: Qualität senken, Tempo auf 0,5×, weniger Quellen, Ultra meiden.

## Speichern und teilen

JSON (Speichern) nimmt Höhe, Wasser, Quellen und Materialparameter in voller Genauigkeit mit. **Teilen** schreibt einen kompakten Zustand in den URL-Hash (`#sf2.…`) oder als Share-JSON — ohne Cloud. Der Link trägt Vorlage, Quellen, Tempo, Kamera, Kiesel und ein grobes Höhenfeld (64²). Fehlt Platz, bleibt die Vorlage ohne Gelände. PNG ist ein Blick aus der aktuellen Kamera. Trocken- und Nass-Sand unter `public/textures/` mischen sich nach Feuchte; der Wannenrand trägt Holz. Fehlt eine Datei, bleibt die lokale Prozedur.

## Was V1 nicht ist

Kein WebGPU, kein fremdes Bild-API, keine komplette Requisitenbibliothek. Erst muss das Wasser glaubwürdig graben.
