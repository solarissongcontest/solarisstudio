import "@/confirmations.css";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  FileText,
  Flag,
  KeyRound,
  Layers3,
  LogOut,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";

import { ConfirmationsAdminNav } from "@/components/confirmations/ConfirmationsAdminNav";
import { Button } from "@/components/ui/button";
import {
  loadConfirmationEditions,
  requireConfirmationsAdmin,
  type ConfirmationEdition,
} from "@/integrations/confirmations/admin";
import { confirmationsSupabase } from "@/integrations/confirmations/client";

export const Route = createFileRoute("/confirmations/admin/")({
  head: () => ({
    meta: [
      { title: "Confirmations Organiser — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmationsAdminOverview,
});

const cards = [
  {
    to: "/confirmations/admin/responses",
    title: "Responses",
    description: "Review every confirmation, entry and National Final.",
    icon: FileText,
  },
  {
    to: "/confirmations/admin/rounds",
    title: "Submission rounds",
    description: "Open, close, schedule and limit confirmation waves.",
    icon: Layers3,
  },
  {
    to: "/confirmations/admin/editions",
    title: "Editions",
    description: "Control the active SSC edition and response editing.",
    icon: SlidersHorizontal,
  },
  {
    to: "/confirmations/admin/countries",
    title: "Countries",
    description: "Review delegation status, selection methods and entry information.",
    icon: Flag,
  },
  {
    to: "/confirmations/admin/calendar",
    title: "Calendar",
    description: "See reveals, National Finals and round deadlines together.",
    icon: CalendarDays,
  },
  {
    to: "/confirmations/admin/recovery-codes",
    title: "Recovery codes",
    description: "Help delegations regain access to their responses.",
    icon: KeyRound,
  },
  {
    to: "/confirmations/admin/settings",
    title: "Settings",
    description: "Editing controls, edition workflow and public-form information.",
    icon: Settings2,
  },
] as const;

function ConfirmationsAdminOverview() {
  const navigate = useNavigate();
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const admin = await requireConfirmationsAdmin();
        if (!admin) {
          await navigate({ to: "/auth", search: { redirect: "/confirmations/admin" } });
          return;
        }
        const rows = await loadConfirmationEditions();
        if (alive) setEditions(rows);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Could not load Confirmations admin.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);

  const activeEdition = useMemo(
    () => editions.find((edition) => edition.status === "active") ?? editions[0] ?? null,
    [editions],
  );

  const totals = useMemo(() => {
    const responseCount = editions.reduce((sum, edition) => sum + (edition.response_count ?? 0), 0);
    const rounds = editions.reduce((sum, edition) => sum + edition.rounds.length, 0);
    const openRounds = editions.reduce(
      (sum, edition) => sum + edition.rounds.filter((round) => round.status === "open").length,
      0,
    );
    return { responseCount, rounds, openRounds };
  }, [editions]);

  async function signOut() {
    await confirmationsSupabase.auth.signOut();
    await navigate({ to: "/auth" });
  }

  return (
    <div className="confirmations-theme min-h-screen">
      <div className="confirmations-backdrop" aria-hidden="true" />
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link to="/confirmations" className="text-xs text-white/55 transition hover:text-white">
            ← Confirmations portal
          </Link>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="size-3.5" /> Sign out of Solaris
          </Button>
        </div>

        <ConfirmationsAdminNav current="/confirmations/admin" />

        <header className="mb-8">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200/65">Delegation operations</p>
          <h1 className="confirmations-display mt-2 text-5xl font-normal uppercase leading-none sm:text-6xl">
            Confirmations
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">
            Manage delegation responses, submission waves, reviews, reveal dates and recovery access from Solaris Operations.
          </p>
        </header>

        {loading ? (
          <div className="confirmations-surface p-8 text-center text-sm text-white/55">Loading organiser data…</div>
        ) : error ? (
          <div className="confirmations-surface border-red-300/20 p-6 text-sm text-red-100">{error}</div>
        ) : (
          <>
            <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="confirmations-surface p-5">
                <p className="text-[9px] uppercase tracking-[0.18em] text-white/35">Active edition</p>
                <p className="mt-2 text-xl font-medium text-white">
                  {activeEdition ? `SSC ${activeEdition.edition_number}` : "None"}
                </p>
                <p className="mt-1 truncate text-xs text-white/45">{activeEdition?.name ?? "No edition configured"}</p>
              </div>
              <div className="confirmations-surface p-5">
                <p className="text-[9px] uppercase tracking-[0.18em] text-white/35">Responses</p>
                <p className="mt-2 text-3xl font-medium text-white">{totals.responseCount}</p>
                <p className="mt-1 text-xs text-white/45">Across all Confirmations editions</p>
              </div>
              <div className="confirmations-surface p-5">
                <p className="text-[9px] uppercase tracking-[0.18em] text-white/35">Rounds</p>
                <p className="mt-2 text-3xl font-medium text-white">{totals.rounds}</p>
                <p className="mt-1 text-xs text-white/45">Configured submission waves</p>
              </div>
              <div className="confirmations-surface p-5">
                <p className="text-[9px] uppercase tracking-[0.18em] text-white/35">Open now</p>
                <p className="mt-2 text-3xl font-medium text-white">{totals.openRounds}</p>
                <p className="mt-1 text-xs text-white/45">Rounds accepting new responses</p>
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {cards.map(({ to, title, description, icon: Icon }) => (
                <Link key={to} to={to} className="confirmations-surface group p-5 transition hover:border-white/20">
                  <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sky-100/75 transition group-hover:border-sky-200/20 group-hover:bg-sky-200/10">
                    <Icon className="size-4.5" />
                  </div>
                  <h2 className="mt-4 text-lg font-medium text-white">{title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/48">{description}</p>
                </Link>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
