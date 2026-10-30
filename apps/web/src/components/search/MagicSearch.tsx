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
import { useReducedMotion } from "motion/react";
import type { EnginePort } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import { themeAtom, toolAtom } from "../../state/session/editor";
import { changeLanguage } from "../../state/i18n";
import { importVectorFiles, VectorImportError } from "../../services/assets/vector/import-files";
import type { TaskRunner } from "../projects/ProjectDialog";
import { SearchDialog } from "./SearchDialog";
import { IconButton } from "../shared/IconButton";
import { SearchPalette } from "./SearchPalette";
import { SearchCatalog } from "./catalog/cache";
import { browserSearchTiming } from "./open-timing";
import type { SearchItem } from "./catalog/model";
import { captureSearchItem, type PanelMode, type ProjectView, type SearchActions } from "./actions";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { useSearchShortcuts } from "./use-search-shortcuts";
import { useKeybindings } from "../../state/keybindings/use-keybindings";
import { createCommandPort } from "../../state/keybindings/command-port";
import {
  captureGestureOrigin,
  isGestureOriginCurrent,
} from "../../canvas/interaction/gesture-origin";
import { bindingLabel } from "./shortcuts";
import { SearchCommandSurface } from "./SearchCommandSurface";
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
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const reducedMotion = useReducedMotion();
  const bindings = useKeybindings();
  const catalog = useMemo(() => new SearchCatalog(), []),
    timing = useMemo(() => browserSearchTiming(), []);
  const setTool = useSetAtom(toolAtom),
    setTheme = useSetAtom(themeAtom);
  const [open, setOpenState] = useState(false),
    [help, setHelp] = useState(false);
  const [cycle, setCycle] = useState(0);
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
      if (value && !openRef.current) {
        returnFocus.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setCycle((current) => current + 1);
      }
      openRef.current = value;
      if (value) timing.request();
      else timing.cancel();
      if (value && dialogRef.current) delete dialogRef.current.dataset.openPaintUpperBoundMs;
      setOpenState(value);
    },
    [timing],
  );
  const toggle = useCallback(() => {
    setOpen(!openRef.current);
  }, [setOpen]);
  const openShortcuts = useCallback(() => setHelp(true), []);
  useSearchShortcuts(toggle, openShortcuts);
  const recordOpen = useCallback(
    (milliseconds: number) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      dialog.dataset.openPaintUpperBoundMs = milliseconds.toFixed(2);
      dialog.dataset.catalogSize = String(catalog.size);
      dialog.dataset.initialOptionCount = String(dialog.querySelectorAll('[role="option"]').length);
    },
    [catalog],
  );
  useLayoutEffect(() => {
    if (open && dialogRef.current) {
      const input = searchInput.current;
      if (input && document.activeElement !== input) input.focus({ preventScroll: true });
      timing.mounted(recordOpen);
    }
  }, [open, timing, recordOpen]);
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
  const commandContext = useRef({ actions, t, bindings, locale, onTask });
  useLayoutEffect(() => {
    commandContext.current = { actions, t, bindings, locale, onTask };
  });
  const choose = useCallback(
    (item: SearchItem) => {
      if (item.disabled || !openRef.current) return;
      const current = commandContext.current;
      const origin = captureGestureOrigin(engine);
      const execute = captureSearchItem(item, current.actions);
      pending.current = () => {
        if (
          !scope.current.alive ||
          scope.current.engine !== engine ||
          !isGestureOriginCurrent(engine, origin)
        )
          throw new Error(current.t("keybindings:stale"));
        return execute();
      };
      setOpen(false);
    },
    [engine, setOpen],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);
  const runCommand = useCallback(
    (id: string) => {
      const current = commandContext.current;
      const item = catalog
        .commandsFor(engine.getSnapshot(), current.t, current.bindings, current.locale)
        .find((item) => item.id === id);
      if (!item) return false;
      const origin = captureGestureOrigin(engine);
      const execute = captureSearchItem(item, current.actions);
      if (!item.disabled)
        void current.onTask(() => {
          if (
            !scope.current.alive ||
            scope.current.engine !== engine ||
            !isGestureOriginCurrent(engine, origin)
          )
            throw new Error(current.t("keybindings:stale"));
          return execute();
        });
      return true;
    },
    [catalog, engine],
  );
  useLayoutEffect(
    () =>
      createCommandPort(engine).subscribe((id) => {
        if (id === "app:search") {
          toggle();
          return true;
        }
        return runCommand(id);
      }),
    [engine, toggle, runCommand],
  );
  const Content = children;
  const triggerNode = useMemo(
    () => (
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
    ),
    [triggerId, t, bindings, open, setOpen],
  );
  return (
    <>
      {Content ? (
        <SearchCommandSurface
          engine={engine}
          catalog={catalog}
          t={t}
          bindings={bindings}
          locale={locale}
          trigger={triggerNode}
          run={runCommand}
          component={Content}
        />
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
          const input = searchInput.current;
          if (input && document.activeElement !== input) input.focus({ preventScroll: true });
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
        <SearchPalette
          key={cycle}
          engine={engine}
          catalog={catalog}
          t={t}
          bindings={bindings}
          locale={locale}
          inputRef={searchInput}
          reduced={!!reducedMotion}
          onChoose={choose}
          onClose={close}
        />
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
