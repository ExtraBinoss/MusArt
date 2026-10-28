import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import {
  useCallback,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Ellipsis } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { EnginePort } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import { themeAtom, toolAtom, useEngine } from "../../state/session/editor";
import { changeLanguage } from "../../state/i18n";
import { importVectorFiles, VectorImportError } from "../../services/assets/vector/import-files";
import type { TaskRunner } from "../projects/ProjectDialog";
import { Button } from "../ui/button";
import { DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { SearchDialog } from "./SearchDialog";
import { IconButton } from "../shared/IconButton";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../ui/command";
import { Kbd, KbdGroup } from "../ui/kbd";
import { SearchCatalog } from "./catalog/cache";
import { browserSearchTiming } from "./open-timing";
import {
  SEARCH_CATEGORIES,
  type SearchCategory,
  type SearchFilter,
  type SearchItem,
} from "./catalog/model";
import { searchItems } from "./catalog/search";
import { captureSearchItem, type PanelMode, type ProjectView, type SearchActions } from "./actions";
import { modifierLabel } from "./shortcuts";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { useSearchShortcuts } from "./use-search-shortcuts";
import { getSearchIcon } from "./icons";
import { useKeybindings } from "../../state/keybindings/use-keybindings";
import { createCommandPort } from "../../state/keybindings/command-port";
import {
  captureGestureOrigin,
  isGestureOriginCurrent,
} from "../../canvas/interaction/gesture-origin";
import { bindingLabel } from "./shortcuts";
import "./messages";
import "./search.css";

export interface MagicSearchProps {
  engine: EnginePort;
  services: EditorServices;
  onTask: TaskRunner;
  onImport: () => void;
  onProjects: (view: ProjectView) => void;
  onExport: () => void;
  onPanelMode: (mode: PanelMode) => void;
  children?: ComponentType<SearchSurface>;
}
export interface SearchSurface {
  engine: EnginePort;
  trigger: ReactNode;
  commands: readonly SearchItem[];
  run: (id: string) => void;
}
const CLOSED_ITEMS: SearchItem[] = [];
export function MagicSearch({
  engine,
  services,
  onTask,
  onImport,
  onProjects,
  onExport,
  onPanelMode,
  children,
}: MagicSearchProps) {
  const { t, i18n } = useTranslation();
  const reducedMotion = useReducedMotion();
  const bindings = useKeybindings();
  const catalog = useMemo(() => new SearchCatalog(), []),
    timing = useMemo(() => browserSearchTiming(), []);
  const snapshot = useEngine(engine);
  const setTool = useSetAtom(toolAtom),
    setTheme = useSetAtom(themeAtom);
  const [open, setOpenState] = useState(false),
    [help, setHelp] = useState(false);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<SearchFilter>("all");
  const [activeId, setActiveId] = useState("");
  const triggerId = useId();
  const searchInput = useRef<HTMLInputElement>(null),
    svgInput = useRef<HTMLInputElement>(null),
    portableInput = useRef<HTMLInputElement>(null);
  const pending = useRef<(() => void | Promise<void>) | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const openRef = useRef(false),
    dialogRef = useRef<HTMLDivElement>(null);
  const scope = useRef({ engine, alive: true });
  useLayoutEffect(() => {
    const current = { engine, alive: true };
    scope.current = current;
    return () => {
      current.alive = false;
      timing.cancel();
    };
  }, [engine, timing]);
  const setOpen = useCallback(
    (value: boolean) => {
      if (value && pending.current) return;
      if (value && !openRef.current)
        returnFocus.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      openRef.current = value;
      if (value) timing.request();
      else timing.cancel();
      if (value && dialogRef.current) delete dialogRef.current.dataset.openPaintUpperBoundMs;
      setOpenState(value);
      if (value) {
        setQuery("");
        setCategory("all");
        setActiveId("");
      }
    },
    [timing],
  );
  const toggle = useCallback(() => {
    setOpen(!openRef.current);
  }, [setOpen]);
  const openShortcuts = useCallback(() => setHelp(true), []);
  useSearchShortcuts(toggle, openShortcuts);
  // Closed updates change dock availability only. Document indexing belongs to an actual opening.
  const commands = useMemo(
    () => catalog.commandsFor(snapshot, t, bindings, i18n.resolvedLanguage ?? i18n.language),
    [catalog, snapshot, t, bindings, i18n.resolvedLanguage, i18n.language],
  );
  const items = useMemo(
    () =>
      open
        ? catalog.read(snapshot, t, bindings, i18n.resolvedLanguage ?? i18n.language)
        : CLOSED_ITEMS,
    [open, catalog, snapshot, t, bindings, i18n.resolvedLanguage, i18n.language],
  );
  const recordOpen = useCallback(
    (milliseconds: number) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      dialog.dataset.openPaintUpperBoundMs = milliseconds.toFixed(2);
      dialog.dataset.catalogSize = String(items.length);
      dialog.dataset.initialOptionCount = String(dialog.querySelectorAll('[role="option"]').length);
    },
    [items.length],
  );
  useLayoutEffect(() => {
    if (open && dialogRef.current) {
      searchInput.current?.focus();
      timing.mounted(recordOpen);
    }
  }, [open, timing, recordOpen]);
  const results = useMemo(
    () =>
      open
        ? searchItems(items, query, category)
        : { items: [] as SearchItem[], total: items.length, browsing: true, limited: false },
    [items, query, category, open],
  );
  const available = catalog.categories;
  const activeItem =
    results.items.find((item) => item.id === activeId && !item.disabled) ??
    results.items.find((item) => !item.disabled);
  const resultCategories = [...new Set(results.items.map((item) => item.category))];
  const actions: SearchActions = {
    engine,
    services,
    t,
    onImport,
    onProjects,
    onExport,
    onPanelMode,
    onImportSvg: () => svgInput.current?.click(),
    onOpenPortable: () => portableInput.current?.click(),
    onShortcuts: openShortcuts,
    setTool,
    setTheme,
    setLanguage: changeLanguage,
  };
  function choose(item: SearchItem) {
    if (item.disabled || !openRef.current) return;
    const origin = captureGestureOrigin(engine);
    const execute = captureSearchItem(item, actions);
    pending.current = () => {
      if (
        !scope.current.alive ||
        scope.current.engine !== engine ||
        !isGestureOriginCurrent(engine, origin)
      )
        throw new Error(t("keybindings:stale"));
      return execute();
    };
    setOpen(false);
  }
  function runCommand(id: string) {
    const item = commands.find((item) => item.id === id);
    if (!item) return false;
    const origin = captureGestureOrigin(engine);
    const execute = captureSearchItem(item, actions);
    if (!item.disabled)
      void onTask(() => {
        if (
          !scope.current.alive ||
          scope.current.engine !== engine ||
          !isGestureOriginCurrent(engine, origin)
        )
          throw new Error(t("keybindings:stale"));
        return execute();
      });
    return true;
  }
  useLayoutEffect(() =>
    createCommandPort(engine).subscribe((id) => {
      if (id === "app:search") {
        toggle();
        return true;
      }
      return runCommand(id);
    }),
  );
  function categoryButton(value: SearchFilter) {
    return (
      <Button
        key={value}
        variant={category === value ? "secondary" : "ghost"}
        size="sm"
        aria-pressed={category === value}
        onClick={() => {
          setCategory(value);
          setActiveId("");
          searchInput.current?.focus();
        }}
      >
        {t(`search:${value}`)}
      </Button>
    );
  }
  function renderGroup(value: SearchCategory) {
    const group = results.items.filter((item) => item.category === value);
    if (!group.length) return null;
    return (
      <CommandGroup key={value} heading={t(`search:${value}`)}>
        {group.map((item, index) => {
          const Icon = getSearchIcon(item);
          return (
            <CommandItem
              key={item.id}
              value={item.id}
              disabled={Boolean(item.disabled)}
              aria-description={item.disabled}
              onSelect={() => choose(item)}
            >
              <motion.span
                className="magic-search-item-content"
                initial={reducedMotion ? false : { opacity: 0, y: 3, filter: "blur(3px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{
                  duration: reducedMotion ? 0 : 0.13,
                  delay: reducedMotion ? 0 : Math.min(index, 7) * 0.008,
                }}
              >
                <Icon size={16} strokeWidth={1.6} />
                <span className="magic-search-item-copy">
                  <span>{item.label}</span>
                  {(item.disabled || item.detail) && <small>{item.disabled || item.detail}</small>}
                </span>
                {item.shortcut && (
                  <KbdGroup>
                    {item.shortcut.map((key) => (
                      <Kbd key={key}>{key === "Mod" ? modifierLabel() : key}</Kbd>
                    ))}
                  </KbdGroup>
                )}
              </motion.span>
            </CommandItem>
          );
        })}
      </CommandGroup>
    );
  }
  const Content = children;
  const triggerNode = (
    <IconButton
      id={triggerId}
      label={t("search:title")}
      shortcut={bindingLabel("app:search", bindings)}
      className="magic-search-trigger"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(true)}
    >
      <Ellipsis size={19} />
    </IconButton>
  );
  return (
    <>
      {Content ? (
        <Content engine={engine} trigger={triggerNode} commands={commands} run={runCommand} />
      ) : (
        triggerNode
      )}
      <SearchDialog
        open={open}
        onOpenChange={setOpen}
        reduced={!!reducedMotion}
        ref={dialogRef}
        data-magic-search
        className="floating-panel magic-search-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInput.current?.focus();
          timing.mounted(recordOpen);
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (openRef.current) return;
          const origin = returnFocus.current;
          const target =
            origin?.isConnected && origin !== document.body
              ? origin
              : (document.querySelector<HTMLElement>(".editor-canvas") ??
                document.getElementById(triggerId));
          target?.focus({ preventScroll: true });
          const task = pending.current;
          pending.current = null;
          if (task)
            queueMicrotask(() => {
              void onTask(task);
            });
        }}
      >
        <motion.div
          className="magic-search-surface"
          initial={reducedMotion ? false : { opacity: 0, y: 6, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reducedMotion ? 0 : 0.16, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t("search:title")}</DialogTitle>
            <DialogDescription>{t("search:description")}</DialogDescription>
          </DialogHeader>
          <Command
            shouldFilter={false}
            loop
            value={activeItem?.id ?? ""}
            onValueChange={setActiveId}
            className="magic-search-command"
            label={t("search:title")}
          >
            <div className="magic-search-input-row">
              <CommandInput
                ref={searchInput}
                value={query}
                onValueChange={(value) => {
                  setQuery(value);
                  setActiveId("");
                }}
                placeholder={t("search:search")}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("close")}
                onClick={() => setOpen(false)}
              >
                <Kbd>Esc</Kbd>
              </Button>
            </div>
            <div
              className="magic-search-categories"
              role="group"
              aria-label={t("search:categories")}
            >
              {categoryButton("all")}
              {SEARCH_CATEGORIES.filter((value) => available.has(value)).map(categoryButton)}
            </div>
            <ScrollShadow>
              <CommandList label={t("search:title")}>
                <CommandEmpty>{t("search:empty")}</CommandEmpty>
                {resultCategories.map(renderGroup)}
              </CommandList>
            </ScrollShadow>
            <footer className="magic-search-footer">
              <span aria-live="polite">
                {results.limited
                  ? t(results.browsing ? "search:browse" : "search:limited", {
                      count: results.items.length,
                    })
                  : t("search:resultCount", { count: results.total })}
              </span>
              <span className="magic-search-key-hint">
                <Kbd>↑↓</Kbd>
                {t("search:navigate")}
                <Kbd>↵</Kbd>
                {t("search:choose")}
              </span>
            </footer>
          </Command>
        </motion.div>
      </SearchDialog>
      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
      <input
        ref={svgInput}
        className="sr-only"
        type="file"
        accept="image/svg+xml,.svg"
        multiple
        aria-label={t("search:importSvg")}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length)
            void onTask(async () => {
              try {
                await importVectorFiles(engine, files);
              } catch (error) {
                if (error instanceof VectorImportError)
                  throw new Error(t(`search:svgError_${error.code}`, { file: error.fileName }), {
                    cause: error,
                  });
                throw error;
              }
            });
        }}
      />
      <input
        ref={portableInput}
        className="sr-only"
        type="file"
        accept=".musart,.json,application/json"
        aria-label={t("search:openPortable")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void onTask(() => services.openPortable(file));
        }}
      />
    </>
  );
}
