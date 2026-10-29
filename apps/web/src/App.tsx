import { useCallback, useMemo, useRef, useState } from "react";
import { useStore } from "jotai";
import { useRenderMetrics } from "./state/session/render-metrics";
import { MusArtLogo } from "./components/branding/MusArtLogo";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import type { AppProps } from "./state/contracts";
import {
  toolAtom,
  toleranceAtom,
  useEngineValue,
  useEngine,
  useTheme,
} from "./state/session/editor";
import { useShortcuts } from "./state/session/shortcuts";
import { formatUiError } from "./state/i18n/errors/format";
import "./state/i18n";
import "./styles/global.css";
import { TooltipProvider } from "./components/ui/tooltip";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./components/ui/resizable";
import { Button } from "./components/ui/button";
import { Toolbar } from "./components/toolbar/Toolbar";
import { MobileEditor } from "./components/workspace/mobile/MobileEditor";
import { MobileControlsContext, useMobileLayout } from "./components/workspace/mobile/use-mobile";
import { EditorSidebar } from "./components/workspace/EditorSidebar";
import { CanvasArea } from "./components/viewport/CanvasArea";
import { ProjectDialog, type ProjectDialogProps } from "./components/projects/ProjectDialog";
import { MotionImportConfirmation } from "./components/motion-import/ConfirmationDialog";
import { EditorNotice, type EditorNoticeValue } from "./components/notifications/EditorNotice";
import { errorDiagnostics } from "./components/notifications/diagnostics";
import { ProjectPill } from "./components/projects/ProjectPill";
import { freezeEffectPreviews } from "./state/session/effect-preview";
import { ToolSettings } from "./components/toolbar/ToolSettings";
import type { ProjectView } from "./components/search/actions";
import { MotionTimelineDock } from "./components/motion-shell/MotionTimelineDock";
import { createMotionTransport } from "./services/motion/transport";
import {
  FontLibraryProvider,
  bundledFontLibrary,
} from "./components/properties/fonts/library-context";

export function App({ engine, services, welcome = false }: AppProps) {
  const { t } = useTranslation();
  const mobile = useMobileLayout();
  const element = useRef<HTMLElement>(null);
  useRenderMetrics(element);
  useTheme();
  const projectId = useEngineValue(engine, (snapshot) => snapshot.project.id);
  const projectName = useEngineValue(engine, (snapshot) => snapshot.project.name);
  const [choosingProject, setChoosingProject] = useState(
    () => welcome || new URLSearchParams(location.search).get("welcome") === "1",
  );
  const [projectMenu, setProjectMenu] = useState<ProjectView | null>(
    choosingProject ? "projects" : null,
  );
  const [exportMenu, setExportMenu] = useState(false);
  const [timelapseMenu, setTimelapseMenu] = useState(false);
  const motionTransport = useMemo(() => createMotionTransport(engine), [engine]);
  const [notice, setNotice] = useState<EditorNoticeValue | null>(null);
  const [processing, setProcessing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const store = useStore();
  const onError = useCallback(
    (message: string, details?: string) => {
      // A failed frame cannot be repaired by requesting more frames from the same source.
      motionTransport.pause();
      setNotice((current) =>
        current?.error && current.message === message && current.details === details
          ? current
          : { message, error: true, ...(details ? { details } : {}) },
      );
    },
    [motionTransport],
  );
  const dismissNotice = useCallback(() => setNotice(null), []);
  const onTask = useCallback(
    async (task: () => void | Promise<void>, success?: string): Promise<boolean> => {
      try {
        await task();
        if (success) setNotice({ message: success, error: false });
        return true;
      } catch (error) {
        setNotice({ message: formatUiError(error), details: errorDiagnostics(error), error: true });
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
  const showTimelapse = useCallback(
    (open: boolean) => {
      if (open) motionTransport.pause();
      setTimelapseMenu(open);
    },
    [motionTransport],
  );
  useShortcuts(engine, services, onTask, !choosingProject);
  return (
    <FontLibraryProvider library={services.fonts ?? bundledFontLibrary}>
      <MobileControlsContext value={mobile}>
        <TooltipProvider delayDuration={350}>
          <main className="musart-app" ref={element}>
            <MotionImportConfirmation engine={engine} />
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
                    {!mobile && (
                      <Toolbar
                        engine={engine}
                        services={services}
                        onTask={onTask}
                        onProjects={setProjectMenu}
                        onExport={() => showExport(true)}
                        onPanelMode={(mode) => {
                          if (mode === "animate") showTimelapse(true);
                        }}
                        onImport={onImport}
                      />
                    )}
                    {!mobile && <ToolSettings services={services} onTask={onTask} />}
                    {processing && (
                      <div className="processing-notice floating-panel" role="status">
                        {t("processing")}
                      </div>
                    )}
                  </ResizablePanel>
                  {!mobile && (
                    <>
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
                          exportOpen={exportMenu}
                          onExportOpenChange={showExport}
                          timelapseOpen={timelapseMenu}
                          onTimelapseOpenChange={showTimelapse}
                        />
                      </ResizablePanel>
                    </>
                  )}
                </ResizablePanelGroup>
                {mobile ? (
                  <MobileEditor
                    engine={engine}
                    services={services}
                    run={run}
                    onTask={onTask}
                    exportOpen={exportMenu}
                    onExportOpenChange={showExport}
                    timelapseOpen={timelapseMenu}
                    onTimelapseOpenChange={showTimelapse}
                    tools={
                      <>
                        <Toolbar
                          engine={engine}
                          services={services}
                          onTask={onTask}
                          onProjects={setProjectMenu}
                          onExport={() => showExport(true)}
                          onPanelMode={(mode) => {
                            if (mode === "animate") showTimelapse(true);
                          }}
                          onImport={onImport}
                        />
                        <ToolSettings services={services} onTask={onTask} />
                      </>
                    }
                  />
                ) : (
                  <MotionTimelineDock engine={engine} />
                )}
                <input
                  ref={input}
                  type="file"
                  multiple
                  accept="image/*,video/*,.svg"
                  className="sr-only"
                  aria-label={t("import")}
                  onChange={(event) => {
                    if (event.target.files?.length) onDropFiles(Array.from(event.target.files));
                    event.target.value = "";
                  }}
                />
              </>
            )}
            <EditorNotice notice={notice} onClose={dismissNotice} />
            {projectMenu && (
              <ProjectMenu
                engine={engine}
                services={services}
                {...(choosingProject ? { welcome: true } : { projectName, projectId })}
                initialView={projectMenu}
                onClose={() => {
                  setChoosingProject(false);
                  setProjectMenu(null);
                }}
                onTask={onTask}
              />
            )}
          </main>
        </TooltipProvider>
      </MobileControlsContext>
    </FontLibraryProvider>
  );
}

/** Canonical origin follows edits only while the dashboard is mounted. */
function ProjectMenu({ engine, ...props }: ProjectDialogProps & { engine: EnginePort }) {
  const snapshot = useEngine(engine);
  const origin = useMemo(
    () => ({
      projectId: snapshot.project.id,
      pageId: snapshot.pageId,
      revision: snapshot.revision,
    }),
    [snapshot.project.id, snapshot.pageId, snapshot.revision],
  );
  return <ProjectDialog {...props} origin={origin} />;
}
