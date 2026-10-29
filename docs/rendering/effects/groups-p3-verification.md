# Procedural effects in transformed masked groups

`test/browser/effects-groups-p3.spec.ts` verifies all eleven new effects on a real
waterfall photograph in a Display-P3 working composition. A parent group rotates
−7°, its effect-bearing child group rotates 13°, and a separate sibling ellipse
mask rotates −11°. The photograph has fractional alpha; a translucent screen-blend
ellipse adds mixed content inside the group. Parent opacity is 90% and mask opacity
80%. This exercises real layer-mask mapping and nested target isolation rather
than a flat masked image fixture.

For each effect, an enabled amount-zero control preserves the same reference
geometry. Removing the mask almost doubles total alpha coverage (ratio 1.980634),
confirming the real mask changes the rendered result. The active effect must alter
at least 100 covered pixels and exceed 0.5 mean premultiplied RGB byte difference
over the complete page. All source alpha bytes must remain identical. Optional
coverage-removal settings remain disabled for this preservation witness;
the dedicated Circle/Shatter/CRT/Receipt tests cover their opt-in alpha controls.

The frozen 2026-10-28 run passes WebGPU in 25.6 seconds and Three's WebGL fallback
in 24.4 seconds. Linux / Headless Chrome 156.0.8078.4 uses viewport 1600×1000,
DPR 1.25 and Intel Xe-LPG for WebGPU. One worker runs inside a 200% CPU scope,
2300 MiB memory-high / 3200 MiB hard limit and zero swap allowance.

| Effect         | Mean premultiplied RGB difference | Changed covered pixels, WebGPU |
| -------------- | --------------------------------: | -----------------------------: |
| Ripple         |                             1.132 |                           5592 |
| Shatter        |                             2.950 |                           6487 |
| Noise          |                             4.074 |                           7150 |
| Flashlight     |                             5.964 |                           7151 |
| Circle         |                             8.660 |                           7153 |
| Cyanotype      |                             5.122 |                           7153 |
| Datamosh       |                             3.031 |                           7147 |
| CRT            |                             4.336 |                           7153 |
| One-bit Dither |                             7.523 |                           7154 |
| Receipt        |                             7.377 |                           7154 |
| Pink Phosphor  |                             7.673 |                           7154 |

Both backends preserve every alpha byte. For each effect, actual native editor
canvas snapshots and exports match in every RGBA byte at backing scales
0.625×/1×/2×, corresponding to physical requests 0.625×/1×/1.5× under the common
quality-tier policy. This compares matching backing density, not a CPU resize of
the complete 1× page. The P3 working composition passes through the existing final
sRGB presentation/export conversion; no wide-gamut PNG-tagging claim is made.

Both contact sheets were visually inspected: every effect visibly treats the
photographic content within the rotated ellipse silhouette. Instrumented production
WebGPU, WebGL and Canvas2D pixel-read APIs record zero calls. Raw reports, PNGs and
contact sheets are preserved under ignored `artifacts/effects-groups-p3/`. Native
validation decodes occur in a separate inspector page. These are correctness
witnesses rather than GPU-duration or frame-rate measurements.
