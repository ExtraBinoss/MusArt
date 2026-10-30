# CPU text shaping and analytical outlines

The renderer now prepares glyph metadata and vector paths with pinned text-shaper 0.1.28. Filled glyphs still use the existing analytical Three/TSL Slug pipeline. This migration does not introduce CPU rasterization, SDF/MSDF, a native WebGPU engine, or a HarfBuzz fallback. The timings below are a bounded three-observation comparison, not a general application-speed claim.

## Method and source identity

The baseline is `a40285b8f32f99778219cd9bcc55b8ae694c0edc`, HarfBuzz.js 0.4.15 and OpenType.js 2.0.0. Its independent worktree, original source snapshot, exact JavaScript/WASM runtime files, production build and matching maps were retained before removing production HarfBuzz dependencies. The CPU source snapshot was initially captured at `436f469`; SHA-256 verification confirms all eleven text-subsystem files are byte-identical to `a40285b8`. Those hashes and the final candidate runtime-file hashes are retained in ignored `artifacts/text-shaper-migration/cpu-provenance.json`. Later baseline commit `3ac0ae7` changes only a test. The candidate uses the production adapters and the declared Bun patch described in [dependency provenance](../../patches/README.md). Its installed text-shaper bundle SHA-256 is `43746f6e9885b317347d700464786050c38577550eb1c092a3751bcde9547867`.

Each method ran three fresh Bun processes, serially, on the same shared host. Inputs are sixteen cases across Inter, Tinos, Space Grotesk, Roboto Mono, Manrope, DM Sans, Lora, Playfair Display, Caveat and Arimo. They include AFTERHOURS × 150, French/English paragraphs, accents/NFC, ligatures, kerning, static/variable weights, wrapping, tracking, Greek, Cyrillic and Hebrew. All sixteen have real non-whitespace glyph coverage; none was skipped or counted as a missing-glyph rendering. Optical size is 14, clamped by the font where appropriate. This is token shaping for the existing horizontal layout, not a newly added full bidi/line-breaking engine.

The host recorded Intel(R) Core(TM) Ultra 5 125H, Bun 1.4.2. Commands used CPUQuota 200%, MemoryMax 2200M, MemorySwapMax 0, nice 15 and ionice 2/7. Font and old WASM bytes were read before timing. OS/file caches were shared; these are not isolated-machine trials. The [durable runner](../../test/performance/text-shaper/cpu/README.md) retains exact workloads, hashes, environment and fresh-process commands. Complete commands/curve/bounds/placement arrays and the exact historical adapters remain in ignored `artifacts/text-shaper-migration/`.

The CPU runner measures renderer preparation directly. Melt's later SVG branding and loading marks are outside these CPU clocks; the browser comparison likewise retains the same pre-branding interface for both methods.

The module clock includes each backend import/evaluation. Bootstrap parse and shaper setup are separate. Old WASM initialization occurs during bootstrap setup; new JavaScript module work occurs during module loading. A native browser comparison separately includes actual navigation, transfer and bootstrap in [the browser report](text-shaping-browser.md). CPU clocks exclude network and GPU work. The CPU scope is 200%; the separate native browser cohort uses a 100% CPU scope, so their absolute durations must not be treated as the same measurement boundary.

All values below are milliseconds. Each cell lists run 1 / run 2 / run 3, followed by the median. Three observations and large host variation do not establish statistical significance.

## Startup

| Phase                       |                         HarfBuzz/OpenType |                               text-shaper |
| --------------------------- | ----------------------------------------: | ----------------------------------------: |
| Backend modules             | 114.074 / 168.410 / 115.948 (**115.948**) | 164.443 / 177.320 / 220.861 (**177.320**) |
| Bootstrap font parse        |    148.589 / 82.310 / 81.114 (**82.310**) |         1.761 / 3.022 / 1.874 (**1.874**) |
| Bootstrap shaper setup      |     38.768 / 19.979 / 14.652 (**19.979**) |     60.783 / 59.696 / 63.614 (**60.783**) |
| Sum of those startup phases | 301.430 / 270.699 / 211.714 (**270.699**) | 226.988 / 240.038 / 286.349 (**240.038**) |

