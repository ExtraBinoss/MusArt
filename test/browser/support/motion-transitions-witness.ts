import { createEffect, createLayer, createPage, type TransitionStyle } from "@musart/core";
import { createRenderSession } from "../../../packages/render/src/index";

function encode(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(Error("Native PNG encoding failed."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(Error("Native PNG encoding returned no data URL."));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    }, "image/png"),
  );
}
/** Actual Three.js graph; all inspection occurs later in a separate uninstrumented page. */
export async function renderTransitionCohort(
  styles: readonly TransitionStyle[],
  forceWebGL: boolean,
) {
  const original = createPage({
    width: 112,
    height: 80,
    background: "transparent",
    layers: [
      createLayer("group", { id: "stage", x: 8, y: 8, width: 96, height: 64 }),
      createLayer("rectangle", {
        id: "gradient",
        parentId: "stage",
        x: 0,
        y: 0,
        width: 96,
        height: 64,
        radius: 12,
        fillGradient: {
          kind: "linear",
          angle: 30,
          stops: [
            { offset: 0, color: "#e48470" },
            { offset: 1, color: "#758bb8" },
          ],
        },
      }),
      createLayer("ellipse", {
        id: "cream",
        parentId: "stage",
        x: 16,
        y: 16,
        width: 30,
        height: 30,
        fill: "#e8d9ad",
        opacity: 0.6,
      }),
      createLayer("rectangle", {
        id: "ink",
        parentId: "stage",
        x: 57,
        y: 12,
        width: 22,
        height: 40,
        fill: "#233b32",
        opacity: 0.8,
        rotation: 12,
      }),
    ],
  });
  const session = createRenderSession({ forceWebGL, maxBytes: 16 * 1024 * 1024 });
  const captured: { style: TransitionStyle; images: string[] }[] = [];
  try {
    const baseline = await session.withCanvasFrame(original, {}, encode);
    for (const style of styles) {
      const images: string[] = [];
      // Repeated interior sampling, reversed endpoints and no wall-clock dependency.
      for (const progress of [0.37, 1, 0, 0.37]) {
        const effect = createEffect("transition", {
          id: "transition",
          seed: 73,
          settings: { style, progress },
        });
        const composition = {
          ...original,
          layers: original.layers.map((layer) =>
            layer.id === "stage" ? { ...layer, effects: [effect] } : layer,
          ),
        };
        images.push(await session.withCanvasFrame(composition, {}, encode));
      }
      captured.push({ style, images });
    }
    const stats = session.stats();
    return {
      baseline,
      captured,
      stats,
      readbacks: window.__musartVideoReadbacks,
      userAgent: navigator.userAgent,
    };
  } finally {
    await session.dispose();
  }
}

/** Test-only decoded pixel inspection; never imported by the editor or renderer. */
export async function inspectTransitionCohort(
  input: Awaited<ReturnType<typeof renderTransitionCohort>>,
) {
  async function pixels(url: string) {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    try {
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    } finally {
      bitmap.close();
      canvas.width = canvas.height = 0;
    }
  }
  const base = await pixels(input.baseline),
    results = [];
  for (const { style, images } of input.captured) {
    const frames = await Promise.all(images.map(pixels));
    let endpointError = 0,
      repeatedError = 0,
      zeroAlpha = 0,
      interiorChange = 0,
      interiorAlpha = 0,
      expandedAlpha = 0;
    for (let i = 0; i < base.length; i++) {
      endpointError = Math.max(endpointError, Math.abs(base[i]! - frames[1]![i]!));
      repeatedError = Math.max(repeatedError, Math.abs(frames[0]![i]! - frames[3]![i]!));
      if (i % 4 === 3) {
        zeroAlpha += frames[2]![i]!;
        interiorAlpha += frames[0]![i]!;
        expandedAlpha = Math.max(expandedAlpha, frames[0]![i]! - base[i]!);
      }
      interiorChange += Math.abs(frames[0]![i]! - base[i]!);
    }
    results.push({
      style,
      endpointError,
      repeatedError,
      zeroAlpha,
      interiorChange,
      interiorAlpha,
      expandedAlpha,
    });
  }
  return results;
}
