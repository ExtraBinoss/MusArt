export type MediaStorageErrorCode =
  | "VIDEO_ORIGINAL_MISSING"
  | "VIDEO_STORAGE_LIMIT"
  | "VIDEO_IMPORT_UNAVAILABLE"
  | "AUDIO_IMPORT_UNAVAILABLE"
  | "AUDIO_ORIGINAL_MISSING"
  | "AUDIO_STORAGE_LIMIT";
/** Stable UI codes preserve the real platform diagnostic for the existing error/copy flow. */
export class MediaStorageError extends Error {
  constructor(
    readonly code: MediaStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MediaStorageError";
  }
}
