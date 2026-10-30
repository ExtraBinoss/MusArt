# Contributing to MusArt

MusArt is an MIT-licensed, local-first creative editor. Read [AGENTS.md](AGENTS.md) and the [architecture contracts](docs/architecture/contracts.md) before changing shared behavior.

## Set up

Use Bun 1.4.2 and Node.js 22.12 or newer. Run `bun install --frozen-lockfile`, then `bun dev`. The application uses port 6100. Install the browser test runtime with `bunx playwright install --with-deps chromium`.

## Make a change

Fork the repository and create a branch for one focused change. Open a pull request against `main`, describe the user-visible result, and include the relevant verification. For substantial features, open an issue first to agree on scope.

`main` is protected: contributions require a pull request, a passing `verify` check, resolved review conversations and review by `@ExtraBinoss`. The owner can bypass these rules when necessary. GitHub Pages publication is reserved to `ExtraBinoss`; contributor pull requests run validation only. Repository administrators configure these controls in GitHub, separately from the files in a pull request.

- Keep document logic in the pure core, GPU work in the renderer, and platform/UI behavior in the app.
- Organize features in focused subdirectories. Each effect owns its own folder and TSL implementation.
- Keep code and style files at or below 600 lines. Extract cohesive behavior rather than empty wrappers.
- Put behavior tests in the relevant `test/` tree, never under `src/`. Test outcomes, invalid inputs, cleanup, and regressions. Exact per-file mirrors are optional; integration tests may cover several modules. Do not add mechanical tests just for wrappers, re-exports or presentation-only edits.
- Keep all four coverage metrics at or above 85%, globally and for the critical core package. Do not exclude difficult production code to satisfy a threshold.
- Preserve GPU texture ownership, alpha isolation, stable uniforms, demand rendering, and the no-readback path. Browser tests must inspect real pixels in addition to mocked API contracts.
- Update both English and French UI catalogs for visible interface changes. Write project documentation in English.

The development loop is: implement the feature, run its focused code tests, and finish. Pass a test file or directory to `bun run test -- <path>`, use `bun run test:related -- <source-path>` to select dependent tests, or use `bun run test:watch -- <path>` while editing. These commands do not collect coverage. Add a focused browser check for rendering/native interactions and a benchmark for performance-sensitive work; do not run the full GPU/storage suites for unrelated changes.

For focused coverage, use `bun run test:coverage:changed -- <source-paths>`. Without paths it selects staged, unstaged and untracked executable sources from Git. It runs exact mirrored tests when all selected sources have them, otherwise it reports the fallback and selects related tests for all selected sources. Only those sources are instrumented, and partial reports go to `artifacts/coverage-related/`. Use `test:coverage:related` to include dependent consumers as well; shared barrel imports can make that selection broad. The full `coverage/` report and CI thresholds remain unchanged. Pure core tests use a shared Node worker; DOM tests use isolated VM contexts, while native storage and external animation-clock integration tests retain fresh Node realms.

When using subagents, follow the delegation rules in [AGENTS.md](AGENTS.md#delegation): give each worker a bounded implementation task and exclusive file ownership, use a fresh context for independent work, and keep intermediate messages for blockers or changed requirements. The coordinator continues implementation and names one owner for integrated validation. Share checks already completed, avoid duplicate runs and status-only reactivations, and finish after the relevant checks pass.

Run relevant static checks and `bun run check:rules` before committing. After a fix, rerun affected checks rather than starting the complete gate again. Reports, captures, dependencies, builds, local projects, and secrets do not belong in commits.

| Command                          | Checks                                                                                                                                                                                | When to use it                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `bun run check-ci`               | Workspace versions, repository rules, typecheck, lint, formatting, full Vitest coverage, coverage-aware rules and production build. No Chromium installation or Playwright scenarios. | Automatic pull-request/push validation and the gate before GitHub Pages publication. |
| `bun run test:browser -- <path>` | Selected real-browser scenarios, with a production build and preview server. Requires Chromium.                                                                                       | Rendering or native interaction changes.                                             |
| `bun run check`                  | Everything in `check-ci`, followed by the complete Playwright browser suite. Requires Chromium.                                                                                       | Requested full verification and release preparation.                                 |

The automatic Quality workflow uses `check-ci`; browser tests run explicitly when needed. All source coverage requirements remain in force. Passing `check-ci` alone does not establish correct GPU output or native interactions.

## Commit and review

Every delivered feature and fix needs an English entry under `Unreleased` in [CHANGELOG.md](CHANGELOG.md). Describe the resulting behavior and meaningful limitations. Keep completed-work lists and measured results in the changelog or supporting documentation; `AGENTS.md` contains lasting contribution rules.

Commit each verified feature or milestone separately with a descriptive message, such as `feat(render): add an isolated effect pass` or `fix(core): preserve layer order when ungrouping`. Stage the files belonging to that change and preserve unrelated user work.

A review should explain the concrete behavior, why it changed, what was tested, and any remaining limitation. Performance reports should identify the browser, adapter, scene, warmup, and measurement boundaries. A mocked renderer or a successful build alone is not evidence of correct GPU pixels.

## Prepare a release

The root and every workspace share one Semantic Versioning release number. `bun run version:check` detects mismatches and runs as part of the quality gate. After validation, run `bun run release -- patch`, `minor`, `major`, or an explicit `X.Y.Z` to synchronize the manifests and move `Unreleased` notes into a dated release.

The script requires release notes and refuses invalid versions, downgrades and duplicate releases. Review the generated diff, run `bun install` if versions changed, verify the frozen installation and quality gate, then commit the notes, manifests and any lockfile change together. This command prepares local files; it does not create a Git tag, publish packages or push commits.

## Report an issue

Include a minimal reproduction, expected and observed behavior, browser version, rendering backend, and relevant console errors. A synthetic `.musart` project is preferable to private artwork. For performance issues, state the image/layer count and whether the delay occurs during import, the first effect compilation, an interaction, saving, or export.

Report security vulnerabilities privately using [the security policy](SECURITY.md). Keep private artwork, credentials and personal data out of public issues and pull requests.

Third-party assets and code must retain their provenance and compatible license notices. Use the supplied MusArt branding without recoloring it.
