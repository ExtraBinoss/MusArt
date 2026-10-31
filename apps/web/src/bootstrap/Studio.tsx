import { MeltLogo } from "../ui/brand/MeltLogo";
import { BrandStatus } from "../ui/brand/BrandStatus";
import { useTranslation } from "react-i18next";
import "./messages";
import "./loading.css";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ProjectDialog } from "../components/projects/ProjectDialog";
import { TooltipProvider } from "../components/ui/tooltip";
import { createRuntime, type EditorRuntime } from "../services/session/runtime";
import { attachAutomation } from "../services/automation/automation";
import { formatUiError } from "../state/i18n/errors/format";
import type { StudioRouting } from "../state/contracts";
import { createProjectFromTemplate } from "../services/projects/templates/catalog";
const App = lazy(() => import("../App").then((module) => ({ default: module.App })));
export function Studio({ routing }: { routing?: StudioRouting } = {}) {
  const { t } = useTranslation("startup");
  const [runtime, setRuntime] = useState<EditorRuntime | null>(null);
  const [error, setError] = useState("");
  const initialRouting = useRef(routing);
  const [editorOpened, setEditorOpened] = useState(routing?.view !== "dashboard");
  if (routing?.view === "editor" && !editorOpened) setEditorOpened(true);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    let current: EditorRuntime | undefined;
    let detach: (() => void) | undefined;
    const report = (error: unknown) => {
      if (!disposed) setError(formatUiError(error));
    };
    const initial = initialRouting.current;
    void createRuntime(report, {
      signal: controller.signal,
      projectId: initial?.projectId,
      editor: initial?.view === "editor",
      library: initial?.view === "dashboard",
    })
      .then(async (result) => {
        if (disposed) {
          void result.dispose().catch(report);
          return;
        }
        current = result;
        if (initial?.templateId) {
          await createProjectFromTemplate(result.services, initial.templateId, {
            signal: controller.signal,
          });
          if (disposed) return;
          initial.navigate("editor", result.engine.getSnapshot().project.id);
        }
        if (new URLSearchParams(location.search).get("automation") === "1")
          detach = attachAutomation(result.engine, result.services);
        setRuntime(result);
      })
      .catch(report);
    return () => {
      disposed = true;
      controller.abort();
      detach?.();
      void current?.dispose().catch(report);
    };
  }, []);
  useEffect(() => {
    if (
      !runtime ||
      !routing?.projectId ||
      runtime.engine.getSnapshot().project.id === routing.projectId
    )
      return;
    void runtime.services
      .openProject(routing.projectId)
      .catch((failure: unknown) => setError(formatUiError(failure)));
  }, [runtime, routing?.projectId]);
  return (
    <>
      {runtime && !editorOpened && routing ? (
        <TooltipProvider>
          <ProjectDialog
            services={runtime.services}
            welcome
            showLanding={false}
            initialView="templates"
            onHome={() => routing.navigate("home")}
            onClose={() => routing.navigate("editor", runtime.engine.getSnapshot().project.id)}
            onTask={async (task) => {
              try {
                await task();
                return true;
              } catch (failure) {
                setError(formatUiError(failure));
                return false;
              }
            }}
          />
        </TooltipProvider>
      ) : runtime ? (
        <Suspense
          fallback={
            <div className="studio-loading">
              <BrandStatus size={52} state="preparing" />
            </div>
          }
        >
          <App
            engine={runtime.engine}
            services={runtime.services}
            welcome={runtime.welcome}
            routing={routing}
          />
        </Suspense>
      ) : (
        <div className="studio-loading" role="status">
          {error ? <MeltLogo size={52} /> : <BrandStatus size={52} state="preparing" />}
          <span>{t("opening")}</span>
        </div>
      )}
      {error && (
        <div className="runtime-error" role="alert">
          <span>{error}</span>
          <button type="button" aria-label={t("dismiss")} onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
    </>
  );
}
