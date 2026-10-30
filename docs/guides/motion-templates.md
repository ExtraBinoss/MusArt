# Editable Motion templates

The gallery filters Static and Motion designs. Every card creates an independent
project through the same atomic installation service used for original-backed
media imports. Editing a template never changes its bundled source document.

| Template          | Mode         | Demonstrated capabilities                                                                                                        |
| ----------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| In Bloom          | Motion, 5 s  | Original flower video, photo collage, nested groups, text, animated effects, springs and three original sound effects            |
| Sound Playground  | Motion, 6 s  | Nine audio cues sharing three original WAVs, grouped instruments, animated shapes, GPU transitions and editable audio processing |
| Motion Stress Lab | Motion       | Fifty photo layers, one hundred effects, three video clips, masks, easing families and timed sound effects                       |
| Orbit Study       | Motion, 5 s  | Authored effect time, live gradient, orbital geometry and independently eased transforms                                         |
| Paper Motion      | Motion, 5 s  | Nested paper layers, group and child animation, spring easing and GPU entrance transitions                                       |
| Transition Atlas  | Motion, 60 s | Thirty independent occurrences of one canonical group, per-occurrence progress/style keys and all thirty GPU operators           |
| Colorfield        | Static       | Editable vector shapes, typography and a multistop fill gradient                                                                 |

## Headless authoring

`TemplateAuthor` uses only public core commands. These builders do not require
React, a browser, storage or a renderer. The generated project and command journal
are retained together so both the portable document and its authoring history
can be inspected.

```sh
bun scripts/templates/designed.ts
bun scripts/templates/generate.ts
```

The second command also writes the original WAV sidecars used by In Bloom,
Stress Lab and Sound Playground. The seeded TypeScript sound recipes are original MusArt material;
their provenance is recorded in `public/templates/motion/media/SFX-LICENSE.md`.
Existing photographs and video retain their own adjacent provenance records.

The designed-template loader bounds the actual streamed download at 1 MiB,
validates identity, dimensions, mode and the portable schema, and rejects embedded
assets in these geometry-only designs. Original-backed Motion templates verify
each media path, SHA-256 fingerprint and byte length before atomic installation.
Abort and stale project-origin guards remain active throughout installation.

## Real covers

Covers are rendered from evaluated compositions through the actual Three.js
render graph, then encoded with the browser's native WebP encoder. They are not
substitute SVG artwork. For example, with the isolated editor running on port 6110:

```sh
bun scripts/templates/render.ts --url http://127.0.0.1:6110 \
  --input apps/web/public/templates/designed \
  --output artifacts/motion-template-covers \
  --template orbit-study --edge 720 --time 2.4
```

Inspect the generated image before copying it into the public template directory.
The original 30 October 2026 cover cohort rendered six designs on WebGPU with instrumented
production read counts of zero. Cache use was 3.79–25.42 MB under a 128 MiB budget.
One bounded browser ran at a time; its 50% CPU quota and Vite's 50% quota shared one
logical core. These cold cover captures include shader/source preparation and
encoding; they establish visible output, not a steady-state frame budget.

Sound Playground has a separate inspected 720px cover rendered through the real
WebGPU graph, also with zero instrumented production readbacks. Its audio cues
make it the current interaction-profiling workload. Opening a template or seeing
a correct cover does not establish smooth playback or a 16 ms interaction budget;
the measured findings and remaining gates are recorded in
[the implementation progress](../research/figma_motion/progress-2026-10-30.md).
