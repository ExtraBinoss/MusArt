import { expect, test } from "vitest";
import { resolve } from "node:path";
import { parseTemplateVideoProbe, readTemplateMedia } from "../../../scripts/templates/media";

test("probes the checked-in CC0 original and preserves exact video PTS instead of the longer audio/container tail", async () => {
  const { media, originals } = await readTemplateMedia(
    resolve("apps/web/public/templates/motion/media"),
  );
  expect(media.photos).toHaveLength(3);
  expect(media.photos.map((asset) => [asset.width, asset.height])).toEqual([
    [332, 332],
    [298, 332],
    [240, 200],
  ]);
  expect(media.photos.every((asset) => asset.dataUrl.startsWith("data:image/jpeg;base64,"))).toBe(
    true,
  );
  expect(media.video).toMatchObject({
    kind: "video",
    width: 960,
    height: 540,
    byteLength: 1128375,
    duration: { value: 150150, rate: 30000 },
    firstTimestamp: { value: 0, rate: 30000 },
    timeResolution: 30000,
    orientation: { rotation: 0, flip: false, pixelAspectRatio: { numerator: 1, denominator: 1 } },
  });
  expect(media.video).not.toHaveProperty("dataUrl");
  expect(originals).toHaveLength(4);
  expect(originals[0]!.file).toBe("media/flower.mp4");
  expect(media.video.contentRevision).toBe(
    "sha256:0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451",
  );
});

test("parses source timing and display orientation and rejects missing/ambiguous stream metadata", () => {
  const video = {
    codec_type: "video",
    width: 200,
    height: 100,
    duration_ts: 90,
    start_pts: 12,
    time_base: "1/30",
  };
  const result = parseTemplateVideoProbe({
    streams: [
      { codec_type: "audio", duration_ts: 2000 },
      { ...video, sample_aspect_ratio: "2:1", side_data_list: [{ rotation: -90 }] },
    ],
  });
  expect([result.width, result.height]).toEqual([100, 400]);
  expect(result.orientation.rotation).toBe(270);
  expect(result.firstTimestamp).toEqual({ value: 12, rate: 30 });
  for (const patch of [
    { width: 0 },
    { duration_ts: 0 },
    { duration_ts: 1.1 },
    { start_pts: undefined },
    { time_base: "0/0" },
    { sample_aspect_ratio: "0:0" },
    { tags: { rotate: "45" } },
    { width: 201, sample_aspect_ratio: "1:2" },
  ])
    expect(() => parseTemplateVideoProbe({ streams: [{ ...video, ...patch }] })).toThrow();
  expect(() => parseTemplateVideoProbe({ streams: [] })).toThrow();
});
