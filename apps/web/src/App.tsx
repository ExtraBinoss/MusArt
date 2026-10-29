import { useCallback, useRef, useState } from "react";
import { useStore } from "jotai";
import { useRenderMetrics } from "./state/session/render-metrics";
import { createPortal } from "react-dom";
import { X, AlertCircle, CheckCircle2 } from "lucide-react";
import { MusArtLogo } from "./components/branding/MusArtLogo";
import { useTranslation } from "react-i18next";
import type { AppProps } from "./state/contracts";
import { toolAtom, toleranceAtom, useEngineValue, useTheme } from "./state/session/editor";
import { useShortcuts } from "./state/session/shortcuts";
import { formatUiError } from "./state/i18n/errors/format";
import "./state/i18n";
import "./styles/global.css";
import { TooltipProvider } from "./components/ui/tooltip";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./components/ui/resizable";
import { Button } from "./components/ui/button";
import { Toolbar } from "./components/toolbar/Toolbar";
import { EditorSidebar } from "./components/workspace/EditorSidebar";
import { CanvasArea } from "./components/viewport/CanvasArea";
import { ProjectDialog } from "./components/projects/ProjectDialog";
import { ProjectPill } from "./components/projects/ProjectPill";
import { freezeEffectPreviews } from "./state/session/effect-preview";
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
  const projectId = useEngineValue(engine, (snapshot) => snapshot.project.id);
  const projectName = useEngineValue(engine, (snapshot) => snapshot.project.name);
  const [welcomeProject] = useState(() => (welcome ? projectId : null));
  const choosingProject = welcomeProject === projectId;
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
  const showExport = useCallback(
    (open: boolean) => {
      if (open) freezeEffectPreviews(engine);
      setExportMenu(open);
    },
    [engine],
  );
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
                      key={projectId}
                      engine={engine}
                      services={services}
                      name={projectName}
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
                  <EditorSidebar
                    engine={engine}
                    services={services}
                    run={run}
                    onTask={onTask}
                    panelMode={panelMode}
                    onPanelMode={setPanelMode}
                    exportOpen={exportMenu}
                    onExportOpenChange={showExport}
                  />
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
              {...(choosingProject ? { welcome: true } : { projectName, projectId })}
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
