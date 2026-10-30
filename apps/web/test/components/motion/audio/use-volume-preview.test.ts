import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useVolumePreview } from "../../../../src/components/motion/audio/use-volume-preview";
import { audioFixture } from "../../../support/audio";
const state = vi.hoisted(() => ({ previewVolume: vi.fn() }));
vi.mock("../../../../src/services/motion/audio/session", () => ({
  getMotionAudioSession: () => state,
}));
it("previews volume imperatively without React commits or document edits and publishes one undo entry", () => {
  const d = audioFixture(),
    before = d.engine.getSnapshot(),
    commands = vi.fn();
  d.engine.subscribeCommands(commands);
  let renders = 0;
  const hook = renderHook(() => {
    renders++;
    return useVolumePreview(d.engine, d.track());
  });
  const initial = renders;
  act(() => {
    for (let i = 0; i < 100; i++) hook.result.current.preview(i / 100);
  });
  expect(renders).toBe(initial);
  expect(d.engine.getSnapshot()).toBe(before);
  expect(commands).not.toHaveBeenCalled();
  act(() => hook.result.current.commit(0.55));
  expect(commands).toHaveBeenCalledOnce();
  expect(d.track().volume).toBe(0.55);
  act(() => d.engine.undo());
  expect(d.track().volume).toBe(1);
  hook.unmount();
});
it("cancels drafts on Escape/retirement and rejects cross-project edits without replacing authoritative values", () => {
  const d = audioFixture(),
    hook = renderHook(() => useVolumePreview(d.engine, d.track()));
  act(() => hook.result.current.preview(0.2));
  act(() => hook.result.current.cancel());
  expect(d.track().volume).toBe(1);
  expect(state.previewVolume).toHaveBeenLastCalledWith(d.track().id, null);
  act(() => {
    hook.result.current.preview(0.3);
    d.engine.execute({ type: "renameProject", name: "Another revision" });
  });
  act(() => hook.result.current.commit(0.3));
  expect(d.track().volume).toBe(1);
  expect(hook.result.current.changed).toBe(true);
  hook.unmount();
});
