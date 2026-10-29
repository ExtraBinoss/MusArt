# Seed and explicit-time precision

The nine new effects that use a random seed now receive a separate unsigned integer uniform. The portable seed range is unchanged: 0 through 2,147,483,647. The previous floating-point seed port and compact Bayer seed vector remain available for the existing operators; this change does not silently redefine their historical fields.

Noise divides the integer into 10, 10 and 11 bits before converting those small exact fragments to its three-dimensional phase. The highest allowed bit is therefore retained. Hash-based effects pass the integer directly to the shared hash. Receipt's fixed offsets and Pink Phosphor's grain-frame offset are added as unsigned integers, avoiding conversion back to float before hashing. No effect-specific uniform names or GPU-buffer inspection are required.

Pink Phosphor reduces flicker cycles before multiplying by 2π. CRT similarly reduces flicker cycles, subtracts the already-reduced rolling phase from the screen coordinate, and bounds its grain/line frame to 65,536 states before forming integer coordinates. Ripple independently reduces spatial and temporal wave cycles before combining them. These changes retain small image coordinates and phase details at long explicit times. They do not add history, wall clocks or simulation state.

## Frozen native evidence

The reproducible matrix is `test/browser/seed-precision.spec.ts`, using a real 128×128 photograph with fractional alpha. On both WebGPU and Three WebGL it tests seed 0, 2³⁰ and 2³⁰+1, repeats the adjacent seed, and compares original alpha. The two cases passed in 12.1 seconds on the frozen v3 build. Every repeated image was byte-identical and every source-alpha byte remained unchanged. Both backends produced identical comparison metrics:

| Effect         | Mean straight-RGB byte difference, 0 → 2³⁰ | Difference, 2³⁰ → 2³⁰+1 |
| -------------- | -----------------------------------------: | ----------------------: |
| Noise          |                                   72.24530 |                19.27911 |
| Shatter        |                                   22.67554 |                11.47215 |
| Flash Light    |                                   22.09275 |                11.17377 |
| Cyanotype      |                                   53.38310 |                28.01654 |
| Datamosh       |                                   28.79679 |                18.60604 |
| CRT            |                                   27.06130 |                15.01231 |
| Receipt        |                                   53.88617 |                64.04555 |
| One-bit Dither |                                  162.70569 |               163.26599 |
| Pink Phosphor  |                                   42.82265 |                21.51933 |

Seed-sensitive paper/grain settings are deliberately enabled where needed; the matrix establishes integer transport rather than a default-look speed measurement. Its CPU-only shader-descriptor observer found real `u32` fields in WebGPU uniform structs and `uint` fields in WebGL uniform blocks. This inspects source strings sent to the driver, not GPU data. All production WebGPU, WebGL and canvas pixel-read counters remained zero.

At seed 2³⁰ with flicker disabled, Pink's grain changes at 1/30 and 2/30 seconds. Those images exactly equal the corresponding seed+1 and seed+2 images at time zero, proving unsigned frame addition as well as visible phase change. Pink flicker at time 86,400/speed 8 exactly equals time zero. CRT with noise/jitter disabled and flicker rate 60 plus rolling speed 2 also matches time zero exactly at 86,400 seconds. Ripple's independent extreme-time annulus test remains non-neutral and matches its equivalent phase exactly.

The existing Ripple, Noise and Pink individual native suites also passed all six backend cases in 29.4 seconds, retaining their original source-alpha, primitive-oracle and matched-density editor/export checks. Typecheck, 19 mirrored files/32 tests, typed lint and the production build passed. These are full correctness-case runtimes, not individual shader latency measurements.

## Provenance and prior evidence

The actual served v3 executable is `artifacts/effects-final-cohort-v3-dist/`, including source maps. HTTP index SHA-256 was checked against that directory before the v3 browser runs. Its manifest is `artifacts/seed-precision/v3-provenance.json`; raw images and metrics are under `artifacts/seed-precision/{webgpu,webgl}/`, with `native-v3.log` and `native-individual-v3.log` alongside them.

The original served v2 executable, `artifacts/effects-final-cohort-v2-dist/`, remains intact. Earlier affected Noise/Pink/Ripple captures are preserved under `artifacts/seed-precision/v2-artifacts/`. The v2 precision probe genuinely reproduced Noise's ignored bit 30 and adjacent-seed alias; its reports are labeled v2. An initial attempted v3 run still reached the v2 preview process, so it is explicitly classified as a v2 port-confirmation run, not a v3 shader failure. The task preview was then replaced with the verified v3 directory.

Existing latency measurements remain attributed to v2. A separate fresh-process v3 cohort is required before attaching any speed claim to these precision fixes. No reference image, source-alpha rule, pixel comparison or acceptance threshold was weakened.
