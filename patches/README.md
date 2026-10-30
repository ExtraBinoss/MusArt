# Pinned dependency patches

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
