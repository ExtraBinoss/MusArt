import {
  MousePointer2,
  Hand,
  Type,
  WandSparkles,
  Scan,
  ImagePlus,
  Undo2,
  Redo2,
} from "lucide-react";
import { useAtom } from "jotai";
import { memo } from "react";
import type { EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { toolAtom } from "../../state/session/editor";
import { ToolbarScroll } from "./dock/ToolbarScroll";
import { IconButton } from "../shared/IconButton";
import { ShapeToolSlot } from "../assets/ShapeToolSlot";
import { Separator } from "../ui/separator";
import { MagicSearch, type MagicSearchProps, type SearchSurface } from "../search/MagicSearch";
import { PinnedCommands } from "./dock/PinnedCommands";
import { useKeybindings } from "../../state/keybindings/use-keybindings";
import { bindingLabel } from "../search/shortcuts";

const tools = [
  ["pointer", MousePointer2, "action:toolPointer"],
  ["hand", Hand, "action:toolHand"],
  ["text", Type, "action:toolText"],
  ["wand", WandSparkles, "action:toolWand"],
  ["segment", Scan, "action:toolSegment"],
] as const;
export function Toolbar(props: MagicSearchProps) {
  return <MagicSearch {...props}>{ToolbarContents}</MagicSearch>;
}
function ToolbarContents(surface: SearchSurface) {
  const { engine, commands } = surface;
  const canUndo = !commands.find((item) => item.id === "action:undo")?.disabled;
  const canRedo = !commands.find((item) => item.id === "action:redo")?.disabled;
  const { t } = useTranslation();
  const bindings = useKeybindings();
  return (
    <nav className="toolbar floating-panel" aria-label={t("selection")}>
      <ToolbarScroll>
        <StaticTools engine={engine} />
        <Separator />
        <IconButton
          label={t("import")}
          shortcut={bindingLabel("action:importImages", bindings)}
          onClick={() => surface.run("action:importImages")}
        >
          <ImagePlus strokeWidth={1.65} />
        </IconButton>
        <Separator />
        <IconButton
          label={t("undo")}
          shortcut={bindingLabel("action:undo", bindings)}
          disabled={!canUndo}
          onClick={() => surface.run("action:undo")}
        >
          <Undo2 strokeWidth={1.65} />
        </IconButton>
        <IconButton
          label={t("redo")}
          shortcut={bindingLabel("action:redo", bindings)}
          disabled={!canRedo}
          onClick={() => surface.run("action:redo")}
        >
          <Redo2 strokeWidth={1.65} />
        </IconButton>
        <PinnedCommands commands={surface.commands} run={surface.run} />
        {surface.trigger}
      </ToolbarScroll>
    </nav>
  );
}

/** Command availability never rebuilds tools; their own preferences and active atom stay live. */
const StaticTools = memo(function StaticTools({ engine }: { engine: EnginePort }) {
  const { t } = useTranslation();
  const [tool, setTool] = useAtom(toolAtom);
  const bindings = useKeybindings();
  return (
    <>
      {tools.map(([id, Icon, shortcut]) => (
        <IconButton
          key={id}
          label={t(id)}
          shortcut={bindingLabel(shortcut, bindings)}
          active={tool === id}
          onClick={() => setTool(id)}
          className="tool-button"
        >
          <Icon strokeWidth={1.65} />
        </IconButton>
      ))}
      <ShapeToolSlot engine={engine} />
    </>
  );
});
