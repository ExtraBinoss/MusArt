/** GPU editing is RGB; managed still output uses a native ICC encoder. Legacy proof stays generic. */
export const RENDER_CAPABILITIES = Object.freeze({
  rasterFormats: Object.freeze(["png", "jpeg", "webp"] as const),
  outputColorSpace: "srgb" as const,
  documentColorSpaces: Object.freeze(["srgb", "display-p3", "cmyk", "cmyk-proof"] as const),
  nativeCmykExport: true,
  iccProfileProof: true,
  p3Preview: "Converted to the sRGB display/output gamut",
  cmykProof: "Generic UCR / 280% TAC / 8% dot gain / warm paper; not an ICC press profile",
});
