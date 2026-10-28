import type { Composition, ReplayState } from "@musart/core";
import type { FragmentPart } from "../fragments/model";

export type ThumbnailHashJob = {
  kind: "thumbnail";
  page: Composition;
  sources: readonly (readonly [string, string])[];
};
export type CanonicalHashJob = { kind: "history"; state: ReplayState } | ThumbnailHashJob;
export type HashRequest =
  | { type: "hash"; id: number; job: CanonicalHashJob }
  | { type: "begin-hash"; id: number }
  | { type: "hash-part"; id: number; part: FragmentPart }
  | { type: "finish-hash"; id: number; parts: number }
  | { type: "cancel"; id: number };
export type HashResponse =
  | { id: number; value: string; pageBytes?: number }
  | { id: number; error: string };

export function isHashResponse(value: unknown): value is HashResponse {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(message.id) &&
    Number(message.id) > 0 &&
    ((typeof message.value === "string" &&
      /^[a-f0-9]{64}$/.test(message.value) &&
      (message.pageBytes === undefined ||
        (Number.isSafeInteger(message.pageBytes) && Number(message.pageBytes) >= 2))) ||
      typeof message.error === "string")
  );
}
