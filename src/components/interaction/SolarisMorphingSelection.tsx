import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

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
}: {
  value: string;
  options: readonly SolarisSelectionOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const count = Math.max(1, options.length);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-solaris-morphing-selection=""
      className={cn(
        "relative grid min-h-11 overflow-hidden rounded-xl border border-border/70 bg-surface/65 p-1",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 rounded-lg border border-white/[0.08] bg-white/[0.07] transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: `calc((100% - .5rem) / ${count})`,
          transform: `translateX(calc(${selectedIndex} * 100%))`,
        }}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative z-[1] min-h-9 min-w-0 rounded-lg px-3 text-sm font-semibold",
              "transition-[color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100",
              selected ? "text-foreground" : "text-muted-foreground",
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
