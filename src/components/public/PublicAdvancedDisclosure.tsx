import { ChevronDown } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

import { trackPublicUxEvent } from "@/lib/public-ux-events";
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
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <section
      className="public-advanced-disclosure"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            trackPublicUxEvent("advanced_section_opened", {
              target: label,
              metadata: { interaction: "disclosure" },
            });
            onOpen?.();
          }
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
      {/* The controlled region stays addressable while closed, but expensive
          panel children still mount only on expansion. */}
      <div id={panelId} className="public-advanced-content" hidden={!open}>
        {open ? children : null}
      </div>
    </section>
  );
}
