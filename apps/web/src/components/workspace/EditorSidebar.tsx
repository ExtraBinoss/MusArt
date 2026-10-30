import { memo, useMemo, useState } from "react";
import { PenTool } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Composition, EnginePort, Project } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import { useEngine } from "../../state/session/editor";
import { ResizablePanel, ResizableHandle } from "../ui/resizable";
import { ProjectPanelGroup } from "./ProjectPanelGroup";
import { Inspector } from "../properties/Inspector";
import { sameInspectorPage } from "../properties/inspector-scope";
import { LayersPanel } from "../layers/LayersPanel";
import { layerSelection } from "../layers/menu/selection";
import { ExportActions } from "../export/ExportActions";
import type { TaskRunner } from "../projects/ProjectDialog";
import { InspectorInteractionBoundary } from "./InspectorInteractionBoundary";
import { useAttachmentPresentation } from "../shared/use-attachment-presentation";

/** Selection-driven panels subscribe here, without rebuilding the workspace and toolbar. */
export const EditorSidebar = memo(function EditorSidebar({
  engine,
  services,
  run,
  onTask,
  timelapseOpen = false,
  onTimelapseOpenChange,
  exportOpen,
  onExportOpenChange,
  mobilePanel,
}: {
  mobilePanel?: "properties" | "layers";
  engine: EnginePort;
  services: EditorServices;
  run: (action: () => void) => void;
  onTask: TaskRunner;
  timelapseOpen?: boolean;
  onTimelapseOpenChange?: (open: boolean) => void;
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
  const inspector = (
    <div className="inspector-tabs">
      <div className="inspector-header">
        <span className="inspector-design-label">
          <PenTool size={13} />
          {t("design")}
        </span>
        <ExportActions
          engine={engine}
          timelapseOpen={timelapseOpen}
          onTimelapseOpenChange={onTimelapseOpenChange ?? (() => {})}
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
      <InspectorPresentation engine={engine} properties={properties} run={run} />
    </div>
  );
  const layers = (
    <LayersPanel
      engine={engine}
      services={services}
      page={page}
      project={snapshot.project}
      selection={snapshot.selection}
      run={run}
    />
  );
  if (mobilePanel) return mobilePanel === "properties" ? inspector : layers;
  return (
    <ProjectPanelGroup preference="sidebarLayout" orientation="vertical" className="sidebar-panels">
      <ResizablePanel id="properties" defaultSize="63%" minSize="22%">
        {inspector}
      </ResizablePanel>
      <ResizableHandle aria-label={t("panelResize")} withHandle className="layers-resize" />
      <ResizablePanel id="layers" defaultSize="37%" minSize="20%">
        {layers}
      </ResizablePanel>
    </ProjectPanelGroup>
  );
});

/** Overlay ownership updates only this presentation boundary, not the sidebar's tabs and rows. */
const InspectorPresentation = memo(function InspectorPresentation({
  engine,
  properties,
  run,
}: {
  engine: EnginePort;
  properties: { target: string; page: Composition; selection: string[]; assets: Project["assets"] };
  run: (action: () => void) => void;
}) {
  const deferredProperties = useAttachmentPresentation(properties);
  const [retained, setRetained] = useState(deferredProperties);
  const unchanged =
    retained.target === deferredProperties.target &&
    retained.assets === deferredProperties.assets &&
    sameInspectorPage(retained.page, deferredProperties.page);
  if (!unchanged) setRetained(deferredProperties);
  const shownProperties = unchanged ? retained : deferredProperties;
  const pending =
    properties.target !== deferredProperties.target ||
    properties.assets !== deferredProperties.assets ||
    !sameInspectorPage(properties.page, deferredProperties.page);
  const selected = useMemo(
    () => layerSelection(shownProperties.page, shownProperties.selection).selected,
    [shownProperties],
  );
  return (
    <InspectorInteractionBoundary busy={pending}>
      <Inspector
        engine={engine}
        page={shownProperties.page}
        assets={shownProperties.assets}
        selected={selected}
        run={run}
      />
    </InspectorInteractionBoundary>
  );
});
