import { fragmentValue } from "../fragments/encode";
import { yieldFragmentTask } from "../fragments/task-yield";
import type { CanonicalHashJob, HashRequest } from "./protocol";

/** One bounded clone per task; originals are not part of thumbnail metadata jobs. */
export async function sendHashFragments(
  port: { postMessage(message: HashRequest): void },
  id: number,
  job: CanonicalHashJob,
  signal: AbortSignal,
  isCurrent: () => boolean,
  yieldTask: (signal: AbortSignal) => Promise<void> = yieldFragmentTask,
): Promise<void> {
  let parts = 0;
  for (const part of fragmentValue(job)) {
    await yieldTask(signal);
    signal.throwIfAborted();
    if (!isCurrent()) throw new DOMException("Canonical hash request is stale.", "AbortError");
    port.postMessage({ type: "hash-part", id, part });
    parts++;
  }
  signal.throwIfAborted();
  if (!isCurrent()) throw new DOMException("Canonical hash request is stale.", "AbortError");
  port.postMessage({ type: "finish-hash", id, parts });
}
