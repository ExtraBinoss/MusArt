import { computeCanonicalHash } from "./compute";
import type { CanonicalHashJob, HashRequest, HashResponse } from "./protocol";

/** Worker-local FIFO: messages already contain native structured-clone snapshots. */
export function createHashProcessor(
  reply: (response: HashResponse) => void,
  compute: (job: CanonicalHashJob) => Promise<string> = computeCanonicalHash,
) {
  const queue: Extract<HashRequest, { type: "hash" }>[] = [];
  let active: { id: number; cancelled: boolean } | undefined;
  async function drain() {
    if (active) return;
    const request = queue.shift();
    if (!request) return;
    const current = { id: request.id, cancelled: false };
    active = current;
    try {
      const value = await compute(request.job);
      reply(
        current.cancelled
          ? { id: request.id, error: "Hash cancelled." }
          : { id: request.id, value },
      );
    } catch (error) {
      reply({ id: request.id, error: error instanceof Error ? error.message : "Hash failed." });
    } finally {
      active = undefined;
      void drain();
    }
  }
  return (request: HashRequest) => {
    if (request.type === "cancel") {
      if (active?.id === request.id) active.cancelled = true;
      const index = queue.findIndex((entry) => entry.id === request.id);
      if (index >= 0) {
        queue.splice(index, 1);
        reply({ id: request.id, error: "Hash cancelled." });
      }
      return;
    }
    if (queue.length + Number(Boolean(active)) >= 8) {
      reply({ id: request.id, error: "Hash queue is full." });
      return;
    }
    queue.push(request);
    void drain();
  };
}

const process = createHashProcessor((response) => globalThis.postMessage(response));
globalThis.onmessage = (event: MessageEvent<HashRequest>) => process(event.data);
