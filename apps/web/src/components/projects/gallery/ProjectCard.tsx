import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Ellipsis, Pencil, Trash2, HardDrive, History } from "lucide-react";
import type { EditorServices, ProjectSummary } from "../../../state/contracts";
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
  const { t, i18n } = useTranslation();
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
    <article className="project-card" aria-label={project.name} data-active={active || undefined}>
      <ProjectPreview project={project} services={services} onOpen={onOpen} disabled={disabled}>
        <div className="project-card-overlay">
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
          </div>
          <div className="project-card-details">
            <span>
              {project.pages.length} {t("pageUnit", { count: project.pages.length })} ·{" "}
              {project.width} × {project.height}
            </span>
            {active ? (
              <span className="active-project-badge">{t("activeProject")}</span>
            ) : (
              <time dateTime={project.updatedAt}>
                {new Date(project.updatedAt).toLocaleDateString(i18n.language)}
              </time>
            )}
          </div>
        </div>
      </ProjectPreview>
    </article>
  );
}