A retained attribution-only probe timed the Inter `font.gvar` getter at 62.75 ms (Lora 16.03 ms). Upstream `parseGvar` loops every glyph’s variation data when that table is first requested, so the first nondefault outline can pay whole-font tuple parsing before any requested contour is produced. This is a substantial observed cost, not an exclusive profile of the entire first-path interval. Lazy per-glyph parsing is a possible future optimization, not part of this measured migration.

The package parses tables lazily. A low candidate `parseMs` does not mean all font work disappeared: GPOS/variation parsing and the compatibility collector move work into setup/first shape, and variable `gvar` paths can move work into first extraction. Read those phases together.

## Warm shaping per call

Each observation averages 128 real shapes, including owned output copying.

| Case               |                 HarfBuzz/OpenType |                       text-shaper |
| ------------------ | --------------------------------: | --------------------------------: |
| afterhours-150     | 0.180 / 0.067 / 0.147 (**0.147**) | 0.058 / 0.164 / 0.120 (**0.120**) |
| inter-fr-light     | 0.068 / 0.052 / 0.182 (**0.068**) | 0.262 / 0.339 / 0.171 (**0.262**) |
| inter-en-regular   | 0.051 / 0.150 / 0.189 (**0.150**) | 0.158 / 0.163 / 0.226 (**0.163**) |
| inter-fr-heavy     | 0.214 / 0.074 / 0.200 (**0.200**) | 0.153 / 0.295 / 0.275 (**0.275**) |
| tinos-serif        | 0.048 / 0.050 / 0.120 (**0.050**) | 0.091 / 0.020 / 0.062 (**0.062**) |
| tinos-bold         | 0.047 / 0.014 / 0.078 (**0.047**) | 0.019 / 0.019 / 0.020 (**0.019**) |
| space-grotesk      | 0.117 / 0.040 / 0.089 (**0.089**) | 0.053 / 0.045 / 0.050 (**0.050**) |
| roboto-mono        | 0.021 / 0.027 / 0.012 (**0.021**) | 0.085 / 0.021 / 0.025 (**0.025**) |
| manrope-sans       | 0.077 / 0.018 / 0.053 (**0.053**) | 0.035 / 0.126 / 0.044 (**0.044**) |
| dm-sans            | 0.053 / 0.023 / 0.051 (**0.051**) | 0.062 / 0.023 / 0.033 (**0.033**) |
| lora-serif         | 0.152 / 0.018 / 0.114 (**0.114**) | 0.081 / 0.032 / 0.038 (**0.038**) |
| playfair-display   | 0.093 / 0.012 / 0.096 (**0.093**) | 0.022 / 0.025 / 0.023 (**0.023**) |
| caveat-handwriting | 0.159 / 0.056 / 0.082 (**0.082**) | 0.519 / 0.222 / 0.400 (**0.400**) |
| inter-greek        | 0.007 / 0.018 / 0.044 (**0.018**) | 0.018 / 0.026 / 0.012 (**0.018**) |
| inter-cyrillic     | 0.028 / 0.006 / 0.041 (**0.028**) | 0.013 / 0.010 / 0.018 (**0.013**) |
| arimo-hebrew       | 0.004 / 0.012 / 0.007 (**0.007**) | 0.015 / 0.009 / 0.033 (**0.015**) |

## First parse + setup + shape

This combines each case’s parse/setup/first-shape boundaries so lazy work is not mistaken for an isolated parse improvement.

