import {
  createEffect,
  createProject,
  EFFECT_CATALOG,
  parseProject,
  type EffectType,
  type Layer,
  type Project,
} from "@musart/core";
import { createTechnoArtboard } from "../../../apps/web/src/services/projects/templates/techno";

/** Real editable AFTERHOURS artboards, with validated, deterministic catalogue-wide settings. */
export function layerStressProject(layerCount: number, effectCount: number): Project {
  let serial = 0;
  const id = () => `stress-${layerCount}-${++serial}`;
  const pages = [];
  for (let remaining = layerCount; remaining > 0;) {
    const page = createTechnoArtboard(id);
    page.id = id();
    page.name = `AFTERHOURS ${pages.length + 1}`;
    page.layers = page.layers.slice(0, Math.min(remaining, page.layers.length));
    remaining -= page.layers.length;
    pages.push(page);
  }
  const candidates = pages.map((page) =>
    page.layers.filter(
      (layer) => layer.kind !== "group" && layer.width >= 24 && layer.height >= 24,
    ),
  );
  const types = Object.values(EFFECT_CATALOG)
    .filter((effect) => !effect.source)
    .map((effect) => effect.type) as EffectType[];
  let existing = pages.reduce(
    (count, page) => count + page.layers.reduce((sum, layer) => sum + layer.effects.length, 0),
    0,
  );
  if (existing > effectCount)
    throw new Error("Requested effect count is below the original artwork's effect count.");
  for (let index = 0; existing < effectCount; index++, existing++) {
    const type = types[index % types.length]!,
      effect = createEffect(type, { id: id(), opacity: 0.4 + (index % 6) * 0.1 });
    for (const parameter of EFFECT_CATALOG[type].parameters) {
      let value: unknown;
      if (parameter.kind === "number") {
        const fraction = 0.2 + (index % 7) * 0.1;
        const raw = parameter.min + (parameter.max - parameter.min) * fraction;
        value = parameter.integer
          ? Math.round(raw)
          : Number((Math.round(raw / parameter.step) * parameter.step).toPrecision(10));
        value = Math.max(parameter.min, Math.min(parameter.max, value as number));
      } else if (parameter.kind === "boolean") value = index % 2 === 0;
      else if (parameter.kind === "select")
        value = parameter.options[index % parameter.options.length]!.value;
      else value = ["#d5ff46", "#31e6d7", "#5731c8", "#f2f5f1"][index % 4];
      const target = parameter.scope === "settings" ? (effect.settings ??= {}) : effect;
      (target as unknown as Record<string, unknown>)[parameter.key] = value;
    }
    // Spread stacks across the project and across substantial painted content.
    const owners = candidates[index % candidates.length]!;
    const owner = owners[Math.floor(index / candidates.length) % owners.length] as Layer;
    owner.effects.push(effect);
  }
  return parseProject(
    JSON.stringify(
      createProject({
        id: `stress-project-${layerCount}-${effectCount}`,
        name: `${layerCount} layers / ${effectCount} effects`,
        pages,
      }),
    ),
  );
}
