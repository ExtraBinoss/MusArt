import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type ImageAsset,
} from "@musart/core";

export const BRAND_ART_SOURCES = [
  { id: "portrait", file: "portrait.jpg", mime: "image/jpeg", width: 736, height: 736 },
  { id: "eyes", file: "eyes.jpg", mime: "image/jpeg", width: 602, height: 803 },
  { id: "flower", file: "flower.jpg", mime: "image/jpeg", width: 831, height: 831 },
  { id: "chrome", file: "chrome.png", mime: "image/png", width: 736, height: 1104 },
] as const;
export type BrandArtSources = Record<(typeof BRAND_ART_SOURCES)[number]["id"], string>;

/** Portable artwork. Every image treatment uses Melt's native TSL composition/effect graph. */
export function createBrandComposition(sources: BrandArtSources) {
  const assets: ImageAsset[] = BRAND_ART_SOURCES.map(({ id, mime, width, height }) => ({
    id,
    name: `Artist study — ${id}`,
    mime,
    width,
    height,
    dataUrl: sources[id],
  }));
  const engine = new EditorEngine(
    createProject({
      id: "melt-social-art",
      name: "Melt — artist study",
      pages: [createPage({ id: "social-art", width: 640, height: 600, background: "#F1F0EC" })],
    }),
  );
  const image = (
    id: string,
    source: keyof BrandArtSources,
    x: number,
    y: number,
    width: number,
  ) => {
    const asset = assets.find((entry) => entry.id === source)!;
    return createLayer("image", {
      id,
      name: id,
      assetId: source,
      x,
      y,
      width,
      height: (width * asset.height) / asset.width,
    });
  };
  engine.execute({
    type: "addLayers",
    assets,
    layers: [
      {
        ...image("chrome-field", "chrome", 10, 20, 235),
        rotation: -13,
        opacity: 0.88,
        effects: [
          createEffect("bit-dither", {
            scale: 1,
            settings: { method: "bayer4", foreground: "#E9DFF4", background: "#6F5789" },
          }),
        ],
      },
      {
        ...image("lily", "flower", 412, 415, 175),
        rotation: -20,
        blendMode: "multiply",
        effects: [],
      },
      {
        ...image("bayer-portrait", "portrait", 178, 36, 400),
        rotation: 7,
        effects: [
          createEffect("bit-dither", {
            id: "social-bayer",
            scale: 2,
            settings: {
              method: "bayer4",
              foreground: "#21172B",
              background: "#C9B4FF",
              contrast: 1.1,
              gamma: 1.08,
            },
          }),
        ],
      },
      createLayer("rectangle", {
        id: "ascii-paper",
        x: 34,
        y: 267,
        width: 258,
        height: 342,
        rotation: -7,
        fill: "#2B1745",
      }),
      {
        ...image("ascii-eyes", "eyes", 38, 271, 250),
        rotation: -7,
        effects: [
          createEffect("brightness", { amount: 0.6 }),
          createEffect("ascii", { id: "social-ascii", scale: 7, color: false }),
          createEffect("invert"),
          createEffect("bit-dither", {
            scale: 1,
            settings: {
              method: "threshold",
              threshold: 0.82,
              foreground: "#2B1745",
              background: "#DDCBF0",
            },
          }),
        ],
      },
    ],
  });
  return engine.getSnapshot().project;
}
