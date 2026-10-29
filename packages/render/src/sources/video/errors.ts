export type VideoSourceErrorCode =
  | "VIDEO_ORIGINAL_MISSING"
  | "closed"
  | "superseded"
  | "aborted"
  | "unsupported"
  | "alphaUnsupported"
  | "budgetExceeded"
  | "decodeFailed"
  | "busy";

export class VideoSourceError extends Error {
  constructor(
    public readonly code: VideoSourceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "VideoSourceError";
  }
}

export function videoSourceFailure(error: unknown): VideoSourceError {
  return error instanceof VideoSourceError
    ? error
    : new VideoSourceError("decodeFailed", "Video source decoding failed.", { cause: error });
}
