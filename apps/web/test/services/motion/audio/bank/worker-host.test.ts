import { expect, it, vi } from "vitest";
import { handleBankJob } from "../../../../../src/services/motion/audio/bank/worker-host";
const state = vi.hoisted(() => ({ pcm: vi.fn(), atlas: vi.fn() }));
vi.mock("../../../../../src/services/motion/audio/bank/prepare", () => ({
  prepareBankPcm: state.pcm,
}));
vi.mock("../../../../../src/services/motion/audio/bank/atlas", () => ({
  prepareBankAtlas: state.atlas,
}));
it("transfers genuine PCM and atlas ownership, reporting actual preparation failures", async () => {
  const send = vi.fn(),
    pcm = { pcm: new Float32Array(3) };
  state.pcm.mockResolvedValueOnce(pcm);
  await handleBankJob({ id: 1, type: "prepare", preset: "soft-plop" }, send);
  expect(send).toHaveBeenLastCalledWith({ id: 1, type: "pcm", value: pcm }, [pcm.pcm.buffer]);
  const atlas = { neutral: { close: vi.fn() }, active: { close: vi.fn() } };
  state.atlas.mockReturnValueOnce(atlas);
  await handleBankJob({ id: 2, type: "atlas" } as never, send);
  expect(send).toHaveBeenLastCalledWith({ id: 2, type: "atlas", value: atlas }, [
    atlas.neutral,
    atlas.active,
  ]);
  state.pcm.mockRejectedValueOnce(Error("Recipe source failed"));
  await handleBankJob({ id: 3, type: "prepare", preset: "soft-plop" }, send);
  expect(send).toHaveBeenLastCalledWith({ id: 3, type: "error", message: "Recipe source failed" });
  state.atlas.mockReturnValueOnce(atlas);
  const broken = vi.fn().mockImplementationOnce(() => {
    throw Error("transfer failed");
  });
  await handleBankJob({ id: 4, type: "atlas" } as never, broken);
  expect(atlas.neutral.close).toHaveBeenCalledOnce();
  expect(atlas.active.close).toHaveBeenCalledOnce();
});
