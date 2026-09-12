import { Link } from "@tanstack/react-router";
import { CalendarClock, FileClock, ShieldCheck } from "lucide-react";

import { usePublishedRulebook } from "@/lib/rules-governance";
import { SSC_RULEBOOK } from "@/lib/ssc-rules-v4";

export function RulebookVersionBanner() {
  const release = usePublishedRulebook();
  const version = release.data?.version ?? SSC_RULEBOOK.version;
  const title = release.data?.title ?? SSC_RULEBOOK.status;
  const effectiveAt = release.data?.effective_from ?? release.data?.published_at ?? null;

  return (
    <section className="mb-4 grid gap-3 rounded-2xl border border-sky-200/12 bg-sky-200/[0.035] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-sky-200/12 bg-sky-200/[0.065] text-sky-100">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[9px] font-black uppercase tracking-[.16em] text-sky-200/65">Current official rulebook</p>
            <span className="rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[9px] font-black text-white">v{version}</span>
          </div>
          <p className="mt-1 text-xs font-bold text-slate-100">{title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <CalendarClock className="size-3" />
            {effectiveAt ? `Effective ${formatDate(effectiveAt)}` : "Bundled official regulations"}
            {release.isFetching ? <span>· checking for a newer published release…</span> : null}
          </p>
        </div>
      </div>
      <Link
        to="/rules/changes"
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-violet-200/12 bg-violet-200/[0.045] px-3 text-[10px] font-black text-violet-100 transition hover:border-violet-200/22 hover:bg-violet-200/[0.08]"
      >
        <FileClock className="size-3.5" /> Version history
      </Link>
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
