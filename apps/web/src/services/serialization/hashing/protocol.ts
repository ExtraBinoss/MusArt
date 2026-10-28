import type { Composition, ReplayState } from "@musart/core";

export type ThumbnailHashJob = {
  kind: "thumbnail";
  page: Composition;
  sources: readonly (readonly [string, string])[];
};
export type CanonicalHashJob = { kind: "history"; state: ReplayState } | ThumbnailHashJob;
export type HashRequest =
  | { type: "hash"; id: number; job: CanonicalHashJob }
  | { type: "cancel"; id: number };
export type HashResponse = { id: number; value: string } | { id: number; error: string };

export function isHashResponse(value: unknown): value is HashResponse {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(message.id) &&
    Number(message.id) > 0 &&
    ((typeof message.value === "string" && /^[a-f0-9]{64}$/.test(message.value)) ||
      typeof message.error === "string")
  );
}
