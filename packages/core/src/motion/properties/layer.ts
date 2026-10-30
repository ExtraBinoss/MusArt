import type { Layer } from "../../document/model";
import { BLEND_MODES } from "../../layers/blending/catalog";
import type { LayerMotionProperty, MotionPropertySchema } from "./model";

const number = (min: number, max: number): MotionPropertySchema => ({
  kind: "number",
  min,
  max,
  interpolation: "continuous",
});
const choice = (options: readonly string[]): MotionPropertySchema => ({
  kind: "choice",
  options: Object.freeze([...options]),
  interpolation: "hold",
});
const color: MotionPropertySchema = { kind: "color", format: "rgba", interpolation: "continuous" };
const schemas: Readonly<Record<LayerMotionProperty, MotionPropertySchema>> = Object.freeze({
  x: number(-1_000_000, 1_000_000),
  y: number(-1_000_000, 1_000_000),
  width: number(0.01, 32768),
  height: number(0.01, 32768),
  rotation: number(-360000, 360000),
  scaleX: number(0.001, 100),
  scaleY: number(0.001, 100),
  opacity: number(0, 1),
  visible: { kind: "boolean", interpolation: "hold" },
  fill: color,
  stroke: color,
  strokeWidth: number(0, 1024),
  radius: number(0, 32768),
  blendMode: choice(BLEND_MODES),
  text: { kind: "string", minLength: 0, maxLength: 1_000_000, interpolation: "hold" },
  fontFamily: { kind: "string", minLength: 1, maxLength: 256, interpolation: "hold" },
  fontSize: number(1, 4096),
  fontWeight: number(100, 1000),
  lineHeight: number(0.1, 10),
  letterSpacing: number(-1024, 1024),
  textAlign: choice(["left", "center", "right"]),
  "fillGradient.angle": number(-360000, 360000),
  "fillGradient.kind": choice(["linear", "radial"]),
});
const textProperties: ReadonlySet<string> = new Set([
  "text",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textAlign",
]);

export const LAYER_MOTION_PROPERTIES: readonly LayerMotionProperty[] = Object.freeze(
  Object.keys(schemas) as LayerMotionProperty[],
);

/** Kept visible to capability consumers rather than advertising unsafe structural animation. */
export const LAYER_MOTION_LIMITATIONS: Readonly<Record<string, string>> = Object.freeze({
  "fillGradient.stops":
    "Stops have no durable IDs; stop animation requires topology-aware addresses before it can be safe.",
  vector: "Path topology and source definitions are structural edits, not scalar animation values.",
  assetId: "Replacing a media source requires an atomic resource/identity command.",
  parentId: "Hierarchy changes require validated reparenting commands.",
  mask: "Mask relationships require validated dependency-graph commands.",
  locked: "Editor locking is presentation/authoring state, not animated content.",
});

/** Explicit nested paint targets are allowlisted; this is not an object-path resolver. */
export function layerMotionSchema(
  layer: Layer,
  property: LayerMotionProperty,
): MotionPropertySchema | null {
  if (!Object.hasOwn(schemas, property)) return null;
  if (textProperties.has(property) && layer.kind !== "text") return null;
  if (property === "radius" && layer.kind !== "rectangle") return null;
  if (
    (property === "fillGradient.angle" || property === "fillGradient.kind") &&
    !layer.fillGradient
  )
    return null;
  return schemas[property];
}

export function readLayerMotionValue(layer: Layer, property: LayerMotionProperty): unknown {
  if (property === "scaleX" || property === "scaleY") return layer[property] ?? 1;
  if (property === "fillGradient.angle") return layer.fillGradient?.angle;
  if (property === "fillGradient.kind") return layer.fillGradient?.kind;
  return Object.hasOwn(schemas, property) ? layer[property] : undefined;
}
