import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, RefreshCw, Trophy } from "lucide-react";

import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import { syncMergedTelevotingEditionCatalog } from "@/integrations/televoting/solaris-sync.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/televoting/admin/editions")({
  head: () => ({ meta: [{ title: "Voting edition links — Solaris Organizer" }, { name: "robots", content: "noindex" }] }),
  component: TelevotingEditionsPage,
});

function TelevotingEditionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const syncCatalog = useServerFn(syncMergedTelevotingEditionCatalog);

  const { data: admin, isLoading: adminLoading } = useQuery({ queryKey: ["merged-televoting-admin"], queryFn: () => getAdmin() });

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
    <div className="mx-auto max-w-5xl space-y-4">
      <AdminPageHeader
        eyebrow="Voting service"
        title="Edition links"
        description="Solaris Studio owns edition identity. Televoting keeps linked records only so voting data can reference the same editions without creating a second editable archive."
        actions={<button type="button" disabled={isFetching} onClick={() => void refresh()} className="admin-action-secondary"><RefreshCw className={cn("size-4", isFetching && "animate-spin")} /> {isFetching ? "Refreshing…" : "Refresh"}</button>}
      />

      <AdminCard>
        <AdminCardHeader eyebrow="Editions" title="Managed in Solaris" description="Create, rename and archive editions in Solaris. Televoting updates automatically." action={<Link to="/admin" className="admin-action-secondary !min-h-10">Manage editions</Link>} />
      </AdminCard>

      {adminLoading || isLoading ? (
        <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Checking edition links…</p></AdminCard>
      ) : error ? (
        <AdminCard className="!border-rose-200/15 !bg-rose-200/[0.045]"><p className="text-sm text-rose-100">{error instanceof Error ? error.message : "Edition links could not be refreshed."}</p></AdminCard>
      ) : editions.length ? (
        <div className="space-y-3">
          {editions.map((edition) => (
            <AdminCard key={edition.solaris_id} className={cn("!p-4", edition.is_archived && "opacity-70")}>
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100"><Trophy className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-bold text-foreground">SSC {edition.edition_number} · {edition.name}</h2>
                    {edition.is_active ? <AdminStatus tone="ready"><CheckCircle2 className="size-3" /> Active</AdminStatus> : edition.is_archived ? <AdminStatus tone="neutral">Archived</AdminStatus> : <AdminStatus tone="info">Linked</AdminStatus>}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">This Televoting edition updates automatically when its Solaris edition changes.</p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">Technical IDs</summary>
                    <p className="mt-1 break-all text-xs text-muted-foreground">Solaris {edition.solaris_id} · voting projection {edition.id}</p>
                  </details>
                </div>
              </div>
            </AdminCard>
          ))}
        </div>
      ) : (
        <AdminCard><AdminEmptyState icon={Trophy} title="No linked editions" description="No numbered Solaris editions are currently available to the voting service." action={<Link to="/admin" className="admin-action-primary">Manage editions</Link>} /></AdminCard>
      )}
    </div>
  );
}
