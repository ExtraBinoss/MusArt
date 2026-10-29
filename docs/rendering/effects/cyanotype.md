# Cyanotype

This is an original continuous-tone photographic print interpretation in Three.js TSL. Dark photographic detail maps to adjustable Prussian-blue ink, while bright detail maps to warm paper. It is not a chemical reaction simulator. The genuine botanical cyanotypes shown by the [Natural History Museum, Anna Atkins](https://www.nhm.ac.uk/discover/anna-atkins-cyanotypes-the-first-book-of-photographs.html) are the primary visual reference: blue density, pale silhouettes, coating variation and subtle paper grain. The [MoMA cyanotype collection](https://www.moma.org/collection/terms/cyanotype) provides additional real print references.

The source's luminance passes through exposure, independent black/white endpoints, contrast, gamma and optional negative polarity. A normalized optical-density curve controls blue deposition while retaining endpoint tones. A bounded four-sample smooth hash field varies coating density. Fine deterministic grain and elongated fiber cells vary paper reflectance. Wash-out and border fading affect ink coverage, not the source alpha silhouette. Ink and paper colors are fully editable.

All fields use authored document coordinates and the portable seed. There is no implicit clock, source resizing, CPU composition or GPU pixel readback. The shared 1× effect plane and mip transport feed the editor, thumbnails and export. Native photographic/tonal/alpha and cross-density tests and actual PNG inspection are required before acceptance; artifacts remain ignored.

## Native verification

Both backend cases passed on October 28, 2026 with Chromium 156 on Linux, Intel Xe-LPG WebGPU and Three's WebGL fallback, viewport1600×1000, DPR1. The real waterfall photograph changed by 38.508 mean RGB byte levels over opaque pixels while preserving every source-alpha byte. Exact native editor/export RGBA matches were verified at62.5%,100%,200%, together with exact1×→2× reference blocks and deterministic seeded paper. Exposure/contrast/gamma/density/endpoints, negative wash, strongly textured edges and maximum tonal controls all produced real visible changes.

Independent black/gray/white calibration produced [[18, 61, 120, 255], [73, 105, 145, 255], [244, 241, 223, 255]] RGBA samples. The gray value matches the normalized density equation within one byte; blue ink and warm paper endpoints are exact. Both backends reported zero production GPU/WebGL/Canvas2D readbacks and no page errors. Captures and reports remain under ignored artifacts/cyanotype/.

Visual review compared the genuine NHM Anna Atkins reference with the native positive and negative photographic prints. Fine waterfall/foliage detail remains recognizable in blue density, bright paper highlights and modest coating texture; the negative washed variant produces pale foliage on blue. The implementation supplies an adjustable photographic interpretation rather than claiming to reproduce a particular historical print.
