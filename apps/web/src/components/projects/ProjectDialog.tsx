import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Settings2 } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useMobileLayout } from "../workspace/mobile/use-mobile";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { LibraryToolbar } from "./dashboard/LibraryToolbar";
import { LibraryTransition } from "./dashboard/LibraryTransition";
import { ProjectCreateActions } from "./dashboard/ProjectCreateActions";
import { useTranslation } from "react-i18next";
import type { EditorServices, ProjectSummary } from "../../state/contracts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Tabs, TabsContent } from "../ui/tabs";
import { Button } from "../ui/button";
import { IconButton } from "../shared/IconButton";
import { LibrarySidebar } from "./dashboard/LibrarySidebar";
import { DashboardTabs } from "./dashboard/DashboardTabs";
import { MusArtLogo } from "../branding/MusArtLogo";
import { NewProjectForm } from "./creation/NewProjectForm";
import { PreferencesDialog } from "./preferences/PreferencesDialog";
import { ProjectGallery } from "./gallery/ProjectGallery";
import { TemplateGallery } from "./templates/TemplateGallery";
import { createProjectFromTemplate } from "../../services/projects/templates/catalog";
import type { TemplateLoadOptions } from "../../services/projects/templates/motion/loader";
import { LandingPage } from "./landing/LandingPage";
import "./creation/messages";
import "./dashboard/messages";
import "./dashboard/dashboard.css";

