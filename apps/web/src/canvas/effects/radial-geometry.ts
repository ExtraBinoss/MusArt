import {
  createLayerGeometryIndex,
  getEffectDefinition,
  getEffectParameter,
  invertMatrix,
  patchEffectParameter,
  transformPoint,
  type Composition,
  type Effect,
  type Layer,
} from "@musart/core";

export type RadialHandle = "center" | "radius" | "innerRadius";
/** Authoring geometry, independent from renderer density and viewport scale. */
export function radialGeometry(page: Composition, layer: Layer, effect: Effect) {
  const gizmo = getEffectDefinition(effect.type).gizmo;
  if (!gizmo) return null;
  const definition = getEffectDefinition(effect.type);
  const value = (key: string) =>
    Number(
      getEffectParameter(
        effect,
        definition.parameters.find((p) => p.key === key)!,
      ),
    );
  const unit = gizmo.radiusUnits === "relative-min" ? Math.min(layer.width, layer.height) : 1;
  return {
    x: value(gizmo.centerX) * layer.width,
    y: value(gizmo.centerY) * layer.height,
    radius: value(gizmo.radius) * unit,
    innerRadius: gizmo.innerRadius ? value(gizmo.innerRadius) * unit : null,
    aspect: gizmo.aspect ? value(gizmo.aspect) : 1,
    rotation: gizmo.rotation ? value(gizmo.rotation) : 0,
    matrix: createLayerGeometryIndex(page).worldMatrix(layer.id),
  };
}

export function moveRadialHandle(
  page: Composition,
  layer: Layer,
  effect: Effect,
  handle: RadialHandle,
  point: { x: number; y: number },
): Effect {
  const definition = getEffectDefinition(effect.type),
    gizmo = definition.gizmo;
  const geometry = radialGeometry(page, layer, effect);
  if (!gizmo || !geometry) return effect;
  const local = transformPoint(invertMatrix(geometry.matrix), point);
  let next = effect;
  const set = (key: string, value: number) => {
    const parameter = definition.parameters.find((p) => p.key === key);
    if (parameter?.kind !== "number") return;
    const clamped = Math.max(parameter.min, Math.min(parameter.max, value));
    next = {
      ...next,
      ...patchEffectParameter(next, parameter, parameter.integer ? Math.round(clamped) : clamped),
    };
  };
  if (handle === "center") {
    set(gizmo.centerX, local.x / layer.width);
    set(gizmo.centerY, local.y / layer.height);
  } else {
    const angle = (geometry.rotation * Math.PI) / 180;
    const dx = local.x - geometry.x,
      dy = local.y - geometry.y;
    const x = (dx * Math.cos(angle) + dy * Math.sin(angle)) / geometry.aspect;
    const y = dy * Math.cos(angle) - dx * Math.sin(angle);
    const distance = Math.hypot(x, y);
    const unit = gizmo.radiusUnits === "relative-min" ? Math.min(layer.width, layer.height) : 1;
    const key = handle === "innerRadius" ? gizmo.innerRadius : gizmo.radius;
    if (key)
      set(
        key,
        (handle === "innerRadius"
          ? Math.min(distance, geometry.radius)
          : Math.max(distance, geometry.innerRadius ?? 0)) / unit,
      );
  }
  return next;
}
