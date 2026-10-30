import { useTranslation } from "react-i18next";
import { SearchInput } from "../../assets/SearchInput";
import styles from "./FontPicker.module.css";
import "./messages";

/** Combobox keyboard semantics remain immediate; font work lives outside the input. */
export function FontPickerSearch({
  id,
  listId,
  activeId,
  hints,
  query,
  onQuery,
  onMove,
  onChoose,
}: {
  id: string;
  listId: string;
  activeId?: string;
  hints: { label: string }[];
  query: string;
  onQuery: (value: string) => void;
  onMove: (direction: -1 | 1) => void;
  onChoose: () => void;
}) {
  const { t } = useTranslation("fonts");
  return (
    <div className={styles.search}>
      <SearchInput
        id={id}
        autoFocus
        searchButton
        captureTyping
        role="combobox"
        aria-label={t("search")}
        aria-autocomplete="list"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={activeId}
        prefix={t("searchPrefix")}
        hints={hints}
        value={query}
        onChange={(event) => onQuery(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            onMove(event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Enter") {
            event.preventDefault();
            onChoose();
          }
        }}
      />
    </div>
  );
}
