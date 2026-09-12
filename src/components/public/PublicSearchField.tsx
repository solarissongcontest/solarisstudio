import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

type PublicSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
};

export function PublicSearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: PublicSearchFieldProps) {
  return (
    <label
      className={cn(
        "flex h-11 min-w-0 items-center gap-2.5 rounded-xl border border-white/[0.09] bg-black/10 px-3 transition-colors focus-within:border-sky-200/30",
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-sky-200" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="min-w-0 flex-1 appearance-none border-0 !bg-transparent p-0 text-sm shadow-none outline-none placeholder:text-muted-foreground/60 focus-visible:!shadow-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/[0.05] hover:text-white"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </label>
  );
}
