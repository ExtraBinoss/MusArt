import { VideoPlaybackCursor } from "../../../packages/render/src/sources/video/playback";
import { createVideoFixture } from "./video-source-witness";
const native = () => ({
  ...(window as unknown as { __musartNativeVideo: { decodersOpen: number; framesOpen: number } })
    .__musartNativeVideo,
});
export async function runVideoPlaybackWitness() {
  const { blob, codec } = await createVideoFixture(300);
  const cursor = new VideoPlaybackCursor({
    assetId: "long-original",
    contentRevision: "v1",
    original: blob,
  });
  const requests: number[] = [],
    pts: number[] = [];
  try {
    for (const seconds of [0, 0.016, 0.033, 0.05, 0.066, 0.1, 0.2]) {
      const started = performance.now();
      const frame = await cursor.requestFrame({ value: seconds * 1000, rate: 1000 });
      requests.push(performance.now() - started);
      if (!frame) throw Error("Sequential playback returned no native frame.");
      pts.push(frame.timestamp.value / frame.timestamp.rate);
      frame.release();
    }
    const before = { stats: cursor.stats(), native: native() };
    const closeStarted = performance.now();
    await cursor.dispose();
    const closeMs = performance.now() - closeStarted,
      after = { stats: cursor.stats(), native: native() };
    const canceled = new VideoPlaybackCursor({
        assetId: "long-original",
        contentRevision: "v1",
        original: blob,
      }),
      abort = new AbortController();
    let result: "resolved" | "rejected" = "resolved";
    const pending = canceled.requestFrame({ value: 575, rate: 100 }, { signal: abort.signal }).then(
      (lease) => {
        lease?.release();
      },
      () => {
        result = "rejected";
      },
    );
    const waitStarted = performance.now();
    while (native().decodersOpen === 0 && performance.now() - waitStarted < 2000)
      await new Promise((resolve) => setTimeout(resolve, 0));
    const abortStarted = performance.now();
    abort.abort();
    await pending;
    await canceled.dispose();
    return {
      codec,
      bytes: blob.size,
      encodedFrames: 300,
      requests,
      pts,
      before,
      after,
      closeMs,
      canceled: {
        result,
        abortMs: performance.now() - abortStarted,
        stats: canceled.stats(),
        native: native(),
      },
      browser: navigator.userAgent,
    };
  } finally {
    await cursor.dispose();
  }
}
