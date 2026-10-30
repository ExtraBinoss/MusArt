import { BotEngine } from "../../../../src/ui/brand/engine/engine";
import { SHAPE_BY_ID } from "../../../../src/ui/brand/engine/skins";
import { EXPRESSION_BY_ID } from "../../../../src/ui/brand/engine/expressions";
import { DEFAULT_EYE_GEOMETRY } from "../../../../src/ui/brand/engine/eye-geometry";
import type {
  EyeGeometry,
  EyeStyle,
  ExpressionId,
  ShapeId,
} from "../../../../src/ui/brand/engine/bot-types";
interface Look {
  shape: ShapeId;
  expression: ExpressionId;
  eyes: EyeStyle;
  eyeGeometry: EyeGeometry;
}
export function defaultPreset(): { look: Look } {
  return {
    look: {
      shape: "cercle",
      expression: "neutre",
      eyes: "capsule",
      eyeGeometry: { ...DEFAULT_EYE_GEOMETRY },
    },
  };
}
export function createMascotEngine(look: Look) {
  const engine = new BotEngine(
    100,
    "idle",
    SHAPE_BY_ID.get(look.shape)!.radii,
    EXPRESSION_BY_ID.get(look.expression)!,
  );
  engine.setEyes(look.eyes, -1);
  engine.setEyeGeometry(look.eyeGeometry);
  return engine;
}
