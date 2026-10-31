# Export dialog and print output

Image, Motion and Timelapse use the same responsive dialog: useful settings in
the scrolling left column, a preview/player in the right column and a fixed
footer. Extra encoder controls are collapsed under **Advanced**. PDF controls
are collapsed under **Print**. The ordinary export path is two clicks: open,
then export. Switching output type uses one direct segmented choice, so that
path also takes three clicks. The Timelapse dropdown path is three. Opening export pauses editor
playback; closing does not resume it.

The captured artboard ID is independent of the active editing page. A selected
layer/group defaults to selection output; **Whole artboard** restores the full
canvas. Choosing a different artboard clears the previous page's selection.
Motion and replay retain the selection's final authored crop across frames,
rather than moving the output crop with the animated content. Independent audio
tracks are excluded from selection video; selected video layers retain their
own source audio. Whole-artboard export retains the normal audio mix.

## Task ownership

One export belongs to the editor session, independently of the dialog. A shared
job publishes integer progress to the dialog and the export button. It never
publishes frame/progress state into App, Inspector or the canvas. The document
snapshot and originals are frozen at execution; subsequent ordinary edits can
continue. Same-ID reloads and project replacement cancel the task and reject
late delivery. Legacy synchronous consumers retain strict stale-scope checks.

Between video/replay frames, the background gate yields a real task and defers
GPU work during active pointer, wheel and drag gestures. It owns and disposes
its input listeners. Preview disposal is awaited before the full-resolution
export context is allocated. A closed dialog releases only its own preview;
it does not abort the session's encoding task.

Cancel remains pending until actual encoder/renderer cleanup finishes. Another
export cannot start during cleanup. Progress is monotonic, capped at 99% until
the encoding, finalization and delivery promise succeeds; no partial file is
downloaded. Failures retain their actual cause for the export status surface.
Runtime disposal drains/cancels the task before retiring fonts and storage.

Project switching and route navigation share one confirmation. **Stay in
project** retains the task. **Cancel export and leave** waits for cancellation
before replacing the project. Native reload/close uses the browser's own
`beforeunload` confirmation, whose wording is controlled by the browser.

## Color targets

New canvases can target sRGB or CMYK. The portable `colorSpace: "cmyk"` automatically
applies an ICC soft proof to the main canvas, thumbnails, Motion and Timelapse.
The GPU compositing buffers remain RGB, but the visible document previews the
same CGATS21 CRPC6 / Perceptual print conversion used by native CMYK export.
Transparent artwork is shown over white paper, as in print output. This is
color-managed display, not four-channel ink/separation editing. The former `cmyk-proof` value remains
readable as a legacy generic simulation; it is not the new CMYK output target.
Display-P3 documents retain the existing explicit conversion to sRGB output.

The display proof samples a precomputed 86³ RGBA8 lookup texture in the final
GPU pass. It requires 2,544,224 bytes per renderer, accounted in the existing
GPU LRU, with one shared immutable CPU copy. It loads only for CMYK display,
renders on demand and performs no runtime CPU pixel conversion or GPU readback.
Regenerate it with `bun scripts/color/print-proof.ts`; `--check` verifies the
table/profile checksums. The synthetic build-time grid uses the same native
ICC library and unmodified profiles as export. Both WebGPU and WebGL use TSL.

`RenderOptions.colorOutput: "source"` bypasses the display proof only before
native CMYK encoding. Display/source frame and preview caches are distinct;
the export preview performs its native proof once, while RGB image/video output
keeps the document's proofed appearance. No proof is baked into native CMYK input.

The LUT is an interpolated display approximation, not a promise of bit-identical
RGB values after an 8-bit CMYK round trip. Against 10,000 seeded random samples
through independent Pillow/LittleCMS, maximum channel error was 13/255, p99 4/255
and mean maximum-channel error 0.704/255. Sharp 8-bit ink quantization boundaries
cause the largest differences. Screen calibration, viewing light, press and
paper still determine the physical match. WYSIWYG here uses one explicit print
profile throughout the canvas/preview/output pipeline.

| Output             | Color contract                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| PNG / WebP         | sRGB; native file encoding and embedded RGB ICC profile.                                                                                     |
| JPEG / TIFF        | sRGB or true four-channel CMYK with embedded ICC profile.                                                                                    |
| PDF                | Raster artwork with an ICCBased image, output intent and vector print marks; sRGB or CMYK. This is not advertised as a certified PDF/X file. |
| Motion / Timelapse | RGB native video encoding; CMYK is a print-image option.                                                                                     |

