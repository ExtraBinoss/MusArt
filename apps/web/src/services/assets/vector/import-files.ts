import { createLayer, type EnginePort } from "@musart/core";
import { importSvg } from "./import-svg";

export class VectorImportError extends Error {
  constructor(
    readonly code: "tooMany" | "tooLarge" | "invalid" | "stale" | "read",
    readonly fileName = "",
    cause?: unknown,
  ) {
    super(`Vector import failed: ${code}${fileName ? ` (${fileName})` : ""}.`, { cause });
    this.name = "VectorImportError";
  }
}
/** Prepare vetted portable paths before one atomic command; original SVG never enters the DOM. */
export async function importVectorFiles(engine: EnginePort, files: readonly File[]): Promise<void> {
  if (!files.length) return;
  if (files.length > 32) throw new VectorImportError("tooMany");
  const snapshot = engine.getSnapshot();
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const layers = [];
  for (const [index, file] of files.entries()) {
    if (file.size > 256000) throw new VectorImportError("tooLarge", file.name);
    let source: string;
    try {
      source = await file.text();
    } catch (cause) {
      throw new VectorImportError("read", file.name, cause);
    }
    let vector;
    try {
      vector = importSvg(source, file.name);
    } catch (cause) {
      throw new VectorImportError("invalid", file.name, cause);
    }
    const [, , width, height] = vector.viewBox.split(/\s+/).map(Number) as [
      number,
      number,
      number,
      number,
    ];
    const scale = Math.min(1, (page.width * 0.6) / width, (page.height * 0.6) / height);
    const layerWidth = width * scale,
      layerHeight = height * scale,
      offset = (index % 5) * 16;
    layers.push(
      createLayer("vector", {
        id: vector.id,
        name: vector.name,
        width: layerWidth,
        height: layerHeight,
        x: Math.min(page.width - layerWidth, (page.width - layerWidth) / 2 + offset),
        y: Math.min(page.height - layerHeight, (page.height - layerHeight) / 2 + offset),
        vector: {
          viewBox: vector.viewBox,
          path: vector.path,
          parts: vector.parts,
          attribution: vector.attribution,
          preserveColors: true,
        },
      }),
    );
  }
  const current = engine.getSnapshot();
  if (
    current.project.id !== snapshot.project.id ||
    current.pageId !== snapshot.pageId ||
    current.revision !== snapshot.revision
  )
    throw new VectorImportError("stale");
  engine.execute({ type: "addLayers", layers });
  engine.select(layers.map((layer) => layer.id));
}
