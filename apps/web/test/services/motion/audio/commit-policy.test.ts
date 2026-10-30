import { expect, it } from "vitest";
import { compileMotion } from "@musart/core";
import {
  classifyAudioMixChange,
  rebaseAudioMixFrame,
  rebaseAudioMixProgram,
} from "../../../../src/services/motion/audio/commit-policy";
import { audioFixture } from "../../../support/audio";
it("accepts only audio mix publications and rebases metadata while preserving compiled visual references", () => {
  const d = audioFixture(),
    before = d.engine.getSnapshot(),
    program = compileMotion(before.project, { compositionId: before.pageId });
  d.engine.execute({
    type: "updateMotionAudioTrack",
    trackId: d.track().id,
    patch: { volume: 0.4, mute: true },
  });
  const publication = classifyAudioMixChange(before, d.engine.getSnapshot());
  expect(publication!.changes).toEqual([{ trackId: d.track().id, volume: 0.4, mute: true }]);
  const updated = rebaseAudioMixProgram(program, publication!);
  expect(updated.layers).toBe(program.layers);
  expect(updated.composition.layers).toBe(program.composition.layers);
  expect(updated.audio[0]!.media).toMatchObject({ volume: 0.4, mute: true });
  expect(program.audio[0]!.media.volume).toBe(1);
  expect(rebaseAudioMixFrame(program.composition, updated)!.layers).toBe(
    program.composition.layers,
  );
  expect(rebaseAudioMixFrame(null, updated)).toBeNull();
});
it("rejects reloads, page changes, naming, trims and changes outside the scalar audio mix", () => {
  const d = audioFixture(),
    before = d.engine.getSnapshot();
  d.engine.execute({
    type: "updateMotionAudioTrack",
    trackId: d.track().id,
    patch: { name: "Changed" },
  });
  expect(classifyAudioMixChange(before, d.engine.getSnapshot())).toBeNull();
  d.engine.undo();
  const current = d.engine.getSnapshot();
  d.engine.load(current.project);
  expect(classifyAudioMixChange(current, d.engine.getSnapshot())).toBeNull();
  expect(classifyAudioMixChange(before, before)).toBeNull();
});
