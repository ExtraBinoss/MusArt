import { memo, useDeferredValue, useMemo, type ComponentType, type ReactNode } from "react";
import type { EnginePort } from "@musart/core";
import type { BindingSnapshot } from "../../state/keybindings/model";
import { useEngineValue } from "../../state/session/editor";
import type { SearchCatalog } from "./catalog/cache";
import type { SearchTranslate } from "./catalog/model";
import type { SearchSurface } from "./MagicSearch";

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
  const commands = useDeferredValue(liveCommands);
  const MemoContent = useMemo(() => memo(Content), [Content]);
  return <MemoContent engine={engine} trigger={trigger} commands={commands} run={run} />;
});
