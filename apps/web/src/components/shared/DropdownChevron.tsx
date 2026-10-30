import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../ui/utils";
import "./dropdown-chevron.css";

/** Decorative disclosure icon shared by Radix triggers; state belongs to the native trigger. */
export function DropdownChevron({ className, ...props }: ComponentProps<typeof ChevronDown>) {
  return (
    <ChevronDown
      {...props}
      aria-hidden="true"
      data-slot="select-chevron"
      className={cn("dropdown-chevron", className)}
    />
  );
}
