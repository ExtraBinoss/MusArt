import { useCallback, useMemo, useRef, useState } from "react";
import { useStore } from "jotai";
import { useRenderMetrics } from "./state/session/render-metrics";
import { createPortal } from "react-dom";
import { X, AlertCircle, CheckCircle2, PenTool, Clapperboard } from "lucide-react";
import { MusArtLogo } from "./components/branding/MusArtLogo";
import { useTranslation } from "react-i18next";
import { layerSelection } from "./components/layers/menu/selection";
import type { AppProps } from "./state/contracts";
import { toolAtom, toleranceAtom, useEngine, useTheme } from "./state/session/editor";
import { useShortcuts } from "./state/session/shortcuts";
import { formatUiError } from "./state/i18n/errors/format";
import "./state/i18n";
import "./styles/global.css";
import { TooltipProvider } from "./components/ui/tooltip";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./components/ui/resizable";
import { Button } from "./components/ui/button";
import { Toolbar } from "./components/toolbar/Toolbar";
import { Inspector } from "./components/properties/Inspector";
import { LayersPanel } from "./components/layers/LayersPanel";
import { CanvasArea } from "./components/viewport/CanvasArea";
import { ProjectDialog } from "./components/projects/ProjectDialog";
import { ProjectPill } from "./components/projects/ProjectPill";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { AnimatePanel } from "./components/animation/AnimatePanel";
import { freezeEffectPreviews } from "./state/session/effect-preview";
import { ExportPopover } from "./components/export/ExportPopover";
import { ToolSettings } from "./components/toolbar/ToolSettings";
import type { PanelMode, ProjectView } from "./components/search/actions";
import {
  FontLibraryProvider,
  bundledFontLibrary,
} from "./components/properties/fonts/library-context";

