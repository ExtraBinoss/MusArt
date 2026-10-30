/** Serializable animation values; structural document edits are not keyframe values. */
export type MotionValue = number | string | boolean;

export type LayerMotionProperty =
  | "x"
  | "y"
  | "width"
  | "height"
  | "rotation"
  | "scaleX"
  | "scaleY"
  | "opacity"
  | "visible"
  | "fill"
  | "stroke"
  | "strokeWidth"
  | "radius"
  | "blendMode"
  | "text"
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "lineHeight"
  | "letterSpacing"
  | "textAlign"
  | "fillGradient.angle"
  | "fillGradient.kind";

export type EffectMotionProperty =
  | "enabled"
  | "amount"
  | "scale"
  | "levels"
  | "color"
  | "seed"
  | "blendMode"
  | "opacity"
  | "composite"
  | "time";

export type MotionPropertyTarget =
  | { readonly kind: "layer"; readonly layerId: string; readonly property: LayerMotionProperty }
  | {
      readonly kind: "effect";
      readonly layerId: string;
      readonly effectId: string;
      readonly property: EffectMotionProperty;
    }
  | {
      readonly kind: "effectSetting";
      readonly layerId: string;
      readonly effectId: string;
      /** Resolved against this effect's own definition, never an arbitrary object path. */
      readonly property: string;
    };

/** Metadata only: no closures, clocks, browser handles or mutable document references. */
interface MotionPropertyBase {
  readonly target: MotionPropertyTarget;
  readonly interpolation: "continuous" | "hold";
}

export type MotionPropertyDescriptor = MotionPropertyBase &
  (
    | {
        readonly kind: "number" | "integer";
        readonly value: number;
        readonly min: number;
        readonly max: number;
      }
    | {
        readonly kind: "color";
        readonly value: string;
        /** Effect colors currently accept RGB6 only; layer paints also accept alpha/transparent. */
        readonly format: "rgb" | "rgba";
      }
    | { readonly kind: "boolean"; readonly value: boolean }
    | { readonly kind: "choice"; readonly value: string; readonly options: readonly string[] }
    | {
        readonly kind: "string";
        readonly value: string;
        readonly minLength: number;
        readonly maxLength: number;
      }
  );

type WithoutCurrentValue<T> = T extends unknown ? Omit<T, "value" | "target"> : never;
export type MotionPropertySchema = WithoutCurrentValue<MotionPropertyDescriptor>;

export interface EffectMotionCapability {
  readonly kind: "effect" | "effectSetting";
  readonly property: string;
  readonly status: "animatable" | "macro";
  readonly reason?: string;
}
