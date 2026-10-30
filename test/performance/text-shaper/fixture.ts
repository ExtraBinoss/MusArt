import { createLayer, createPage, createProject } from "@musart/core";

export const TEXT_SHAPER_FAMILIES = [
  ["Inter", 800],
  ["Tinos", 400],
  ["Space Grotesk", 600],
  ["Roboto Mono", 400],
  ["Manrope", 500],
  ["DM Sans", 600],
  ["Lora", 500],
  ["Playfair Display", 500],
  ["Caveat", 600],
  ["Arimo", 500],
] as const;
export const TEXT_SHAPER_WIDTH = 1600;
export const TEXT_SHAPER_HEIGHT = 1500;

/** Ten bundled families in fifteen-layer runs, avoiding artificial idle-LRU churn. */
export function textShaperProject() {
  const layers = TEXT_SHAPER_FAMILIES.flatMap(([fontFamily, fontWeight], family) =>
    Array.from({ length: 15 }, (_, copy) => {
      const index = family * 15 + copy;
      return createLayer("text", {
        id: `shaper-text-${index}`,
        name: `${fontFamily} ${copy + 1}`,
        x: (index % 10) * 160 + 8,
        y: Math.floor(index / 10) * 100 + 6,
        width: 144,
        height: 88,
        fontFamily,
        fontWeight,
        fontSize: 19,
        lineHeight: 1.2,
        letterSpacing: copy % 3 === 0 ? -0.3 : 0,
        textAlign: copy % 3 === 0 ? "center" : copy % 3 === 1 ? "left" : "right",
        text: `Créez café ${copy + 1}\nAV office fi\nMuseArt déjà`,
        opacity: copy % 5 === 0 ? 0.7 : 1,
        fill: copy % 4 ? "#192027" : "#5731c8",
        ...(copy % 5 === 0
          ? {
              fillGradient: {
                kind: "linear" as const,
                angle: 25,
                stops: [
                  { offset: 0, color: "#5731c8" },
                  { offset: 1, color: "#007e87" },
                ],
              },
            }
          : {}),
      });
    }),
  );
  return createProject({
    id: "text-shaper-150-ten-fonts",
    name: "150 editable texts / 10 bundled fonts",
    pages: [
      createPage({
        id: "text-shaper-page",
        name: "Typography",
        width: TEXT_SHAPER_WIDTH,
        height: TEXT_SHAPER_HEIGHT,
        background: "#ffffff",
        layers,
      }),
    ],
  });
}

export const TEXT_SHAPER_WARM_IDS = Array.from(
  { length: 15 },
  (_, index) => `shaper-text-${135 + index}`,
);
export const TEXT_SHAPER_WARM_TEXT = "Édition fluide\nAV affine ffi\nCafé déjà 42";
