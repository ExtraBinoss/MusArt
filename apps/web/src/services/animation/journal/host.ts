import { JournalProcessor } from "./processor";
import { FragmentAssembly } from "../../serialization/fragments/assembly";
import type {
  JournalAction,
  JournalFrame,
  JournalRequest,
  JournalResponse,
  JournalResult,
  JournalFailure,
} from "./model";
interface Processor {
  run(action: JournalAction, frame: JournalFrame): Promise<JournalResult>;
  dispose(): Promise<void>;
}
function failure(error: unknown): JournalFailure {
  const value =
    error && typeof error === "object"
      ? (error as { name?: unknown; message?: unknown; code?: unknown })
      : null;
  return {
    name: typeof value?.name === "string" ? value.name.slice(0, 128) : "Error",
    message: (typeof value?.message === "string"
      ? value.message
      : typeof error === "string"
        ? error
        : "Journal worker failed."
    ).slice(0, 4096),
    ...(typeof value?.code === "string" ? { code: value.code.slice(0, 128) } : {}),
  };
}
/** One admitted fragmented frame. Payloads never appear in acknowledgments or leave this worker. */
export function createJournalHost(
  post: (response: JournalResponse) => void,
  create: (database: string) => Processor = (database) => new JournalProcessor(database),
) {
  let active: {
      id: number;
      database: string;
      action: JournalAction;
      assembly: FragmentAssembly;
      parts: number;
    } | null = null,
    processor: Processor | null = null,
    database = "",
    busy = false,
    disposed = false,
    work: Promise<void> = Promise.resolve();
  const reject = (id: number, error: unknown) => post({ id, error: failure(error) });
  return {
    receive(value: unknown): void {
      const message = value as Partial<JournalRequest> | null;
      const id = message && Number.isSafeInteger(message.id) && message.id! > 0 ? message.id! : 0;
      if (disposed) {
        reject(id, Error("Journal host is disposed."));
        return;
      }
      try {
        if (!message || !id || typeof message !== "object") throw Error("Invalid journal message.");
        if (message.type === "begin") {
          if (active || busy) throw Error("A journal frame is already active.");
          if (
            typeof message.database !== "string" ||
            !message.database ||
            message.database.length > 256 ||
            !message.action ||
            !["ensure", "commit", "clear", "configure"].includes(message.action.kind)
          )
            throw Error("Invalid journal begin.");
          active = {
            id,
            database: message.database,
            action: message.action,
            assembly: new FragmentAssembly(),
            parts: 0,
          };
          return;
        }
        if (!active || active.id !== id || busy)
          throw Error("Unknown or unfinished journal frame.");
        if (message.type === "part") {
          active.assembly.add(message.part!);
          active.parts++;
          return;
        }
        if (
          message.type !== "finish" ||
          !Number.isSafeInteger(message.parts) ||
          message.parts !== active.parts
        )
          throw Error("Journal fragment count does not match.");
        const frame = active.assembly.finish() as JournalFrame,
          job = active;
        busy = true;
        work = (async () => {
          try {
            if (!processor || database !== job.database) {
              await processor?.dispose();
              processor = create(job.database);
              database = job.database;
            }
            const result = await processor.run(job.action, frame);
            if (!disposed) post({ id: job.id, result });
          } catch (error) {
            if (!disposed) reject(job.id, error);
          } finally {
            active = null;
            busy = false;
          }
        })();
      } catch (error) {
        if (active?.id === id && !busy) active = null;
        reject(id, error);
      }
    },
    async dispose() {
      disposed = true;
      active = null;
      await work;
      await processor?.dispose();
      processor = null;
    },
  };
}
