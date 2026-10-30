import { ensure } from "../errors";
import { FORMAT_VERSION, type Project } from "./model";
import { EFFECT_CATALOG } from "../effects/catalog";
import { BLEND_CATALOG } from "../layers/blending/catalog";
import {
  assertRecord,
  assertText,
  assertNumber,
  assertBoolean,
  assertColor,
  assertList,
  assertUniqueId,
} from "./guards";
import { validateLayerLayout, validatePageLayout } from "../layout/validation";
import { validateVector } from "../vector/validation";
import { validateMaskSource, validateMaskGraph } from "../masks/validation";

import { validateReplaySpec } from "../animation/validation";
import { validateFillGradient } from "../paint/gradient";
import { validateEffectExtensions } from "../effects/validation";
import { validateCompositionMotion } from "../motion/validation";
import type { Composition } from "./model";
import { validateAssetDescription } from "../assets/validation";
import type { Asset } from "../assets/model";

const kinds = ["rectangle", "ellipse", "text", "image", "video", "group", "vector"];
const effectTypes = Object.keys(EFFECT_CATALOG);

function validateEffect(value: unknown, ids: Set<string>): void {
  assertRecord(value);
  assertUniqueId(value.id, ids);
  ensure(
    typeof value.type === "string" && effectTypes.includes(value.type),
    "INVALID_DOCUMENT",
    "Effet inconnu",
  );
  assertBoolean(value.enabled);
  assertBoolean(value.color);
  assertNumber(value.amount, 0, 1);
  const scale = EFFECT_CATALOG[value.type as keyof typeof EFFECT_CATALOG].parameters.find(
    (parameter) =>
      parameter.kind === "number" && parameter.key === "scale" && parameter.scope !== "settings",
  );
  assertNumber(
    value.scale,
    scale?.kind === "number" ? (scale.documentMin ?? scale.min) : 0.1,
    scale?.kind === "number" ? (scale.documentMax ?? scale.max) : 128,
  );
  assertNumber(value.levels, 2, 256);
  assertNumber(value.seed, 0, 2147483647);
  validateEffectExtensions(value);
}

function validateLayer(value: unknown, ids: Set<string>, assets: Record<string, unknown>): void {
  assertRecord(value);
  assertUniqueId(value.id, ids);
  assertText(value.name);
  ensure(
    typeof value.kind === "string" && kinds.includes(value.kind),
    "INVALID_DOCUMENT",
    "Type de calque inconnu",
  );
  ensure(
    value.parentId === null || typeof value.parentId === "string",
    "INVALID_DOCUMENT",
    "Parent invalide",
  );
  assertNumber(value.x, -1_000_000, 1_000_000);
  assertNumber(value.y, -1_000_000, 1_000_000);
  assertNumber(value.width, 0.01, 32768);
  assertNumber(value.height, 0.01, 32768);
  assertNumber(value.rotation, -360000, 360000);
  assertNumber(value.opacity, 0, 1);
  assertNumber(value.strokeWidth, 0, 1024);
  assertNumber(value.radius, 0, 32768);
  assertBoolean(value.visible);
  assertBoolean(value.locked);
  assertColor(value.fill);
  if (value.fillGradient !== undefined) validateFillGradient(value.fillGradient);
  assertColor(value.stroke);
  ensure(
    typeof value.blendMode === "string" && Object.hasOwn(BLEND_CATALOG, value.blendMode),
    "INVALID_DOCUMENT",
    "Mélange inconnu",
  );
  ensure(
    typeof value.text === "string" && value.text.length <= 1_000_000,
    "INVALID_DOCUMENT",
    "Contenu texte invalide",
  );
  assertText(value.fontFamily, 256);
  assertNumber(value.fontSize, 1, 4096);
  assertNumber(value.fontWeight, 100, 1000);
  assertNumber(value.lineHeight, 0.1, 10);
  assertNumber(value.letterSpacing, -1024, 1024);
  ensure(
    typeof value.textAlign === "string" && ["left", "center", "right"].includes(value.textAlign),
    "INVALID_DOCUMENT",
    "Alignement invalide",
  );
  ensure(
    value.assetId === null ||
      (typeof value.assetId === "string" && Object.hasOwn(assets, value.assetId)),
    "INVALID_DOCUMENT",
    "Ressource manquante",
  );
  if (value.kind === "image" || value.kind === "video") {
    ensure(value.assetId !== null, "INVALID_DOCUMENT", "Image sans ressource");
    const asset = assets[value.assetId as string] as { kind?: unknown };
    ensure(
      value.kind === "video"
        ? asset.kind === "video"
        : asset.kind === undefined || asset.kind === "image",
      "INVALID_DOCUMENT",
      "Layer and original media kinds do not match",
    );
  }
  if (value.mask !== null) validateMaskSource(value.mask, assets);
  if (value.maskSource !== undefined) assertBoolean(value.maskSource);
  if (value.kind === "vector") validateVector(value.vector);
  else if (value.vector !== undefined) validateVector(value.vector);
  validateLayerLayout(value, ids);

  assertList(value.effects, 64);
  for (const effect of value.effects) validateEffect(effect, ids);
}

