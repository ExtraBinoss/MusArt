import {
  FORMAT_VERSION,
  type Composition,
  type Effect,
  type EffectType,
  type Layer,
  type LayerKind,
  type Project,
} from "./model";

import { createId } from "./identity";
import { getEffectDefinition } from "../effects/catalog";
export { createId } from "./identity";

export const PRESETS = [
  { id: "square", name: "Carré social", width: 1080, height: 1080 },
  { id: "portrait", name: "Portrait", width: 1080, height: 1350 },
  { id: "story", name: "Story", width: 1080, height: 1920 },
  { id: "landscape", name: "Paysage", width: 1920, height: 1080 },
  { id: "a4", name: "A4 · 300 dpi", width: 2480, height: 3508 },
  { id: "desktop", name: "Écran", width: 1440, height: 900 },
] as const;

export function createLayer(kind: LayerKind, patch: Partial<Layer> = {}): Layer {
  const labels: Record<LayerKind, string> = {
    rectangle: "Rectangle",
    ellipse: "Ellipse",
    text: "Texte",
    image: "Image",
    group: "Groupe",
  };
  return {
    id: createId("layer"),
    kind,
    name: labels[kind],
    parentId: null,
    x: 80,
    y: 80,
    width: 280,
    height: kind === "text" ? 100 : 220,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: "#2563eb",
    stroke: "#ffffff",
    strokeWidth: 0,
    radius: 0,
    blendMode: "normal",
    text: "Votre texte",
    fontFamily: "Inter",
    fontSize: 64,
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: 0,
    textAlign: "left",
    assetId: null,
    mask: null,
    effects: [],
    ...patch,
  };
}

export function createEffect(type: EffectType, patch: Partial<Effect> = {}): Effect {
  return {
    id: createId("effect"),
    type,
    ...getEffectDefinition(type).defaults,
    ...patch,
  };
}

export function createPage(patch: Partial<Composition> = {}): Composition {
  return {
    id: createId("page"),
    name: "Composition 1",
    width: 1080,
    height: 1080,
    background: "#ffffff",
    layers: [],
    guides: [],
    ...patch,
  };
}

/** Supply timestamps at the platform boundary; the pure default is reproducible. */
export function createProject(patch: Partial<Project> = {}): Project {
  return {
    version: FORMAT_VERSION,
    id: createId("project"),
    name: "Sans titre",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    pages: [createPage()],
    assets: {},
    ...patch,
  };
}
