# Selection handle contrast

The normal canvas and timeline-hover frames share the same handle material. The
fallback uses a white fill/border and a black outer hairline, independent of the
application theme. Interactive buttons keep their accessible names, keyboard
focus, hit targets and geometry; hover markers remain noninteractive.

| Situation                              | Material and bound                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| One selected layer, paused             | Up to five 8 × 8 CSS-pixel backdrop filters.                                                                         |
| Hover of a different, unselected layer | Up to four additional filtered markers.                                                                              |
| Hover of an already selected layer     | The existing selection frame supplies the feedback; the redundant hover frame is hidden.                             |
| Multiple selected layers               | Two-tone fallback, with no per-handle backdrop filters.                                                              |
| Playback                               | Two-tone fallback under the existing 20% frame opacity; no claim of adaptive sampling through that opacity boundary. |
| Forced colors or unsupported filtering | System colors or the two-tone fallback.                                                                              |

The optional backdrop chain averages the tiny handle region, converts its painted
backdrop to grayscale, increases contrast towards black/white and inverts it. This operates on
the browser's composited backdrop, including the real Three.js canvas; it does
not inspect source-image pixels, select a JavaScript color or create a second
renderer. The maximum is nine small filtered markers, rather than 320 filters
for 64 selected layers. There are no production pixel-read APIs or sampling loops.
Mixed edges and the exact contrast midpoint can retain intermediate values;
the two-tone perimeter remains available instead of promising an exact dominant
color classification for every possible backdrop.

[MDN's backdrop-filter reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)
explains why the material must be transparent and why an ancestor with opacity
below one restricts the available backdrop. The current
[CSSWG Filter Effects Level 2 draft](https://drafts.csswg.org/filter-effects-2/#BackdropRoot)
also distinguishes backdrop roots from transformed stacking contexts; that draft
does not yet have Working Group consensus. This behavior therefore needs native
browser verification rather than an assumption based only on parsed CSS.

[`mix-blend-mode: difference`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/blend-mode)
was considered but does not itself produce black/white output and can retain low
contrast over middle gray. The white/black hairline fallback remains useful at
sharp boundaries where a small filtered sample contains mixed content.

The native witness must retain actual canvas screenshots on white, black and
gray backgrounds, both themes, plus real hover feedback. Screenshot pixels may
be decoded in an isolated validation page after capture; those test-only reads
must remain outside the production page's readback probe. Large-selection and
playback checks verify the filter bound and accessible disabled state. Browser,
actual rendering backend, adapter, viewport and DPR belong with the artifacts;
a functional pass does not establish a universal frame-time guarantee.
