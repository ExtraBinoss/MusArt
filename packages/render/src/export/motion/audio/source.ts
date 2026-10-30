import type { OriginalMediaAsset } from "@musart/core";
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input, type AudioSample } from "mediabunny";
import type { MediaSourceResolver } from "../../../sources/media/model";
import { MotionExportError } from "../errors";
import type { MotionAudioSource, MotionPcmChunk } from "./model";
const MAX_WINDOW_BYTES = 8 * 1024 * 1024;
const MAX_SAMPLE_FRAMES = 65536;

function copySample(sample: AudioSample): MotionPcmChunk {
  if (
    sample.numberOfFrames < 1 ||
    sample.numberOfFrames > MAX_SAMPLE_FRAMES ||
    sample.numberOfChannels < 1 ||
    sample.numberOfChannels > 2 ||
    !Number.isFinite(sample.timestamp)
  )
    throw new MotionExportError(
      "unsupportedAudio",
      "Decoded audio sample exceeds its supported channel or packet budget.",
    );
  const channels = Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
    const data = new Float32Array(sample.numberOfFrames);
    sample.copyTo(data, { planeIndex, format: "f32-planar" });
    for (const value of data)
      if (!Number.isFinite(value))
        throw new MotionExportError(
          "unsupportedAudio",
          "Source audio contains non-finite PCM values.",
        );
    return data;
  });
  return {
    timestamp: sample.timestamp,
    sampleRate: sample.sampleRate,
    frames: sample.numberOfFrames,
    channels,
  };
}

/** Browser/native audio decoding is reusable without the editor or an AudioContext. */
export async function openMotionAudioSource(
  asset: OriginalMediaAsset,
  resolver: MediaSourceResolver,
  options: { signal?: AbortSignal } = {},
): Promise<MotionAudioSource | null> {
  options.signal?.throwIfAborted();
  const original = await resolver.resolveOriginal(asset, options);
  options.signal?.throwIfAborted();
  if (!(original instanceof Blob) || original.size !== asset.byteLength)
    throw new MotionExportError(
      "missingOriginal",
      "Audio original does not match its immutable media description.",
    );
  const input = new Input({
    source: new BlobSource(original, { maxCacheSize: 2 * 1024 * 1024 }),
    formats: ALL_FORMATS,
  });
  let closed = false,
    inputClosed = false,
    pending: Promise<unknown> | null = null;
  const closeInput = () => {
    if (!inputClosed) {
      inputClosed = true;
      input.dispose();
    }
  };
  const onAbort = () => {
    closed = true;
    closeInput();
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const close = async () => {
    closed = true;
    closeInput();
    options.signal?.removeEventListener("abort", onAbort);
    await pending?.catch(() => {});
  };
  try {
    const tracks = await input.getAudioTracks();
    options.signal?.throwIfAborted();
    if (!tracks.length) {
      await close();
      if (asset.kind === "audio")
        throw new MotionExportError(
          "unsupportedAudio",
          "The imported audio original has no decodable audio track.",
        );
      return null;
    }
    if (tracks.length !== 1)
      throw new MotionExportError(
        "unsupportedAudio",
        "Select a single source audio track before exporting a file with alternate tracks.",
      );
    const track = tracks[0]!;
    const channels = await track.getNumberOfChannels(),
      sampleRate = await track.getSampleRate();
    if (
      (channels !== 1 && channels !== 2) ||
      !Number.isInteger(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000 ||
      !(await track.canDecode())
    )
      throw new MotionExportError(
        "unsupportedAudio",
        "Source audio needs a decodable mono/stereo track at 8–192 kHz.",
      );
    const sink = new AudioSampleSink(track);
    options.signal?.throwIfAborted();
    return {
      sampleRate,
      channels,
      readWindow(start, end, request = {}) {
        if (pending)
          return Promise.reject(
            new MotionExportError("busy", "Audio original windows must be consumed serially."),
          );
        const job = async () => {
          options.signal?.throwIfAborted();
          request.signal?.throwIfAborted();
          if (closed) throw new MotionExportError("closed", "Audio original source is closed.");
          if (pending)
            throw new MotionExportError(
              "busy",
              "Audio original windows must be consumed serially.",
            );
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 1)
            throw new MotionExportError(
              "invalidOptions",
              "Audio decode windows must have a positive duration of at most one second.",
            );
          const iterator = sink.samples(start - 1 / sampleRate, end + 1 / sampleRate);
          const requestSignal = request.signal === options.signal ? undefined : request.signal;
          requestSignal?.addEventListener("abort", onAbort, { once: true });
          const chunks: MotionPcmChunk[] = [];
          let done = false,
            failed = false,
            failure: unknown,
            bytes = 0;
          try {
            for (let result = await iterator.next(); !result.done; result = await iterator.next()) {
              const sample = result.value;
              try {
                options.signal?.throwIfAborted();
                request.signal?.throwIfAborted();
                if (closed)
                  throw new MotionExportError("closed", "Audio source closed during decoding.");
                bytes += sample.numberOfFrames * sample.numberOfChannels * 4;
                if (bytes > MAX_WINDOW_BYTES)
                  throw new MotionExportError(
                    "unsupportedAudio",
                    "Decoded audio window exceeds its PCM budget.",
                  );
                const chunk = copySample(sample);
                if (chunk.sampleRate !== sampleRate || chunk.channels.length !== channels)
                  throw new MotionExportError(
                    "unsupportedAudio",
                    "Source audio configuration changed during decoding.",
                  );
                chunks.push(chunk);
              } finally {
                sample.close();
              }
            }
            options.signal?.throwIfAborted();
            request.signal?.throwIfAborted();
            if (closed)
              throw new MotionExportError("closed", "Audio source closed during decoding.");
            done = true;
          } catch (error) {
            failed = true;
            failure = error;
          }
          requestSignal?.removeEventListener("abort", onAbort);
          const errors: unknown[] = [];
          if (!done)
            try {
              for (let result = await iterator.next(); !result.done; result = await iterator.next())
                result.value.close();
            } catch (error) {
              errors.push(error);
            }
          try {
            await iterator.return(undefined);
          } catch (error) {
            errors.push(error);
          }
          if (errors.length)
            throw new AggregateError(
              failed ? [failure, ...errors] : errors,
              "Motion audio window cleanup failed.",
            );
          if (failed) throw failure;
          return chunks;
        };
        const result = job();
        pending = result;
        void result
          .finally(() => {
            if (pending === result) pending = null;
          })
          .catch(() => {});
        return result;
      },
      dispose: close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
