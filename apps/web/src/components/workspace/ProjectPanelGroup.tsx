import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
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
  const pendingLayoutRef = useRef<Record<string, number> | null>(null);
  const restore = useCallback(() => {
    const target = pendingLayoutRef.current;
    const current = group.current?.getLayout();
    if (
      !target ||
      !current ||
      Object.keys(target).length !== Object.keys(current).length ||
      Object.keys(target).some((id) => !(id in current))
    )
      return;
    pendingLayoutRef.current = null;
    if (Object.keys(target).some((id) => target[id] !== current[id]))
      group.current?.setLayout(target);
  }, []);
  useLayoutEffect(() => {
    pendingLayoutRef.current = enabled ? (layout ?? defaults[preference]) : { workspace: 100 };
    restore();
  }, [controller, layout, preference, enabled, restore]);
  function protect(event: PointerEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) {
    if (!enabled) return;
    const target = event.target as HTMLElement;
    const handle = target.closest("[data-slot=resizable-handle]");
    if (handle?.closest("[data-slot=resizable-panel-group]") === event.currentTarget) {
      pendingLayoutRef.current = null;
      controller?.protect(preference);
    }
  }
  return (
    <ResizablePanelGroup
      {...props}
      groupRef={group}
      defaultLayout={enabled ? defaults[preference] : { workspace: 100 }}
      onPointerDownCapture={protect}
      onKeyDownCapture={protect}
      onLayoutChanged={(next, meta) => {
        if (!meta.isUserInteraction) {
          restore();
          return;
        }
        if (!enabled) return;
        const requested = meta.requestedLayout ?? next;
        if (Object.keys(defaults[preference]).some((id) => !(id in requested))) return;
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
