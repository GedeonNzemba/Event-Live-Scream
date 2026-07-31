# Fonts

These five files are **not** committed — they are third-party binaries and the
repository has no reason to carry them. Download them before the first build:

| File | Source | Licence |
| --- | --- | --- |
| `Fraunces.ttf` | [Google Fonts](https://fonts.google.com/specimen/Fraunces) — download family, take the variable file | SIL OFL 1.1 |
| `Switzer-Regular.otf` | [Fontshare](https://www.fontshare.com/fonts/switzer) | ITF Free Font License |
| `Switzer-Medium.otf` | as above | as above |
| `Switzer-Semibold.otf` | as above | as above |
| `JetBrainsMono.ttf` | [JetBrains](https://www.jetbrains.com/lp/mono/) — variable file | SIL OFL 1.1 |

Rename to exactly the names above; `_layout.tsx` requires them by path and the
app will not start if one is missing.

Subset to Latin Extended before shipping. The correspondent is paying for their
own download on a Congolese data bundle, and the full Fraunces variable file is
several hundred kilobytes of glyphs this product will never render.
