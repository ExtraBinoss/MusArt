import "../../../../src/state/i18n";
import { expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { AudioWaveform } from "../../../../src/components/motion/audio/AudioWaveform";
import { audioFixture } from "../../../support/audio";
const state = vi.hoisted(() => ({ waveform: vi.fn() }));
vi.mock("../../../../src/services/motion/audio/session", () => ({
  getMotionAudioSession: () => ({ preparation: { waveform: state.waveform } }),
}));
it("draws one clipped continuous mountain in two nearby shades from worker peaks", async () => {
  const d = audioFixture();
  state.waveform.mockResolvedValue(new Float32Array(2048).fill(0.6));
  const view = render(
    <AudioWaveform
      engine={d.engine}
      asset={d.asset}
      track={d.track()}
      width={12000}
      left={3000}
      visibleWidth={300}
    />,
  );
  await waitFor(() => expect(view.container.querySelector("path")!.getAttribute("d")).not.toBe(""));
  const svg = view.container.querySelector("svg")!;
  expect(svg.getAttribute("width")).toBe("303");
  expect(svg.getAttribute("viewBox")).toBe("3000 0 303 16");
  expect(view.container.querySelectorAll("path")).toHaveLength(2);
  expect(view.container.querySelector("path")!.getAttribute("d")!.endsWith("Z")).toBe(true);
  expect(state.waveform).toHaveBeenCalledWith(d.asset);
  view.unmount();
});

it("counts retained waveform commits on its SVG only in automation sessions", async () => {
  const d = audioFixture(),
    track = d.track(),
    originalUrl = location.href;
  state.waveform.mockResolvedValue(new Float32Array(2048).fill(0.6));
  try {
    history.replaceState({}, "", "/?automation=1");
    const props = {
      engine: d.engine,
      asset: d.asset,
      track,
      width: 200,
      left: 0,
      visibleWidth: 100,
    };
    const view = render(<AudioWaveform {...props} />);
    const node = view.container.firstElementChild!;
    await waitFor(() => expect(node).not.toHaveAttribute("data-preparing"));
    const before = Number(node.getAttribute("data-react-renders"));
    view.rerender(<AudioWaveform {...props} visibleWidth={120} />);
    expect(view.container.firstElementChild).toBe(node);
    expect(view.container.children).toHaveLength(1);
    expect(node).toHaveAttribute("data-react-renders", String(before + 1));
    view.unmount();
  } finally {
    history.replaceState({}, "", originalUrl);
  }
});
