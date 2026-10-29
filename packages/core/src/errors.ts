export type EngineErrorCode =
  | "INVALID_DOCUMENT"
  | "INVALID_COMMAND"
  | "NOT_FOUND"
  | "LOCKED"
  | "INVALID_HIERARCHY"
  | "LAST_PAGE"
  | "BUSY";

export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export function ensure(
  condition: unknown,
  code: EngineErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new EngineError(code, message);
}
