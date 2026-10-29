# Mobile and onboarding handoff

Checkpoint: 2026-10-30, branch `feat/mobile-onboarding`, worktree
`/home/albi/Documents/Projects/Hackaton/MuseArtWeb-mobile`.

## Implemented

- Theme-aware landing with animated headline, draggable real template carousel,
  separate logo/CTA pills and four documented video placeholders.
- Projects/Templates library with desktop sidebar, five recent thumbnail leases,
  Preferences, disabled Community, retained search/header, list transitions,
  Static/Motion template filter and shared scroll shadows.
- New-project dialog with visual presets, linked dimensions, live aspect preview
  and the same split-button structure as editor export for importing `.musart`.
- Matching themed card-caption fades, shorter overlays and aligned template mode
  captions. Creation controls are enlarged.
- Genuine engine/GPU hover playback for authored Motion templates in the landing
  and template gallery. It has bounded ownership, cancellation, resource cleanup
  and no production GPU readbacks or document edits.
- Full-width mobile canvas, bottom navigation, draggable sheets, animated handle
  feedback/navigation, compact tools, primary Motion activation and export sheet.
- Mobile numeric sliders with precision fields, imperative previews, transparent
  surroundings while adjusting, cancellation and one undo entry per gesture.
- Native two-finger pan/zoom, compact mobile timeline and horizontal overflow
  shadows on desktop/mobile timelines.
- Responsive desktop dock with hover/wheel scrolling, shared shadows, ruler
  insets, consistent floating-control geometry and bottom zoom tooltips.

## Remaining follow-up

- Review the finished interface on the user's physical phone and incorporate any
  remaining visual or touch feedback. Native Chromium interaction checks passed;
  these do not replace Safari/physical-device verification.
- Extend real Motion hover playback to saved user projects if requested across
  both galleries. This checkpoint plays authored templates; saved project cards
  retain their existing cached page-preview carousel.
- Finish parity of saved-project captions with template captions: project cards
  still show page count, dimensions and active/date metadata rather than the
  template's right-aligned Static/Motion caption.
- Confirm whether the editor logo should open creation directly. It currently
  opens the library, which exposes the shared new-project dialog.
- Integrate the newer Motion branch commit `88675a9` (project layout persistence
  and timeline interactions) before merging this work. This branch was created
  from `e2b0312`; upstream advanced during this session. Preserve both histories
  and inspect overlapping timeline changes.
- Replace the four landing placeholders with user-supplied clips. The paths and
  slots are documented in `apps/web/public/videos/README.md`.
- No remote push, PR, deployment or release has been performed. Full CI/release
  gates have not been run. Community intentionally remains disabled/coming soon.

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
- Ignored evidence/configuration lives under `artifacts/mobile-onboarding/`.

## Local preview

The Vite server was left running on port `6200`:

- `http://localhost:6200`
- `http://localhost:6200/?welcome=1` to revisit the landing without deleting data.
- `http://192.168.1.12:6200` from a phone on the same network, while this host
  retains that address.

Restart from this worktree with `bun run dev --port 6200` if needed.