| Case               |                     HarfBuzz/OpenType |                           text-shaper |
| ------------------ | ------------------------------------: | ------------------------------------: |
| afterhours-150     | 72.589 / 49.005 / 45.386 (**49.005**) | 64.607 / 63.578 / 72.767 (**64.607**) |
| inter-fr-light     | 29.962 / 28.365 / 55.952 (**29.962**) | 51.065 / 47.695 / 27.364 (**47.695**) |
| inter-en-regular   | 23.543 / 47.993 / 40.348 (**40.348**) | 23.222 / 32.409 / 22.114 (**23.222**) |
| inter-fr-heavy     | 36.918 / 38.817 / 43.019 (**38.817**) | 19.705 / 46.735 / 34.303 (**34.303**) |
| tinos-serif        |  13.953 / 13.662 / 7.162 (**13.662**) |     4.010 / 1.064 / 7.183 (**4.010**) |
| tinos-bold         | 13.590 / 14.885 / 16.451 (**14.885**) |     3.982 / 2.924 / 3.603 (**3.603**) |
| space-grotesk      |    8.631 / 10.797 / 9.652 (**9.652**) |    3.747 / 4.205 / 11.927 (**4.205**) |
| roboto-mono        |     5.007 / 3.901 / 2.850 (**3.901**) |     1.373 / 0.691 / 0.860 (**0.860**) |
| manrope-sans       |  14.426 / 2.749 / 14.481 (**14.426**) |    2.250 / 3.254 / 10.959 (**3.254**) |
| dm-sans            |  14.466 / 8.107 / 21.035 (**14.466**) |     4.254 / 3.177 / 5.182 (**4.254**) |
| lora-serif         |    7.595 / 3.184 / 16.997 (**7.595**) |  7.690 / 10.665 / 10.618 (**10.618**) |
| playfair-display   |     9.753 / 2.176 / 9.192 (**9.192**) | 17.219 / 16.491 / 22.007 (**17.219**) |
| caveat-handwriting |  19.619 / 7.931 / 20.817 (**19.619**) |    12.540 / 7.140 / 4.676 (**7.140**) |
| inter-greek        | 16.440 / 13.582 / 46.826 (**16.440**) | 17.716 / 20.176 / 26.226 (**20.176**) |
| inter-cyrillic     | 25.962 / 35.186 / 33.536 (**33.536**) | 17.425 / 30.867 / 25.033 (**25.033**) |
| arimo-hebrew       |     5.669 / 7.079 / 9.075 (**7.079**) |  6.908 / 10.020 / 11.571 (**10.020**) |

## First unique paths and quadratic curves

This includes actual weighted vector paths, bounds and quadratic conversion for every unique shaped glyph. The cold variable path regressions remain visible.

| Case               |                     HarfBuzz/OpenType |                               text-shaper |
| ------------------ | ------------------------------------: | ----------------------------------------: |
| afterhours-150     |     8.834 / 3.948 / 8.473 (**8.473**) | 129.086 / 161.779 / 147.867 (**147.867**) |
| inter-fr-light     | 15.170 / 20.687 / 10.391 (**15.170**) |    68.730 / 125.727 / 67.419 (**68.730**) |
| inter-en-regular   |     1.953 / 4.943 / 5.468 (**4.943**) |         1.769 / 2.172 / 1.395 (**1.769**) |
| inter-fr-heavy     |  13.148 / 21.283 / 9.583 (**13.148**) |     63.834 / 58.107 / 66.898 (**63.834**) |
| tinos-serif        |     4.017 / 1.828 / 1.461 (**1.828**) |         1.103 / 0.607 / 0.836 (**0.836**) |
| tinos-bold         |     2.713 / 0.853 / 4.439 (**2.713**) |         0.610 / 0.632 / 0.658 (**0.632**) |
| space-grotesk      |     6.888 / 1.384 / 5.696 (**5.696**) |         8.232 / 5.615 / 4.587 (**5.615**) |
| roboto-mono        |     3.008 / 6.112 / 1.179 (**3.008**) |         1.274 / 0.900 / 0.895 (**0.900**) |
| manrope-sans       |     1.679 / 0.980 / 2.533 (**1.679**) |         8.864 / 6.276 / 5.713 (**6.276**) |
| dm-sans            |     5.185 / 2.631 / 6.649 (**5.185**) |     14.169 / 19.844 / 19.346 (**19.346**) |
| lora-serif         |    3.046 / 10.761 / 9.276 (**9.276**) |      8.420 / 10.634 / 11.195 (**10.634**) |
| playfair-display   |     6.950 / 1.081 / 3.549 (**3.549**) |        8.664 / 9.626 / 11.216 (**9.626**) |
| caveat-handwriting |     6.678 / 2.109 / 8.507 (**6.678**) |         1.550 / 1.463 / 2.618 (**1.550**) |
| inter-greek        |     1.240 / 4.180 / 3.437 (**3.437**) |         0.727 / 1.664 / 0.489 (**0.727**) |
| inter-cyrillic     |    2.550 / 0.770 / 12.302 (**2.550**) |         0.434 / 0.419 / 0.409 (**0.419**) |
| arimo-hebrew       |     0.176 / 0.239 / 0.244 (**0.239**) |         0.322 / 0.233 / 0.520 (**0.322**) |

