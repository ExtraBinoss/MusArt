# Flash Light

This is an image-space photographic spotlight. It changes illumination in the original photograph; it does not invent three-dimensional geometry or surface normals.

The reference for the smooth fully lit core, transition and unlit exterior is the spotlight model and rendered comparison in [PBRT, Point Lights / Spotlights](https://www.pbr-book.org/4ed/Light_Sources/Point_Lights). The implementation is original Three.js TSL. Elliptical shape and rotation provide practical photographic beam controls. The outer radius is a fraction of the authored layer's shorter side; the center is normalized with document Y pointing down.

Ambient illumination, intensity, flash exposure, highlight compression, tint and haze are independent controls. A deterministic small film-grain field is optional. The original alpha is retained. Seed, geometry and illumination never depend on the viewport zoom or an implicit clock.

Visual acceptance requires a real photograph with a recognizable lit subject, visibly darker surroundings, a smooth adjustable falloff and a movable light center. A flat calibration scene separately proves the radial gain and outside ambient level. Native WebGPU and WebGL PNGs, amount-zero identity, fractional alpha, extreme settings, zoom/export consistency and handle transactions must be verified before completion.

## Native evidence

On October 28, 2026 both native cases passed on Chromium 156 / Linux, Intel Xe-LPG WebGPU and Three's WebGL fallback, viewport 1600×1000, DPR 1. The graded-alpha waterfall photograph retained every original alpha byte. Its opaque-region mean change was 28.950 RGB byte levels. Native editor and export pixels matched exactly at 62.5%, 100% and 200%; the 1× plane exactly reproduced every 2×2 block at 2×. Alternate centers, a hard edge, rotated ellipses, tint/exposure, inversion, falloff, film grain, saturation and highlight compression all changed the image while preserving alpha. A fully unlit configuration remained exactly black inside the original coverage.

The independent white-source calibration produced center RGBA (255,255,255,255), transition (119,119,119,255), and exterior (0,0,0,255), matching the CPU smoothstep calculation within one byte. Both backends reported zero production JavaScript GPU/canvas readbacks and no page errors. Full reports and PNGs are in ignored artifacts/flashlight/.

Visual review compared the actual PBRT spotlight render (saved under artifacts/flashlight/references/) with the processed photo: a softly bounded illuminated center, recognizable waterfall/bridge detail and dark surroundings are present. This is an image-space photographic interpretation of that beam appearance, without invented 3D shadows. The blue/exposure variant intentionally demonstrates an overexposed cold beam; it is not the default look.
