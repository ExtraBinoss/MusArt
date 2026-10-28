import { computeCanonicalHash } from "./compute";
import { logicalBytes } from "../../projects/logical-bytes";
import { FragmentAssembly } from "../fragments/assembly";
import type { CanonicalHashJob, HashRequest, HashResponse } from "./protocol";

/** Worker-local FIFO: messages already contain native structured-clone snapshots. */
export function createHashProcessor(
  reply: (response: HashResponse) => void,
  compute: (job: CanonicalHashJob) => Promise<string> = computeCanonicalHash,
) {
  const queue: Extract<HashRequest, { type: "hash" }>[] = [];
  const assembling = new Map<number, { value: FragmentAssembly; parts: number }>();
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
          : {
              id: request.id,
              value,
              ...(request.job.kind === "thumbnail"
                ? { pageBytes: logicalBytes(request.job.page) }
                : {}),
            },
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
      if (assembling.delete(request.id)) {
        reply({ id: request.id, error: "Hash cancelled." });
        return;
      }
      if (active?.id === request.id) active.cancelled = true;
      const index = queue.findIndex((entry) => entry.id === request.id);
      if (index >= 0) {
        queue.splice(index, 1);
        reply({ id: request.id, error: "Hash cancelled." });
      }
      return;
    }
    if (request.type === "hash-part" || request.type === "finish-hash") {
      const frame = assembling.get(request.id);
      try {
        if (!frame) throw new Error("Unknown canonical hash frame.");
        if (request.type === "hash-part") {
          frame.value.add(request.part);
          frame.parts++;
          return;
        }
        if (!Number.isSafeInteger(request.parts) || request.parts !== frame.parts)
          throw new Error("Incomplete canonical hash frame.");
        const job = frame.value.finish() as CanonicalHashJob;
        assembling.delete(request.id);
        queue.push({ type: "hash", id: request.id, job });
        void drain();
      } catch (error) {
        assembling.delete(request.id);
        reply({
          id: request.id,
          error: error instanceof Error ? error.message : "Invalid canonical hash frame.",
        });
      }
      return;
    }
    if (queue.length + assembling.size + Number(Boolean(active)) >= 8) {
      reply({ id: request.id, error: "Hash queue is full." });
      return;
    }
    if (request.type === "begin-hash") {
      if (
        assembling.has(request.id) ||
        active?.id === request.id ||
        queue.some(({ id }) => id === request.id)
      ) {
        reply({ id: request.id, error: "Duplicate canonical hash frame." });
        return;
      }
      assembling.set(request.id, { value: new FragmentAssembly(), parts: 0 });
      return;
    }
    queue.push(request);
    void drain();
  };
}

const process = createHashProcessor((response) => globalThis.postMessage(response));
globalThis.onmessage = (event: MessageEvent<HashRequest>) => process(event.data);
