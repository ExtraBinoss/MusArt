import { ensure } from "../errors";
import { FORMAT_VERSION, type Project } from "./model";
import { EFFECT_CATALOG } from "../effects/catalog";

const kinds = ["rectangle", "ellipse", "text", "image", "group"];
const effectTypes = Object.keys(EFFECT_CATALOG);
const colorPattern = /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|transparent)$/i;
function record(value: unknown): asserts value is Record<string, unknown> {
  ensure(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "INVALID_DOCUMENT",
    "Objet attendu",
  );
}
function text(value: unknown, maximum = 256): asserts value is string {
  ensure(
    typeof value === "string" && value.length > 0 && value.length <= maximum,
    "INVALID_DOCUMENT",
    "Texte invalide",
  );
}
function numeric(value: unknown, minimum: number, maximum: number): asserts value is number {
  ensure(
    typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum,
    "INVALID_DOCUMENT",
    "Nombre hors limites",
  );
}
function flag(value: unknown): void {
  ensure(typeof value === "boolean", "INVALID_DOCUMENT", "Booléen attendu");
}
function color(value: unknown): void {
  ensure(
    typeof value === "string" && colorPattern.test(value),
    "INVALID_DOCUMENT",
    "Couleur invalide",
  );
}
function list(value: unknown, maximum: number): asserts value is unknown[] {
  ensure(
    Array.isArray(value) && value.length <= maximum,
    "INVALID_DOCUMENT",
    "Liste invalide ou trop longue",
  );
}
function uniqueId(value: unknown, ids: Set<string>): void {
  text(value);
  ensure(!ids.has(value), "INVALID_DOCUMENT", `Identifiant dupliqué : ${value}`);
  ids.add(value);
}

function validateEffect(value: unknown, ids: Set<string>): void {
  record(value);
  uniqueId(value.id, ids);
  ensure(effectTypes.includes(String(value.type)), "INVALID_DOCUMENT", "Effet inconnu");
  flag(value.enabled);
  flag(value.color);
  numeric(value.amount, 0, 1);
  numeric(value.scale, 0.1, 128);
  numeric(value.levels, 2, 256);
  numeric(value.seed, 0, 2147483647);
}

function validateLayer(value: unknown, ids: Set<string>, assets: Record<string, unknown>): void {
  record(value);
  uniqueId(value.id, ids);
  text(value.name);
  ensure(kinds.includes(String(value.kind)), "INVALID_DOCUMENT", "Type de calque inconnu");
  ensure(
    value.parentId === null || typeof value.parentId === "string",
    "INVALID_DOCUMENT",
    "Parent invalide",
  );
  numeric(value.x, -1_000_000, 1_000_000);
  numeric(value.y, -1_000_000, 1_000_000);
  numeric(value.width, 0.01, 32768);
  numeric(value.height, 0.01, 32768);
  numeric(value.rotation, -360000, 360000);
  numeric(value.opacity, 0, 1);
  numeric(value.strokeWidth, 0, 1024);
  numeric(value.radius, 0, 32768);
  flag(value.visible);
  flag(value.locked);
  color(value.fill);
  color(value.stroke);
  ensure(
    ["normal", "multiply", "screen", "overlay"].includes(String(value.blendMode)),
    "INVALID_DOCUMENT",
    "Mélange inconnu",
  );
  ensure(
    typeof value.text === "string" && value.text.length <= 1_000_000,
    "INVALID_DOCUMENT",
    "Contenu texte invalide",
  );
  text(value.fontFamily, 256);
  numeric(value.fontSize, 1, 4096);
  numeric(value.fontWeight, 100, 1000);
  numeric(value.lineHeight, 0.1, 10);
  numeric(value.letterSpacing, -1024, 1024);
  ensure(
    ["left", "center", "right"].includes(String(value.textAlign)),
    "INVALID_DOCUMENT",
    "Alignement invalide",
  );
  ensure(
    value.assetId === null ||
      (typeof value.assetId === "string" && Object.hasOwn(assets, value.assetId)),
    "INVALID_DOCUMENT",
    "Ressource manquante",
  );
  if (value.kind === "image")
    ensure(value.assetId !== null, "INVALID_DOCUMENT", "Image sans ressource");
  if (value.mask !== null) {
    record(value.mask);
    text(value.mask.assetId);
    ensure(Object.hasOwn(assets, value.mask.assetId), "INVALID_DOCUMENT", "Masque sans ressource");
    flag(value.mask.enabled);
    flag(value.mask.inverted);
  }
  list(value.effects, 64);
  for (const effect of value.effects) validateEffect(effect, ids);
}

function validateHierarchy(layers: unknown[]): void {
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of layers) {
    record(item);
    byId.set(String(item.id), item);
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
  record(value);
  ensure(
    value.version === FORMAT_VERSION,
    "INVALID_DOCUMENT",
    "Version de projet non prise en charge",
  );
  const ids = new Set<string>();
  uniqueId(value.id, ids);
  text(value.name);
  text(value.createdAt, 64);
  text(value.updatedAt, 64);
  ensure(
    Number.isFinite(Date.parse(value.createdAt)) && Number.isFinite(Date.parse(value.updatedAt)),
    "INVALID_DOCUMENT",
    "Dates invalides",
  );
  record(value.assets);
  const assetEntries = Object.entries(value.assets);
  ensure(assetEntries.length <= 5000, "INVALID_DOCUMENT", "Trop de ressources");
  for (const [key, asset] of assetEntries) {
    record(asset);
    uniqueId(asset.id, ids);
    ensure(key === asset.id, "INVALID_DOCUMENT", "Clé de ressource incohérente");
    text(asset.name);
    text(asset.mime, 128);
    ensure(
      /^image\/(png|jpeg|webp|gif|svg\+xml|avif)$/.test(asset.mime),
      "INVALID_DOCUMENT",
      "Format de ressource non pris en charge",
    );
    numeric(asset.width, 1, 32768);
    numeric(asset.height, 1, 32768);
    text(asset.dataUrl, 200_000_000);
    ensure(
      /^data:image\/(?:png|jpeg|webp|gif|svg\+xml|avif)(?:;[^,]*)?,/.test(asset.dataUrl),
      "INVALID_DOCUMENT",
      "Ressource non intégrée",
    );
  }
  list(value.pages, 100);
  ensure(value.pages.length > 0, "INVALID_DOCUMENT", "Un projet doit contenir une composition");
  for (const page of value.pages) {
    record(page);
    uniqueId(page.id, ids);
    text(page.name);
    numeric(page.width, 1, 16384);
    numeric(page.height, 1, 16384);
    color(page.background);
    list(page.layers, 10000);
    list(page.guides, 1000);
    for (const layer of page.layers) validateLayer(layer, ids, value.assets);
    validateHierarchy(page.layers);
    for (const guide of page.guides) {
      record(guide);
      uniqueId(guide.id, ids);
      ensure(guide.axis === "x" || guide.axis === "y", "INVALID_DOCUMENT", "Axe invalide");
      numeric(guide.position, -1_000_000, 1_000_000);
    }
  }
}
