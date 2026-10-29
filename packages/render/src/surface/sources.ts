import { isVideoAsset, type Asset } from "@musart/core";

const images = new Map<string, Promise<HTMLImageElement>>();

export function createSurface(width: number, height: number): HTMLCanvasElement {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Dimensions de rendu invalides.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: false });
  if (!context) throw new Error("Le rendu Canvas 2D est indisponible.");
  return context;
}

export function loadAsset(asset: Asset): Promise<HTMLImageElement> {
  if (isVideoAsset(asset))
    return Promise.reject(Error("A video requires an explicit timed frame source."));
  const key = asset.id + ":" + asset.dataUrl;
  const existing = images.get(key);
  if (existing) return existing;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      images.delete(key);
      reject(new Error(`Image illisible : ${asset.name}`));
    };
    image.src = asset.dataUrl;
  });
  images.set(key, promise);
  if (images.size > 64) images.delete(images.keys().next().value!);
  return promise;
}

export async function sourcePixels(asset: Asset): Promise<ImageData> {
  const image = await loadAsset(asset);
  const canvas = createSurface(asset.width, asset.height);
  const context = context2d(canvas);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export function clearSourceCache(): void {
  images.clear();
}
