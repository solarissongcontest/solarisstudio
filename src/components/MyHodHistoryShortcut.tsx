import { Link } from "@tanstack/react-router";
import { History, UserRoundCog } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function MyHodHistoryShortcut() {
  const [target, setTarget] = useState<Element | null>(null);
  useEffect(() => { setTarget(document.querySelector(".app-main")); }, []);
  if (!target) return null;

  return createPortal(
    <section className="mt-5" data-my-hod-history-shortcut>
      <Link
        to="/my-solaris/hod-history"
        className="group flex min-h-20 items-center gap-4 rounded-2xl border border-border/70 bg-surface/55 p-4 transition hover:border-primary/25 hover:bg-surface-strong"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <UserRoundCog className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-primary"><History className="size-3.5" /> HOD identity</span>
          <span className="mt-1 block text-sm font-semibold">Check which editions were actually yours</span>
          <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">Keep personal voting-pattern analysis tied to the correct Head of Delegation.</span>
        </span>
        <span className="shrink-0 text-xs font-bold text-primary">Open →</span>
      </Link>
    </section>,
    target,
  );
}
