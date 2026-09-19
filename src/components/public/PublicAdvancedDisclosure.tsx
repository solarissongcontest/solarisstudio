import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PublicAdvancedDisclosure({
  label,
  description,
  children,
  defaultOpen = false,
  onOpen,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="public-advanced-disclosure">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) onOpen?.();
        }}
        className="public-advanced-trigger"
      >
        <span className="min-w-0 text-left">
          <span className="block text-sm font-semibold text-foreground">{label}</span>
          {description ? (
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open ? <div className="public-advanced-content">{children}</div> : null}
    </section>
  );
}
