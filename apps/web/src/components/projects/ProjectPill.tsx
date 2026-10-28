import { useId, useState } from "react";
import { ChevronDown, Download, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import type { TaskRunner } from "./ProjectDialog";
import { ProjectName } from "./ProjectName";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { Kbd, KbdGroup } from "../ui/kbd";
import { modifierLabel } from "../search/shortcuts";
import { useKeybindings } from "../../state/keybindings/use-keybindings";
import { chordTokens } from "../../state/keybindings/chords";
import "./dashboard/messages";
import "./dashboard/dashboard.css";
export function ProjectPill({
  engine,
  services,
  name,
  onTask,
}: {
  engine: EnginePort;
  services: EditorServices;
  name: string;
  onTask: TaskRunner;
}) {
  const bindings = useKeybindings();
  const save = bindings.bindings.get("action:save")?.[0];
  const [origin] = useState(() => engine.getSnapshot().project.id);
  const { t } = useTranslation(),
    inputId = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="project-pill floating-panel"
          aria-label={t("projectActions")}
          aria-description={name}
        >
          <span className="project-pill-title">{name}</span>
          <ChevronDown size={13} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="floating-panel project-actions"
      >
        <div className="project-rename">
          <Label htmlFor={inputId}>{t("projectName")}</Label>
          <ProjectName
            key={name}
            id={inputId}
            name={name}
            onRename={(name) => {
              void onTask(() => {
                if (engine.getSnapshot().project.id === origin)
                  engine.execute({ type: "renameProject", name });
              });
            }}
          />
        </div>
        <Separator />
        <Button
          variant="ghost"
          className="menu-item"
          onClick={() => {
            void onTask(services.saveProject, t("saved"));
          }}
        >
          <Save size={14} />
          {t("save")}
          {save && (
            <KbdGroup>
              {chordTokens(save).map((key) => (
                <Kbd key={key}>{key === "Mod" ? modifierLabel() : key}</Kbd>
              ))}
            </KbdGroup>
          )}
        </Button>
        <Separator />
        <Button
          variant="ghost"
          className="menu-item"
          onClick={() => {
            void onTask(services.exportProject);
          }}
        >
          <Download size={14} />
          {t("dashboard:download")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
