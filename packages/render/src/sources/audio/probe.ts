import { subtractMotionTime, type AudioAsset } from "@musart/core";
import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import { videoTrackTime } from "../video/time";

export type AudioOriginalProbe = Pick<
  AudioAsset,
  "duration" | "firstTimestamp" | "timeResolution" | "sampleRate" | "channels"
>;

/** Lazy metadata inspection only; audio PCM is decoded later in bounded windows. */
export async function probeAudioOriginal(
  original: Blob,
  options: { signal?: AbortSignal } = {},
): Promise<AudioOriginalProbe> {
  options.signal?.throwIfAborted();
  const input = new Input({
    source: new BlobSource(original, { maxCacheSize: 1024 * 1024 }),
    formats: ALL_FORMATS,
  });
  const abort = () => input.dispose();
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    const tracks = await input.getAudioTracks();
    if (tracks.length !== 1 || !(await tracks[0]!.canDecode()))
      throw Error("Import an audio file containing one decodable audio track.");
    const track = tracks[0]!;
    const [first, end, timeResolution, sampleRate, channels] = await Promise.all([
      track.getFirstTimestamp(),
      track.computeDuration(),
      track.getTimeResolution(),
      track.getSampleRate(),
      track.getNumberOfChannels(),
    ]);
    options.signal?.throwIfAborted();
    const firstTimestamp = videoTrackTime(first, timeResolution);
    const duration = subtractMotionTime(videoTrackTime(end, timeResolution), firstTimestamp);
    if (
      duration.value <= 0 ||
      !Number.isInteger(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000 ||
      (channels !== 1 && channels !== 2)
    )
      throw Error("Audio needs a positive duration and a mono/stereo track at 8–192 kHz.");
    return Object.freeze({ firstTimestamp, duration, timeResolution, sampleRate, channels });
  } finally {
    options.signal?.removeEventListener("abort", abort);
    input.dispose();
  }
}
