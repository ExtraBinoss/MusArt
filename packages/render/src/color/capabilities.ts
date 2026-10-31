/** CMYK documents use an ICC GPU display proof and a native CMYK encoder. Legacy proof stays generic. */
export const RENDER_CAPABILITIES = Object.freeze({
  rasterFormats: Object.freeze(["png", "jpeg", "webp"] as const),
  outputColorSpace: "srgb" as const,
  documentColorSpaces: Object.freeze(["srgb", "display-p3", "cmyk", "cmyk-proof"] as const),
  nativeCmykExport: true,
  iccProfileProof: true,
  cmykCanvasProof: "CGATS21 CRPC6 / Perceptual / sRGB display / white paper",
  p3Preview: "Converted to the sRGB display/output gamut",
  cmykProof: "Generic UCR / 280% TAC / 8% dot gain / warm paper; not an ICC press profile",
});