CMYK uses the unmodified **CGATS21 CRPC6** standard profile from Idealliance /
X-Rite with a perceptual rendering intent. It is a standard print target, not a
promise of a match on every press or paper. The UI identifies the profile and
asks users to check it with their printer. Profile attribution, license and
download origin are in `packages/render/assets/profiles/NOTICE.md`.

The managed encoder is lazy-loaded in a disposable module worker. Native canvas
encoding produces a PNG file; ImageMagick/LittleCMS in WebAssembly decodes that
file, transforms its color and encodes the result. GPU pixels never cross into
JavaScript arrays. Neither canvas `getImageData`, WebGL `readPixels`, GPU buffer
mapping nor VideoFrame `copyTo` is used. The worker is terminated on cancellation
and on completion. Multi-artboard ZIP packaging also runs in an abortable
worker, with transferable encoded buffers and a 128-MiB archive bound. Conversion has a 32-megapixel / 128-MiB input limit and a
512-MiB native memory ceiling; excess work fails visibly.

## Print geometry

PDF defaults to 300 dpi, no added bleed and no marks. Print options include
0–25 mm bleed, crop marks, registration marks, CMYK color bars and the actual
artwork name/profile. Bleed extends the document render domain, retaining real
artwork beyond the trim; it does not stretch or mirror edge pixels. Transparent
areas are flattened against white paper for CMYK and PDF.

The PDF contains explicit MediaBox, BleedBox and TrimBox values. Crop marks sit
outside the bleed. Registration uses the PDF `/All` separation. Print marks and
labels stay vector paths/text; the composed artwork uses the existing GPU graph.
The preview and PDF share page/mark geometry. The preview embeds a native
CMYK-to-sRGB soft proof and uses screen approximations for the solid ink bars.

## Verification

`test/browser/export-dialog.spec.ts` exercises real Chrome input, downloaded
files, selected scopes, background cancellation, leaving confirmation and all
three dialog types. The print witness decodes the PDF with Poppler and verifies
PNG dimensions/color, embedded four-channel ICC output, page boxes and document
immutability. Pixel/video inspection is separate from production readback probes.
Focused service/UI tests cover cleanup gates, stale identity, actual errors,
monotonic progress, print geometry and fixed selection crops.

Executed on 2026-10-31 with Chrome 154.0.8037.97 on Linux: nine relevant
native scenarios passed, including WebGPU/WebGL, DPR 3 backing density, selected
mask alpha, inactive artboards, decoded videos and background cancellation.
The final print/mobile follow-up also passed against the production client under
`CPUQuota=100%`, `MemoryHigh=1600M`, `MemoryMax=2200M`, `MemorySwapMax=0` and
low CPU/I/O priority. Its TIFF CMYK sample matches the independent Pillow/LittleCMS
ICC reference exactly; JPEG differs by one 8-bit level in two ink channels.
Production readback probes remain zero. These are functional witnesses, not
input-latency benchmarks. Logs and captures are retained in `artifacts/export-dialog/`.

The subsequent CMYK-canvas witness (`test/browser/cmyk-canvas.spec.ts`) passed
on both WebGPU and WebGL in Chrome 154 on Linux, at 1600 × 1000 / DPR 1.
On its eight-patch color/alpha grid, the largest canvas-to-native-preview or
canvas-to-independently-decoded-TIFF channel difference was 1/255. RGB delivery
matched the displayed proof; switching to sRGB and undo restored the expected
unproofed/proofed colors. The 50-photo / 100-effect workload also passed with
bounded GPU accounting and unchanged GPU-pass/React-commit counts across idle
frames. All production readback counts were zero. These checks used one CPU
core, low CPU/I/O priority and no swap, with a 3,000 MiB memory ceiling. See
`artifacts/cmyk-canvas/` for captures and reports; the random-color precision
limits above remain applicable beyond the grid.

Primary references: [ICC CRPC6 profile and license](https://registry.color.org/profile-registry/CGATS21_CRPC6),
[LittleCMS ICC soft-proofing](https://www.littlecms.com/LittleCMS2.18%20tutorial.pdf),
[Affinity soft-proof/export guidance](https://www.affinity.studio/blog/screen-to-paper-how-to-hand-off-your-logo),
[native ICC conversion API](https://github.com/dlemstra/magick-wasm),
[canvas serialization color contract](https://html.spec.whatwg.org/multipage/canvas.html).
