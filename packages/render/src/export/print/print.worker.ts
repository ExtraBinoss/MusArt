import { createPrintPreview } from "./preview-svg";
import {
  AlphaAction,
  ColorProfile,
  ColorSpace,
  Density,
  DensityUnit,
  ImageMagick,
  initializeImageMagick,
  MagickColors,
  MagickFormat,
  RenderingIntent,
  ResourceLimits,
} from "@imagemagick/magick-wasm";
import wasmUrl from "@imagemagick/magick-wasm/magick.wasm?url";
import rgbUrl from "../../../assets/profiles/sRGB-v4.icc?url";
import cmykUrl from "../../../assets/profiles/CGATS21_CRPC6.icc?url";
import type { PrintEncodingRequest } from "./encode";
import { createPrintPdf } from "./pdf";
import { validatePrint } from "./layout";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PrintEncodingRequest>) => void) | null;
  postMessage: (message: { blob?: Blob; error?: string }) => void;
};
async function bytes(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The color profile could not be loaded.");
  return new Uint8Array(await response.arrayBuffer());
}
async function encode(event: MessageEvent<PrintEncodingRequest>) {
  try {
    const { blob, options, width, height, name, creator, proof } = event.data;
    validatePrint(options.print);
    if (
      !["png", "jpeg", "webp", "pdf", "tiff"].includes(options.format) ||
      !["srgb", "cmyk"].includes(options.colorMode) ||
      !Number.isFinite(options.quality) ||
      options.quality < 0 ||
      options.quality > 1 ||
      (options.colorMode === "cmyk" && ["png", "webp"].includes(options.format))
    )
      throw new Error("Invalid managed image format or color settings.");
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      blob.size > 128 * 1024 * 1024 ||
      width * height > 32_000_000
    )
      throw new Error("Print output exceeds the 32 megapixel / 128 MiB encoding limit.");
    const [rgb, cmyk] = await Promise.all([
      bytes(rgbUrl),
      bytes(cmykUrl),
      initializeImageMagick(new URL(wasmUrl, import.meta.url)),
    ]);
    ResourceLimits.memory = 512n * 1024n * 1024n;
    ResourceLimits.disk = 0n;
    ResourceLimits.width = 32768n;
    ResourceLimits.height = 32768n;
    const input = new Uint8Array(await blob.arrayBuffer());
    const result = ImageMagick.read(input, (image) => {
      if (image.width * image.height > 32_000_000)
        throw new Error("Print output exceeds the 32 megapixel encoding limit.");
      image.density = new Density(options.print.dpi, DensityUnit.PixelsPerInch);
      image.quality = Math.round(options.quality * 100);
      image.renderingIntent = RenderingIntent.Perceptual;
      if (options.format === "pdf" || options.colorMode === "cmyk") {
        image.backgroundColor = MagickColors.White;
        image.alpha(AlphaAction.Remove);
      }
      if (options.colorMode === "cmyk") {
        if (
          !image.transformColorSpace(new ColorProfile(rgb), new ColorProfile(cmyk)) ||
          image.colorSpace !== ColorSpace.CMYK
        )
          throw new Error("ICC conversion to CMYK failed.");
      } else image.setProfile(new ColorProfile(rgb));
      if (proof) {
        if (options.colorMode === "cmyk" && !image.transformColorSpace(new ColorProfile(rgb)))
          throw new Error("ICC proof conversion failed.");
        return image.write(MagickFormat.Png, (data) => {
          const png = new Uint8Array(data);
          if (options.format !== "pdf") return new Blob([png], { type: "image/png" });
          const bleed = Math.ceil((options.print.bleedMm * options.print.dpi) / 25.4);
          return createPrintPreview(png, {
            width: width + 2 * bleed,
            height: height + 2 * bleed,
            trimWidth: width,
            trimHeight: height,
            name,
            creator,
            options,
          });
        });
      }
      const format =
        options.format === "pdf" || options.format === "jpeg"
          ? MagickFormat.Jpeg
          : options.format === "tiff"
            ? MagickFormat.Tiff
            : options.format === "webp"
              ? MagickFormat.WebP
              : MagickFormat.Png;
      if (options.format === "pdf") image.removeProfile("icc");
      return image.write(format, (data) => {
        const encoded = new Uint8Array(data);
        if (options.format === "pdf")
          return createPrintPdf(encoded, options.colorMode === "cmyk" ? cmyk : rgb, {
            width: image.width,
            height: image.height,
            trimWidth: width,
            trimHeight: height,
            name,
            creator,
            options,
          });
        return new Blob([encoded], { type: `image/${options.format}` });
      });
    });
    scope.postMessage({ blob: result });
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : "Print encoding failed." });
  }
}
scope.onmessage = (event) => {
  void encode(event);
};
