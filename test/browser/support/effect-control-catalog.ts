import {
  createEffect,
  getEffectDefinition,
  isEffectParameterVisible,
  type Effect,
  type EffectParameter,
  type EffectType,
} from "@musart/core";

export const parameterKey = (parameter: EffectParameter) =>
  `${parameter.scope ?? "root"}:${parameter.key}`;

/** Cover every registered field, including conditional treatments, without repeating whole forms. */
export function effectControlCases(type: EffectType) {
  const definition = getEffectDefinition(type);
  const base = createEffect(type, {
    id: `controls-${type}`,
    ...(type === "gradient" ? { settings: { preset: "custom", colorCount: 6 } } : {}),
  });
  const candidates = [base];
  for (const parameter of definition.parameters) {
    if (!parameter.visibleWhen) continue;
    const condition = definition.parameters.find(
      (field) => field.key === parameter.visibleWhen!.key,
    );
    for (const value of parameter.visibleWhen.values) {
      const next = condition?.kind === "number" ? Number(value) : value;
      candidates.push({
        ...base,
        settings: { ...base.settings, [parameter.visibleWhen.key]: next },
      });
    }
  }
  const remaining = new Set(definition.parameters.map(parameterKey));
  const result: { effect: Effect; fields: EffectParameter[] }[] = [];
  while (remaining.size) {
    const ranked = candidates
      .map((effect) => ({
        effect,
        fields: definition.parameters.filter(
          (field) => remaining.has(parameterKey(field)) && isEffectParameterVisible(effect, field),
        ),
      }))
      .sort((a, b) => b.fields.length - a.fields.length);
    const best = ranked[0]!;
    if (!best.fields.length)
      throw new Error(`Unreachable ${type} fields: ${[...remaining].join(", ")}`);
    result.push(best);
    for (const field of best.fields) remaining.delete(parameterKey(field));
  }
  return result;
}
