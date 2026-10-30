import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Ellipsis, Pencil, Trash2, HardDrive, History } from "lucide-react";
import type { EditorServices, ProjectSummary } from "../../../state/contracts";
import { ModeIcon } from "../../motion/ModeIcon";
import "../dashboard/messages";
import { ProjectPreview } from "./ProjectPreview";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../../ui/dropdown-menu";
export function ProjectCard({
  project,
  services,
  active,
  disabled = false,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onInsights,
  onClearHistory,
}: {
  project: ProjectSummary;
  services: EditorServices;
  active: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onRename: (name: string) => Promise<boolean>;
  onDuplicate: () => void;
  onDelete: () => void;
  onInsights: () => void;
  onClearHistory: () => void;
}) {
  const { t } = useTranslation();
  const previewPage = project.pages.find((page) => page.mode === "motion") ?? project.pages[0];
  const mode =
    project.mode ?? (project.pages.some((page) => page.mode === "motion") ? "motion" : "static");
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
  return (
    <article
      className="project-card"
      aria-label={project.name}
      data-active={active || undefined}
      aria-current={active ? "true" : undefined}
    >
      <ProjectPreview project={project} services={services} onOpen={onOpen} disabled={disabled}>
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
                  onClick={onOpen}
                  onKeyDown={(event) => {
                    if (event.key === "F2") {
                      event.preventDefault();
                      begin();
                    }
                  }}
                >
                  {project.name}
                </button>
              )}
            </div>
            <span className="project-card-resolution">
              {previewPage?.width ?? project.width} × {previewPage?.height ?? project.height} px
            </span>
          </div>
          <span className="project-card-mode" data-mode={mode}>
            <ModeIcon mode={mode} size={14} />
            <span>{t(mode === "motion" ? "dashboard:modeMotion" : "dashboard:modeStatic")}</span>
          </span>
        </div>
        <DropdownMenu
          onOpenChange={(open) => {
            menuOpen.current = open;
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
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              const input = nameInput.current;
              if (!editing || menuOpen.current || !input?.isConnected || input.disabled) return;
              event.preventDefault();
              input.focus({ preventScroll: true });
            }}
          >
            <DropdownMenuItem
              disabled={disabled}
              onSelect={() => {
                begin();
              }}
            >
              <Pencil size={14} />
              {t("renameProject")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={disabled} onSelect={onDuplicate}>
              <Copy size={14} />
              {t("duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={disabled} onSelect={onInsights}>
              <HardDrive size={14} />
              {t("projectStorage")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={disabled} onSelect={onClearHistory}>
              <History size={14} />
              {t("clearHistory")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={disabled} variant="destructive" onSelect={onDelete}>
              <Trash2 size={14} />
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ProjectPreview>
    </article>
  );
}
