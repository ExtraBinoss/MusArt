import { memo, useMemo, type ComponentType, type ReactNode } from "react";
import type { EnginePort } from "@musart/core";
import type { BindingSnapshot } from "../../state/keybindings/model";
import { useEngineValue } from "../../state/session/editor";
import type { SearchCatalog } from "./catalog/cache";
import type { SearchTranslate } from "./catalog/model";
import type { SearchSurface } from "./MagicSearch";
import { useAttachmentPresentation } from "../shared/use-attachment-presentation";

/** Dock availability changes only its consuming surface, leaving the closed search shell retained. */
export const SearchCommandSurface = memo(function SearchCommandSurface({
  engine,
  catalog,
  t,
  bindings,
  locale,
  trigger,
  run,
  component: Content,
}: {
  engine: EnginePort;
  catalog: SearchCatalog;
  t: SearchTranslate;
  bindings: BindingSnapshot;
  locale: string;
  trigger: ReactNode;
  run: SearchSurface["run"];
  component: ComponentType<SearchSurface>;
}) {
  const liveCommands = useEngineValue(engine, (snapshot) =>
    catalog.commandsFor(snapshot, t, bindings, locale),
  );
  const commands = useAttachmentPresentation(liveCommands);
  // History stays actionable during effect editing, including pinned Undo/Redo commands.
  const shownCommands = useMemo(() => {
    if (commands === liveCommands) return commands;
    const history = liveCommands.filter(
      (item) => item.id === "action:undo" || item.id === "action:redo",
    );
    if (
      history.every(
        (item) => commands.find((old) => old.id === item.id)?.disabled === item.disabled,
      )
    )
      return commands;
    return commands.map((item) => history.find((current) => current.id === item.id) ?? item);
  }, [commands, liveCommands]);
  const MemoContent = useMemo(() => memo(Content), [Content]);
  return <MemoContent engine={engine} trigger={trigger} commands={shownCommands} run={run} />;
});
