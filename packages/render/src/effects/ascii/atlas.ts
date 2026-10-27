import { CanvasTexture, NearestFilter, NoColorSpace } from "three/webgpu";

/** One immutable upload used by every ASCII pass; no rasterized effect results. */
export function createGlyphAtlas(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 16 * 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Création de l’atlas ASCII impossible.");
  context.fillStyle = "#000000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = "bold 15px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  Array.from(" .,:;+tfLCG08M@#").forEach((glyph, index) =>
    context.fillText(glyph, index * 16 + 8, 8),
  );
  const atlas = new CanvasTexture(canvas);
  atlas.colorSpace = NoColorSpace;
  atlas.minFilter = NearestFilter;
  atlas.magFilter = NearestFilter;
  atlas.generateMipmaps = false;
  return atlas;
}
