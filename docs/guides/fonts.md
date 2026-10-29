# Font library

The font picker combines twenty bundled outline families, a snapshot of **1,950 Google Fonts families**, imported user fonts and locally installed faces exposed by the browser. Search and category filters operate on metadata; the list is virtualized. Opening the picker does not download the entire Google Fonts library.

Hovering or keyboard-focusing a face previews the selected text through the imperative scene port. Closing the picker restores the original face. A choice produces one validated document edit and one undo entry. The renderer keeps five idle font faces in an LRU cache. Active preparation leases prevent eviction while a face is being used; old faces release native shaping resources explicitly.

## Sources and downloads

Twenty OFL families ship in `apps/web/public/fonts/`. Their source revision, byte lengths, SHA-256 checksums and notices are recorded in that directory's manifest.

The complete Google Fonts metadata snapshot lives in `packages/assets/data/fonts/`. It was built from the official metadata endpoint and the immutable Google Fonts Git tree at `ddf386ba1b9fbc6b2c818f1ddcd9148f54ced94b`. Six additional educational families use versioned TrueType URLs supplied by the official Google Fonts download manifests. The source manifest records input hashes and the exact family count. Outline files are fetched on demand; no artwork or text is sent to Google to request subsets.

`scripts/fonts/catalog.ts` deterministically rebuilds the data from captured `artifacts/google-fonts-metadata.json`, `artifacts/google-fonts-tree.json` and `artifacts/google-fonts-overrides.json`. Normal builds and CI use the checked-in snapshot and need no Google API key. Updating the snapshot is a reviewed source-data change, not an automatic runtime update.

Font files retain their own licenses. Remote catalog entries link to the original license or family license page; imported personal fonts remain local to the user's browser storage.

## User storage

TTF and OTF imports are validated before installation and bounded to 32 MiB per file. The library stores original bytes separately from searchable metadata in its own IndexedDB database. Content hashes give imported faces durable IDs and deduplicate identical files. Metadata and binary writes are atomic. Installation reports real parse, download, quota and transaction failures.

There is no application expiry or automatic disk-cache eviction for installed fonts. The browser controls site storage, and clearing its site data removes this library. Closing a renderer only releases its in-memory resources.

Projects and edit journals store family references; font binaries are user-wide resources. A custom font must be installed separately when opening a project in another browser/profile. The current portable `.musart` document does not embed private font files. Missing fonts produce an unavailable-font error rather than silently pretending the requested face rendered.

The app supplies the same font resolver to the editor, still exports, thumbnails, automation and timelapse sessions. The pure document engine contains no font parser, browser API or GPU object.

## Local font discovery

When supported, opening the popover calls `queryLocalFonts()` directly in the opening user gesture. The browser may request its native `local-fonts` permission. Discovery reads metadata first; a face's original bytes are requested only when it is installed or used. An unsupported or denied API leaves the bundled, Google and imported libraries available. There is no separate detection button and no background permission loop.

This API depends on browser support, a secure context and the site's permissions policy. See [queryLocalFonts](https://developer.mozilla.org/en-US/docs/Web/API/Window/queryLocalFonts) and [Chrome's Local Font Access guide](https://developer.chrome.com/docs/capabilities/web-apis/local-fonts).

## Color tools

The compact color control places vertical hue and alpha sliders beside the saturation/value pad. All channels support live previews, keyboard adjustment, cancellation and one committed gesture. The native screen eyedropper is exposed only when the browser provides `EyeDropper`; it preserves the fill's alpha and applies the selected RGB once. Its request is cancelled on teardown or when its originating control becomes stale. See [EyeDropper.open](https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper/open).
