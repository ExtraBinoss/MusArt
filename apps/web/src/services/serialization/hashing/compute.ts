import { fingerprintState } from "../../history/fingerprint";
import { canonicalJson } from "../canonical-json";
import type { CanonicalHashJob, ThumbnailHashJob } from "./protocol";

/** Exact existing thumbnail schema: editing-only metadata never invalidates rendered pixels. */
export function thumbnailPaintMetadata({ page, sources }: ThumbnailHashJob) {
  const layers = page.layers.map((layer) => {
    const {
      name: _name,
      locked: _locked,
      guides: _guides,
      margin: _margin,
      padding: _padding,
      ...paint
    } = layer;
    return {
      ...paint,
      effects: layer.effects.map(({ id: _id, ...effect }) => effect),
      ...(layer.vector ? { vector: { ...layer.vector, attribution: undefined } } : {}),
    };
  });
  return {
    version: "gpu-webp-768-88-v1",
    width: page.width,
    height: page.height,
    background: page.background,
    colorSpace: page.colorSpace ?? "srgb",
    layers,
    sources,
  };
}

/** Shared by the module worker and the explicit no-Worker compatibility path. */
export async function computeCanonicalHash(job: CanonicalHashJob): Promise<string> {
  if (job.kind === "history") return fingerprintState(job.state);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(thumbnailPaintMetadata(job))),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
