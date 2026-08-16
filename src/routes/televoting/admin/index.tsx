import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, CalendarDays, PlayCircle, ShieldAlert, Trophy, Users } from "lucide-react";

import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import { getMergedTelevotingOverview } from "@/integrations/televoting/admin-data.functions";

export const Route = createFileRoute("/televoting/admin/")({
  head: () => ({ meta: [{ title: "Televoting Control Centre — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: TelevotingAdminOverview,
});

function TelevotingAdminOverview() {
  const navigate = useNavigate();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const getOverview = useServerFn(getMergedTelevotingOverview);

  const { data: admin, isLoading: adminLoading } = useQuery({
    queryKey: ["merged-televoting-admin"],
    queryFn: () => getAdmin(),
  });

  useEffect(() => {
    if (!adminLoading && !admin) void navigate({ to: "/televoting/admin/sign-in" });
  }, [admin, adminLoading, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["merged-televoting-admin-overview"],
    queryFn: () => getOverview(),
    enabled: Boolean(admin),
    refetchInterval: 5_000,
  });

  const cards = [
    { label: "Editions", value: data?.editions ?? 0, icon: CalendarDays },
    { label: "Rounds", value: data?.rounds ?? 0, icon: PlayCircle },
    { label: "Open rounds", value: data?.openRounds ?? 0, icon: PlayCircle },
    { label: "Submissions", value: data?.submissions ?? 0, icon: Users },
    { label: "Blocked events", value: data?.blocked ?? 0, icon: ShieldAlert },
    { label: "Active edition", value: data?.activeEdition ?? "—", icon: Trophy },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl py-4 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link to="/televoting" className="text-xs text-muted-foreground hover:text-foreground">← Televoting portal</Link>
        {admin ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground">Signed in as {admin.username}</span> : null}
      </div>

      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.22em] text-sky-100/65">Televoting organiser</p>
        <h1 className="font-display mt-2 text-5xl uppercase leading-none sm:text-6xl">Control centre</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">The merged organiser shell uses the existing Televoting administrator accounts and database. Its deeper admin tools are being absorbed behind this same workspace.</p>
      </header>

      {adminLoading || isLoading ? (
        <section className="glass-strong p-8 text-center text-sm text-muted-foreground">Loading Televoting control room…</section>
      ) : error ? (
        <section className="glass-strong border-destructive/30 p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Admin data could not be loaded."}</section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {cards.map(({ label, value, icon: Icon }) => (
              <article key={label} className="glass p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{label}</span><Icon className="size-4 text-sky-100/65" /></div>
                <p className="mt-3 truncate text-2xl font-medium tabular-nums sm:text-3xl">{value}</p>
              </article>
            ))}
          </section>

          <section className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              { label: "Rounds & entries", description: "Configure voting rounds and participant entries.", icon: PlayCircle },
              { label: "Results", description: "Review original and converted televote results.", icon: Trophy },
              { label: "Analytics", description: "Inspect participation and voting behaviour.", icon: BarChart3 },
              { label: "Integrity", description: "Anti-abuse, detection and friend-voting analysis.", icon: ShieldAlert },
            ].map(({ label, description, icon: Icon }) => (
              <article key={label} className="glass p-5 opacity-75">
                <div className="grid size-10 place-items-center rounded-xl border border-sky-200/15 bg-sky-200/10 text-sky-100"><Icon className="size-4" /></div>
                <h2 className="mt-4 text-lg font-medium">{label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                <p className="mt-3 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Integration in progress</p>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
