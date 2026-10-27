/** Output encoders remain RGB; the CMYK preview is an explicitly generic print simulation. */
export const RENDER_CAPABILITIES = Object.freeze({
  rasterFormats: Object.freeze(["png", "jpeg", "webp"] as const),
  outputColorSpace: "srgb" as const,
  documentColorSpaces: Object.freeze(["srgb", "display-p3", "cmyk-proof"] as const),
  nativeCmykExport: false,
  iccProfileProof: false,
  p3Preview: "Converted to the sRGB display/output gamut",
  cmykProof: "Generic UCR / 280% TAC / 8% dot gain / warm paper; not an ICC press profile",
});
