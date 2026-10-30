import { beforeEach, expect, it, vi } from "vitest";
import { chooseMotionEncoding } from "../../../src/export/motion/encoding";
const state = vi.hoisted(() => ({ video: vi.fn(), audio: vi.fn() }));
vi.mock("mediabunny", () => ({
  canEncodeVideo: state.video,
  canEncodeAudio: state.audio,
  Quality: class {
    constructor(readonly options: unknown) {}
  },
  Mp4OutputFormat: class {
    getSupportedVideoCodecs() {
      return ["avc"];
    }
    getSupportedAudioCodecs() {
      return ["aac", "opus"];
    }
  },
  WebMOutputFormat: class {
    getSupportedVideoCodecs() {
      return ["vp9", "vp8"];
    }
    getSupportedAudioCodecs() {
      return ["opus"];
    }
  },
}));
beforeEach(() => {
  state.video.mockReset().mockResolvedValue(true);
  state.audio.mockReset().mockResolvedValue(true);
});
const options = {
  container: "auto" as const,
  alpha: "discard" as const,
  width: 32,
  height: 24,
  frameRate: 30000 / 1001,
  audio: { sampleRate: 48000, channels: 2 },
};
it("probes real A/V capabilities and selects supported container pairs without discarding sound", async () => {
  expect(await chooseMotionEncoding(options)).toMatchObject({
    videoCodec: "avc",
    audioCodec: "aac",
    mimeType: "video/mp4",
  });
  state.audio.mockResolvedValueOnce(false);
  expect(await chooseMotionEncoding(options)).toMatchObject({
    videoCodec: "vp9",
    audioCodec: "opus",
    mimeType: "video/webm",
  });
  expect(state.video).toHaveBeenCalledWith(
    "avc",
    expect.objectContaining({
      width: 32,
      frameRate: 30000 / 1001,
      quality: expect.objectContaining({
        options: { bitrate: 8_000_000, bitrateMode: "variable" },
      }),
    }),
  );
  expect(state.audio).toHaveBeenCalledWith(
    "aac",
    expect.objectContaining({
      quality: expect.objectContaining({ options: { bitrate: 192_000 } }),
    }),
  );
});
it("keeps explicit WebM as WebM", async () => {
  expect(await chooseMotionEncoding({ ...options, container: "webm" })).toMatchObject({
    videoCodec: "vp9",
    audioCodec: "opus",
    mimeType: "video/webm",
  });
  expect(state.video.mock.calls.map((call) => call[0])).toEqual(["vp9"]);
});
it("rejects unavailable audio/video honestly", async () => {
  state.audio.mockResolvedValue(false);
  await expect(chooseMotionEncoding({ ...options, container: "mp4" })).rejects.toMatchObject({
    code: "noAudioCodec",
  });
  expect(state.audio.mock.calls.map((call) => call[0])).toEqual(["aac"]);
  state.video.mockResolvedValue(false);
  await expect(chooseMotionEncoding(options)).rejects.toMatchObject({ code: "noVideoCodec" });
});

it("rejects transparency for every container before codec probes or alpha splitting", async () => {
  for (const container of ["auto", "mp4", "webm"] as const)
    await expect(
      chooseMotionEncoding({ ...options, container, alpha: "keep" }),
    ).rejects.toMatchObject({ name: "MotionExportError", code: "alphaUnsupported" });
  expect(state.video).not.toHaveBeenCalled();
  expect(state.audio).not.toHaveBeenCalled();
});

it("rejects malformed runtime options before native encoder capability checks", async () => {
  await expect(chooseMotionEncoding({ ...options, videoBitrate: 0 })).rejects.toMatchObject({
    code: "invalidOptions",
  });
  await expect(chooseMotionEncoding({ ...options, audioBitrate: Infinity })).rejects.toMatchObject({
    code: "invalidOptions",
  });
  await expect(
    chooseMotionEncoding({ ...options, alpha: "invalid" as "discard" }),
  ).rejects.toMatchObject({ code: "invalidOptions" });
  await expect(
    chooseMotionEncoding({ ...options, container: "invalid" as "auto" }),
  ).rejects.toMatchObject({ code: "invalidOptions" });
  expect(state.video).not.toHaveBeenCalled();
  expect(state.audio).not.toHaveBeenCalled();
});
