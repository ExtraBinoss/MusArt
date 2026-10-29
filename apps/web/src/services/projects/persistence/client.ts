import type { IDBPDatabase } from "idb";
import type { StudioDatabase, StoredThumbnail, ThumbnailInfo } from "../database";
import type { ThumbnailRead } from "../thumbnails/model";
import { fragmentValue } from "../../serialization/fragments/encode";
import { yieldFragmentTask } from "../../serialization/fragments/task-yield";
import { persistProjectWrite } from "./transaction";
import { persistThumbnail } from "./thumbnail";
import { readThumbnailInfo, readThumbnails } from "./reads";
import {
  PersistenceUncertainError,
  persistenceFailure,
  persistenceResponse,
  persistenceResult,
} from "./protocol";
import type {
  ProjectWriteFrame,
  ProjectWriteResult,
  PersistenceResult,
  PersistenceWorkerPort,
} from "./model";
import type { StoredMediaOriginal } from "../media/model";
export interface PersistenceClientOptions {
  worker?: () => PersistenceWorkerPort | null;
  yieldTask?: (signal: AbortSignal, foreground: boolean) => Promise<void>;
  timeout?: number;
}
type PersistenceAction =
  | { kind: "save"; frame: ProjectWriteFrame; mediaOriginals: readonly StoredMediaOriginal[] }
  | { kind: "thumbnail"; record: StoredThumbnail }
  | { kind: "info"; projectId: string }
  | { kind: "thumbnails"; projectId: string; pageIds?: readonly string[]; allowStale?: boolean };
