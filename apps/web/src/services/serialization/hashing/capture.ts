import { isPublishedComposition } from "@musart/core";
import type { CanonicalHashJob } from "./protocol";

/** Preserve call-time values while allowing certified engine pages to be streamed lazily. */
export function captureHashJob(job: CanonicalHashJob): CanonicalHashJob {
  if (job.kind === "history") return structuredClone(job);
  return {
    kind: "thumbnail",
    page: isPublishedComposition(job.page) ? job.page : structuredClone(job.page),
    sources: structuredClone(job.sources),
  };
}
