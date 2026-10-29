import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Upload, ArrowLeft, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EditorServices } from "../../state/contracts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Tabs, TabsContent } from "../ui/tabs";
import { Button } from "../ui/button";
import { IconButton } from "../shared/IconButton";
import { DashboardTabs } from "./dashboard/DashboardTabs";
import { MusArtLogo } from "../branding/MusArtLogo";
import { NewProjectForm } from "./creation/NewProjectForm";
import { PreferencesDialog } from "./preferences/PreferencesDialog";
import { ProjectGallery } from "./gallery/ProjectGallery";
import { TemplateGallery } from "./templates/TemplateGallery";
import { createProjectFromTemplate } from "../../services/projects/templates/catalog";
import { hasCompletedOnboarding } from "../../state/onboarding/preferences";
import { OnboardingDialog } from "../onboarding/OnboardingDialog";
import "./dashboard/messages";
import "./dashboard/dashboard.css";

export type TaskRunner = (task: () => void | Promise<void>, success?: string) => Promise<boolean>;
export interface ProjectDialogProps {
  services: EditorServices;
  projectName?: string;
  welcome?: boolean;
  projectId?: string;
  onClose: () => void;
  onTask: TaskRunner;
  initialView?: "projects" | "templates" | "newProject" | "settings" | "settingsEditor";
}
/** The same dashboard works before the first document and above an open project. */
export function ProjectDialog(props: ProjectDialogProps) {
  const [onboarding, setOnboarding] = useState(() =>
    Boolean(props.welcome && !hasCompletedOnboarding()),
  );
  if (onboarding) return <OnboardingDialog onComplete={() => setOnboarding(false)} />;
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
  onClose,
  onTask,
  initialView = "projects",
  welcome = false,
}: ProjectDialogProps) {
  const { t } = useTranslation();
  const [view, setView] = useState(initialView === "projects" ? "projects" : "templates");
  const [creating, setCreating] = useState(initialView === "newProject");
  const [busy, setBusy] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scope = useRef({ alive: true, pending: false });
  useEffect(() => {
    const current = scope.current;
    current.alive = true;
    return () => {
      current.alive = false;
    };
  }, []);
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
    setView("templates");
    setCreating(true);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !welcome && !busy && !preferences) onClose();
      }}
    >
      <DialogContent
        closeLabel={t("close")}
        showCloseButton={!welcome && !busy}
        onEscapeKeyDown={(event) => {
          if (welcome || busy || preferences) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (welcome || busy || preferences) event.preventDefault();
        }}
        data-welcome={welcome || undefined}
        className="floating-panel project-dashboard"
      >
        <DialogHeader className="dashboard-header">
          <div className="dashboard-header-line">
            <div className="dashboard-brand">
              <MusArtLogo size={34} />
              <span>MusArt</span>
            </div>
            <IconButton
              label={t("settings")}
              className="dashboard-settings"
              disabled={busy}
              onClick={() => setPreferences(true)}
            >
              <Settings2 size={16} />
            </IconButton>
          </div>
          <DialogTitle className="sr-only">{t("dashboard:title")}</DialogTitle>
          <DialogDescription>{t("dashboard:local")}</DialogDescription>
        </DialogHeader>
        <Tabs
          value={view}
          onValueChange={(value) => {
            if (!busy) {
              setView(value);
              setCreating(false);
            }
          }}
          className="dashboard-body"
        >
          <div className="dashboard-navigation">
            <DashboardTabs value={view} disabled={busy} />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={14} />
              {t("dashboard:import")}
            </Button>
          </div>
          <TabsContent value="projects" className="dashboard-pane scrollable-panel">
            <div className="dashboard-intro">
              <div>
                <h2>
                  {t(projectName && !welcome ? "dashboard:projectHeading" : "dashboard:question")}
                </h2>
                <p>{t("dashboard:projectsHint")}</p>
              </div>
              <Button size="sm" onClick={custom} disabled={busy}>
                <Plus size={14} />
                {t("dashboard:new")}
              </Button>
            </div>
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
            />
          </TabsContent>
          <TabsContent value="templates" className="dashboard-pane scrollable-panel">
            {creating ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="dashboard-back"
                  onClick={() => setCreating(false)}
                >
                  <ArrowLeft size={14} />
                  {t("dashboard:back")}
                </Button>
                <div className="dashboard-intro">
                  <div>
                    <h2>{t("dashboard:question")}</h2>
                    <p>{t("dashboard:createHint")}</p>
                  </div>
                </div>
                <div className="dashboard-creation">
                  <NewProjectForm
                    disabled={busy}
                    onCreate={(options) => complete(() => services.createProject(options))}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="dashboard-intro">
                  <div>
                    <h2>{t("dashboard:question")}</h2>
                    <p>{t("dashboard:description")}</p>
                  </div>
                  <Button variant="outline" size="sm" disabled={busy} onClick={custom}>
                    <Plus size={14} />
                    {t("dashboard:custom")}
                  </Button>
                </div>
                <TemplateGallery
                  busy={busy}
                  onChoose={(id) => complete(() => createProjectFromTemplate(services, id))}
                />
              </>
            )}
          </TabsContent>
        </Tabs>
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
