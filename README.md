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
| Kiesel / Radierer / Beton | `K` / `R` / `B` | Symbolleiste |
| Rückgängig / Wiederholen | `Strg+Z` / `Strg+Y` | Symbole oben |

Oben: Vorlagen, Qualität (inkl. **Auto**), Tempo (0,25×–8×) und **Zeitraffer**, Zurücksetzen (Szene oder nur Wasser), Teilen, Speichern, Laden, Bild. Rechts (am Telefon unten): Kontext zum aktiven Werkzeug. Unter **Erweitert** liegen Körnung, Kohäsion, Infiltration, Erosionsrate, Sedimentkapazität, **Relief** (Überhöhung von Rücken und Rinnen, ohne die Wanne anzuheben), **Wellen** (flussgetriebene Kräusel, ruhige Stellen leise; Detail folgt der Qualität) und eine optionale Heatmap (Fluss oder Tiefe). Beim ersten Start führt eine Kurzanleitung in drei Schritten: Sand formen → Quelle → Abspielen.

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

Zusätzliche Werkzeuge: **Feststampfen** (Kohäsion lokal), **Rinne** vorzeichnen, **Einebnen** (Pinsel oder ganze Wanne), **Beton** (Hartstoff / Platte oder Wand, Taste `B`), **Kiesel** (kleine Steine) und **Radierer** (Kiesel und Beton).

## Performance

- **Mittel** ist die Vorgabe auf dem Telefon, **Hoch** am Rechner.
- **Auto** bleibt an, bis eine feste Stufe gewählt wird. Unter 25 Bildern/s rutscht die Qualität eine Stufe tiefer (Toast).
- Gitter: Niedrig 128², Mittel 256², Hoch/Ultra 512². Schatten und Partikel nur auf Hoch und Ultra.
- Texturen: Mittel/Niedrig bleiben bei 512er- (bzw. 256er-) Karten und niedriger Anisotropie, damit ein Qualitätswechsel die Albedo nicht neu ableitet.
- Wenn es hakelt: Qualität senken, Tempo auf 0,5×, weniger Quellen, Ultra meiden.

## Speichern und teilen

JSON (Speichern) nimmt Höhe, Wasser, Quellen und Materialparameter in voller Genauigkeit mit. **Teilen** schreibt einen kompakten Zustand in den URL-Hash (`#sf2.…`) oder als Share-JSON — ohne Cloud. Der Link trägt Vorlage, Quellen, Tempo, Kamera, Kiesel und ein grobes Höhenfeld (64²). Nur extrem lange Links lassen das Gelände weg. PNG ist ein Blick aus der aktuellen Kamera. Trocken- und Nass-Sand unter `public/textures/` werden kachelbar nachbearbeitet und mischen sich nach Feuchte; der Wannenrand nimmt Beton/`concrete-albedo.jpg` (Laborlook), sonst Holz, sonst eine lokale Prozedur.

## V1.x — was jetzt drin ist

Gegen die ursprüngliche V1-Skizze ist der spielbare Kern gewachsen. Neu bzw. fest verdrahtet:

- Wasser über virtuelle Rohre (Mei / O’Brien): Fluxkarte → Geschwindigkeit → Sediment per MacCormack-Advektion. Kapazität im Gleichgewicht (C ∝ sin α · |v|), Erosion nur bei Fluss×Gefälle — stehende Tropfen brennen nicht ein. Nach dem Schnitt rutschen Ufer über den Böschungswinkel (thermisch). Flaches, lesbares Wasser über dem Bett; Wellen-Normalen folgen der Fließrichtung. Schaum nur an Turbulenz. Transiente Blasen-Cluster an Schub/Stufen, dünne Bedload-Körner in schnellem klarem Fluss.
- Zielring (AimCursor) sitzt auf der verformten Sandoberfläche, nicht auf der flachen Mesh-Ebene.
- Quellenpins sitzen auf derselben Höhe (UV → verdrängtes Gelände). Quelle ziehen verschiebt den Pin auf dem Sand.
- Werkzeuge **Feststampfen**, **Rinne**, **Einebnen**, **Beton** (nicht erodierbar), plus **Kiesel** und **Radierer**.
- Vorlagen inkl. Referenz-Rinne, dünnen Adern und Beton-Szenen (Kanal, Becken, Treppe, Wehr); Heatmap für Fluss oder Tiefe.
- Kurzanleitung, Tempo bis 8× / Zeitraffer, Auto-Qualität, Szene oder nur Wasser zurücksetzen.
- Teilen per URL-Hash oder Share-JSON (ohne Cloud).
- Gebackene Trocken-/Nass-Sand- und Laborrand-Texturen (kachelbar, abgeleitete Normalen/Rauheit); Nass mischt sich nach Feuchte. Hoch/Ultra nutzen stärkere Anisotropie. Mittel auf dem Telefon bleibt bei 512er-Karten, damit die Texturen nicht bei jedem Qualitätswechsel neu entstehen.

## Noch zurückgestellt

Die ursprüngliche Vision bleibt an ein paar Stellen bewusst offen:

- **WebGPU** — weiter WebGL2.
- **Echtes externes Bild-API** — nur Platzhalter (`VITE_ASSET_API`), sonst lokal / gebacken.
- **Volle Requisitenbibliothek** — nur leichte Kiesel, keine Möbel oder Figuren.
- **Hohe Share-Genauigkeit / Cloud** — Hash bleibt grob (64²), volles Gelände nur im JSON.
- **Physik-Feinschliff** jenseits des Erosionskerns (Nassbruch, echte Turbidität, Mehrphasen).
