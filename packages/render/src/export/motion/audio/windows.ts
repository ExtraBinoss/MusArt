import { MotionExportError } from "../errors";
import type { MotionAudioSource, MotionPcmChunk } from "./model";

interface Entry {
  start: number;
  end: number;
  chunks: readonly MotionPcmChunk[];
  bytes: number;
}

/** Live decoding reads ahead without extending the native scheduled-audio queue. */
export function createMotionAudioWindows(readAhead: number) {
  if (!Number.isFinite(readAhead) || readAhead < 0 || readAhead > 0.5)
    throw new MotionExportError("invalidOptions", "Invalid audio source read-ahead.");
  const entries = new Map<MotionAudioSource, Entry>();
  let bytes = 0,
    closed = false;
  const forget = (source: MotionAudioSource) => {
    const entry = entries.get(source);
    if (entry) bytes -= entry.bytes;
    entries.delete(source);
  };
  return {
    forget,
    async read(
      source: MotionAudioSource,
      start: number,
      end: number,
      options: { signal?: AbortSignal },
    ) {
      options.signal?.throwIfAborted();
      if (closed) throw new MotionExportError("closed", "Audio windows are closed.");
      const cached = entries.get(source);
      if (cached && start >= cached.start && end <= cached.end) {
        entries.delete(source);
        entries.set(source, cached);
        return cached.chunks;
      }
      const after = Math.max(end, start + readAhead);
      const chunks = await source.readWindow(start, after, options);
      options.signal?.throwIfAborted();
      if (closed) throw new MotionExportError("closed", "Audio windows are closed.");
      if (readAhead > 0) {
        forget(source);
        const size = chunks.reduce(
          (sum, chunk) => sum + chunk.channels.reduce((n, channel) => n + channel.byteLength, 0),
          0,
        );
        if (size <= 2 * 1024 * 1024) {
          entries.set(source, { start, end: after, chunks, bytes: size });
          bytes += size;
          while (entries.size > 4 || bytes > 2 * 1024 * 1024) forget(entries.keys().next().value!);
        }
      }
      return chunks;
    },
    dispose() {
      closed = true;
      entries.clear();
      bytes = 0;
    },
  };
}
