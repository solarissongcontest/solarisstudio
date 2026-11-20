import { type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { selectionKeyboardTarget } from "@/lib/selection-keyboard";

export type SolarisSelectionOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

export function SolarisMorphingSelection({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  layout = "equal",
}: {
  value: string;
  options: readonly SolarisSelectionOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  layout?: "equal" | "scroll";
}) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const count = Math.max(1, options.length);
  const focusIndex = options.findIndex((option) => option.value === value && !option.disabled);
  const tabStop = focusIndex >= 0 ? focusIndex : options.findIndex((option) => !option.disabled);
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = selectionKeyboardTarget(options, index, event.key,
      getComputedStyle(event.currentTarget).direction === "rtl");
    if (next == null) return;
    const button = event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')[next];
    if (!button) return;
    event.preventDefault();
    button.focus();
    if (options[next].value !== value) onChange(options[next].value);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-solaris-morphing-selection=""
      data-solaris-morphing-layout={layout}
      className={cn(
        "relative grid min-h-11 overflow-hidden rounded-xl border border-border/70 bg-surface/65 p-1",
        className,
      )}
      style={layout === "equal" ? { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` } : undefined}
    >
      {layout === "equal" ? <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 rounded-lg border border-white/[0.08] bg-white/[0.07] transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: `calc((100% - .5rem) / ${count})`,
          transform: `translateX(calc(${selectedIndex} * 100%))`,
        }}
      /> : null}
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={option.disabled}
            onKeyDown={(event) => moveFocus(event, index)}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative z-[1] min-h-11 min-w-0 rounded-lg px-3 text-sm font-semibold",
              "transition-[color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100",
              selected ? "text-foreground" : "text-muted-foreground",
              layout === "scroll" && "whitespace-nowrap",
              option.disabled && "cursor-not-allowed opacity-45",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
