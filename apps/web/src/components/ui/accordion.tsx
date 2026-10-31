// shadcn/ui, MIT. Source: https://ui.shadcn.com/r/styles/new-york-v4/accordion.json
import * as React from "react";
import { Accordion as Primitive } from "radix-ui";
import { ChevronDown } from "lucide-react";
import { cn } from "./utils";
export function Accordion(props: React.ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="accordion" {...props} />;
}
export function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  );
}
export function AccordionTrigger({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Header className="flex">
      <Primitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "flex flex-1 items-center justify-between gap-4 py-4 text-left text-sm font-medium outline-none transition-all hover:underline focus-visible:ring-2 focus-visible:ring-ring [&[data-state=open]>svg]:rotate-180",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="size-4 shrink-0 transition-transform duration-200" />
      </Primitive.Trigger>
    </Primitive.Header>
  );
}
export function AccordionContent({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content data-slot="accordion-content" className="overflow-hidden" {...props}>
      <div className={cn("pb-4", className)}>{children}</div>
    </Primitive.Content>
  );
}
