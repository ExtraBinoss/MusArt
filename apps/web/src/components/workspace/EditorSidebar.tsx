import { memo, useDeferredValue, useMemo, useState } from "react";
import { PenTool, Clapperboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import { useEngine } from "../../state/session/editor";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "../ui/resizable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Inspector } from "../properties/Inspector";
import { sameInspectorPage } from "../properties/inspector-scope";
import { LayersPanel } from "../layers/LayersPanel";
import { layerSelection } from "../layers/menu/selection";
import { AnimatePanel } from "../animation/AnimatePanel";
import { ExportPopover } from "../export/ExportPopover";
import type { PanelMode } from "../search/actions";
import type { TaskRunner } from "../projects/ProjectDialog";
import { InspectorInteractionBoundary } from "./InspectorInteractionBoundary";

/** Selection-driven panels subscribe here, without rebuilding the workspace and toolbar. */
export const EditorSidebar = memo(function EditorSidebar({
  engine,
  services,
  run,
  onTask,
  panelMode,
  onPanelMode,
  exportOpen,
  onExportOpenChange,
}: {
  engine: EnginePort;
  services: EditorServices;
  run: (action: () => void) => void;
  onTask: TaskRunner;
  panelMode: PanelMode;
  onPanelMode: (mode: PanelMode) => void;
  exportOpen: boolean;
  onExportOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const snapshot = useEngine(engine);
  const page =
    snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
    snapshot.project.pages[0]!;
  const target = JSON.stringify([snapshot.project.id, page.id, snapshot.selection]);
  const properties = useMemo(
    () => ({ target, page, selection: snapshot.selection, assets: snapshot.project.assets }),
    [target, page, snapshot.selection, snapshot.project.assets],
  );
  const deferredProperties = useDeferredValue(properties);
  const [retained, setRetained] = useState(deferredProperties);
  const unchanged =
    retained.target === deferredProperties.target &&
    retained.assets === deferredProperties.assets &&
    sameInspectorPage(retained.page, deferredProperties.page);
  // Only adopt a new context after it has deferred; ruler-only metadata retains the shown scope.
  if (!unchanged) setRetained(deferredProperties);
  const shownProperties = unchanged ? retained : deferredProperties;
  const pending =
    target !== deferredProperties.target ||
    properties.assets !== deferredProperties.assets ||
    !sameInspectorPage(page, deferredProperties.page);
  const selected = useMemo(
    () => layerSelection(shownProperties.page, shownProperties.selection).selected,
    [shownProperties],
  );
  return (
    <ResizablePanelGroup orientation="vertical" className="sidebar-panels">
      <ResizablePanel id="properties" defaultSize="63%" minSize="22%">
        <Tabs
          value={panelMode}
          onValueChange={(mode) => onPanelMode(mode as PanelMode)}
          className="inspector-tabs"
        >
          <div className="inspector-header">
            <TabsList aria-label={t("panelMode")} className="inspector-mode">
              <TabsTrigger value="design">
                <PenTool aria-hidden />
                {t("design")}
              </TabsTrigger>
              <TabsTrigger value="animate">
                <Clapperboard aria-hidden />
                {t("animate")}
              </TabsTrigger>
            </TabsList>
            <ExportPopover
              open={exportOpen}
              onOpenChange={onExportOpenChange}
              page={page}
              pageCount={snapshot.project.pages.length}
              selection={snapshot.selection}
              revision={snapshot.revision}
              services={services}
              onTask={onTask}
            />
          </div>
          <TabsContent value="design">
            <InspectorInteractionBoundary busy={pending}>
              <Inspector
                engine={engine}
                page={shownProperties.page}
                assets={shownProperties.assets}
                selected={selected}
                run={run}
              />
            </InspectorInteractionBoundary>
          </TabsContent>
          <TabsContent value="animate">
            <AnimatePanel engine={engine} services={services} />
          </TabsContent>
        </Tabs>
      </ResizablePanel>
      <ResizableHandle aria-label={t("panelResize")} withHandle className="layers-resize" />
      <ResizablePanel id="layers" defaultSize="37%" minSize="20%">
        <LayersPanel
          engine={engine}
          services={services}
          page={page}
          project={snapshot.project}
          selection={snapshot.selection}
          run={run}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
});
