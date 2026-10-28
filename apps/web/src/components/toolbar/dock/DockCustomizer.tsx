import { useMemo } from "react";
import { ArrowUp, ArrowDown, PinOff, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverTrigger, PopoverContent } from "../../ui/popover";
import { IconButton } from "../../shared/IconButton";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { CommandCatalog } from "./catalog/CommandCatalog";
import type { SearchItem } from "../../search/catalog/model";
import { MAX_DOCK_COMMANDS, moveDockCommand } from "./preferences";
import "./messages";
export function DockCustomizer({
  ids,
  commands,
  onChange,
}: {
  ids: readonly string[];
  commands: readonly SearchItem[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const catalog = useMemo(
    () => new Map(commands.map((command) => [command.id, command])),
    [commands],
  );
  const pinnedCount = ids.filter((id) => catalog.has(id)).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton label={t("dock:title")}>
          <Settings2 size={17} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="floating-panel dock-customizer">
        <h2>{t("dock:title")}</h2>
        <p className="dock-customizer-hint">{t("dock:hint")}</p>
        {pinnedCount > 0 && (
          <>
            <h3>{t("dock:pinned")}</h3>
            <ScrollShadow
              className="dock-customizer-pinned"
              style={{ height: Math.min(140, pinnedCount * 27) }}
            >
              <div
                className="dock-customizer-pinned-viewport"
                role="group"
                aria-label={t("dock:pinned")}
              >
                {ids.map((id, index) => {
                  const command = catalog.get(id);
                  if (!command) return null;
                  const values = { name: command.label };
                  return (
                    <div key={id} data-pinned-command={id}>
                      <span>{command.label}</span>
                      <IconButton
                        label={t("dock:up", values)}
                        disabled={index === 0}
                        onClick={() => onChange(moveDockCommand(ids, id, index - 1))}
                      >
                        <ArrowUp size={14} />
                      </IconButton>
                      <IconButton
                        label={t("dock:down", values)}
                        disabled={index === ids.length - 1}
                        onClick={() => onChange(moveDockCommand(ids, id, index + 1))}
                      >
                        <ArrowDown size={14} />
                      </IconButton>
                      <IconButton
                        label={t("dock:unpin", values)}
                        onClick={() => onChange(ids.filter((value) => value !== id))}
                      >
                        <PinOff size={14} />
                      </IconButton>
                    </div>
                  );
                })}
              </div>
            </ScrollShadow>
          </>
        )}
        <h3>{t("dock:available")}</h3>
        <CommandCatalog ids={ids} commands={commands} onChange={onChange} />
        <p className="dock-customizer-limit">{t("dock:limit", { count: MAX_DOCK_COMMANDS })}</p>
      </PopoverContent>
    </Popover>
  );
}
