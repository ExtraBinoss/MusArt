# Receipt

Receipt prints the actual source image as thermal-style monochrome dots on procedural paper. It does not invent shop names, prices, totals, text or barcode data. Text already present in the source is printed with the rest of the image. There is no printer connection or claim of physically simulating heat diffusion.

## Primary references

- [Epson, ePOS-Print API User's Manual, page 13](https://files.support.epson.com/pdf/pos/bulk/tm-i_epos-print_um_en_revk.pdf#page=13) shows actual receipt/ticket layouts with raster images, paper-feed margins and cut positions. The printed examples inform the contrast and blank-paper margins; their text and graphic contents are not copied into MusArt.
- [Epson, Print in Page Mode](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/pagemode.html) documents dot coordinates and print-area placement, including independent paper-feed and cutting operations.
- [Epson, GS ( L graphics reference](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_lparen_cl.html) describes monochrome digital graphics and print-energy modes. MusArt's density, missing dots, head streaks and feed bands are bounded image treatments inspired by thermal line printing, not hardware diagnostics.

## Rendering contract

Print pitch and dot spread are authored document pixels. Nine fixed neighboring square stamps sample the source image at their print-cell centers, allowing dots to genuinely spread across neighboring cells. Ordered mode uses the application's existing four-by-four Bayer thresholds; stochastic mode uses a deterministic integer hash, and threshold mode uses a fixed middle threshold. There is no sequential error diffusion or temporal history. Gamma, contrast, exposure and inversion act before thresholding. Missing dots never add marks, and print density, head streaks and feed bands reduce existing marks.

Margins fit the entire source into the remaining print area. The default fit preserves its aspect ratio and centers it inside those minimum margins; the optional fill mode stretches it across the full print area. Neither mode crops the source. The paper has adjustable colors, authored-coordinate grain/fibers and a signed fold-lighting profile. Straight, irregular torn and repeated scalloped/perforated top/bottom cuts have independently bounded spacing, depth and softness. Optional edge shading can reveal the contour even while alpha is preserved.

Original source alpha is retained by default, including holes and transparent corners. **Transparent paper edges** explicitly intersects the source silhouette with the paper-cut footprint. It can remove coverage but cannot fill source transparency. The paper envelope and overall amount use the shared premultiplied interpolation helper, preserving color through partial coverage. Amount zero restores the original RGBA. All continuous settings update stable uniforms; no source bitmap resize, generated texture, GPU pixel readback, font atlas or effect-specific resource cache is used. The common compositor filters the completed authored-reference effect stack for canvas zoom, thumbnails and enlarged exports.

## Native verification

`test/browser/receipt.spec.ts` passed on Chromium's WebGPU and Three WebGL backends in 12.1 seconds total (5.8 and 5.5 seconds per case). The frozen production build includes all eleven new effects. Tests use the common 1600×1000 viewport at DPR 1 and the bounded single-worker protocol. These are complete verification-case runtimes, not individual shader timings.

A real 320×480 photograph with source text, rounded corners and a transparent interior hole retains exact original alpha. Changing the seed, switching to stochastic dots and switching to a hard threshold produced mean premultiplied RGB differences of 83.82, 50.52 and 39.66. Repeating the original seed and reducing the 2× export both produced exactly zero difference. Separate margin, wear, feed-band, texture and fold witnesses all changed the output; extreme settings remained finite while retaining source alpha. Photo and calibration metrics were identical across both backends.

The independent print-grid oracle checks every pixel of a 240×240 uniform gray source at a six-pixel pitch against the four-by-four ordered threshold formula. All 57,600 pixels matched exactly, with 28,800 black and 28,800 white pixels. Contracting dots reduced black coverage to 12,800 pixels; spreading them increased it to 54,400. Bright exposure and complete missing-dot wear produced all-white paper; dark exposure produced an all-black print. With asymmetric margins, contain produced the exact 120×120 bounds `[60,60,179,179]`, while stretch produced 120×240 bounds `[60,0,179,239]`.

Explicit torn cuts removed 7,498 source-covered pixels without adding coverage. The solid-red witness checked 3,844 fully transparent cut pixels at half amount: zero RGB error and the expected 0.5-byte alpha rounding. All 1,986 partially covered edge pixels also retained red. The real margin field committed one revision and native undo restored it. Instrumented GPU, WebGL and canvas pixel-read APIs recorded zero production calls. PNGs, metrics, the common build/typecheck logs and native results are retained in ignored `artifacts/receipt/`.
