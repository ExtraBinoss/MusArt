import type { createStore } from "jotai";
import type { Layer, Composition } from "@musart/core";
import { previewAtom } from "./editor";

export type PreviewValue =
  | { target: "layer"; layerId: string; patch: Partial<Layer> }
  | { target: "layers"; layerIds: string[]; patch: Partial<Layer> }
  | { target: "page"; patch: Partial<Composition> };
export interface PreviewSource {
  read: () => PreviewValue | null;
  subscribe: (listener: () => void) => () => void;
}
/** Jotai remains a presentation adapter; previews notify GPU listeners without React subscriptions. */
export function createPreviewSource(store: ReturnType<typeof createStore>): PreviewSource {
  return {
    read: () => store.get(previewAtom),
    subscribe: (listener) => store.sub(previewAtom, listener),
  };
}

export const EMPTY_PREVIEW_SOURCE: PreviewSource = Object.freeze({
  read: () => null,
  subscribe: () => () => undefined,
});
