import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { FontOption } from "./catalog";
import { Button } from "../../ui/button";
import { ButtonGroup } from "../../ui/button-group";
import { HorizontalScroll } from "../../shared/scroll/HorizontalScroll";
import styles from "./FontPicker.module.css";
import "./messages";

export type FontCategory = "all" | "installed" | FontOption["category"];
const categories = ["all", "sans", "serif", "mono", "display", "handwriting", "installed"] as const;
/** Controlled category selection has one labeled native scroll viewport. */
export const FontCategoryTabs = memo(function FontCategoryTabs({
  value,
  onChange,
}: {
  value: FontCategory;
  onChange: (category: FontCategory) => void;
}) {
  const { t } = useTranslation("fonts");
  return (
    <div className={styles.filters}>
      <HorizontalScroll label={t("categories")}>
        <ButtonGroup>
          {categories.map((item) => (
            <Button
              key={item}
              size="xs"
              variant="outline"
              aria-pressed={value === item}
              onClick={() => onChange(item)}
            >
              {t(item === "all" || item === "installed" ? item : `filter.${item}`)}
            </Button>
          ))}
        </ButtonGroup>
      </HorizontalScroll>
    </div>
  );
});
