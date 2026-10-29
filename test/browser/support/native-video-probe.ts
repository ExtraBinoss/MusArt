import type { Page } from "@playwright/test";

export async function installNativeVideoProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const nativeResources = {
      framesOpen: 0,
      peakFrames: 0,
      decodersOpen: 0,
      peakDecoders: 0,
      closedFrames: 0,
      duplicateCloses: 0,
      hooked: false,
    };
    (window as unknown as { __musartNativeVideo: object }).__musartNativeVideo = nativeResources;
    if (typeof VideoFrame === "undefined" || typeof VideoDecoder === "undefined") return;
    const liveFrames = new Set<VideoFrame>(),
      knownFrames = new WeakSet<VideoFrame>();
    const record = (frame: VideoFrame) => {
      if (knownFrames.has(frame)) return;
      knownFrames.add(frame);
      liveFrames.add(frame);
      nativeResources.framesOpen = liveFrames.size;
      nativeResources.peakFrames = Math.max(nativeResources.peakFrames, liveFrames.size);
    };
    const NativeFrame = VideoFrame,
      close = NativeFrame.prototype.close,
      clone = NativeFrame.prototype.clone;
    NativeFrame.prototype.close = function (this: VideoFrame) {
      if (liveFrames.delete(this)) nativeResources.closedFrames++;
      else if (knownFrames.has(this)) nativeResources.duplicateCloses++;
      nativeResources.framesOpen = liveFrames.size;
      close.call(this);
    };
    NativeFrame.prototype.clone = function (this: VideoFrame) {
      const frame = clone.call(this);
      record(frame);
      return frame;
    };
    window.VideoFrame = new Proxy(NativeFrame, {
      construct(target, args) {
        const frame = Reflect.construct(target, args) as VideoFrame;
        record(frame);
        return frame;
      },
    });
    const NativeDecoder = VideoDecoder,
      decoderClose = NativeDecoder.prototype.close;
    const liveDecoders = new Set<VideoDecoder>();
    NativeDecoder.prototype.close = function (this: VideoDecoder) {
      liveDecoders.delete(this);
      nativeResources.decodersOpen = liveDecoders.size;
      decoderClose.call(this);
    };
    window.VideoDecoder = new Proxy(NativeDecoder, {
      construct(target, args) {
        const init = args[0] as VideoDecoderInit;
        const decoder = Reflect.construct(target, [
          {
            ...init,
            output: (frame: VideoFrame) => {
              record(frame);
              init.output(frame);
            },
          },
        ]) as VideoDecoder;
        liveDecoders.add(decoder);
        nativeResources.decodersOpen = liveDecoders.size;
        nativeResources.peakDecoders = Math.max(nativeResources.peakDecoders, liveDecoders.size);
        return decoder;
      },
    });
    nativeResources.hooked = true;
  });
}
