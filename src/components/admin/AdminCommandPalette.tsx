import { Link } from "@tanstack/react-router";
import { Command, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { editionLabel, useEditions } from "@/lib/data";

const FIXED = [
  ["Control Room", "/admin/control-room", "Overview"],
  ["Manage editions", "/admin", "Contest"],
  ["Action Centre", "/admin/action-centre", "Operations"],
  ["Status", "/admin/status", "Operations"],
  ["Hosting", "/admin/hosts", "Broadcast"],
  ["Predictions", "/admin/predictions", "Engagement"],
  ["Country accounts", "/admin/country-accounts", "Terra Solaris"],
  ["Deadlines & audit", "/admin/system", "System"],
  ["Public homepage", "/", "Public site"],
] as const;

export function AdminCommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data: editions = [] } = useEditions();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const commands = useMemo(
    () => [
      ...FIXED.map(([label, href, group]) => ({ label, href, group })),
      ...editions.map((edition) => ({
        label: `${editionLabel(edition)} · ${edition.name}`,
        href: `/admin/${edition.slug}`,
        group: "Editions",
      })),
    ],
    [editions],
  );

  const needle = query.trim().toLowerCase();
  const filtered = commands.filter((item) => !needle || `${item.label} ${item.group}`.toLowerCase().includes(needle));

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="hidden min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs text-muted-foreground hover:text-foreground sm:flex">
        <Search className="h-3.5 w-3.5" /> Search <kbd className="ml-1 rounded bg-background/60 px-1.5 py-0.5 text-[9px]">⌘K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 px-3 pt-[12vh] backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Command className="h-4 w-4 text-primary" />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search admin tools or editions…" className="min-h-14 min-w-0 flex-1 bg-transparent text-sm outline-none" />
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {filtered.slice(0, 20).map((item) => (
                <Link key={`${item.group}-${item.href}-${item.label}`} to={item.href as any} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded-xl px-3 hover:bg-surface">
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold">{item.label}</span><span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{item.group}</span></span>
                </Link>
              ))}
              {!filtered.length && <p className="p-6 text-center text-sm text-muted-foreground">No admin destination matches that search.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
