import { useEffect, useMemo, useRef, useState } from "react";
import { FlagChip } from "./FlagChip";
import type { Country } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Fast searchable country picker. Type any part of the name or code,
 * Enter selects the first match — built for high-speed vote entry.
 */
export function CountryPicker({
  countries,
  value,
  onChange,
  placeholder = "Search country…",
  exclude,
  autoFocus,
  className,
}: {
  countries: Country[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  exclude?: Set<string>;
  autoFocus?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = countries.find((c) => c.id === value) ?? null;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return countries
      .filter((c) => !exclude?.has(c.id) || c.id === value)
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.short_code.toLowerCase().includes(q) ||
          (c.native_name ?? "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [countries, query, exclude, value]);

  useEffect(() => {
    if (!open) return;

    const closeWhenPointerLeavesPicker = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeWhenPointerLeavesPicker);
    return () => document.removeEventListener("pointerdown", closeWhenPointerLeavesPicker);
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5"
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {selected && (
          <FlagChip
            code={selected.short_code}
            color={selected.accent_color}
            image={selected.flag_image}
            size="sm"
          />
        )}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={open ? query : (selected?.name ?? "")}
          placeholder={selected ? selected.name : placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (matches[cursor]) pick(matches[cursor].id);
            } else if (e.key === "Escape" || e.key === "Tab") {
              setOpen(false);
            } else if (e.key === "Backspace" && !query && selected) {
              onChange(null);
            }
          }}
          className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open && matches.length > 0 && (
        <ul className="scroll-slim absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-popover p-1 shadow-2xl">
          {matches.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c.id)}
                onMouseEnter={() => setCursor(i)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                  i === cursor ? "bg-surface-strong" : "hover:bg-surface",
                )}
              >
                <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="numeric text-[11px] text-muted-foreground">{c.short_code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
