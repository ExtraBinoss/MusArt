import type { MorphPoint, ShapeMorph } from "@musart/core";
import { brand } from "../../../../ui/brand/config";
import { SHAPE_BY_ID } from "../../../../ui/brand/engine/skins";

/** The shared mascot's actual radial profile, authored once as native editable contour states. */
export function meltMascotMorph(): ShapeMorph {
  const radii = SHAPE_BY_ID.get(brand.mascot.shape)!.radii;
  const frames = Array.from({ length: 9 }, (_, index) => {
    const at = index / 8;
    const pulse = index === 8 ? 0 : Math.sin(at * Math.PI * 2);
    const points: MorphPoint[] = radii.map((r, i) => {
      const angle = (i / radii.length) * Math.PI * 2;
      return [
        0.5 + 0.38 * r * Math.cos(angle) * (1 + 0.13 * pulse),
        0.5 +
          0.38 * r * Math.sin(angle) * (1 - 0.12 * pulse) +
          0.035 * pulse * Math.sin(angle) ** 2,
      ];
    });
    return {
      at,
      box: [0, 0, 1, 1] as [number, number, number, number],
      contours: [{ hole: false, points }],
      easing: "linear" as const,
    };
  });
  return { version: 1, shapes: [{ frames }] };
}
