import { expect, it } from "vitest";
import { EditorEngine } from "../../../src/session/engine";
import { createPage, createProject } from "../../../src/document/factories";
import { compileMotion } from "../../../src/motion/compile";
import { parseProject, serializeProject } from "../../../src/document/serialization";
import type { AudioAsset } from "../../../src/assets/model";
import type { MotionAudioTrack } from "../../../src/motion/audio/model";

const time = (value: number, rate = 1) => ({ value, rate });
const audio = (): AudioAsset => ({
  id: "sound",
  name: "Pop",
  kind: "audio",
  mime: "audio/wav",
  originalId: "original",
  contentRevision: "r1",
  byteLength: 16044,
  duration: time(4),
  firstTimestamp: time(-1, 2),
  timeResolution: 48000,
  sampleRate: 48000,
  channels: 1,
});
const track = (): MotionAudioTrack => ({
  id: "audio-track",
  name: "Pop",
  assetId: "sound",
  start: time(1),
  end: time(5),
  sourceIn: time(0),
  mute: false,
  volume: 1,
});
function setup() {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ id: "page", layers: [] })] }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = () => engine.getSnapshot().project.pages[0]!;
  return { engine, page };
}
it("adds a nonvisual original and timed lane in one undo entry and restores it through Static", () => {
  const { engine, page } = setup();
  engine.execute({ type: "addMotionAudioTrack", track: track(), asset: audio() });
  expect(page().layers).toEqual([]);
  expect(page().motion!.duration).toEqual(time(5));
  const snapshot = engine.getSnapshot();
  engine.undo();
  expect(page().motion!.audioTracks).toBeUndefined();
  expect(engine.getSnapshot().project.assets.sound).toBeUndefined();
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(snapshot.project);
  engine.execute({ type: "setCompositionMode", mode: "static" });
  expect(compileMotion(engine.getSnapshot().project, { compositionId: "page" }).audio).toEqual([]);
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const program = compileMotion(engine.getSnapshot().project, { compositionId: "page" });
  expect(program.audio[0]).toMatchObject({
    start: time(1),
    end: time(5),
    media: { sourceStart: time(-1, 2), timelineStart: time(1), mute: false, volume: 1 },
  });
  expect(Object.isFrozen(program.audio[0])).toBe(true);
  expect(parseProject(serializeProject(engine.getSnapshot().project))).toEqual(
    engine.getSnapshot().project,
  );
});
it("moves without slipping source content, trims the left edge, updates gain and deletes without shrinking", () => {
  const { engine, page } = setup();
  engine.execute({ type: "addMotionAudioTrack", track: track(), asset: audio() });
  engine.execute({ type: "moveMotionAudioTrack", trackId: "audio-track", delta: time(-1) });
  engine.execute({
    type: "setMotionAudioTrackRange",
    trackId: "audio-track",
    start: time(1),
    end: time(3),
  });
  expect(page().motion!.audioTracks![0]).toMatchObject({
    start: time(1),
    end: time(3),
    sourceIn: time(1),
  });
  engine.execute({
    type: "updateMotionAudioTrack",
    trackId: "audio-track",
    patch: { name: "Whoosh", mute: true, volume: 0.25 },
  });
  expect(page().motion!.audioTracks![0]).toMatchObject({
    name: "Whoosh",
    mute: true,
    volume: 0.25,
  });
  engine.execute({ type: "deleteMotionAudioTrack", trackId: "audio-track" });
  expect(page().motion!.audioTracks).toEqual([]);
  expect(page().motion!.duration).toEqual(time(5));
  engine.undo();
  expect(page().motion!.audioTracks![0]!.mute).toBe(true);
});
it("rejects invalid edits atomically, including cross-kind originals and absent clips", () => {
  const { engine } = setup();
  engine.execute({ type: "addMotionAudioTrack", track: track(), asset: audio() });
  const before = engine.getSnapshot();
  for (const command of [
    { type: "moveMotionAudioTrack", trackId: "audio-track", delta: time(-2) },
    { type: "setMotionAudioTrackRange", trackId: "audio-track", start: time(0), end: time(8) },
    { type: "updateMotionAudioTrack", trackId: "audio-track", patch: { volume: NaN } },
    { type: "deleteMotionAudioTrack", trackId: "missing" },
    { type: "addMotionAudioTrack", track: track() },
  ] as const) {
    expect(() => engine.execute(command)).toThrow();
    expect(engine.getSnapshot()).toBe(before);
  }
  engine.execute({ type: "setCompositionMode", mode: "static" });
  expect(() => engine.execute({ type: "deleteMotionAudioTrack", trackId: "audio-track" })).toThrow(
    "Motion",
  );
});

it("reserves durable audio track IDs before allocating another engine entity", () => {
  const { engine } = setup();
  engine.execute({
    type: "addMotionAudioTrack",
    track: { ...track(), id: "page-1" },
    asset: audio(),
  });
  engine.execute({ type: "addPage" });
  expect(engine.getSnapshot().pageId).not.toBe("page-1");
});

it("stores processing in the portable program, clamps fades when trimming and restores it with undo", () => {
  const { engine, page } = setup();
  engine.execute({ type: "addMotionAudioTrack", track: track(), asset: audio() });
  engine.execute({
    type: "updateMotionAudioTrack",
    trackId: "audio-track",
    patch: { processing: { fadeIn: time(3), fadeOut: time(2), reverb: { mix: 0.4, decay: 1.2 } } },
  });
  const before = engine.getSnapshot();
  expect(
    compileMotion(before.project, { compositionId: "page" }).audio[0]!.media.processing!.reverb,
  ).toEqual({ mix: 0.4, decay: 1.2 });
  engine.execute({
    type: "setMotionAudioTrackRange",
    trackId: "audio-track",
    start: time(1),
    end: time(2),
  });
  expect(page().motion!.audioTracks![0]!.processing).toEqual({
    fadeIn: time(1),
    fadeOut: time(1),
    reverb: { mix: 0.4, decay: 1.2 },
  });
  engine.undo();
  expect(engine.getSnapshot().project).toBe(before.project);
});
