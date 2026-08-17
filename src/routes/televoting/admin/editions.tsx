import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import { syncMergedTelevotingEditionCatalog } from "@/integrations/televoting/solaris-sync.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/televoting/admin/editions")({
  head: () => ({ meta: [{ title: "Televoting Editions — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: TelevotingEditionsPage,
});

function TelevotingEditionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const syncCatalog = useServerFn(syncMergedTelevotingEditionCatalog);

  const { data: admin, isLoading: adminLoading } = useQuery({
    queryKey: ["merged-televoting-admin"],
    queryFn: () => getAdmin(),
  });

  useEffect(() => {
    if (!adminLoading && !admin) void navigate({ to: "/televoting/admin/sign-in" });
  }, [admin, adminLoading, navigate]);

  const { data: editions = [], isLoading, error, isFetching } = useQuery({
    queryKey: ["merged-televoting-canonical-editions"],
    queryFn: () => syncCatalog(),
    enabled: Boolean(admin),
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-canonical-editions"] }),
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-rounds"] }),
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-admin-overview"] }),
    ]);
  }

  return (
    <div className="mx-auto max-w-6xl py-4 sm:py-8">
      <div className="mb-5">
        <Link to="/televoting/admin" className="text-xs text-muted-foreground hover:text-foreground">← Televoting control centre</Link>
      </div>

      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.22em] text-sky-100/65">Canonical contest structure</p>
        <h1 className="font-display mt-2 text-5xl uppercase leading-none sm:text-6xl">Editions</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Edition identity is owned by Solaris Studio. Televoting keeps a linked projection only because its voting tables need local foreign keys. Names, active status and archive state are synchronized from Solaris instead of being edited twice.
        </p>
      </header>

      <section className="glass mb-5 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Single source of truth</p>
          <p className="mt-1 text-xs text-muted-foreground">Creating or renaming an edition happens once in Solaris Studio. Opening this workspace refreshes the Televoting projections automatically.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={isFetching} onClick={() => void refresh()}>
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} /> Refresh projections
          </Button>
          <Button asChild><Link to="/televoting/admin/rounds">Manage rounds <ExternalLink className="size-3.5" /></Link></Button>
        </div>
      </section>

      {adminLoading || isLoading ? (
        <section className="glass-strong p-8 text-center text-sm text-muted-foreground">Synchronizing Solaris editions…</section>
      ) : error ? (
        <section className="glass-strong border-destructive/30 p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Editions could not be synchronized."}</section>
      ) : (
        <section className="space-y-3">
          {editions.map((edition) => (
            <article key={edition.solaris_id} className={cn("glass-strong p-5", edition.is_archived && "opacity-70")}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">SSC {edition.edition_number}</span>
                    {edition.is_active ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-emerald-100"><CheckCircle2 className="size-3" /> Active</span>
                    ) : null}
                    {edition.is_archived ? (
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Archived</span>
                    ) : null}
                  </div>
                  <h2 className="mt-3 text-xl font-medium">{edition.name}</h2>
                  <p className="mt-2 text-xs text-muted-foreground">Solaris ID {edition.solaris_id.slice(0, 8)}… · Televoting projection {edition.id.slice(0, 8)}…</p>
                </div>
                <div className="rounded-xl border border-sky-200/15 bg-sky-200/[0.06] px-3 py-2 text-xs text-sky-100/75">Linked to Solaris</div>
              </div>
            </article>
          ))}
          {!editions.length ? <div className="glass-strong p-8 text-center text-sm text-muted-foreground">No numbered Solaris editions exist yet.</div> : null}
        </section>
      )}
    </div>
  );
}
