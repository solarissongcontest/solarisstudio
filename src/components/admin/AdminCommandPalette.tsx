import { Link } from "@tanstack/react-router";
import { Command, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { editionLabel, useEditions } from "@/lib/data";
import { useAdminContext } from "./AdminContext";

const FIXED = [
  ["Overview", "/admin/operations", "Organizer", "home status next things to do"],
  ["Guide", "/admin/guide", "Help", "how to use instructions questions answers"],
  ["All editions", "/admin", "Edition", "manage create old editions"],
  ["Delegations", "/confirmations/admin", "Edition", "confirmations responses countries"],
  ["Delegation responses", "/confirmations/admin/responses", "Delegations", "entries confirmations answers"],
  ["Confirmation rounds", "/confirmations/admin/rounds", "Delegations", "rounds open close schedule"],
  ["Delegation calendar", "/confirmations/admin/calendar", "Delegations", "national finals reveals deadlines"],
  ["Voting", "/televoting/admin", "Voting", "televote votes rounds"],
  ["Voting rounds and entries", "/televoting/admin/rounds", "Voting", "open close entries rules"],
  ["Voting results", "/televoting/admin/results", "Voting", "calculate lock publish"],
  ["Check suspicious votes", "/televoting/admin/integrity", "Voting", "review suspicious votes warnings"],
  ["Voting declarations", "/televoting/admin/integrity-declarations", "Voting", "review declarations flagged votes"],
  ["Voting statistics", "/televoting/admin/analytics", "Voting", "turnout voting numbers"],
  ["Predictions", "/admin/predictions", "More", "prediction rounds"],
  ["Public tester feedback", "/admin/beta-feedback", "More", "public testers feedback"],
  ["Organizer test", "/admin/beta-test", "More", "organizer testing feedback form"],
  ["Organizer test results", "/admin/admin-beta-feedback", "More", "organizer testers results bugs"],
  ["Country accounts", "/admin/country-accounts", "More", "country account access"],
  ["Hosting", "/admin/hosts", "More", "host country city"],
  ["System settings", "/admin/system", "More", "deadlines settings"],
  ["System check", "/admin/sync-health", "More", "check connected systems voting confirmations"],
  ["More organizer pages", "/admin/more", "More", "other organizer pages"],
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
            label: `${editionLabel(activeEdition)} overview`,
            href: `/admin/${activeEdition.slug}`,
            group: "Current edition",
            keywords: `${activeEdition.name} edition home`,
          },
          {
            label: `${editionLabel(activeEdition)} shows`,
            href: `/admin/shows/${activeEdition.slug}`,
            group: "Current edition",
            keywords: `${activeEdition.name} shows semi final create edit`,
          },
          {
            label: `${editionLabel(activeEdition)} entries and running order`,
            href: `/admin/entries/${activeEdition.slug}`,
            group: "Current edition",
            keywords: `${activeEdition.name} entries songs artists running order`,
          },
          {
            label: `${editionLabel(activeEdition)} jury`,
            href: `/admin/jury/${activeEdition.slug}`,
            group: "Current edition",
            keywords: `${activeEdition.name} jury juries votes scores`,
          },
          {
            label: `${editionLabel(activeEdition)} voting rules`,
            href: `/admin/voting-system/${activeEdition.slug}`,
            group: "Current edition",
            keywords: `${activeEdition.name} points weighting qualifiers self voting tie rules`,
          },
          {
            label: `${editionLabel(activeEdition)} televote points`,
            href: `/admin/televote/${activeEdition.slug}`,
            group: "Current edition",
            keywords: `${activeEdition.name} televote totals points`,
          },
          {
            label: `${editionLabel(activeEdition)} public visibility`,
            href: `/admin/publication/${activeEdition.slug}`,
            group: "Current edition",
            keywords: `${activeEdition.name} publish visibility results public release`,
          },
          {
            label: `${editionLabel(activeEdition)} design and broadcast`,
            href: `/admin/design/${activeEdition.slug}`,
            group: "Current edition",
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
        aria-label="Search organizer pages"
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
                placeholder="Search pages or editions…"
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
                  No organizer page matches that search.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
