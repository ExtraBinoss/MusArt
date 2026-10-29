# GPU Noise

Noise is a single effect with seven selectable three-dimensional fields: gradient
Perlin, smoothly interpolated value noise, nearest-cell noise, Worley F1 distance,
fractal Brownian motion, ridged fractal noise and turbulence. The
fractal fields use weighted Perlin octaves; ridged noise squares the inverted
absolute field, while turbulence accumulates absolute noise. All weighted sums
are normalized so changing octave count does not add an unrelated brightness bias.

Perlin, cell and Worley use Three r186's existing MaterialX TSL operators. Value
noise interpolates eight MaterialX cell values with the quintic fade polynomial.
No GLSL/WGSL strings, second rendering framework, CPU image generation or GPU pixel
readback is introduced. The primary references are
[Three r186 MaterialX nodes](https://github.com/mrdoob/three.js/blob/r186/src/nodes/materialx/MaterialXNodes.js),
[Three's MaterialX noise implementation](https://github.com/mrdoob/three.js/blob/r186/src/nodes/materialx/MaterialXNoise.js)
and the [MaterialX noise library](https://github.com/AcademySoftwareFoundation/MaterialX/blob/main/libraries/stdlib/genglsl/lib/mx_noise.glsl).

Only the uniform-selected algorithm executes. Fractal work is bounded to six
octaves and frequency growth to three; negligible zero-amplitude octaves skip the
noise calculation. Monochrome output evaluates one field, while colored output
evaluates three decorrelated positions. The two palette colors, contrast,
brightness, gamma and inversion finish that field before replace/add/multiply
application and the common amount control. Original per-pixel alpha is retained.

Shared coordinates are materialized in their owning TSL function before selecting
an algorithm or color channel. Each octave similarly materializes its common
Perlin sample before choosing fBm, ridged or turbulence output. This prevents a
temporary first generated in one conditional branch from being reused without an
assignment in another branch. Native field diversity and direct upstream pixel
references guard this behavior on both backends.

Cell size and X/Y offsets are authored layer pixels. Z selects a slice of the 3D
field and explicit document time advances it at the configured speed. A stable
seed supplies a fixed phase offset. Raster dimensions, device density, wall clocks
and frame counters never enter the field. The compositor's shared reference plane
and final reduction therefore govern editor, thumbnails and exports consistently.

Mirrored unit tests validate metadata, bounds, command/undo behavior, source alpha
and stable parameter/graph identity. These graph checks do not establish GPU pixel
correctness; the frozen native effect matrix must separately compile and render
the algorithms on WebGPU and Three's WebGL fallback before reporting verification.

## Native verification

The 2026-10-28 frozen-build run of `test/browser/noise-effect.spec.ts` passes both
backends in 10.4 seconds on Linux, Headless Chrome 156.0.8078.4, a 1600×1000
viewport and DPR 1.25. WebGPU reports Intel Xe-LPG; the WebGL fallback is verified
from its real backend and does not claim a queried WebGPU adapter. One worker runs
inside a 200% CPU scope, 2300 MiB memory high watermark, 3200 MiB hard limit and no
swap allowance. This is functional rendering evidence, not GPU timing.

A real waterfall photograph carries rounded transparent corners and a fractional
alpha gradient. All seven fields are distinct and deterministic, preserving all
102 decoded alpha levels with a maximum alpha difference of zero. The direct
upstream Perlin, cell, Worley and fBm references differ by at most one RGB byte on
opaque pixels, with the highest mean difference below 0.001914 bytes. Visual
contact sheets confirm the smooth, cellular and fractal patterns; no independent
primary pixel oracle is claimed for value, ridged or turbulence. Seed, time,
stationary speed, amount zero and colored-field assertions also pass.

Actual native editor canvas snapshots and same-backing-density exports match in
every RGBA byte at scales 0.625×, 1× and 2×. Their requested physical densities are
0.625×, 1× and 1.5× respectively: the last uses the renderer's existing 2× quality
tier. Validation decodes run in an isolated inspection page; production WebGPU,
WebGL and Canvas2D readback counters remain zero. Reproducible commands, raw metrics
and PNG contact sheets are retained under ignored `artifacts/noise/`.

The v3 [seed/time precision regression](effects/seed-time-precision.md) additionally verifies the unsigned seed port, including bit 30 and adjacent values above one billion. The prior ten-bit Z fragment omitted bit 30; the current 10+10+11 split retains it without changing the portable bounds. Both native backends distinguish the selected high seeds while preserving source alpha and exact repeats. This functional evidence is separate from earlier performance cohorts.
