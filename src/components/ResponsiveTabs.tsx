import { cn } from "@/lib/utils";

export type ResponsiveTabOption<T extends string> = {
  value: T;
  label: string;
  shortLabel?: string;
};

export function ResponsiveTabs<T extends string>({
  value,
  options,
  onChange,
  label = "Page",
  className,
  sticky = false,
}: {
  value: T;
  options: readonly ResponsiveTabOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  className?: string;
  sticky?: boolean;
}) {
  /*
   * Theme + Broadcast are now edition-wide and live together on the
   * Manage Editions page. The old per-show tabs are deliberately hidden
   * from the edition show manager so there is only one canonical editor.
   *
   * Keeping the old route code in place is useful for backwards
   * compatibility, but humans no longer get two competing places to
   * change the same design. A rare administrative mercy.
   */
  const visibleOptions =
    label === "Manage edition"
      ? options.filter(
          (item) =>
            item.value !== ("Theme" as T) &&
            item.value !== ("Broadcast" as T),
        )
      : options;

  const visibleValue = visibleOptions.some(
    (item) => item.value === value,
  )
    ? value
    : visibleOptions[0]?.value ?? value;

  return (
    <div
      className={cn(
        "min-w-0",
        sticky &&
          "sticky top-16 z-30 -mx-3 border-y border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl sm:mx-0 sm:rounded-xl sm:border",
        className,
      )}
    >
      <div className="md:hidden">
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </span>

          <select
            value={visibleValue}
            onChange={(event) =>
              onChange(
                event.target.value as T,
              )
            }
            className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none focus:border-primary"
          >
            {visibleOptions.map(
              (item) => (
                <option
                  key={item.value}
                  value={item.value}
                  className="bg-background"
                >
                  {item.label}
                </option>
              ),
            )}
          </select>
        </label>
      </div>

      <div className="scroll-slim hidden overflow-x-auto md:block">
        <div className="flex min-w-max gap-1 rounded-xl bg-surface/50 p-1">
          {visibleOptions.map(
            (item) => (
              <button
                key={item.value}
                type="button"
                onClick={() =>
                  onChange(
                    item.value,
                  )
                }
                className={cn(
                  "min-h-10 shrink-0 rounded-lg px-3 text-sm font-medium transition-colors",
                  visibleValue ===
                    item.value
                    ? "bg-surface-strong text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
