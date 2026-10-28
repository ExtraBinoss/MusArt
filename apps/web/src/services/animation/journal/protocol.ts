import type { JournalFailure, JournalResponse, JournalResult } from "./model";
import { MIN_HISTORY_LIMIT, MAX_HISTORY_LIMIT } from "../../history/model";

export class JournalTransportError extends Error {
  constructor(
    message: string,
    readonly uncertain = false,
  ) {
    super(message);
    this.name = "JournalTransportError";
  }
}
export class JournalQueueFullError extends Error {
  readonly code = "JOURNAL_QUEUE_FULL";
  constructor() {
    super("Journal write queue is full; wait for pending history to finish.");
    this.name = "JournalQueueFullError";
  }
}

export function journalFailure(failure: JournalFailure): Error {
  const error = new Error(failure.message);
  error.name = failure.name;
  if (failure.code) Object.defineProperty(error, "code", { value: failure.code });
  return error;
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

/** The same durable-header invariants apply to worker and compatibility execution. */
export function journalResult(result: unknown): JournalResult {
  if (
    result &&
    typeof result === "object" &&
    "ownNext" in result &&
    "meta" in result &&
    integer(result.ownNext)
  ) {
    const meta = result.meta as Record<string, unknown> | null;
    if (
      meta &&
      typeof meta === "object" &&
      meta.version === 1 &&
      identifier(meta.projectId) &&
      identifier(meta.epoch) &&
      (meta.configurationId === undefined || identifier(meta.configurationId)) &&
      integer(meta.next) &&
      integer(meta.first, 0, meta.next) &&
      integer(meta.count) &&
      meta.count === meta.next - meta.first &&
      result.ownNext <= meta.next &&
      integer(meta.limit, MIN_HISTORY_LIMIT, MAX_HISTORY_LIMIT) &&
      typeof meta.enabled === "boolean" &&
      typeof meta.lastAt === "number" &&
      Number.isFinite(meta.lastAt) &&
      meta.lastAt >= 0 &&
      typeof meta.lastStamp === "string" &&
      meta.lastStamp.length <= 128
    )
      return result as JournalResult;
  }
  throw new JournalTransportError("Malformed journal worker response.");
}

/** Replies carry only bounded headers; neither a document nor its originals return to the UI. */
export function journalResponse(value: unknown, id: number): JournalResponse {
  if (!value || typeof value !== "object" || !("id" in value) || value.id !== id)
    throw new JournalTransportError("Unexpected journal worker response.");
  if ("error" in value) {
    const failure = value.error;
    if (
      failure &&
      typeof failure === "object" &&
      "name" in failure &&
      "message" in failure &&
      typeof failure.name === "string" &&
      typeof failure.message === "string" &&
      (!("code" in failure) || typeof failure.code === "string")
    )
      return value as JournalResponse;
  }
  if ("result" in value) return { id, result: journalResult(value.result) };
  throw new JournalTransportError("Malformed journal worker response.");
}
