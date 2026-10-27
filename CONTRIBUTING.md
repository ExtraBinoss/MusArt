# Contributing to MusArt

MusArt is an MIT-licensed, local-first creative editor. Read [AGENTS.md](AGENTS.md) and the [architecture contracts](docs/CONTRACTS.md) before changing shared behavior.

## Set up

Use Bun 1.4.2 and Node.js 22.12 or newer. Run `bun install --frozen-lockfile`, then `bun dev`. The application uses port 6100. Install the browser test runtime with `bunx playwright install --with-deps chromium`.

## Make a change

- Keep document logic in the pure core, GPU work in the renderer, and platform/UI behavior in the app.
- Organize features in focused subdirectories. Each effect owns its own folder and TSL implementation.
- Keep code and style files at or below 600 lines. Extract cohesive behavior rather than empty wrappers.
- Put tests in a mirrored `test/` tree, never under `src/`. Test outcomes, invalid inputs, cleanup, and regressions.
- Keep all four coverage metrics at or above 85%, globally and for the critical core package. Do not exclude difficult production code to satisfy a threshold.
- Preserve GPU texture ownership, alpha isolation, stable uniforms, demand rendering, and the no-readback path. Browser tests must inspect real pixels in addition to mocked API contracts.
- Update both English and French UI catalogs for visible interface changes. Write project documentation in English.

Run the relevant focused tests while developing, then run `bun run check` before handing off a change. The CI uses the frozen lockfile and the same quality commands. Reports, captures, dependencies, builds, local projects, and secrets do not belong in commits.

## Commit and review

Commit each verified feature or milestone separately with a descriptive message, such as `feat(render): add an isolated effect pass` or `fix(core): preserve layer order when ungrouping`. Stage the files belonging to that change and preserve unrelated user work.

A review should explain the concrete behavior, why it changed, what was tested, and any remaining limitation. Performance reports should identify the browser, adapter, scene, warmup, and measurement boundaries. A mocked renderer or a successful build alone is not evidence of correct GPU pixels.

## Report an issue

Include a minimal reproduction, expected and observed behavior, browser version, rendering backend, and relevant console errors. A synthetic `.musart` project is preferable to private artwork. For performance issues, state the image/layer count and whether the delay occurs during import, the first effect compilation, an interaction, saving, or export.

Third-party assets and code must retain their provenance and compatible license notices. Do not add application screenshots or branding to the README until project artwork is supplied by the maintainer.
