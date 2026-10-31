export interface PrintExportOptions {
  dpi: number;
  bleedMm: number;
  cropMarks: boolean;
  registrationMarks: boolean;
  colorBars: boolean;
  pageInfo: boolean;
}
export interface ManagedImageOptions {
  format: "png" | "jpeg" | "webp" | "pdf" | "tiff";
  colorMode: "srgb" | "cmyk";
  quality: number;
  print: PrintExportOptions;
}