function validateHierarchy(layers: unknown[]): void {
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of layers) {
    assertRecord(item);
    assertText(item.id);
    byId.set(item.id, item);
  }
  for (const item of byId.values()) {
    const seen = new Set<unknown>([item.id]);
    let parentId = item.parentId;
    while (parentId !== null) {
      ensure(
        !seen.has(parentId) && seen.size <= 64,
        "INVALID_HIERARCHY",
        "Cycle ou profondeur excessive",
      );
      ensure(typeof parentId === "string", "INVALID_HIERARCHY", "Identifiant parent invalide");
      const parent = byId.get(parentId);
      ensure(
        parent?.kind === "group",
        "INVALID_HIERARCHY",
        "Le parent doit être un groupe du même document",
      );
      seen.add(parentId);
      parentId = parent.parentId;
    }
  }
}

export function validateProject(value: unknown): asserts value is Project {
  assertRecord(value);
  ensure(
    value.version === FORMAT_VERSION,
    "INVALID_DOCUMENT",
    "Version de projet non prise en charge",
  );
  const ids = new Set<string>();
  assertUniqueId(value.id, ids);
  assertText(value.name);
  assertText(value.createdAt, 64);
  assertText(value.updatedAt, 64);
  ensure(
    Number.isFinite(Date.parse(value.createdAt)) && Number.isFinite(Date.parse(value.updatedAt)),
    "INVALID_DOCUMENT",
    "Dates invalides",
  );
  assertRecord(value.assets);
  const assetEntries = Object.entries(value.assets);
  ensure(assetEntries.length <= 5000, "INVALID_DOCUMENT", "Trop de ressources");
  for (const [key, asset] of assetEntries) {
    assertRecord(asset);
    assertUniqueId(asset.id, ids);
    ensure(key === asset.id, "INVALID_DOCUMENT", "Clé de ressource incohérente");
    validateAssetDescription(asset);
  }
  assertList(value.pages, 100);
  ensure(value.pages.length > 0, "INVALID_DOCUMENT", "Un projet doit contenir une composition");
  for (const page of value.pages) {
    assertRecord(page);
    assertUniqueId(page.id, ids);
    assertText(page.name);
    assertNumber(page.width, 1, 16384);
    assertNumber(page.height, 1, 16384);
    assertColor(page.background);
    assertList(page.layers, 10000);
    assertList(page.guides, 1000);
    for (const layer of page.layers) validateLayer(layer, ids, value.assets);
    validateHierarchy(page.layers);
    validateMaskGraph(page.layers);
    validatePageLayout(page);
    validateCompositionMotion(
      page as unknown as Composition,
      ids,
      value.assets as unknown as Record<string, Asset>,
    );
    for (const guide of page.guides) {
      assertRecord(guide);
      assertUniqueId(guide.id, ids);
      ensure(guide.axis === "x" || guide.axis === "y", "INVALID_DOCUMENT", "Axe invalide");
      assertNumber(guide.position, -1_000_000, 1_000_000);
      if (guide.color !== undefined) assertColor(guide.color);
    }
  }
  if (value.replay !== undefined) validateReplaySpec(value.replay);
}
