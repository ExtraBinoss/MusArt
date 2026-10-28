# Deterministic replay and video encoding

Verified against Mediabunny 1.62.1 on 2026-10-27.

Committed command transactions form a millisecond journal. Pointer previews and selection changes do not enter it. Portable replay data keeps original assets once, outside frame snapshots. Playback evaluates the journal without modifying the live document or undo history.

Video export evaluates a fixed number of frames at explicit timestamps. A retained Three.js WebGPURenderer session serializes each render and its asynchronous encoder consumer. Mediabunny's `CanvasSource` captures that GPU canvas through the browser's native media pipeline. No application pixel array, Canvas2D copy, screen capture, or GPU readback is involved. Awaiting every `add()` propagates encoder backpressure and bounds pending frames.

The encoder probes actual codec support for the selected resolution. MP4 uses AVC; automatic output can choose WebM with VP9 or VP8. Explicit MP4 requests fail visibly when unavailable. Cancellation closes the output and renderer. Video dimensions stay fixed throughout recorded page resizing.

Primary references: [media sources](https://mediabunny.dev/guide/media-sources), [writing files](https://mediabunny.dev/guide/writing-media-files), [samples and packets](https://mediabunny.dev/guide/packets-and-samples).
