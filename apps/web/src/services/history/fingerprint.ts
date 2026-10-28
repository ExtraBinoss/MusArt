import type { ReplayState } from "@musart/core";
import { canonicalJson } from "../serialization/canonical-json";

/** Hash portable metadata, never original image bytes. Only used at durable commit boundaries. */
export async function fingerprintState(state: ReplayState): Promise<string> {
  const serialized = canonicalJson(state);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
