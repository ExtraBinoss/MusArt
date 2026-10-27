import { assertNumber, assertRecord } from "../document/guards";
import { ensure } from "../errors";
import { BLEND_CATALOG } from "../layers/blending/catalog";
import { EFFECT_COMPOSITE_MODES } from "./compositing";
import type { EffectParameter } from "./definition";
import { GRADIENT_PARAMETERS } from "./gradient/parameters";
import { validateEffectParameter } from "./parameters";

const settings = new Map<string, EffectParameter>(
  GRADIENT_PARAMETERS.map((parameter) => [parameter.key, parameter]),
);
/** Optional fields keep old documents valid; every supplied setting remains strictly validated. */
export function validateEffectExtensions(value: Record<string, unknown>): void {
  if (value.blendMode !== undefined)
    ensure(
      typeof value.blendMode === "string" && Object.hasOwn(BLEND_CATALOG, value.blendMode),
      "INVALID_DOCUMENT",
      "Unknown effect blend mode.",
    );
  if (value.opacity !== undefined) assertNumber(value.opacity, 0, 1);
  if (value.time !== undefined) assertNumber(value.time, 0, 86400);
  if (value.composite !== undefined)
    ensure(
      typeof value.composite === "string" &&
        (EFFECT_COMPOSITE_MODES as readonly string[]).includes(value.composite),
      "INVALID_DOCUMENT",
      "Unknown effect composite operation.",
    );
  if (value.settings !== undefined) {
    ensure(value.type === "gradient", "INVALID_DOCUMENT", "Only Gradient owns gradient settings.");
    assertRecord(value.settings);
    for (const [key, field] of Object.entries(value.settings)) {
      const parameter = settings.get(key);
      ensure(parameter, "INVALID_DOCUMENT", "Unknown gradient setting.");
      validateEffectParameter(parameter, field, "INVALID_DOCUMENT");
    }
  }
}
