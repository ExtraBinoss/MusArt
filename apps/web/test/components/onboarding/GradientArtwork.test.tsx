import { expect, test, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { GradientArtwork } from "../../../src/components/onboarding/GradientArtwork";
const controls = vi.hoisted(() => ({
  palette: vi.fn(),
  paused: vi.fn(),
  dispose: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../../../src/services/onboarding/gradient", () => ({
  OnboardingGradient: class {
    constructor() {
      controls.create();
    }
    setPalette = controls.palette;
    setPaused = controls.paused;
    dispose = controls.dispose;
  },
}));

test("retains one controller, applies latest settings and disposes its renderer on exit", async () => {
  const view = render(
    <StrictMode>
      <GradientArtwork palette="aurora" paused={false} />
    </StrictMode>,
  );
  await waitFor(() => expect(controls.create).toHaveBeenCalledTimes(2));
  expect(controls.dispose).toHaveBeenCalledOnce();
  expect(controls.palette).toHaveBeenLastCalledWith("aurora");
  view.rerender(
    <StrictMode>
      <GradientArtwork palette="ultraviolet" paused />
    </StrictMode>,
  );
  expect(controls.palette).toHaveBeenLastCalledWith("ultraviolet");
  expect(controls.paused).toHaveBeenLastCalledWith(true);
  expect(controls.create).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(controls.dispose).toHaveBeenCalledTimes(2);
});
