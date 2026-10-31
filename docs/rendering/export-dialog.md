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

New canvases can target sRGB or CMYK. The portable `colorSpace: "cmyk"` is an
output target: GPU editing remains RGB, including on screen. It does not claim
four-channel brush editing or an ICC press proof in the main canvas. The export
preview uses the real ICC transform. The former `cmyk-proof` value remains
readable as a legacy generic simulation; it is not the new CMYK output target.
Display-P3 documents retain the existing explicit conversion to sRGB output.

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

Primary references: [ICC CRPC6 profile and license](https://registry.color.org/profile-registry/CGATS21_CRPC6),
[native ICC conversion API](https://github.com/dlemstra/magick-wasm),
[canvas serialization color contract](https://html.spec.whatwg.org/multipage/canvas.html).
