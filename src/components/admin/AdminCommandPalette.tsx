import { Link } from "@tanstack/react-router";
import { Command, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { editionLabel, useEditions } from "@/lib/data";
import { useAdminContext } from "./AdminContext";

const FIXED = [
  ["Overview", "/admin/operations", "Organizer", "home status next actions"],
  ["Delegations overview", "/confirmations/admin", "Delegations", "confirmations submissions countries"],
  ["Delegation responses", "/confirmations/admin/responses", "Delegations", "entries confirmations review responses"],
  ["Submission rounds", "/confirmations/admin/rounds", "Delegations", "rounds open close schedule"],
  ["Delegation calendar", "/confirmations/admin/calendar", "Delegations", "national finals reveals deadlines"],
  ["Delegation access", "/confirmations/admin/recovery-codes", "Delegations", "recovery access codes accounts"],
  ["Public voting overview", "/televoting/admin", "Voting", "public voting rounds ballots"],
  ["Public voting rounds", "/televoting/admin/rounds", "Voting", "open close entries rules"],
  ["Voting results", "/televoting/admin/results", "Voting", "calculate official results"],
  ["Voting integrity", "/televoting/admin/integrity", "Voting", "review suspicious votes warnings blocked"],
  ["Friend-voting intelligence", "/admin/friend-voting", "Voting", "relationships reciprocity network signals"],
  ["Voting analytics", "/televoting/admin/analytics", "Voting", "turnout voting numbers"],
  ["Country accounts", "/admin/country-accounts", "Administration", "country account access"],
  ["HOD history", "/admin/hod-history", "Administration", "delegation manager history"],
  ["Predictions", "/admin/predictions", "Administration", "prediction rounds"],
  ["Beta 2 feedback", "/admin/beta2-feedback", "Administration", "public beta current feedback testing report"],
  ["Beta 1 archive", "/admin/beta1-feedback", "Administration", "public beta historical archive feedback"],
  ["System health", "/admin/sync-health", "Administration", "sync health integrations diagnostics"],
  ["System settings", "/admin/system", "Administration", "deadlines settings audit"],
  ["Administration", "/admin/more", "Administration", "accounts history system tools archive"],
  ["All editions", "/admin", "Workspace", "manage create archive editions"],
  ["Organizer guide", "/admin/guide", "Workspace", "how to use instructions questions answers"],
  ["Mobile menu", "/admin/menu", "Workspace", "delegations broadcast administration guide"],
  ["Public Solaris Studio", "/", "Public site", "homepage"],
] as const;

export function AdminCommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const activeEdition =
    editions.find((edition) => edition.id === editionId) ??
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;

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

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const commands = useMemo(() => {
    const currentEdition = activeEdition
      ? [
          {
            label: `${editionLabel(activeEdition)} contest overview`,
            href: `/admin/${activeEdition.slug}`,
            group: "Contest",
            keywords: `${activeEdition.name} edition home workflow`,
          },
          {
            label: `${editionLabel(activeEdition)} shows`,
            href: `/admin/shows/${activeEdition.slug}`,
            group: "Contest",
            keywords: `${activeEdition.name} shows stages create edit`,
          },
          {
            label: `${editionLabel(activeEdition)} entries & running order`,
            href: `/admin/entries/${activeEdition.slug}`,
            group: "Contest",
            keywords: `${activeEdition.name} entries songs artists line-up lineup running order`,
          },
          {
            label: `${editionLabel(activeEdition)} voting rules`,
            href: `/admin/voting-system/${activeEdition.slug}`,
            group: "Voting",
            keywords: `${activeEdition.name} point scale weighting qualifiers self voting tie rules`,
          },
          {
            label: `${editionLabel(activeEdition)} jury`,
            href: `/admin/jury/${activeEdition.slug}`,
            group: "Voting",
            keywords: `${activeEdition.name} jury juries votes scores roster`,
          },
          {
            label: `${editionLabel(activeEdition)} official televote totals`,
            href: `/admin/televote/${activeEdition.slug}`,
            group: "Voting",
            keywords: `${activeEdition.name} televote official totals points`,
          },
          {
            label: `${editionLabel(activeEdition)} publication`,
            href: `/admin/publication/${activeEdition.slug}`,
            group: "Publish",
            keywords: `${activeEdition.name} publish visibility results public release`,
          },
          {
            label: `${editionLabel(activeEdition)} design & broadcast`,
            href: `/admin/design/${activeEdition.slug}`,
            group: "Broadcast",
            keywords: `${activeEdition.name} artwork theme broadcast scoreboard hosts scenes`,
          },
        ]
      : [];

    return [
      ...currentEdition,
      ...FIXED.map(([label, href, group, keywords]) => ({ label, href, group, keywords })),
      ...editions.map((edition) => ({
        label: `${editionLabel(edition)} · ${edition.name}`,
        href: `/admin/${edition.slug}`,
        group: "Editions",
        keywords: `${edition.host_city ?? ""} ${edition.edition_number ?? ""}`,
      })),
    ];
  }, [activeEdition, editions]);

  const needle = query.trim().toLowerCase();
  const filtered = commands.filter(
    (item) =>
      !needle ||
      `${item.label} ${item.group} ${item.keywords}`.toLowerCase().includes(needle),
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground sm:flex sm:w-auto sm:px-3"
        aria-label="Search Solaris Organizer"
      >
        <Search className="size-4" />
        <span className="hidden text-xs sm:inline">Search</span>
        <kbd className="ml-1 hidden rounded bg-black/20 px-1.5 py-0.5 text-[9px] text-muted-foreground lg:inline">⌘K</kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center bg-black/72 px-2 pt-[7vh] backdrop-blur-sm sm:px-3 sm:pt-[12vh]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.1] bg-[#081326] shadow-2xl">
            <div className="flex items-center gap-3 border-b border-white/[0.08] px-3 sm:px-4">
              <Command className="size-4 shrink-0 text-sky-100" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search sections, editions or tools…"
                className="min-h-14 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                aria-label="Close search"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-[68dvh] overflow-y-auto p-2 scroll-slim">
              {filtered.slice(0, 24).map((item) => (
                <Link
                  key={`${item.group}-${item.href}-${item.label}`}
                  to={item.href as any}
                  onClick={() => setOpen(false)}
                  className="flex min-h-13 items-center rounded-xl px-3 transition hover:bg-white/[0.045]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{item.label}</span>
                    <span className="mt-0.5 block text-[10px] font-semibold text-muted-foreground">{item.group}</span>
                  </span>
                </Link>
              ))}
              {!filtered.length ? (
                <p className="p-7 text-center text-sm text-muted-foreground">
                  Nothing in Solaris Organizer matches that search.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
