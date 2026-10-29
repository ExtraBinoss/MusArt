import { useId, type ReactNode } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { TabsList, TabsTrigger } from "../../ui/tabs";
import { RadioGroup } from "radix-ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import "./segmented.css";

export interface SegmentedTab {
  value: string;
  label: string;
  icon?: ReactNode;
}
interface CommonProps {
  value: string;
  items: readonly SegmentedTab[];
  label: string;
  disabled?: boolean;
  size?: "default" | "compact";
  className?: string;
  itemClassName?: string;
  indicatorClassName?: string;
  tooltips?: boolean;
}
type Props = CommonProps &
  (
    | { mode?: "tabs"; onValueChange?: never }
    | { mode: "choice"; onValueChange: (value: string) => void }
  );
/** One shared Motion surface with genuine Radix tabs or an accessible single-value choice. */
export function SegmentedTabs({
  value,
  items,
  label,
  disabled = false,
  size = "default",
  className = "",
  itemClassName = "",
  indicatorClassName = "",
  mode = "tabs",
  tooltips = false,
  onValueChange,
}: Props) {
  const id = useId(),
    reduced = useReducedMotion();
  const Trigger = mode === "choice" ? RadioGroup.Item : TabsTrigger;
  const buttons = items.map((item) => {
    const button = (
      <Trigger
        key={item.value}
        value={item.value}
        disabled={disabled}
        aria-label={item.label}
        className={`segmented-tab ${itemClassName}`}
      >
        {value === item.value && (
          <motion.span
            aria-hidden
            className={`segmented-tab-indicator ${indicatorClassName}`}
            layoutId="active-tab"
            initial={false}
            transition={
              reduced ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 38, mass: 0.7 }
            }
          />
        )}
        {item.icon && (
          <span className="segmented-tab-icon" aria-hidden>
            {item.icon}
          </span>
        )}
        <span className="segmented-tab-label">{item.label}</span>
      </Trigger>
    );
    return tooltips ? (
      <Tooltip key={item.value}>
        <TooltipTrigger asChild>
          <span className="segmented-tab-tooltip">{button}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{item.label}</TooltipContent>
      </Tooltip>
    ) : (
      button
    );
  });
  return (
    <LayoutGroup id={id}>
      {mode === "choice" ? (
        <RadioGroup.Root
          value={value}
          onValueChange={onValueChange}
          orientation="horizontal"
          disabled={disabled}
          aria-label={label}
          className={`segmented-tabs ${className}`}
          data-size={size}
        >
          {buttons}
        </RadioGroup.Root>
      ) : (
        <TabsList aria-label={label} className={`segmented-tabs ${className}`} data-size={size}>
          {buttons}
        </TabsList>
      )}
    </LayoutGroup>
  );
}
