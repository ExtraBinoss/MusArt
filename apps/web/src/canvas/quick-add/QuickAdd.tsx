import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import { Button } from "../../components/ui/button";
import { ButtonGroup } from "../../components/ui/button-group";
import { Popover, PopoverAnchor, PopoverContent } from "../../components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../../components/ui/command";
import { searchItems } from "../../components/search/catalog/search";
import type { SearchFilter, SearchItem } from "../../components/search/catalog/model";
import { getSearchIcon } from "../../components/search/icons";
import { createCommandPort } from "../../state/keybindings/command-port";
import { createLibraryActions } from "../../components/assets/library-actions";
import { toolAtom } from "../../state/session/editor";
import {
  captureGestureOrigin,
  isGestureOriginCurrent,
  type GestureOrigin,
} from "../interaction/gesture-origin";
import { clientToPage } from "../viewport/view";
import type { ViewSource } from "../viewport/motion";
import type { WorkspaceSource } from "../artboards/workspace";
import { artboardAt } from "../artboards/layout";
import type { SceneController } from "../session/scene-controller";
import { createQuickAddItems } from "./catalog";
import { createQuickLayer, isQuickLayerAction } from "./layers";
import "./messages";
import "./quick-add.css";

interface InsertSession {
  origin: GestureOrigin;
  x: number;
  y: number;
}
export function QuickAdd({
  engine,
  viewport,
  workspace,
  viewSource,
  controller,
  onError,
}: {
  engine: EnginePort;
  viewport: RefObject<HTMLDivElement | null>;
  workspace: WorkspaceSource;
  viewSource: ViewSource;
  controller: SceneController;
  onError?: (message: string) => void;
}) {
  const { t } = useTranslation(),
    setTool = useSetAtom(toolAtom);
  const commands = useMemo(() => createCommandPort(engine), [engine]);
  const handoff = useRef(false);
  const showing = useRef(false);
  const [session, setSession] = useState<InsertSession | null>(null),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState<SearchFilter>("all");
  useLayoutEffect(() => {
    showing.current = Boolean(session);
  }, [session]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const open = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        controller.read().playback ||
        (event.target instanceof Element && event.target.closest("[data-canvas-control]"))
      )
        return;
      const rect = element.getBoundingClientRect(),
        layout = workspace.read();
      if (
        artboardAt(
          layout,
          clientToPage({ x: event.clientX, y: event.clientY }, rect, viewSource.read(), layout),
        )
      )
        return;
      event.preventDefault();
      setQuery("");
      setCategory("all");
      setSession({
        origin: captureGestureOrigin(engine),
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    const close = () => setSession(null);
    const stopEngine = engine.subscribe(() =>
      setSession((current) =>
        current && !isGestureOriginCurrent(engine, current.origin) ? null : current,
      ),
    );
    const stopScene = controller.subscribe(() => {
      const next = Boolean(controller.read().playback);
      if (next) close();
    });
    element.addEventListener("dblclick", open);
    element.addEventListener("wheel", close);
    return () => {
      element.removeEventListener("dblclick", open);
      element.removeEventListener("wheel", close);
      stopEngine();
      stopScene();
    };
  }, [engine, viewport, workspace, viewSource, controller]);
  const items = useMemo(
    () => (session ? createQuickAddItems(engine.getSnapshot(), t) : []),
    [session, engine, t],
  );
  const results = useMemo(
    () => (session ? searchItems(items, query, category).items : []),
    [session, items, query, category],
  );
  function run(item: SearchItem) {
    if (
      !session ||
      !isGestureOriginCurrent(engine, session.origin) ||
      controller.read().playback ||
      item.target.kind !== "action"
    ) {
      setSession(null);
      return;
    }
    const action = item.target.action;
    try {
      if (isQuickLayerAction(action)) {
        const snapshot = engine.getSnapshot(),
          page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
        const layer = createQuickLayer(action, page, t("newText"));
        engine.execute({ type: "addLayers", layers: [layer] });
        engine.select([layer.id]);
        setTool("pointer");
      } else {
        if (!commands.run(`action:${action}`)) throw new Error(t("quickAdd:unavailable"));
        if (action === "toolShape") {
          handoff.current = true;
          if (!createLibraryActions(engine).open()) {
            handoff.current = false;
            throw new Error(t("quickAdd:unavailable"));
          }
        }
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    }
    setSession(null);
  }
  return (
    <>
      <Popover
        open={Boolean(session)}
        onOpenChange={(open) => {
          if (!open) setSession(null);
        }}
      >
        <PopoverAnchor asChild>
          <span
            className="quick-add-anchor"
            aria-hidden
            data-canvas-control
            style={{ left: session?.x ?? 0, top: session?.y ?? 0 }}
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className="quick-add-popover"
          data-canvas-control
          aria-label={t("quickAdd:title")}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (showing.current) return;
            if (!handoff.current) viewport.current?.focus();
            handoff.current = false;
          }}
        >
          <Command label={t("quickAdd:title")} shouldFilter={false} loop>
            <CommandInput
              aria-label={t("quickAdd:title")}
              placeholder={t("quickAdd:search")}
              value={query}
              onValueChange={setQuery}
            />
            <ButtonGroup className="quick-add-categories" aria-label={t("search:categories")}>
              {(["all", "tools", "files", "project"] as const).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={category === value ? "secondary" : "ghost"}
                  aria-pressed={category === value}
                  onClick={() => setCategory(value)}
                >
                  {t(`search:${value}`)}
                </Button>
              ))}
            </ButtonGroup>
            <CommandList>
              <CommandEmpty>{t("quickAdd:empty")}</CommandEmpty>
              {[...new Set(results.map((item) => item.category))].map((value) => (
                <CommandGroup key={value} heading={t(`search:${value}`)}>
                  {results
                    .filter((item) => item.category === value)
                    .map((item) => {
                      const Icon = getSearchIcon(item);
                      return (
                        <CommandItem key={item.id} value={item.id} onSelect={() => run(item)}>
                          <Icon size={15} />
                          <span>{item.label}</span>
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
