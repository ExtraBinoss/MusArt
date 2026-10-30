import { resolveEffectSettings, type Effect } from "@musart/core";
export function shadowFootprint(effect: Effect) {
  const settings = resolveEffectSettings(effect);
  const margin = Math.ceil(Number(settings.radius) * 3.2) + 1;
  const x = Number(settings.offsetX),
    y = Number(settings.offsetY);
  return {
    left: margin + Math.ceil(Math.max(0, -x)),
    right: margin + Math.ceil(Math.max(0, x)),
    top: margin + Math.ceil(Math.max(0, -y)),
    bottom: margin + Math.ceil(Math.max(0, y)),
  };
}
