import { useLibraryItemActivation } from "../items/context";
import { LibraryOpenButton } from "../items/LibraryBrowser";
import "../items/messages";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ellipsis, Star } from "lucide-react";
import type { EditorServices, ProjectSummary } from "../../../state/contracts";
import { ModeIcon } from "../../motion/ModeIcon";
import "../dashboard/messages";
import { ProjectPreview } from "./ProjectPreview";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "../../ui/dropdown-menu";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent } from "../../ui/context-menu";
import { ProjectMenuItems } from "./ProjectMenuItems";
export function ProjectCard({
  project,
  services,
  active,
  disabled = false,
  favorite = false,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onInsights,
}: {
  project: ProjectSummary;
  services: EditorServices;
  active: boolean;
  disabled?: boolean;
  favorite?: boolean;
  onOpen: () => void;
  onRename: (name: string) => Promise<boolean>;
  onDuplicate: () => void;
  onDelete: () => void;
  onInsights: () => void;
}) {
  const { t } = useTranslation();
  const previewPage = project.pages.find((page) => page.mode === "motion") ?? project.pages[0];
  const mode =
    project.mode ?? (project.pages.some((page) => page.mode === "motion") ? "motion" : "static");
  const activation = useLibraryItemActivation(
    {
      kind: "project",
      id: project.id,
      name: project.name,
      mode,
      pageId: previewPage?.id,
      preview: project.thumbnail,
      width: previewPage?.width,
      height: previewPage?.height,
    },
    onOpen,
    disabled,
  );
  const [editing, setEditing] = useState(false),
    [saving, setSaving] = useState(false);
  const cancelled = useRef(false),
    submitted = useRef(false),
    nameInput = useRef<HTMLInputElement>(null),
    menuOpen = useRef(false);
  function begin() {
    submitted.current = false;
    cancelled.current = false;
    setEditing(true);
  }
  async function rename(raw: string) {
    if (submitted.current) return;
    submitted.current = true;
    const name = raw.trim();
    if (!name || name === project.name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onRename(name);
    setSaving(false);
    if (ok) setEditing(false);
    else submitted.current = false;
  }
  const actions = {
    rename: begin,
    duplicate: onDuplicate,
    insights: onInsights,
    remove: onDelete,
  };
  function restoreRenameFocus(event: Event) {
    const input = nameInput.current;
    if (!editing || menuOpen.current || !input?.isConnected || input.disabled) return;
    event.preventDefault();
    input.focus({ preventScroll: true });
  }
  return (
    <ContextMenu
      onOpenChange={(open) => {
        menuOpen.current = open;
        if (open) activation.cancel();
      }}
    >
      <ContextMenuTrigger asChild disabled={disabled}>
        <article
          className="project-card"
          aria-label={project.name}
          data-active={active || undefined}
          aria-current={active ? "true" : undefined}
          onContextMenu={activation.cancel}
        >
          <ProjectPreview
            project={project}
            services={services}
            onOpen={(event) => (event ? activation.click(event) : onOpen())}
            onDoubleClick={activation.double}
            previewLabel={
              activation.inspectable ? t("libraryItem:preview", { name: project.name }) : undefined
            }
            disabled={disabled}
          >
            <div className="project-card-overlay project-card-caption">
              <div className="project-card-copy">
                <div className="project-card-meta">
                  {editing ? (
                    <Input
                      ref={nameInput}
                      autoFocus
                      disabled={saving || disabled}
                      maxLength={160}
                      aria-label={t("renameProject")}
                      defaultValue={project.name}
                      onFocus={(event) => event.currentTarget.select()}
                      onBlur={(event) => {
                        if (cancelled.current) {
                          cancelled.current = false;
                          return;
                        }
                        void rename(event.currentTarget.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void rename(event.currentTarget.value);
                        if (event.key === "Escape") {
                          cancelled.current = true;
                          setEditing(false);
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="project-card-name"
                      disabled={disabled}
                      onClick={activation.click}
                      onDoubleClick={activation.double}
                      onKeyDown={(event) => {
                        if (event.key === "F2") {
                          event.preventDefault();
                          begin();
                        }
                      }}
                    >
                      {favorite && (
                        <Star
                          size={12}
                          fill="currentColor"
                          className="library-favorite-badge"
                          aria-label={t("libraryItem:favorites")}
                        />
                      )}
                      <span>{project.name}</span>
                    </button>
                  )}

                  <DropdownMenu
                    onOpenChange={(open) => {
                      menuOpen.current = open;
                      if (open) activation.cancel();
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="project-options-trigger"
                        disabled={disabled}
                        aria-label={t("projectOptions")}
                      >
                        <Ellipsis size={15} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onCloseAutoFocus={restoreRenameFocus}>
                      <ProjectMenuItems actions={actions} disabled={disabled} />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="project-card-details">
                  <span className="project-card-resolution">
                    {previewPage?.width ?? project.width} × {previewPage?.height ?? project.height}{" "}
                    px
                  </span>
                  <span className="project-card-mode" data-mode={mode}>
                    <ModeIcon mode={mode} size={14} />
                    <span>
                      {t(mode === "motion" ? "dashboard:modeMotion" : "dashboard:modeStatic")}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </ProjectPreview>
          {activation.inspectable && (
            <LibraryOpenButton
              onOpen={activation.direct}
              disabled={disabled}
              label={t("openNamedProject", { name: project.name })}
            />
          )}
        </article>
      </ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={restoreRenameFocus}>
        <ProjectMenuItems actions={actions} disabled={disabled} context />
      </ContextMenuContent>
    </ContextMenu>
  );
}
