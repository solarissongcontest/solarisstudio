import { Search, X } from "lucide-react";
import { useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

const APP_SEARCH_FOCUS_STYLE: CSSProperties = {
  background: "rgb(255 255 255 / .07)",
  boxShadow:
    "inset 0 0 0 1px rgb(139 198 222 / .30), 0 0 0 3px rgb(139 198 222 / .04)",
};

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
  const [focused, setFocused] = useState(false);

  return (
    <div
      className={cn("solaris-app-search-shell", className)}
      data-solaris-search-field
      style={focused ? APP_SEARCH_FOCUS_STYLE : undefined}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
    >
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
