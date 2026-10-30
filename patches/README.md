# text-shaper dependency patch

`text-shaper@0.1.28.patch` is applied by Bun through the root package's
`patchedDependencies`. Both the application and performance comparisons use the
same installed patch. It keeps exact variation coordinates and outline geometry,
bounds the native variation cache, and preserves positioning data required by
MusArt's variable-font compatibility adapter.

Upstream `src/font/tables/glyf.ts` stores a WeakMap from each live glyf table to
an unbounded Map of exact variation coordinates. Its 256-glyph limit applies
inside each coordinate set, so an animated fractional weight can otherwise
retain arbitrarily many sets while the font remains in use. The patch retains
eight coordinate sets per glyf table, promotes a set on access, and evicts the
least recently used set before inserting a ninth. Each set still retains at
most 256 glyphs. These are entry-count limits, not byte guarantees. Dropping the
owning Font releases the weakly keyed cache; application font leases and idle
limits remain necessary.

The patch also retains parsed `xDevice`/`yDevice` tables on format-3 anchors,
with matching optional Anchor declarations. Previously only offsets survived,
so the public parsed font table could not resolve its VariationIndex values.
PairPos optimized paths now accept only the first glyph's X advance and its
device record (`valueFormat1 & ~0x44 === 0`, `valueFormat2 === 0`). Other formats
use the existing generic lookup, which now applies all four positioning fields
to both glyphs, for format-1 and format-2 pairs. Script plans, skip rules and
lookup traversal remain upstream's implementation. The application adapter
resolves GDEF variation adjustments before shaping; the patch does not silently
substitute an OpenType or raster engine.

Generic pair traversal also consumes both glyphs when the matched subtable has
a nonempty second ValueRecord. A module-internal helper returns the actual
matched subtable's consumed count; the existing boolean `applyKerningDirect`
facade is preserved. GSUB removes consumed ligature glyphs before the next
lookup, so later contextual substitutions see the correct input sequence.
Both cases have real HarfBuzz witnesses (format-1/2 `AAA` and Caveat `office.`).
The consumed-pair behavior follows the
[OpenType GPOS traversal rule](https://learn.microsoft.com/en-us/typography/opentype/spec/gpos).

The npm package ships a bundled `dist/index.js` and declarations, without
executable TypeScript sources. The applied patch therefore changes that exact
bundle and matching Anchor/internal GPOS declarations. Its large diff lines are upstream's minified
formatting; only the cache, anchor parser, pair-positioning functions and
inter-lookup GSUB compaction change.
`text-shaper@0.1.28.source.patch` records the equivalent readable upstream
TypeScript changes for review. It is a source
reference, not a second applied patch.

- Upstream: <https://github.com/wiedymi/text-shaper>
- npm version: `0.1.28`
- npm source revision: `a23058f475f2b0655b93a89bfce426eecafb9439`
- Tarball: <https://registry.npmjs.org/text-shaper/-/text-shaper-0.1.28.tgz>
- Tarball integrity: `sha512-uwm6+tkgYJ4hsTV0wZVHkZeoXR1/mthLxDiJvfU9o/FiibNinpFRC8PAMTNx8SaOjaK/5ZjDG1XAkPbKlIe2Jg==`
- Original bundle SHA-256: `6c844a3133e6816b00be742ee0d9ae4b4298a3db63c1f5975ed0c7b4ae253943`
- Patched bundle SHA-256: `43746f6e9885b317347d700464786050c38577550eb1c092a3751bcde9547867`
- License: MIT, copyright 2025 wiedymi; notice retained in
  [text-shaper-MIT.txt](../docs/legal/text-shaper-MIT.txt).

`test/audits/text-shaper-cache.test.ts` calls the installed public Font/Face/path
APIs with real bundled Inter bytes. It temporarily observes native Map writes
only during synchronous outline calls, without production debug exports. It
checks access promotion, least-recent eviction, regeneration parity with fresh
font instances, 97 exact fractional weights, font isolation, and the unchanged
256-glyph bound. The prototype instrumentation is restored after each case.
It also walks actual parsed Inter/DM Sans/Merriweather anchors to verify that
nonzero format-3 offsets retain real Device/VariationIndex data. The positioning
adapter's mirrors separately cover all four adjustment fields and both pair
formats through the public shaper API, with HarfBuzz baseline fingerprints.
The audit also checks the frozen Caveat contextual-substitution glyph IDs.

When updating the dependency, review the new upstream implementation and
regenerate the applied bundle patch deliberately. Never reuse these minified
identifiers or recorded bundle hashes for a different tarball. Remove the patch
only after an upstream fix and the same public-API assertions pass.

## Mediabunny WebM duration

`mediabunny@1.62.1.patch` fixes an observed WebM duration loss in opaque video.
Upstream's SimpleBlock path has no explicit duration. Without DefaultDuration,
the final decoded video sample therefore had duration zero; a 0.370 s authored
composition was measured as 0.367 s. Adding frame-rate metadata would instead
resnap the shortened final sample, so it is not an equivalent fix.

The patch enables the existing BlockGroup/BlockDuration path for video, retaining
its ordinary key/delta reference logic. It changes neither encoded packet bytes
nor alpha data, codecs, native encoding or GPU rendering. Both the published
TypeScript source and the ESM distribution used by this project are patched.
CommonJS bundles remain upstream; this project uses ESM imports.

Mediabunny's MPL-2.0 license and original notices remain intact. The patch is
stored as source and applied through Bun's root `patchedDependencies` entry and
lockfile. Always prepare with `bun patch mediabunny@1.62.1` before editing:
ordinary Linux installs can share hardlinks with Bun's cache and other worktrees.
Save an isolated change with `bun patch --commit node_modules/mediabunny`.
These are dependency-patch operations, not Git commits.

Patch files preserve upstream tab-indented context verbatim. Their Git whitespace
attribute reflects unified-diff syntax; application sources retain normal checks.

The original failing output, hashes and inode evidence are kept in ignored
`artifacts/motion/`. Native verification covers both real container decoding and
the public generic renderer; see [composition export](../docs/rendering/composition-export.md).
