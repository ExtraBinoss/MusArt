import { expect, it } from "vitest";
import {
  captureAudioTrackScope,
  createAudioMenuScope,
} from "../../../../src/components/motion/audio/scope";
import { audioFixture } from "../../../support/audio";
it("rebases only recognized scalar mix publications, ignoring selection snapshots", () => {
  const d = audioFixture(),
    scope = captureAudioTrackScope(d.engine, d.track());
  const stop = d.engine.subscribe(() => {
    scope.read();
  });
  d.engine.select([]);
  expect(scope.read()).toBe(d.track());
  d.engine.execute({
    type: "updateMotionAudioTrack",
    trackId: d.track().id,
    patch: { volume: 0.5 },
  });
  expect(scope.read()).toBe(d.track());
  d.engine.execute({
    type: "updateMotionAudioTrack",
    trackId: d.track().id,
    patch: { mute: true },
  });
  expect(scope.read()?.mute).toBe(true);
  d.engine.undo();
  expect(scope.read()?.mute).toBe(false);
  stop();
});
it.each([true, false])(
  "refuses a retained callback after same-ID reload forever, allowMix=%s",
  (mix) => {
    const d = audioFixture(),
      scope = captureAudioTrackScope(d.engine, d.track(), mix),
      old = d.engine.getSnapshot().project;
    d.engine.load(structuredClone(old));
    expect(scope.read()).toBeNull();
    d.engine.load(old);
    expect(scope.read()).toBeNull();
  },
);
it("rejects processing/name edits and stale track props", () => {
  const d = audioFixture(),
    track = d.track(),
    scope = captureAudioTrackScope(d.engine, track);
  d.engine.execute({
    type: "updateMotionAudioTrack",
    trackId: track.id,
    patch: { name: "Renamed" },
  });
  expect(scope.read()).toBeNull();
  expect(captureAudioTrackScope(d.engine, track).read()).toBeNull();
});

it("keeps context selection and editor focus lifetime in its event controller", () => {
  const d = audioFixture(),
    menu = createAudioMenuScope(d.engine);
  expect(menu.read()).toBeNull();
  expect(menu.capture(d.track())).toBe(d.track());
  menu.edit(true);
  expect(menu.isEditing()).toBe(true);
  menu.clear();
  expect(menu.read()).toBeNull();
  menu.edit(false);
  expect(menu.isEditing()).toBe(false);
});
