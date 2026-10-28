import { Plus, X } from "lucide-react";
import { useId } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { createPage, type EnginePort, type Composition } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { IconButton } from "../shared/IconButton";

export function PagesPanel({
  engine,
  page,
  pages,
  run,
}: {
  engine: EnginePort;
  page: Composition;
  pages: Composition[];
  run: (action: () => void) => void;
}) {
  const { t } = useTranslation();
  const motionId = useId();
  const reducedMotion = useReducedMotion();
  const transition = reducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 480, damping: 38 };
  return (
    <Tabs value={page.id} onValueChange={engine.setPage} className="pages-tabs floating-panel">
      <LayoutGroup id={motionId}>
        <TabsList aria-label={t("pages")} className="pages-tabs-list">
          {pages.map((item) => (
            <motion.div
              key={item.id}
              layout="position"
              initial={reducedMotion ? false : { opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transition}
              className="page-tab-wrap"
              data-active={item.id === page.id || undefined}
            >
              {item.id === page.id && (
                <motion.span
                  aria-hidden
                  className="page-tab-indicator"
                  layoutId="active-page-tab"
                  initial={false}
                  transition={transition}
                />
              )}
              <TabsTrigger value={item.id} className="page-tab">
                {item.name}
              </TabsTrigger>
              {item.id === page.id && pages.length > 1 && (
                <IconButton
                  label={t("removePage")}
                  onClick={() => run(() => engine.execute({ type: "deletePage", id: page.id }))}
                >
                  <X size={11} />
                </IconButton>
              )}
            </motion.div>
          ))}
        </TabsList>
      </LayoutGroup>
      <IconButton
        label={t("addPage")}
        onClick={() =>
          run(() =>
            engine.execute({
              type: "addPage",
              page: createPage({
                name: `${t("composition")} ${pages.length + 1}`,
                width: page.width,
                height: page.height,
                background: page.background,
              }),
            }),
          )
        }
      >
        <Plus size={15} />
      </IconButton>
    </Tabs>
  );
}
