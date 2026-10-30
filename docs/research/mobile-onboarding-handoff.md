# Mobile and onboarding handoff

Completed implementation checkpoint: 2026-10-30, branch `feat/mobile-onboarding`, worktree
`/home/albi/Documents/Projects/Hackaton/MuseArtWeb-mobile`.

## Implemented

- Theme-aware landing with animated headline, draggable real template carousel,
  separate logo/CTA pills and four documented video placeholders.
- Projects/Templates library with desktop sidebar, five recent thumbnail leases,
  Preferences, disabled Community, retained search/header, list transitions,
  Static/Motion template filter and shared scroll shadows.
- New-project dialog with visual presets, linked dimensions, live aspect preview
  and the same split-button structure as editor export for importing `.musart`.
- Matching themed card-caption fades, shorter overlays and aligned project/template
  mode captions. Saved-project mode metadata comes from bounded manifest reads;
  dimensions match the displayed Motion artboard. Creation controls are enlarged.
- Genuine engine/GPU hover playback for authored Motion templates in the landing
  and template gallery, plus saved user projects through isolated readonly loads.
  All previews share one bounded GPU owner, follow the selected artboard's authored
  duration, cancel stale work and perform no production GPU readbacks or document
  edits. Static projects retain their cached page carousel.
- Full-width mobile canvas, bottom navigation, draggable sheets, animated handle
  feedback/navigation, compact tools, primary Motion activation and export sheet.
- Mobile numeric sliders with precision fields, imperative previews, transparent
  surroundings while adjusting, cancellation and one undo entry per gesture.
- Native two-finger pan/zoom, compact mobile timeline and horizontal overflow
  shadows on desktop/mobile timelines.
- Responsive desktop dock with hover/wheel scrolling, shared shadows, ruler
  insets, consistent floating-control geometry and bottom zoom tooltips.
- The canvas logo opens the Projects/Templates library. Explicit creation commands
  open the shared dialog over the canvas; cancelling returns to the same document.
  The project-name menu also exposes Projects on desktop and phones.
- Integrated the verified Motion milestone `88675a9`, preserving both histories,
  project layout/zoom preferences and dock Pin/peek behavior. Mobile single-panel
  layouts never overwrite saved desktop split proportions.
- Mobile Layers now has one heading with its live count and existing actions in
  the sheet header. Opacity and blend controls stay centered for empty, single
  and multiple selections; the desktop header remains unchanged.
- Cmd/Ctrl+K keeps query and selection updates inside a retained palette, retains
  result rows, and sorts only a bounded best-match set. Its single panel entrance,
  individual result transitions and translated typewriter avoid editor renders.
  Input echo has priority over result rendering. Pending results remain visible
  but inert; immediate Enter resolves the current criteria instead of an old row.
  Footer instructions are removed. Native profiling, frozen builds, input clocks
  and qualified before/after results are documented in
  [Cmd+K input-priority profiling](../performance/cmdk-priority.md). The measured
  input-echo tail improves while final results take longer; no general speedup
  or guarantee for other devices is claimed.

## Remaining follow-up

- Review the finished interface on the user's physical phone and incorporate any
  remaining visual or touch feedback. Native Chromium interaction checks passed;
  these do not replace Safari/physical-device verification.
- Replace the four landing placeholders with user-supplied clips. The paths and
  slots are documented in `apps/web/public/videos/README.md`.
- Later upstream Motion work-in-progress (`1f49efa`) is outside this verified
  integration; its separate gesture/export/audio roadmap remains documented in
  that branch's resume file.
- This feature branch is published on GitHub. No PR, deployment or release has
  been performed, and full CI/release gates have not been run. Community
  intentionally remains disabled/coming soon.

## Verification at this checkpoint

- Root TypeScript checks, changed-file Oxlint/ESLint, formatting, version check
  (`0.2.0`), whitespace check and contribution rules passed.
- Focused unit suites passed for landing/library/creation, touch navigation,
  mobile controls/sheets/export, timeline/scroll shadows, responsive dock and
  template-preview loader/runtime/intent.
- Native browser cohorts passed: eight onboarding/dashboard/search regressions,
  two landing/library scenarios, real authored Motion preview playback and six
  mobile/responsive scenarios. They include real imports, decoded exports,
  slider cancellation/undo, two-finger gestures and measured editor React/GPU
  readback counters. No production latency benchmark claim is made.
- After integration, all ten focused native scenarios passed together: five
  mobile interaction cases, two real IndexedDB layout/zoom restorations, desktop
  toolbar/ruler overflow, authored-template hover playback and saved-project hover
  playback beyond five seconds. The current document/selection and editor React
  counters stayed unchanged during hover, with zero production readbacks.
- Follow-up unit checks passed for saved metadata/captions and CRUD (36 tests),
  isolated preview lifecycle/storage (23 tests), mixed-artboard/readonly ownership
  paths (11 tests), caption dimensions (4 tests) and merged Motion UI (74 tests).
  These focused cohorts overlap and are not a repository-wide test count.
- Independent source audit found no outstanding navigation, readonly persistence,
  stale-result, cancellation or preview-owner cleanup issue.
- Follow-up mobile checks cover the restored logo/library path, a single Layers
  heading and centered compositing controls across selection states. Cmd+K checks
  cover immediate query/Enter, native file pickers, cross-page navigation, effect
  undo, dialog handoffs, first-frame focus, inert exit and canvas focus return.
- The final Cmd+K audit corrections passed 60 focused unit cases and two affected
  native keyboard scenarios. Category/close buttons own Enter/Space, IME Escape
  keeps composition active, and queued commands reject changed layer targets.
  Root typecheck, typed lint, ESLint, formatting, version and rules checks passed.
- Ignored evidence/configuration lives under `artifacts/mobile-onboarding/`.

## Local preview

The Vite server was left running on port `6200`:

- `http://localhost:6200`
- `http://localhost:6200/?welcome=1` to revisit the landing without deleting data.
- `http://192.168.1.12:6200` from a phone on the same network, while this host
  retains that address.

Restart from this worktree with `bun run dev --port 6200` if needed.
