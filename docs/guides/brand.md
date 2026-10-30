# Melt brand and SVG animation API

The interface identity lives in `apps/web/src/ui/brand/`. `config.ts` supplies
`brand.name`, the pastel primary `#B39ADB` and action fill `#8763C8`, the palette, mascot and asset paths.
The generated palette.css takes its values from config.ts; regenerate with the asset script.
Global CSS variables apply the same palette to both themes and Radix portals.
Primary actions and dark-theme switch thumbs use white. The slightly deeper
action fill keeps white labels legible while accent lines and the mascot stay pastel. Translated product copy uses `brand.name`, not separate hardcoded names.

Existing local projects, `.musart` imports/exports, clipboard payloads, database
keys, automation methods, package names and GitHub URLs keep their established
identifiers. Changing the visible brand does not migrate or rename documents.

## Logo and real pending states

```tsx
import { brand, MeltLogo, BrandStatus } from "@/ui/brand";

<MeltLogo size={32} />                    // Decorative idle Dahlia; no RAF.
<MeltLogo size={64} decorative={false} /> // Accessible name: Melt.
<span>{brand.name}</span>
{exportPending && <BrandStatus state="preparing" size={28} />}
```

`BrandStatus` is decorative. The owning operation keeps its existing status text,
errors and cancellation action. Mount it only during real work. Never time it to
pretend an operation completed. `loading` morphs into the source engine's thinking
state; `preparing` uses its orbit state. Idle uses the genuine `fleur8` Dahlia with
its `surpris` expression. All paths come from Maskot's original engine.

An imperative operation can drive the same leaf without React frame updates:

```ts
import { createBrandActivity } from "@/ui/brand";
const activity = createBrandActivity(false);
activity.set(true); // The real request starts.
try {
  await prepareActualPreview();
} finally {
  activity.set(false);
}
// <BrandStatus state="preparing" activity={activity} />
activity.dispose();
```

An external source can instead supply `{ read(): boolean, subscribe(listener) }`.
Canvas startup subscribes to actual canonical presentation. Motion card previews
publish their real runtime status. No App, Inspector or canvas React component
subscribes to the mascot frame clock.

## Reusing SVG morphing

```tsx
import { MorphPath } from "@/ui/brand";
<svg viewBox="0 0 40 40">
  <MorphPath
    d={open ? "M4 16L20 28L36 16" : "M4 24L20 12L36 24"}
    stroke="#B39ADB"
    fill="none"
    strokeWidth={3}
  />
</svg>;
```

This is Maskot's copied numeric SVG interpolation, not a CSS string approximation.
Matching `d`/`transform` command topology, numeric opacity/stroke width and six-digit
hex colors interpolate directly. Incompatible topology or unsupported values snap
honestly to the new target. Retargeting starts at the displayed value. Hidden tabs
pause transitions; reduced motion completes them; unmount retires callbacks and
releases Motion controls and listeners.

For other mascot states, the complete clock-free source engine is available:

```ts
import { BotEngine, createDahliaEngine } from "@/ui/brand";
const engine: BotEngine = createDahliaEngine();
engine.setState("wink", 1);
const frame = engine.sample(1.25); // Deterministic SVG geometry, no browser clock.
```

The original timestamped `setShape`, `setExpression`, `setEyes`, `setEyeGeometry`,
`setState`, `blink` and `sample` methods remain available. The copied engine owns
geometry; UI adapters own clocks and DOM presentation. It has no core, React,
storage or GPU dependency. Original tests, licensing and checksums are described
in [provenance](../legal/provenance.md).

## Playback and disposal

The branded playback adapter owns at most one RAF and updates retained SVG
attributes at most 30 times per second. Geometry sampling and path morphing run
on the CPU; the browser owns SVG painting and compositing. Idle requests no
frames. Document visibility, reduced motion,
intersection visibility and actual operation activity stop unnecessary work.
Resuming does not advance a hidden clock or queue missed frames. Completed
operations stop immediately, and every instance releases observers, callbacks,
SVG nodes and pending frames on unmount, including StrictMode replay.

## Verification scope

The copied engine keeps its full upstream geometry witnesses. Run the exhaustive
catalogue and fit-table checks explicitly when changing geometry or catalogue
data, rather than for an unrelated UI adjustment:

```sh
bun x vitest run apps/web/test/ui/brand/engine/skins-catalogue.test.ts apps/web/test/ui/brand/engine/eyefit.test.ts --maxWorkers=1
```

On the bounded Linux workstation (Node 24.19.0, one worker, CPU quota 200%, heap 1536 MiB), the
complete 60-frame shape/expression/eye-contour matrix took 39.678 seconds, the
oscillation witness 3.433 seconds and the full table reconstruction/equality
check 0.596 seconds. These are test costs, not interactive frame-rate claims.
The application imports the precomputed table and never calls its full rebuild.

`test/browser/brand.spec.ts` checks the mobile SVG identity in both themes,
decodes all three install-icon sizes, and holds a genuine template download while
observing the animated SVG. Its pending/reduced-motion witness preserves all
five editor React counters, performs zero GPU/WebGL/Canvas readbacks and cancels
without changing the current document.

Theme changes crossfade the complete interface through native View Transitions when available. Initial application, unchanged resolved colors and reduced motion apply immediately. System-color changes use the same path; rapid selections supersede pending transitions without a React frame loop.