## Repeated wrapped layout and new atlas packing

AFTERHOURS uses 150 copies; other cases use 8. Font and outline caches are warm after the preceding phases. Each copy repeats real layout and packs a new curve atlas, then disposes its texture; no renderer/GPU execution is timed.

| Case               |                         HarfBuzz/OpenType |                               text-shaper |
| ------------------ | ----------------------------------------: | ----------------------------------------: |
| afterhours-150     | 659.656 / 240.216 / 455.317 (**455.317**) | 313.377 / 389.360 / 321.967 (**321.967**) |
| inter-fr-light     | 209.379 / 145.386 / 125.584 (**145.386**) |     37.090 / 78.364 / 50.428 (**50.428**) |
| inter-en-regular   |     85.967 / 74.219 / 73.162 (**74.219**) |     41.013 / 38.377 / 30.582 (**38.377**) |
| inter-fr-heavy     | 108.798 / 104.099 / 114.281 (**108.798**) |     44.345 / 30.221 / 42.239 (**42.239**) |
| tinos-serif        |     52.863 / 50.961 / 52.086 (**52.086**) |     23.467 / 12.885 / 27.035 (**23.467**) |
| tinos-bold         |     48.047 / 55.822 / 60.818 (**55.822**) |     30.246 / 16.791 / 32.682 (**30.246**) |
| space-grotesk      |  104.535 / 44.075 / 141.443 (**104.535**) |     30.772 / 39.509 / 43.937 (**39.509**) |
| roboto-mono        |     67.129 / 26.092 / 86.574 (**67.129**) |     31.150 / 25.919 / 41.015 (**31.150**) |
| manrope-sans       |     66.366 / 62.622 / 88.718 (**66.366**) |     20.243 / 26.577 / 22.435 (**22.435**) |
| dm-sans            |     66.151 / 38.700 / 99.120 (**66.151**) |     22.486 / 17.941 / 23.211 (**22.486**) |
| lora-serif         |  118.961 / 45.955 / 101.210 (**101.210**) |     27.521 / 36.312 / 49.666 (**36.312**) |
| playfair-display   |    123.072 / 34.104 / 94.302 (**94.302**) |     27.794 / 49.405 / 48.652 (**48.652**) |
| caveat-handwriting |  125.100 / 59.414 / 104.159 (**104.159**) |     50.399 / 51.429 / 67.929 (**51.429**) |
| inter-greek        |     14.678 / 26.869 / 31.572 (**26.869**) |     15.488 / 16.224 / 21.467 (**16.224**) |
| inter-cyrillic     |     17.447 / 16.584 / 13.252 (**16.584**) |        5.957 / 14.728 / 4.562 (**5.957**) |
| arimo-hebrew       |        3.743 / 18.987 / 3.377 (**3.743**) |         3.813 / 2.875 / 4.028 (**3.813**) |

AFTERHOURS × 150’s repeated preparation median changes 455.317 → 321.967 ms (about 29% lower) in this CPU loop. That does not describe first-use variable paths, every short-string shape, or application canonical latency. For example, first AFTERHOURS variable extraction is slower, and several warm shaping cases regress. The complete six raw records retain parse, setup, first/warm shape, first/warm paths, first layout and repeated preparation rather than selecting only improved phases.

## Correctness and bounded ownership

For all sixteen fixed corpus cases, candidate glyph IDs, UTF16 clusters, advances and XY offsets match the captured HarfBuzz oracle exactly. The tokenized wrapped layout also matches every placed glyph ID, X position and baseline exactly, including Lora and all ten families. Exact font hashes, shape hashes and wrapped-layout hashes are checked by the shaping mirror; font-size/height/wrap fields are part of those fixtures. This is a scoped compatibility result, not a claim that every OpenType/script combination equals HarfBuzz.

Nine additional Inter probes use AV, office and accented French at weights 450.5, 675.25 and 799.9. IDs/clusters match all nine; eight position arrays match exactly. At 675.25 the office i advance differs by one font unit (HarfBuzz 551, candidate 550). No fallback or hidden coordinate quantization is applied to erase that difference. Original probe records remain in `fractional-comparison.json`.

