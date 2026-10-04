import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

export function SolarisSearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn("solaris-app-search-shell", className)} data-solaris-search-field>
      <Search className="solaris-app-search-icon size-[1.05rem]" aria-hidden="true" />
      <input
        type="text"
        role="searchbox"
        inputMode="search"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        enterKeyHint="search"
        className="solaris-app-search-input"
      />
      {value ? (
        <button
          type="button"
          className="solaris-app-search-clear"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
