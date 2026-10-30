import { useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { GroupImperativeHandle, GroupProps } from "react-resizable-panels";
import { ResizablePanelGroup } from "../ui/resizable";
import { useProjectPreference, useProjectPreferences } from "./preferences/context";

const defaults = {
  workspaceLayout: { workspace: 77, inspector: 23 },
  sidebarLayout: { properties: 63, layers: 37 },
};

/** Imperative hydration never remounts the canvas and never becomes a saved user resize. */
export function ProjectPanelGroup({
  preference,
  enabled = true,
  ...props
}: GroupProps & {
  preference: keyof typeof defaults;
  /** Mobile has one canvas panel; keep the desktop preference without applying or saving it. */
  enabled?: boolean;
}) {
  const controller = useProjectPreferences();
  const layout = useProjectPreference(preference);
  const group = useRef<GroupImperativeHandle>(null);
  useLayoutEffect(() => {
    group.current?.setLayout(enabled ? (layout ?? defaults[preference]) : { workspace: 100 });
  }, [controller, layout, preference, enabled]);
  function protect(event: PointerEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) {
    if (!enabled) return;
    const target = event.target as HTMLElement;
    const handle = target.closest("[data-slot=resizable-handle]");
    if (handle?.closest("[data-slot=resizable-panel-group]") === event.currentTarget)
      controller?.protect(preference);
  }
  return (
    <ResizablePanelGroup
      {...props}
      groupRef={group}
      defaultLayout={enabled ? defaults[preference] : { workspace: 100 }}
      onPointerDownCapture={protect}
      onKeyDownCapture={protect}
      onLayoutChanged={(next, meta) => {
        if (!enabled || !meta.isUserInteraction) return;
        const requested = meta.requestedLayout ?? next;
        if (preference === "workspaceLayout")
          controller?.commit(preference, {
            workspace: requested.workspace!,
            inspector: requested.inspector!,
          });
        else
          controller?.commit(preference, {
            properties: requested.properties!,
            layers: requested.layers!,
          });
      }}
    />
  );
}
