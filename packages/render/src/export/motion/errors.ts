export class MotionExportError extends Error {
  constructor(
    public readonly code:
      | "invalidOptions"
      | "containerPrecision"
      | "alphaUnsupported"
      | "missingMotion"
      | "noVideoCodec"
      | "noAudioCodec"
      | "unsupportedAudio"
      | "missingOriginal"
      | "outputLimit"
      | "emptyVideo"
      | "closed"
      | "busy",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MotionExportError";
  }
}
