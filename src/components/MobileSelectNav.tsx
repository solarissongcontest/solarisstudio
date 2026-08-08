export type MobileNavOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

export function MobileSelectNav<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly MobileNavOption<T>[];
  onChange: (value: T) => void;
}) {
  const current = options.find((item) => item.value === value);

  return (
    <label className="block md:hidden">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>

      <div className="rounded-xl border border-border bg-surface">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="min-h-12 w-full appearance-none bg-transparent px-3 pr-10 text-sm font-semibold text-foreground outline-none"
        >
          {options.map((item) => (
            <option key={item.value} value={item.value} className="bg-background">
              {item.label}
            </option>
          ))}
        </select>

        {current?.description && (
          <p className="border-t border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {current.description}
          </p>
        )}
      </div>
    </label>
  );
}
