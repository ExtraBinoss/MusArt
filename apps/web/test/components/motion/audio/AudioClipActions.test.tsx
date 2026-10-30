import "../../../../src/state/i18n";
import { afterEach, expect, it, vi } from "vitest";
import { useSyncExternalStore } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  AudioClipMenu,
  AudioGainControl,
} from "../../../../src/components/motion/audio/AudioClipActions";
import { TimelineControlTooltips } from "../../../../src/components/motion/control-tooltips";
import { TooltipProvider } from "../../../../src/components/ui/tooltip";
import { audioFixture } from "../../../support/audio";
const audition = vi.hoisted(() => {
  const port = {
    owner: null as string | null,
    stop: vi.fn(),
    previewVolume: vi.fn(),
    previewTrack: vi.fn<(id: string, ...args: unknown[]) => Promise<void>>(),
    stopPreview: vi.fn<(trackId?: string) => void>(),
  };
  port.stopPreview.mockImplementation((trackId) => {
    if (trackId === undefined || port.owner === trackId) {
      port.stop();
      port.owner = null;
    }
  });
  port.previewTrack.mockImplementation(async (id) => {
    port.owner = id;
  });
  return port;
});
vi.mock("../../../../src/services/motion/audio/session", () => ({
  getMotionAudioSession: () => audition,
}));
afterEach(() => {
  audition.owner = null;
  vi.clearAllMocks();
});
it("offers native accessible audio context actions with real commands and undo", async () => {
  const d = audioFixture();
  const view = render(
    <TooltipProvider>
      <AudioClipMenu engine={d.engine} track={d.track()} disabled={false} onSelect={() => {}}>
        <button type="button">Sound clip</button>
      </AudioClipMenu>
    </TooltipProvider>,
  );
  fireEvent.contextMenu(screen.getByText("Sound clip"), { clientX: 20, clientY: 20 });
  const item = await screen.findByRole("menuitem", { name: /Couper|Mute/ });
  fireEvent.click(item);
  expect(d.track().mute).toBe(true);
  d.engine.undo();
  expect(d.track().mute).toBe(false);
  view.unmount();
});
it("exposes the shared themed volume slider without publishing an edit merely by opening it", async () => {
  const d = audioFixture(),
    before = d.engine.getSnapshot();
  const view = render(
    <TooltipProvider>
      <AudioGainControl engine={d.engine} track={d.track()} disabled={false} />
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Volume" }));
  expect(await screen.findByRole("slider", { name: "Volume" })).toBeTruthy();
  expect(d.engine.getSnapshot()).toBe(before);
  view.unmount();
});

it("refuses an already open mute callback after a same-ID project reload", async () => {
  const d = audioFixture(),
    view = render(
      <TooltipProvider>
        <AudioClipMenu engine={d.engine} track={d.track()} disabled={false} onSelect={() => {}}>
          <button type="button">Old audio</button>
        </AudioClipMenu>
      </TooltipProvider>,
    );
  fireEvent.contextMenu(screen.getByText("Old audio"), { clientX: 20, clientY: 20 });
  const item = await screen.findByRole("menuitem", { name: /Couper|Mute/ });
  d.engine.load(structuredClone(d.engine.getSnapshot().project));
  const before = d.engine.getSnapshot();
  fireEvent.click(item);
  expect(d.engine.getSnapshot()).toBe(before);
  view.unmount();
});

it("keeps the speaker popover open through its mix commit and undo, and closes on same-ID reload", async () => {
  const d = audioFixture();
  function Host() {
    useSyncExternalStore(d.engine.subscribe, d.engine.getSnapshot);
    return (
      <TooltipProvider>
        <AudioGainControl engine={d.engine} track={d.track()} disabled={false} />
      </TooltipProvider>
    );
  }
  const view = render(<Host />);
  fireEvent.click(screen.getByRole("button", { name: "Volume" }));
  const input = await screen.findByRole("spinbutton");
  fireEvent.change(input, { target: { value: "25" } });
  expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("25");
  fireEvent.blur(input);
  expect(d.track().volume).toBe(0.25);
  expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("25");
  act(() => d.engine.undo());
  expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("100");
  act(() => d.engine.load(structuredClone(d.engine.getSnapshot().project)));
  expect(screen.queryByRole("slider")).toBeNull();
  view.unmount();
});

it("cannot re-open Volume from a stale context after same-ID reload rerenders the fresh track", async () => {
  const d = audioFixture();
  function Host() {
    useSyncExternalStore(d.engine.subscribe, d.engine.getSnapshot);
    return (
      <TooltipProvider>
        <AudioClipMenu engine={d.engine} track={d.track()} disabled={false} onSelect={() => {}}>
          <button type="button">Retired context</button>
        </AudioClipMenu>
      </TooltipProvider>
    );
  }
  const view = render(<Host />);
  fireEvent.contextMenu(screen.getByText("Retired context"), { clientX: 20, clientY: 20 });
  await screen.findByRole("menuitem", { name: "Volume" });
  act(() => d.engine.load(structuredClone(d.engine.getSnapshot().project)));
  fireEvent.click(screen.getByRole("menuitem", { name: "Volume" }));
  expect(screen.queryByRole("slider")).toBeNull();
  view.unmount();
});

it("unmounting a virtualized row cannot stop another cue, while its owner still cleans up", async () => {
  const d = audioFixture(2),
    tracks = d.page().motion!.audioTracks!;
  function Rows({ ids }: { ids: readonly string[] }) {
    return (
      <TooltipProvider>
        {tracks
          .filter((track) => ids.includes(track.id))
          .map((track) => (
            <AudioClipMenu
              key={track.id}
              engine={d.engine}
              track={track}
              disabled={false}
              onSelect={() => {}}
            >
              {(open) => (
                <button type="button" onClick={() => open("fadeIn")}>
                  Edit {track.id}
                </button>
              )}
            </AudioClipMenu>
          ))}
      </TooltipProvider>
    );
  }
  const view = render(<Rows ids={tracks.map((track) => track.id)} />);
  fireEvent.click(screen.getByRole("button", { name: `Edit ${tracks[1]!.id}` }));
  fireEvent.click(await screen.findByRole("button", { name: /^Écouter$|^Preview$/ }));
  expect(audition.previewTrack).toHaveBeenCalledWith(
    tracks[1]!.id,
    expect.any(Object),
    1,
    "fadeIn",
  );
  expect(audition.owner).toBe(tracks[1]!.id);
  audition.stop.mockClear();
  audition.stopPreview.mockClear();
  view.rerender(<Rows ids={[tracks[1]!.id]} />);
  expect(audition.stopPreview).toHaveBeenCalledWith(tracks[0]!.id);
  expect(audition.owner).toBe(tracks[1]!.id);
  expect(audition.stop).not.toHaveBeenCalled();
  view.unmount();
  expect(audition.stopPreview).toHaveBeenLastCalledWith(tracks[1]!.id);
  expect(audition.stop).toHaveBeenCalledOnce();
  expect(audition.owner).toBeNull();
});

it("virtual audio controls construct their popover only on activation and restore focus", async () => {
  const d = audioFixture();
  const select = vi.fn();
  const view = render(
    <TimelineControlTooltips value={false}>
      <AudioGainControl engine={d.engine} track={d.track()} disabled={false} onSelect={select} />
    </TimelineControlTooltips>,
  );
  const trigger = screen.getByRole("button", { name: "Volume" });
  expect(trigger).not.toHaveAttribute("data-state");
  fireEvent.click(trigger);
  await screen.findByRole("slider", { name: "Volume" });
  expect(select).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Volume" }));
  expect(screen.queryByRole("slider")).toBeNull();
  expect(screen.getByRole("button", { name: "Volume" })).toHaveFocus();
  view.unmount();
});
