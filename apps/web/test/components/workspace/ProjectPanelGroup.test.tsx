import { beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import type { GroupProps, GroupImperativeHandle } from "react-resizable-panels";
import { ProjectPanelGroup } from "../../../src/components/workspace/ProjectPanelGroup";
import { ProjectPreferencesProvider } from "../../../src/components/workspace/preferences/context";
import type { ProjectLayoutPreferences } from "../../../src/services/projects/preferences/model";

const control = vi.hoisted(() => ({
  props: {} as GroupProps,
  setLayout: vi.fn(),
  layout: null as Record<string, number> | null,
}));
beforeEach(() => {
  control.layout = null;
  control.setLayout.mockClear().mockImplementation((layout) => {
    control.layout = layout;
  });
});
vi.mock("../../../src/components/ui/resizable", () => ({
  ResizablePanelGroup: (props: GroupProps) => {
    control.props = props;
    if (props.groupRef && typeof props.groupRef === "object")
      (props.groupRef as { current: GroupImperativeHandle | null }).current = {
        setLayout: control.setLayout,
        getLayout: () => control.layout ?? props.defaultLayout ?? {},
      };
    return (
      <div
        data-slot="resizable-panel-group"
        onPointerDownCapture={props.onPointerDownCapture}
        onKeyDownCapture={props.onKeyDownCapture}
      >
        {props.children}
      </div>
    );
  },
}));

test("hydrates imperatively without remounting the canvas and saves only final user-requested layouts", async () => {
  control.setLayout.mockClear();
  const mounted = vi.fn();
  function Canvas() {
    useEffect(mounted, []);
    return <div>Canvas</div>;
  }
  const port = {
    read: vi.fn().mockResolvedValue({ workspaceLayout: { workspace: 70, inspector: 30 } }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <ProjectPreferencesProvider projectId="a" port={port} onError={vi.fn()}>
      <ProjectPanelGroup preference="workspaceLayout">
        <Canvas />
        <div data-slot="resizable-handle" role="separator" />
      </ProjectPanelGroup>
    </ProjectPreferencesProvider>,
  );
  await act(() => Promise.resolve());
  expect(control.setLayout).toHaveBeenLastCalledWith({ workspace: 70, inspector: 30 });
  expect(mounted).toHaveBeenCalledOnce();
  act(() =>
    control.props.onLayoutChanged?.({ workspace: 65, inspector: 35 }, { isUserInteraction: false }),
  );
  expect(port.update).not.toHaveBeenCalled();
  fireEvent.pointerDown(screen.getByRole("separator"));
  act(() =>
    control.props.onLayoutChanged?.(
      { workspace: 65, inspector: 35 },
      { isUserInteraction: true, requestedLayout: { workspace: 62, inspector: 38 } },
    ),
  );
  await act(() => Promise.resolve());
  expect(port.update).toHaveBeenCalledExactlyOnceWith("a", {
    workspaceLayout: { workspace: 62, inspector: 38 },
  });
  expect(mounted).toHaveBeenCalledOnce();
});

test("a newer separator gesture blocks a late restore, and a project switch resets to its own defaults", async () => {
  let resolve!: (value: ProjectLayoutPreferences) => void;
  const first = new Promise<ProjectLayoutPreferences>((done) => {
    resolve = done;
  });
  const port = {
    read: vi.fn((id: string) => (id === "a" ? first : Promise.resolve({}))),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const error = vi.fn();
  const content = (
    <ProjectPanelGroup preference="sidebarLayout">
      <div data-slot="resizable-handle" role="separator" tabIndex={0} />
    </ProjectPanelGroup>
  );
  const view = render(
    <ProjectPreferencesProvider projectId="a" port={port} onError={error}>
      {content}
    </ProjectPreferencesProvider>,
  );
  fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowUp" });
  act(() =>
    control.props.onLayoutChanged?.({ properties: 56, layers: 44 }, { isUserInteraction: true }),
  );
  await act(async () => {
    resolve({ sidebarLayout: { properties: 80, layers: 20 } });
    await first;
  });
  expect(control.setLayout).toHaveBeenLastCalledWith({ properties: 56, layers: 44 });
  view.rerender(
    <ProjectPreferencesProvider projectId="b" port={port} onError={error}>
      {content}
    </ProjectPreferencesProvider>,
  );
  await act(() => Promise.resolve());
  expect(control.setLayout).toHaveBeenLastCalledWith({ properties: 63, layers: 37 });
});

test("mobile single-panel layout suspends desktop hydration and cannot overwrite its saved split", async () => {
  control.setLayout.mockClear();
  const mounted = vi.fn();
  function Canvas() {
    useEffect(mounted, []);
    return <div>Canvas</div>;
  }
  const port = {
    read: vi.fn().mockResolvedValue({ workspaceLayout: { workspace: 70, inspector: 30 } }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  function tree(enabled: boolean) {
    return (
      <ProjectPreferencesProvider projectId="mobile" port={port} onError={vi.fn()}>
        <ProjectPanelGroup preference="workspaceLayout" enabled={enabled}>
          <Canvas />
        </ProjectPanelGroup>
      </ProjectPreferencesProvider>
    );
  }
  const view = render(tree(false));
  await act(() => Promise.resolve());
  expect(control.props.defaultLayout).toEqual({ workspace: 100 });
  expect(control.setLayout).not.toHaveBeenCalled();
  act(() => control.props.onLayoutChanged?.({ workspace: 100 }, { isUserInteraction: true }));
  expect(port.update).not.toHaveBeenCalled();
  view.rerender(tree(true));
  await act(() => Promise.resolve());
  expect(control.setLayout).toHaveBeenLastCalledWith({ workspace: 70, inspector: 30 });
  expect(mounted).toHaveBeenCalledOnce();
});

test("waits for the real panel registry when switching between desktop and mobile", () => {
  function tree(enabled: boolean) {
    return (
      <ProjectPanelGroup preference="workspaceLayout" enabled={enabled}>
        <div>Canvas</div>
      </ProjectPanelGroup>
    );
  }
  const view = render(tree(true));
  control.layout = { workspace: 77, inspector: 23 };
  view.rerender(tree(false));
  expect(control.setLayout).not.toHaveBeenCalled();
  control.layout = { workspace: 100 };
  act(() => control.props.onLayoutChanged?.(control.layout!, { isUserInteraction: false }));
  expect(control.setLayout).not.toHaveBeenCalled();
  view.rerender(tree(true));
  expect(control.setLayout).not.toHaveBeenCalled();
  control.layout = { workspace: 80, inspector: 20 };
  act(() => control.props.onLayoutChanged?.(control.layout!, { isUserInteraction: false }));
  expect(control.setLayout).toHaveBeenCalledExactlyOnceWith({ workspace: 77, inspector: 23 });
});