Variable font positioning resolves GDEF 1.3 VariationIndex values for all four pair-record fields and format 3 anchor X/Y, using normalized axes and the original base values. Both pair formats, negative deltas, region/store bounds, return-to-weight and two concurrent shapers sharing one Font have focused tests. Values are fully computed before any GPOS metadata mutation, so a bad variation row cannot leave a half-updated font. An imported variable TrueType witness without HVAR exercises actual simple/composite `gvar` phantom advances. The upstream `getGlyphDelta` rounds its final X/Y sums with `Math.round`; the no-HVAR adapter uses the resulting right-minus-left phantom delta. The simple/composite witness covers weights 100 / 400 / 800 / 100, not universal fractional-coordinate rounding equivalence. A real independently built CFF OTF witness exercises cubic outlines without bitmap APIs.

The text-shaper patch retains parsed variable anchors, complete PairPos values and correct pair consumption, compacts consumed GSUB ligature slots before later lookup digests, and bounds the native variation-contour coordinate cache to eight promoted LRU entries (256 glyphs each). The adapter keeps at most 512 glyph wrappers and replaces oversized reusable buffers after processing valid input beyond 8192 glyphs. FontRepository leases, five idle faces, abort/stale guards and explicit disposal remain in place. Source byte ownership is explicit; mutating resolver bytes after acquisition cannot corrupt its lazy reader.

Path bounds are intentionally not universally identical to old OpenType.js. An independent FreeType 2.14.3 `FT_Load_Glyph` with NO_SCALE/NO_HINTING/NO_BITMAP and `FT_Outline_Get_BBox` verified thirteen variable composite/punctuation witnesses: candidate bounds match the integer oracle exactly, while old OpenType bounds differ 5–155 font units. The original output and C probe are retained. Other exact Bézier bounds can differ by fractions of a font unit (for example Manrope t versus FreeType’s integer box, and 0.0337 units in Caveat). These are vector bounds, not glyph raster comparisons. See [FreeType glyph retrieval](https://freetype.org/freetype2/docs/reference/ft2-glyph_retrieval.html#ft_load_glyph), [multiple masters](https://freetype.org/freetype2/docs/reference/ft2-multiple_masters.html#ft_set_var_design_coordinates) and [outline processing](https://freetype.org/freetype2/docs/reference/ft2-outline_processing.html#ft_outline_get_bbox).

A separate instrumented fresh-process probe importing/parsing/shaping/producing variable paths and quadratic curves observed zero WebAssembly Module, Instance, compile, compileStreaming, instantiate and instantiateStreaming calls. This is an execution observation, not a zero-WASM-payload claim: the package barrel includes optional raster machinery, which production does not call. Actual fetched/built payload belongs to the browser report. Slug coverage, vertex dilation, paint, composition and GPU readback policy remain unchanged.

## Retained diagnostic failures

Preliminary measurements are not mixed into the final three observations. `candidate-pre-collector-cpu-1.json` exposed an allocation-heavy compatibility metadata visitor. An attribution-only capture showed Inter collection 148.94 ms and apply 15.88 ms; replacing per-record entries/values arrays with one object-child scan and unique VariationIndex deltas produced 26.29 / 3.96 ms in a subsequent diagnostic capture. These single captures explain the fix; they are not another statistical benchmark. Transactional compute-before-mutation remained intact and the 29 relevant units passed.

`candidate-pre-script-cpu-{1,2,3}.json` are the complete earlier three observations whose full-paragraph signatures matched but tokenized Lora layout shifted 6.36 px. Diagnosis found text-shaper 0.1.28 labels the entire ASCII block Common and Latin-1 punctuation Latin. The adapter now explicitly recognizes ASCII letters and skips Unicode Common/Inherited punctuation before selecting a strong script. Standalone AVATAR/office kerning and quoted Hebrew tests verify the actual failure. All final three observations above were rerun on that corrected source; the more favorable preliminary values are not substituted into the final result. A first ASCII-only diagnostic is retained separately too.

Other preserved probes show the original upstream variable-kerning/phantom-metric mismatches and the Caveat consumed-ligature bug that motivated the declared compatibility patch. Initial unit setup failures (cross-realm ArrayBuffer ownership and a reference-fixture generation error) are not counted as successful compatibility checks. The final native GPU/export/FontPicker checks and application-level result are recorded by the browser companion and final delivery report.
