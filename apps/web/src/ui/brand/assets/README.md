# Canonical Melt SVG artwork

`melt.svg` and `melt-maskable.svg` are generated directly from the complete copied
Maskot engine. Their source is `fleur8` (Dahlia), expression `surpris` (wonder),
capsule eyes and the exact deterministic `sample(0.75)` frame. The maskable
variant adds the brand's soft background and insets the same paths into the
platform safe zone. It does not redraw or approximate the silhouette.

From the repository root:

```sh
bun scripts/brand-assets.ts
```

The script also synchronizes the generated palette and application metadata from config.ts.
It writes these sources, their byte-identical public install-icon copies
and `manifest.json` with SHA-256 checksums. It uses pure TypeScript, no DOM, GPU,
network request, rasterization or extra dependency.

The inline logo is the same engine frame. Motion runs only while a genuine
operation remains pending; favicons and installed-app icons stay static.

After the coordinated native-browser slot is available, regenerate the optional
Apple Touch and install PNG renditions with `bun scripts/brand-assets.ts --png`.
These are native browser encodings of these same SVG sources.
`raster-manifest.json` records their checksums. No raster artwork is authored.