function checkedResult(
  result: PersistenceResult,
  action: PersistenceAction,
  projectId: string,
): PersistenceResult {
  const pageIds = action.kind === "thumbnails" ? action.pageIds : undefined;
  if (
    result.kind !== action.kind ||
    (result.kind === "save" && result.value.projectId !== projectId) ||
    ((result.kind === "info" || result.kind === "thumbnails") &&
      result.value.some((item) => item.projectId !== projectId)) ||
    (result.kind === "thumbnails" &&
      pageIds !== undefined &&
      result.value.some((item) => !pageIds.includes(item.pageId))) ||
    (result.kind === "thumbnails" &&
      action.kind === "thumbnails" &&
      !action.allowStale &&
      result.value.some((item) => item.stale))
  )
    throw Error("Mismatched project persistence response.");
  return result;
}
/** One lazily owned worker and bounded FIFO; accepted writes drain to their real transaction outcome. */
export class PersistenceClient {
  private worker: PersistenceWorkerPort | null | undefined;
  private sequence = 0;
  private pendingWrites = 0;
  private pendingReads = 0;
  private closed = false;
  private tail: Promise<unknown> = Promise.resolve();
  private disposal: Promise<void> | null = null;
  constructor(
    private readonly name: string,
    private readonly database: () => Promise<IDBPDatabase<StudioDatabase>>,
    private readonly options: PersistenceClientOptions = {},
  ) {}
  private enqueue<T>(task: () => Promise<T>, mutation = true): Promise<T> {
    if (this.closed) return Promise.reject(Error("Project persistence is disposed."));
    if (mutation ? this.pendingWrites >= 8 : this.pendingReads >= 128)
      return Promise.reject(Error("Project persistence queue is full."));
    if (mutation) this.pendingWrites++;
    else this.pendingReads++;
    const result = this.tail
      .catch(() => undefined)
      .then(task)
      .finally(() => {
        if (mutation) this.pendingWrites--;
        else this.pendingReads--;
      });
    this.tail = result;
    void result.catch(() => undefined);
    return result;
  }
  save(
    frame: ProjectWriteFrame,
    mediaOriginals: readonly StoredMediaOriginal[] = [],
  ): Promise<ProjectWriteResult> {
    return this.enqueue(async () => {
      const result = await this.perform({
        kind: "save",
        frame,
        mediaOriginals: [...mediaOriginals],
      });
      if (result.kind !== "save" || result.value.projectId !== frame.document.id)
        throw Error("Mismatched saved project response.");
      return result.value;
    });
  }
  thumbnail(record: StoredThumbnail): Promise<boolean> {
    const captured = { ...record };
    return this.enqueue(async () => {
      const result = await this.perform({ kind: "thumbnail", record: captured });
      if (result.kind !== "thumbnail") throw Error("Mismatched thumbnail response.");
      return result.value;
    });
  }
  info(projectId: string): Promise<ThumbnailInfo[]> {
    return this.enqueue(async () => {
      const result = await this.perform({ kind: "info", projectId });
      if (result.kind !== "info" || result.value.some((item) => item.projectId !== projectId))
        throw Error("Mismatched thumbnail header response.");
      return result.value;
    }, false);
  }
  thumbnails(
    projectId: string,
    pageIds?: readonly string[],
    allowStale = false,
  ): Promise<ThumbnailRead[]> {
    if (pageIds && (!Array.isArray(pageIds) || pageIds.length > 100))
      return Promise.reject(Error("Invalid thumbnail page selection."));
    const captured = pageIds ? [...pageIds] : undefined;
    return this.enqueue(async () => {
      const result = await this.perform({
        kind: "thumbnails",
        projectId,
        pageIds: captured,
        ...(allowStale ? { allowStale: true } : {}),
      });
      if (
        result.kind !== "thumbnails" ||
        result.value.some(
          (item) => item.projectId !== projectId || (captured && !captured.includes(item.pageId)),
        )
      )
        throw Error("Mismatched thumbnail records response.");
      return result.value;
    }, false);
  }
  private connect() {
    if (this.worker !== undefined) return this.worker;
    try {
      this.worker = this.options.worker
        ? this.options.worker()
        : typeof Worker === "undefined"
          ? null
          : new Worker(new URL("./persistence.worker.ts", import.meta.url), { type: "module" });
    } catch {
      this.worker = null;
    }
    return this.worker;
  }
  private reset() {
    const worker = this.worker;
    this.worker = undefined;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
  }
  private async perform(action: PersistenceAction): Promise<PersistenceResult> {
    const projectId =
      action.kind === "save"
        ? action.frame.document.id
        : action.kind === "thumbnail"
          ? action.record.projectId
          : action.projectId;
    const worker = this.connect();
    if (!worker) {
      const db = await this.database();
      let result: PersistenceResult;
      if (action.kind === "save")
        result = {
          kind: "save",
          value: await (action.mediaOriginals.length
            ? persistProjectWrite(db, action.frame, action.mediaOriginals)
            : persistProjectWrite(db, action.frame)),
        };
      else if (action.kind === "thumbnail")
        result = { kind: "thumbnail", value: await persistThumbnail(db, action.record) };
      else if (action.kind === "info")
        result = { kind: "info", value: await readThumbnailInfo(db, action.projectId) };
      else
        result = {
          kind: "thumbnails",
          value: await readThumbnails(db, action.projectId, action.pageIds, action.allowStale),
        };
      return checkedResult(persistenceResult(result), action, projectId);
    }
    const id = ++this.sequence,
      mutating = action.kind === "save" || action.kind === "thumbnail",
      abort = new AbortController();
    let resolve!: (result: PersistenceResult) => void,
      reject!: (error: Error) => void,
      finished = false,
      settled = false,
      remoteFailure = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const response = new Promise<PersistenceResult>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    void response.catch(() => undefined);
    const fail = (error: Error, uncertain = true) => {
      if (settled) return;
      settled = true;
      const failure = uncertain && finished && mutating ? new PersistenceUncertainError() : error;
      abort.abort(failure);
      reject(failure);
    };
    worker.onmessage = (event) => {
      try {
        const reply = persistenceResponse(event.data, id);
        if ("error" in reply) {
          remoteFailure = true;
          fail(persistenceFailure(reply.error, projectId), false);
          return;
        }
        const result = checkedResult(reply.result, action, projectId);
        if (!settled) {
          settled = true;
          resolve(result);
        }
      } catch (error) {
        fail(error instanceof Error ? error : Error("Invalid persistence reply."));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      fail(Error(event.message || "Project persistence worker failed."));
    };
    worker.onmessageerror = () => fail(Error("Project persistence message could not be decoded."));
    try {
      if (action.kind === "save") {
        worker.postMessage({ type: "begin", id, database: this.name });
        for (const original of action.mediaOriginals) {
          abort.signal.throwIfAborted();
          worker.postMessage({ type: "media", id, original });
          await (this.options.yieldTask ?? yieldFragmentTask)(abort.signal, this.closed);
        }
        let parts = 0;
        for (const part of fragmentValue(action.frame)) {
          do {
            await (this.options.yieldTask ?? yieldFragmentTask)(abort.signal, this.closed);
            abort.signal.throwIfAborted();
          } while (
            !this.closed &&
            typeof navigator !== "undefined" &&
            (
              navigator as Navigator & {
                scheduling?: { isInputPending(options: { includeContinuous: boolean }): boolean };
              }
            ).scheduling?.isInputPending({ includeContinuous: true })
          );
          worker.postMessage({ type: "part", id, part });
          parts++;
        }
        finished = true;
        worker.postMessage({ type: "finish", id, parts });
      } else {
        finished = true;
        if (action.kind === "thumbnail")
          worker.postMessage({ type: "thumbnail", id, database: this.name, record: action.record });
        else if (action.kind === "info")
          worker.postMessage({
            type: "info",
            id,
            database: this.name,
            projectId: action.projectId,
          });
        else
          worker.postMessage({
            type: "thumbnails",
            id,
            database: this.name,
            projectId: action.projectId,
            ...(action.pageIds ? { pageIds: action.pageIds } : {}),
            ...(action.allowStale ? { allowStale: true } : {}),
          });
      }
      timer = setTimeout(
        () => fail(Error("Project persistence worker timed out.")),
        this.options.timeout ?? 30000,
      );
      return await response;
    } catch (error) {
      if (!remoteFailure || !finished) this.reset();
      if (remoteFailure || !finished || !mutating || error instanceof PersistenceUncertainError)
        throw error;
      throw new PersistenceUncertainError();
    } finally {
      clearTimeout(timer);
      if (this.worker === worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
      }
    }
  }
  dispose(): Promise<void> {
    this.closed = true;
    return (this.disposal ??= (async () => {
      await this.tail.catch(() => undefined);
      this.reset();
    })());
  }
}
