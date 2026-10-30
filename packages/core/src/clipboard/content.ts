import { assetOriginalIdentity, isOriginalMediaAsset } from "../assets/identity";
import type { Asset, Project, SessionSnapshot } from "../document/model";
import { createProject } from "../document/factories";
import { validateProject } from "../document/validation";
import { selectionComposition } from "../export/selection";
import { createLayerGeometryIndex } from "../layers/geometry-index";
import type { ClipboardContent } from "./model";

export const MAX_CLIPBOARD_CHARACTERS = 16 * 1024 * 1024;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
/** A content freshness check for local references, not an authentication primitive. */
function fingerprint(source: string): string {
  let first = 0xdeadbeef,
    second = 0x41c6ce57;
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  return `${source.length}:${first >>> 0}:${second >>> 0}`;
}

/** Clipboard JSON contains editable resources and dependencies, never GPU snapshots or replay. */
export function copyContent(
  snapshot: SessionSnapshot,
  options: { includeImages?: boolean; composition?: boolean } = {},
): string {
  const source = snapshot.project.pages.find((page) => page.id === snapshot.pageId);
  if (!source) throw new Error("Clipboard composition is missing.");
  const geometry = createLayerGeometryIndex(source);
  const selected = [...new Set(snapshot.selection)].filter(
    (id) => !geometry.ancestors(id).some((ancestor) => snapshot.selection.includes(ancestor.id)),
  );
  if (!options.composition && !selected.length) throw new Error("Clipboard selection is empty.");
  const selectedPage = options.composition
    ? source
    : selectionComposition(source, selected, [
        snapshot.project.id,
        ...Object.keys(snapshot.project.assets),
      ]);
  const page =
    options.composition || !selectedPage.motion
      ? selectedPage
      : {
          ...selectedPage,
          motion: {
            ...selectedPage.motion,
            audioTracks: [],
            tracks: selectedPage.motion.tracks.filter((track) =>
              selectedPage.layers.some((layer) => layer.id === track.layerId),
            ),
          },
        };
  const assetIds = new Set<string>();
  for (const layer of page.layers) {
    if (layer.assetId) assetIds.add(layer.assetId);
    if (layer.mask?.assetId) assetIds.add(layer.mask.assetId);
  }
  for (const track of page.motion?.audioTracks ?? []) assetIds.add(track.assetId);
  const assets = Object.fromEntries([...assetIds].map((id) => [id, snapshot.project.assets[id]!]));
  const document = createProject({
    id: snapshot.project.id,
    name: snapshot.project.name,
    pages: [page],
    assets,
  });
  validateProject(document);
  const content: ClipboardContent = {
    format: "musart.clipboard",
    version: 1,
    kind: options.composition ? "composition" : "selection",
    sourceProjectId: snapshot.project.id,
    document: { ...document, assets: options.includeImages === false ? {} : assets },
    selection: options.composition ? [] : selected,
    references:
      options.includeImages === false
        ? Object.fromEntries(
            Object.entries(assets).map(([id, original]) => {
              const { dataUrl: _dataUrl, ...asset } = original;
              return [id, { ...asset, fingerprint: fingerprint(assetOriginalIdentity(original)) }];
            }),
          )
        : {},
  };
  const serialized = JSON.stringify(content);
  if (serialized.length > MAX_CLIPBOARD_CHARACTERS)
    throw new RangeError("Clipboard content is too large.");
  return serialized;
}

/** Omitted originals are references within the same durable project, never fabricated images. */
export function parseClipboard(text: string, destination: Project): ClipboardContent {
  if (text.length > MAX_CLIPBOARD_CHARACTERS)
    throw new RangeError("Clipboard content is too large.");
  const value: unknown = JSON.parse(text);
  if (
    !record(value) ||
    value.format !== "musart.clipboard" ||
    value.version !== 1 ||
    (value.kind !== "selection" && value.kind !== "composition") ||
    typeof value.sourceProjectId !== "string" ||
    !record(value.document) ||
    !record(value.document.assets) ||
    !record(value.references) ||
    !Array.isArray(value.selection) ||
    value.selection.length > 10000 ||
    !value.selection.every((id) => typeof id === "string")
  )
    throw new TypeError("Unsupported MusArt clipboard content.");
  const assets: Record<string, Asset> = { ...value.document.assets } as Record<string, Asset>;
  if (Object.keys(value.references).length > 5000)
    throw new RangeError("Too many clipboard originals.");
  for (const [id, metadata] of Object.entries(value.references)) {
    const original = destination.assets[id];
    if (
      value.sourceProjectId !== destination.id ||
      !record(metadata) ||
      !original ||
      metadata.id !== id ||
      metadata.name !== original.name ||
      metadata.mime !== original.mime ||
      metadata.width !== original.width ||
      metadata.height !== original.height ||
      metadata.fingerprint !== fingerprint(assetOriginalIdentity(original)) ||
      Object.hasOwn(assets, id)
    )
      throw new Error("Clipboard originals are missing. Copy again with images included.");
    Object.defineProperty(assets, id, {
      value: original,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  if (value.sourceProjectId !== destination.id && Object.values(assets).some(isOriginalMediaAsset))
    throw Error("Media clipboard references require a binary media transfer between projects.");
  const document = { ...value.document, assets };
  validateProject(document);
  if (
    document.pages.length !== 1 ||
    document.replay !== undefined ||
    document.id !== value.sourceProjectId
  )
    throw new TypeError("Invalid clipboard document scope.");
  const ids = new Set(document.pages[0]!.layers.map((layer) => layer.id));
  if (
    value.selection.some((id) => !ids.has(id)) ||
    new Set(value.selection).size !== value.selection.length ||
    (value.kind === "selection" && !value.selection.length)
  )
    throw new TypeError("Invalid clipboard selection.");
  return { ...value, document } as ClipboardContent;
}
