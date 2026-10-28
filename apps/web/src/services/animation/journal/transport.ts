import type {
  CanonicalOrigin,
  CanonicalPresentation,
} from "../../../state/session/canonical-presentation";
import { PaintYield } from "../paint-yield";
import { fragmentValue, FragmentBudgetError } from "../../serialization/fragments/encode";
import type { JournalAction, JournalFrame, JournalResult, JournalWorkerPort } from "./model";
import { journalFailure, journalResponse, JournalTransportError } from "./protocol";
import { yieldFragmentTask } from "../../serialization/fragments/task-yield";

export interface JournalTransportOptions {
  worker?: () => JournalWorkerPort;
  yieldTask?: (signal: AbortSignal, foreground?: boolean) => Promise<void>;
  timeout?: number;
}

/** One in-flight DTO, sent in bounded tasks. The owner supplies FIFO admission. */
export class JournalTransport {
  private worker: JournalWorkerPort | null = null;
  private sequence = 0;
  private active: { fail: (error: Error) => void; abort: AbortController } | null = null;
  private closed = false;
  private drains = 0;
  private readonly paint: PaintYield;
  constructor(
    private readonly presentation: CanonicalPresentation,
    private readonly options: JournalTransportOptions = {},
  ) {
    this.paint = new PaintYield(presentation);
  }
  drain(): () => void {
    this.drains++;
    this.paint.release();
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.drains--;
      }
    };
  }
  private reset() {
    const worker = this.worker;
    this.worker = null;
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
  }
  async run(database: string, action: JournalAction, frame: JournalFrame): Promise<JournalResult> {
    if (this.closed) throw new JournalTransportError("Journal transport is disposed.");
    if (this.active)
      throw new JournalTransportError("Journal transport already has an active frame.");
    const id = ++this.sequence;
    try {
      this.worker ??=
        this.options.worker?.() ??
        new Worker(new URL("./journal.worker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      throw new JournalTransportError(
        error instanceof Error ? error.message : "Cannot start journal worker.",
      );
    }
    const worker = this.worker,
      abort = new AbortController();
    let finish!: (result: JournalResult) => void, fail!: (error: Error) => void;
    const response = new Promise<JournalResult>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    // A worker can fail during chunk production, before the response is awaited.
    void response.catch(() => {});
    let settled = false,
      remoteFailure = false,
      finished = false;
    const reject = (error: Error) => {
      if (settled) return;
      settled = true;
      const failure =
        error instanceof JournalTransportError && finished
          ? new JournalTransportError(error.message, true)
          : error;
      abort.abort(failure);
      this.paint.release();
      fail(failure);
    };
    this.active = { fail: reject, abort };
    worker.onmessage = (event) => {
      try {
        const reply = journalResponse(event.data, id);
        if ("error" in reply) {
          remoteFailure = true;
          reject(journalFailure(reply.error));
          return;
        }
        if (!settled) {
          settled = true;
          finish(reply.result);
        }
      } catch (error) {
        reject(
          error instanceof Error ? error : new JournalTransportError("Invalid journal reply."),
        );
      }
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      reject(new JournalTransportError(event.message || "Journal worker failed."));
    };
    worker.onmessageerror = () =>
      reject(new JournalTransportError("Journal worker message could not be decoded."));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const origin: CanonicalOrigin = { projectId: frame.state.id, revision: frame.revision };
    try {
      worker.postMessage({ type: "begin", id, database, action });
      let parts = 0;
      for (const part of fragmentValue(frame)) {
        do {
          await (this.options.yieldTask ?? yieldFragmentTask)(abort.signal, this.drains > 0);
          abort.signal.throwIfAborted();
        } while (
          !this.drains &&
          typeof navigator !== "undefined" &&
          (
            navigator as Navigator & {
              scheduling?: { isInputPending(options: { includeContinuous: boolean }): boolean };
            }
          ).scheduling?.isInputPending({ includeContinuous: true })
        );
        if (!this.drains && this.presentation.read().available && !this.presentation.ready(origin))
          await this.paint.wait(origin);
        abort.signal.throwIfAborted();
        worker.postMessage({ type: "part", id, part });
        parts++;
      }
      finished = true;
      worker.postMessage({ type: "finish", id, parts });
      // Time out missing acknowledgments, not a legitimate long interactive pause between chunks.
      timer = setTimeout(
        () => reject(new JournalTransportError("Journal worker timed out.")),
        this.options.timeout ?? 30000,
      );
      return await response;
    } catch (error) {
      const failure =
        remoteFailure || error instanceof FragmentBudgetError
          ? (error as Error)
          : error instanceof JournalTransportError
            ? error
            : new JournalTransportError(
                error &&
                  typeof error === "object" &&
                  "message" in error &&
                  typeof error.message === "string"
                  ? error.message
                  : "Journal transport failed.",
              );
      const finalFailure =
        !remoteFailure && finished && failure instanceof JournalTransportError && !failure.uncertain
          ? new JournalTransportError(failure.message, true)
          : failure;
      reject(finalFailure);
      // A rejected partial frame may still have orphan fragment replies queued on this port.
      if (!remoteFailure || !finished) this.reset();
      throw finalFailure;
    } finally {
      clearTimeout(timer);
      this.active = null;
      if (this.worker === worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
      }
    }
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.active?.fail(new JournalTransportError("Journal transport is disposed."));
    this.paint.release();
    this.reset();
  }
}
