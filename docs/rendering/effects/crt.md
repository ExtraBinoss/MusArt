# CRT

CRT is an image-based display treatment with authored-pixel phosphors, beam scanlines, source misconvergence, barrel distortion and bounded glow sampling. It uses the actual source texture. It does not create a physical tube, simulate an NTSC encoder or claim temporal phosphor persistence: no previous frame is retained.

## Primary references

- [Sony, Road to the Trinitron](https://www.sony.com/en/SonyInfo/CorporateInfo/History/SonyHistory/2-02.html) describes the manufacturer's vertical RGB phosphor stripes and aperture grille, contrasting them with the dot pattern of a shadow-mask tube. These distinct arrangements motivate the aperture, staggered dot and elongated slot options.
- [Florence, Sony Trinitron Macro (photographed 2011)](https://www.lighting-gallery.net/gallery/displayimage.php?pos=-105743) is the photographer's close-up of a 1976 KV-1203. Its separate RGB strips and dark gaps provide a direct visual reference for aperture phosphors. The photo is inspected for reference only and is not bundled in the application.
- [Timothy Lottes, public-domain CRT styled scan-line shader](https://github.com/libretro/common-shaders/blob/master/crt/shaders/crt-lottes.cg) documents beam-shaped scanlines, RGB masks, barrel coordinates and local bloom for an RGB-input arcade display. MusArt independently implements these published ideas in Three TSL; it does not copy that shader's code, language compatibility layer or sample kernels.

## Controls and rendering

Phosphor pitch, scanline spacing, convergence, glow radius and jitter are authored document pixels. Patterns are evaluated at the common canonical reference density; canvas zoom, thumbnails and enlarged PNG output filter that completed result. They do not redefine phosphor spacing or resample the source before applying the effect. Every parameter is a stable uniform, with a constant eight texture samples and no runtime graph rebuild, external textures or pixel readbacks.

The mask options distinguish continuous vertical RGB stripes, staggered phosphor dots and rounded elongated slots. Mask strength and gap control their visibility. Scanline width adjusts a Gaussian beam profile independently from row spacing and phase. Curvature changes the source image mapping; screen zoom controls overscan. Misconvergence samples separate red and blue positions around the green signal. The five-tap glow filter averages premultiplied image values and ignores hidden transparent RGB.

Brightness, contrast, saturation, tint and vignette adjust the emitted signal. Noise and horizontal line jitter use an integer coordinate hash and the saved seed. Flicker and a rolling interference band use the explicit time in seconds; the generic live preview can advance it, while a saved time reproduces the same frame. A still image contains no temporal persistence history. The same source/settings/seed/time are deterministic on both renderer backends.

Rounded screen edges use an authored-pixel signed distance with controllable softness and bezel color. Original alpha is preserved by default, including transparent source corners and holes. **Transparent screen edges** explicitly multiplies the original alpha by the screen footprint; it can remove coverage but cannot create it. Amount zero restores the original RGBA in either mode. Source sampling near transparent content falls back to the original color to avoid a black fringe. GPU sources, graph passes and target caches remain owned by the existing renderer lifecycle.

Screen softness and overall effect amount blend coverage in premultiplied space. In transparent-edge mode, screen color is retained through the feather instead of blending toward an opaque bezel and darkening the edge. Native solid-red tests check all fully removed pixels at half effect amount and all partially covered screen-edge pixels at full amount.

## Native verification

Both `test/browser/crt.spec.ts` cases passed in Chromium: WebGPU in 5.7 seconds and Three WebGL in 5.6 seconds. The photograph retained exact alpha; changing the seed and time produced mean premultiplied RGB differences of 12.16 and 20.88, while repeating a saved frame and reducing the 2× export both produced exactly zero difference. Isolated convergence, curvature and glow-radius changes measured 14.81, 28.44 and 7.46 respectively. A constant gray patch's beam pattern spanned 113 byte values across rows.

A separate solid-white calibration measures actual connected phosphor geometry across the image. At an eight-pixel pitch, complete shadow dots measured 6×6 pixels and slots 6×20; the slot image included 54 fully black separator rows. Aperture stripes spanned all 320 rows with no horizontal interruptions. Edge-clipped components are counted separately because their truncated extent cannot establish roundness. These are independent geometry witnesses in addition to full-image photo comparisons.

Solid-red screen cutouts contained 67,232 fully removed pixels: at half effect amount they retained red with zero color error and the expected 0.5-byte alpha rounding. All 2,360 partially covered screen-edge pixels retained red at full amount. The real brightness field committed one revision and undo restored its prior value. Production GPU, WebGL and canvas pixel-read API counters all stayed zero. Decoded PNGs, calibration metrics and the native cohort log are preserved under ignored `artifacts/crt/`.

The v3 [seed/time precision regression](seed-time-precision.md) preserves the full unsigned seed and bounds animated grain coordinates to 65,536 frame states. Flicker and rolling cycles are reduced before angle multiplication and screen-coordinate subtraction. With noise/jitter disabled, the 24-hour frame at flicker rate 60 and rolling speed 2 is byte-identical to time zero on both backends. Adjacent large seeds remain distinct when noise/jitter are enabled. Earlier correctness captures and v2 performance measurements retain their original attribution.