export function App({ engine, services, welcome = false }: AppProps) {
  const { t } = useTranslation();
  const element = useRef<HTMLElement>(null);
  useRenderMetrics(element);
  useTheme();
  const snapshot = useEngine(engine);
  const page =
    snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
    snapshot.project.pages[0]!;
  const selected = useMemo(
    () => layerSelection(page, snapshot.selection).selected,
    [page, snapshot.selection],
  );
  const [welcomeProject] = useState(() => (welcome ? snapshot.project.id : null));
  const choosingProject = welcomeProject === snapshot.project.id;
  const [projectMenu, setProjectMenu] = useState<ProjectView | null>(welcome ? "projects" : null);
  const [exportMenu, setExportMenu] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>("design");
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const [processing, setProcessing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const store = useStore();
  const onError = useCallback((message: string) => setNotice({ message, error: true }), []);
  const onTask = useCallback(
    async (task: () => void | Promise<void>, success?: string): Promise<boolean> => {
      try {
        await task();
        if (success) setNotice({ message: success, error: false });
        return true;
      } catch (error) {
        setNotice({ message: formatUiError(error), error: true });
        return false;
      }
    },
    [],
  );
  const run = useCallback(
    (action: () => void) => {
      void onTask(action);
    },
    [onTask],
  );
  const onDropFiles = useCallback(
    (files: File[]) => {
      void onTask(() => services.importFiles(files));
    },
    [onTask, services],
  );
  const onImagePoint = useCallback(
    (layerId: string, x: number, y: number) => {
      const tool = store.get(toolAtom);
      if (tool !== "wand" && tool !== "segment") return;
      setProcessing(true);
      void onTask(() =>
        services.selectImagePoint(layerId, x, y, tool, store.get(toleranceAtom)),
      ).finally(() => setProcessing(false));
    },
    [onTask, services, store],
  );
  const onImport = useCallback(() => input.current?.click(), []);
  const showExport = (open: boolean) => {
    if (open) freezeEffectPreviews(engine);
    setExportMenu(open);
  };
  useShortcuts(engine, services, onTask, !choosingProject);
  return (
    <FontLibraryProvider library={services.fonts ?? bundledFontLibrary}>
      <TooltipProvider delayDuration={350}>
        <main className="musart-app" ref={element}>
          {!choosingProject && (
            <>
              <ResizablePanelGroup orientation="horizontal" className="workspace-panels">
                <ResizablePanel
                  id="workspace"
                  minSize="35%"
                  defaultSize="77%"
                  className="workspace"
                >
                  <CanvasArea
                    services={services}
                    engine={engine}
                    onError={onError}
                    onDropFiles={onDropFiles}
                    onImagePoint={onImagePoint}
                    fontResolver={services.fonts?.resolve}
                  />
                  <div className="project-trigger">
                    <Button
                      variant="ghost"
                      className="brand-button floating-panel"
                      aria-label={t("projectMenu")}
                      onClick={() => setProjectMenu("projects")}
                    >
                      <MusArtLogo />
                    </Button>
                    <ProjectPill
                      key={snapshot.project.id}
                      engine={engine}
                      services={services}
                      name={snapshot.project.name}
                      onTask={onTask}
                    />
                  </div>
                  <Toolbar
                    engine={engine}
                    services={services}
                    onTask={onTask}
                    onProjects={setProjectMenu}
                    onExport={() => showExport(true)}
                    onPanelMode={setPanelMode}
                    onImport={onImport}
                  />
                  <ToolSettings services={services} onTask={onTask} />
                  {processing && (
                    <div className="processing-notice floating-panel" role="status">
                      {t("processing")}
                    </div>
                  )}
                </ResizablePanel>
                <ResizableHandle aria-label={t("panelResize")} className="sidebar-resize" />
                <ResizablePanel
                  id="inspector"
                  minSize="260px"
                  maxSize="480px"
                  defaultSize="320px"
                  className="sidebar"
                >
                  <ResizablePanelGroup orientation="vertical" className="sidebar-panels">
                    <ResizablePanel id="properties" defaultSize="63%" minSize="22%">
                      <Tabs
                        value={panelMode}
                        onValueChange={(mode) => setPanelMode(mode as PanelMode)}
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
                            open={exportMenu}
                            onOpenChange={showExport}
                            page={page}
                            pageCount={snapshot.project.pages.length}
                            selection={snapshot.selection}
                            revision={snapshot.revision}
                            services={services}
                            onTask={onTask}
                          />
                        </div>
                        <TabsContent value="design">
                          <Inspector engine={engine} page={page} selected={selected} run={run} />
                        </TabsContent>
                        <TabsContent value="animate">
                          <AnimatePanel engine={engine} services={services} />
                        </TabsContent>
                      </Tabs>
                    </ResizablePanel>
                    <ResizableHandle
                      aria-label={t("panelResize")}
                      withHandle
                      className="layers-resize"
                    />
                    <ResizablePanel id="layers" defaultSize="37%" minSize="20%">
                      <LayersPanel
                        services={services}
                        engine={engine}
                        page={page}
                        project={snapshot.project}
                        selection={snapshot.selection}
                        run={run}
                      />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>
              </ResizablePanelGroup>
              <input
                ref={input}
                type="file"
                multiple
                accept="image/*,.svg"
                className="sr-only"
                aria-label={t("import")}
                onChange={(event) => {
                  if (event.target.files?.length) onDropFiles(Array.from(event.target.files));
                  event.target.value = "";
                }}
              />
            </>
          )}
          {createPortal(
            <div aria-live="polite" aria-atomic="true">
              {notice && (
                <div
                  className={`editor-notice floating-panel ${notice.error ? "error-notice" : ""}`}
                  role={notice.error ? "alert" : "status"}
                >
                  {notice.error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                  <span>{notice.message}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("close")}
                    onClick={() => setNotice(null)}
                  >
                    <X size={14} />
                  </Button>
                </div>
              )}
            </div>,
            document.body,
          )}
          {projectMenu && (
            <ProjectDialog
              services={services}
              {...(choosingProject
                ? { welcome: true }
                : { projectName: snapshot.project.name, projectId: snapshot.project.id })}
              initialView={projectMenu}
              onClose={() => {
                if (engine.getSnapshot().project.id !== welcomeProject) setProjectMenu(null);
              }}
              onTask={onTask}
            />
          )}
        </main>
      </TooltipProvider>
    </FontLibraryProvider>
  );
}
