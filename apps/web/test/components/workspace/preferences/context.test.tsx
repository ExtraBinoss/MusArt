import { expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  ProjectPreferencesProvider,
  useProjectPreference,
  useProjectPreferences,
} from "../../../../src/components/workspace/preferences/context";

test("field hydration and edits rerender their consumer without rerendering the provider owner", async () => {
  const parent = vi.fn(),
    zoom = vi.fn(),
    height = vi.fn();
  let preferences: ReturnType<typeof useProjectPreferences>;
  function Zoom() {
    zoom();
    preferences = useProjectPreferences();
    return <output data-testid="zoom">{useProjectPreference("timelineZoom") ?? 120}</output>;
  }
  function Height() {
    height();
    return <output>{useProjectPreference("timelineHeight") ?? 0.3}</output>;
  }
  const port = {
    read: vi.fn().mockResolvedValue({ timelineZoom: 240 }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  function Owner() {
    parent();
    return (
      <ProjectPreferencesProvider projectId="a" port={port} onError={vi.fn()}>
        <Zoom />
        <Height />
      </ProjectPreferencesProvider>
    );
  }
  const view = render(<Owner />);
  await screen.findByText("240");
  const before = {
    parent: parent.mock.calls.length,
    zoom: zoom.mock.calls.length,
    height: height.mock.calls.length,
  };
  act(() => preferences!.commit("timelineZoom", 320));
  expect(screen.getByTestId("zoom")).toHaveTextContent("320");
  expect(parent).toHaveBeenCalledTimes(before.parent);
  expect(height).toHaveBeenCalledTimes(before.height);
  expect(zoom).toHaveBeenCalledTimes(before.zoom + 1);
  view.unmount();
});

test("standalone consumers retain an optional non-persistent fallback", () => {
  function Probe() {
    return <output>{useProjectPreference("timelineZoom") ?? 120}</output>;
  }
  render(<Probe />);
  expect(screen.getByText("120")).toBeVisible();
});

test("pagehide drains pending wheel preferences and removes its listener on unmount", async () => {
  let preferences: ReturnType<typeof useProjectPreferences>;
  function Probe() {
    preferences = useProjectPreferences();
    useProjectPreference("timelineZoom");
    return null;
  }
  const port = {
    read: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const removed = vi.spyOn(window, "removeEventListener");
  const view = render(
    <ProjectPreferencesProvider projectId="a" port={port} onError={vi.fn()}>
      <Probe />
    </ProjectPreferencesProvider>,
  );
  act(() => preferences!.commit("timelineZoom", 360, 600));
  expect(port.update).not.toHaveBeenCalled();
  await act(async () => {
    window.dispatchEvent(new Event("pagehide"));
    await preferences!.flush();
  });
  expect(port.update).toHaveBeenCalledExactlyOnceWith("a", { timelineZoom: 360 });
  act(() => preferences!.commit("timelineZoom", 380, 600));
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await preferences!.flush();
  });
  expect(port.update).toHaveBeenLastCalledWith("a", { timelineZoom: 380 });
  expect(port.update).toHaveBeenCalledTimes(2);
  visibility.mockRestore();
  view.unmount();
  expect(removed).toHaveBeenCalledWith("pagehide", expect.any(Function));
  removed.mockRestore();
});