export type TaskRunner = (task: () => void | Promise<void>, success?: string) => Promise<boolean>;
export interface ProjectDialogProps {
  services: EditorServices;
  projectName?: string;
  welcome?: boolean;
  projectId?: string;
  origin?: TemplateLoadOptions["expectedOrigin"];
  onClose: () => void;
  onTask: TaskRunner;
  initialView?: "projects" | "templates" | "newProject" | "settings" | "settingsEditor";
}
/** The same dashboard works before the first document and above an open project. */
export function ProjectDialog(props: ProjectDialogProps) {
  return props.initialView === "settings" || props.initialView === "settingsEditor" ? (
    <PreferencesDialog
      onClose={props.onClose}
      initialSection={props.initialView === "settingsEditor" ? "editor" : "general"}
    />
  ) : (
    <ProjectDashboard {...props} />
  );
}
function ProjectDashboard({
  services,
  projectName,
  projectId,
  origin,
  onClose,
  onTask,
  initialView = "projects",
  welcome = false,
}: ProjectDialogProps) {
  const { t } = useTranslation();
  const mobile = useMobileLayout();
  const [landing, setLanding] = useState(Boolean(welcome && initialView !== "newProject"));
  const [view, setView] = useState<"projects" | "templates">(
    initialView === "templates" ? "templates" : "projects",
  );
  const [queries, setQueries] = useState({ projects: "", templates: "" });
  const [templateMode, setTemplateMode] = useState<"static" | "motion">("static");
  const [projectHints, setProjectHints] = useState<ProjectSummary[]>([]);
  const [creating, setCreating] = useState(initialView === "newProject");
  const [busy, setBusy] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scope = useRef({ alive: true, pending: false });
  const templateRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const current = scope.current;
    current.alive = true;
    return () => {
      current.alive = false;
      templateRequest.current?.abort();
    };
  }, []);
  useEffect(
    () => () => templateRequest.current?.abort(),
    [origin?.projectId, origin?.pageId, origin?.revision, projectId, welcome],
  );
  const perform = useCallback(
    async (task: () => void | Promise<void>, success?: string) => {
      const current = scope.current;
      if (current.pending || !current.alive) return false;
      current.pending = true;
      setBusy(true);
      const ok = await onTask(task, success);
      current.pending = false;
      if (!current.alive) return false;
      setBusy(false);
      return ok;
    },
    [onTask],
  );
  function complete(task: () => void | Promise<void>) {
    void perform(task).then((ok) => {
      if (ok && scope.current.alive) onClose();
    });
  }
  function custom() {
    if (!scope.current.pending && scope.current.alive) setCreating(true);
  }
  function home() {
    if (!scope.current.pending && scope.current.alive) setLanding(true);
  }
  function changeView(value: string) {
    if (
      scope.current.pending ||
      !scope.current.alive ||
      (value !== "projects" && value !== "templates")
    )
      return;
    setView(value);
    setCreating(false);
  }
  function chooseTemplate(id: string) {
    if (scope.current.pending || !scope.current.alive) return;
    const request = new AbortController();
    templateRequest.current?.abort();
    templateRequest.current = request;
    setTemplateLoading(id === "in-bloom" || id === "motion-stress-lab");
    complete(async () => {
      try {
        await createProjectFromTemplate(services, id, {
          signal: request.signal,
          expectedOrigin: origin,
        });
      } finally {
        if (templateRequest.current === request) {
          templateRequest.current = null;
          if (scope.current.alive) setTemplateLoading(false);
        }
      }
    });
  }
  if (landing)
    return (
      <LandingPage
        onCreate={() => setLanding(false)}
        onTemplate={chooseTemplate}
        busy={busy}
        onCancel={templateLoading ? () => templateRequest.current?.abort() : undefined}
      />
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !welcome && !busy && !preferences && !creating) onClose();
      }}
    >
      <DialogContent
        closeLabel={t("close")}
        showCloseButton={!welcome && !busy}
        onEscapeKeyDown={(event) => {
          if (welcome || busy || preferences || creating) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (welcome || busy || preferences || creating) event.preventDefault();
        }}
        data-welcome={welcome || undefined}
        className="floating-panel project-dashboard"
      >
        <div className="dashboard-sidebar">
          <Button
            variant="ghost"
            className="dashboard-brand"
            aria-label={t("dashboard:home")}
            disabled={busy}
            onClick={home}
          >
            <MusArtLogo size={32} />
            <span>MusArt</span>
          </Button>
          <LibrarySidebar
            services={services}
            onTask={onTask}
            view={view}
            busy={busy}
            onViewChange={changeView}
            onChooseRecent={(id) => complete(() => services.openProject(id))}
            onPreferences={() => setPreferences(true)}
          />
        </div>
        <div className="dashboard-main">
          <DialogHeader className="dashboard-header">
            <div className="dashboard-header-line">
              <Button
                variant="ghost"
                className="dashboard-home"
                aria-label={t("dashboard:backHomeLabel")}
                disabled={busy}
                onClick={home}
              >
                <ArrowLeft size={15} />
                {t("dashboard:backHome")}
              </Button>
              <div className="dashboard-header-actions">
                {mobile && (
                  <IconButton
                    label={t("settings")}
                    className="dashboard-settings dashboard-mobile-settings"
                    disabled={busy}
                    onClick={() => setPreferences(true)}
                  >
                    <Settings2 size={16} />
                  </IconButton>
                )}
              </div>
            </div>
            <DialogTitle className="sr-only">{t("dashboard:title")}</DialogTitle>
            <DialogDescription className="sr-only">{t("dashboard:description")}</DialogDescription>
          </DialogHeader>
          <Tabs value={view} onValueChange={changeView} className="dashboard-body">
            <div className="dashboard-navigation">
              <DashboardTabs value={view} disabled={busy} />
            </div>
            <ScrollShadow className="dashboard-list-scroll" surface="var(--background)">
              <TabsContent value={view} forceMount className="dashboard-pane scrollable-panel">
                <div className="dashboard-pane-content">
                  <div className="dashboard-intro">
                    <div>
                      <h2>
                        {t(
                          view === "projects" && projectName && !welcome
                            ? "dashboard:projectHeading"
                            : "dashboard:question",
                        )}
                      </h2>
                      <p>
                        {t(
                          view === "projects" ? "dashboard:projectsHint" : "dashboard:description",
                        )}
                      </p>
                    </div>
                    <ProjectCreateActions
                      label={t(view === "projects" ? "dashboard:new" : "dashboard:custom")}
                      disabled={busy}
                      onCreate={custom}
                      onImport={() => fileRef.current?.click()}
                    />
                  </div>
                  <LibraryToolbar
                    view={view}
                    query={queries[view]}
                    onQueryChange={(query) =>
                      setQueries((current) => ({ ...current, [view]: query }))
                    }
                    mode={templateMode}
                    onModeChange={setTemplateMode}
                    projects={projectHints}
                    disabled={busy}
                  />
                  <div className="dashboard-grid-stage">
                    <AnimatePresence initial={false}>
                      <LibraryTransition key={view}>
                        {view === "projects" ? (
                          <ProjectGallery
                            services={services}
                            activeProjectId={projectId}
                            onTask={perform}
                            busy={busy}
                            onOpen={() => {
                              if (scope.current.alive) onClose();
                            }}
                            onCreate={custom}
                            showCreateAction={false}
                            query={queries.projects}
                            hideSearch
                            onProjectsLoaded={setProjectHints}
                          />
                        ) : (
                          <TemplateGallery
                            busy={busy}
                            onChoose={chooseTemplate}
                            onCancel={
                              templateLoading ? () => templateRequest.current?.abort() : undefined
                            }
                            query={queries.templates}
                            mode={templateMode}
                            hideToolbar
                          />
                        )}
                      </LibraryTransition>
                    </AnimatePresence>
                  </div>
                </div>
              </TabsContent>
            </ScrollShadow>
          </Tabs>
        </div>
        {creating && (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open && !busy) setCreating(false);
            }}
          >
            <DialogContent
              className="creation-dialog"
              showCloseButton={!busy}
              onEscapeKeyDown={(event) => {
                if (busy) event.preventDefault();
              }}
              onInteractOutside={(event) => {
                if (busy) event.preventDefault();
              }}
            >
              <DialogHeader>
                <DialogTitle>{t("creation:title")}</DialogTitle>
                <DialogDescription>{t("creation:hint")}</DialogDescription>
              </DialogHeader>
              <NewProjectForm
                disabled={busy}
                onCreate={(options) => complete(() => services.createProject(options))}
              />
            </DialogContent>
          </Dialog>
        )}
        {preferences && <PreferencesDialog onClose={() => setPreferences(false)} />}
        <input
          ref={fileRef}
          className="sr-only"
          type="file"
          accept=".musart,.json,application/json"
          aria-label={t("dashboard:import")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) complete(() => services.openPortable(file));
            event.target.value = "";
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
