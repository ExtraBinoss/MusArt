import { useEffect, useRef, useState } from "react";
import { useAtom, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import type { EnginePort } from "@musart/core";
import { toolAtom } from "../../state/session/editor";
import { IconButton } from "../shared/IconButton";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../ui/popover";
import { shapeChoiceAtom } from "./selection";
import { PaletteVector } from "./PaletteVector";
import { ShapePalette } from "./ShapePalette";
import { createLibraryActions } from "./library-actions";
import { useKeybindings } from "../../state/keybindings/use-keybindings";
import { bindingLabel } from "../search/shortcuts";
import "./messages";
import "./assets.css";

export function ShapeToolSlot({ engine }: { engine: EnginePort }) {
  const { t } = useTranslation("assets");
  const bindings = useKeybindings();
  const [open, setOpen] = useState(false);
  useEffect(() => createLibraryActions(engine).subscribe(() => setOpen(true)), [engine]);
  const [shape, setShape] = useAtom(shapeChoiceAtom);
  const [tool] = useAtom(toolAtom);
  const setTool = useSetAtom(toolAtom);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clear() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => clear, []);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className="shape-tool-slot"
          onContextMenu={(event) => {
            event.preventDefault();
            clear();
            setOpen(true);
          }}
        >
          <IconButton
            label={t("tool")}
            shortcut={bindingLabel("action:toolShape", bindings)}
            active={tool === "shape"}
            onPointerDown={() => {
              clear();
              timer.current = setTimeout(() => setOpen(true), 450);
            }}
            onPointerUp={clear}
            onPointerCancel={clear}
            onPointerLeave={clear}
            onClick={() => setTool("shape")}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
              }
            }}
          >
            <PaletteVector item={shape} />
          </IconButton>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="shape-tool-disclosure"
              aria-label={t("library")}
              title={t("shortcut")}
            >
              <ChevronDown size={10} />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent side="right" align="start" className="w-[340px] overflow-hidden p-0">
        <ShapePalette
          engine={engine}
          onChoose={(item) => {
            setShape(item);
            setTool("shape");
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
