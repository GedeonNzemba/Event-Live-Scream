# Fonts

Five files, not committed — they are third-party binaries and the repository has
no reason to carry them. They are **not optional**: `_layout.tsx` requires them
by path, Metro resolves that at bundle time, and a missing file fails the bundle
with *Unable to resolve module* before the app runs.

```bash
cd mobile && npm run fonts
```

That fetches everything below and writes an `ATTRIBUTION.txt` next to them, which
both licences require to travel with the binaries.

| File | Source | Licence |
| --- | --- | --- |
| `Fraunces.ttf` | [Google Fonts](https://fonts.google.com/specimen/Fraunces) — the variable file | SIL OFL 1.1 |
| `Switzer-Regular.otf` | [Fontshare](https://www.fontshare.com/fonts/switzer) | ITF Free Font License |
| `Switzer-Medium.otf` | as above | as above |
| `Switzer-Semibold.otf` | as above | as above |
| `JetBrainsMono.ttf` | [JetBrains](https://www.jetbrains.com/lp/mono/) — the variable file | SIL OFL 1.1 |

If Fontshare's download endpoint has moved, the script substitutes **Archivo**
(SIL OFL, from Google Fonts) so a typeface can never be the thing that stops you
starting the app. Archivo rather than Inter on purpose: Inter is on the
"looks generated" list in [docs/12](../../../../docs/12-mobile-apps.md), and
Archivo was drawn for high performance at small sizes, which is the actual
reason Switzer was chosen. Force it with `npm run fonts -- --fallback`.

Doing it by hand instead: download, rename to exactly the names above, and drop
them in this directory in **both** apps.

Subset to Latin Extended before shipping. The correspondent pays for their own
download on a Congolese data bundle, and the full Fraunces variable file is
several hundred kilobytes of glyphs this product will never render.
