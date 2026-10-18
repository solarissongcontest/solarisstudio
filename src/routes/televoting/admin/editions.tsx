import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, RefreshCw, Trophy, Wrench } from "lucide-react";
import { toast } from "sonner";

import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import {
  getMergedTelevotingEditionLinks,
} from "@/integrations/televoting/edition-links.functions";
import type { MergedTelevotingEditionLink } from "@/integrations/televoting/edition-links.server";
import { syncMergedTelevotingEditionCatalog } from "@/integrations/televoting/solaris-sync.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/televoting/admin/editions")({
  head: () => ({
    meta: [
      { title: "Voting edition links — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TelevotingEditionsPage,
});

function TelevotingEditionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const getEditionLinks = useServerFn(getMergedTelevotingEditionLinks);
  const syncCatalog = useServerFn(syncMergedTelevotingEditionCatalog);
  const [repairOpen, setRepairOpen] = useState(false);

  const { data: admin, isLoading: adminLoading } = useQuery({
    queryKey: ["merged-televoting-admin"],
    queryFn: () => getAdmin(),
  });

  useEffect(() => {
    if (!adminLoading && !admin) void navigate({ to: "/televoting/admin/sign-in" });
  }, [admin, adminLoading, navigate]);

  const {
    data: editions = [],
    isLoading,
    error,
    isFetching,
  } = useQuery({
    queryKey: ["merged-televoting-edition-links"],
    queryFn: () => getEditionLinks(),
    enabled: Boolean(admin),
    staleTime: 15_000,
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["merged-televoting-edition-links"] });
  }

  const repairMutation = useMutation({
    mutationFn: () => syncCatalog(),
    onSuccess: async () => {
      setRepairOpen(false);
      toast.success("Voting edition links repaired");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["merged-televoting-edition-links"] }),
        queryClient.invalidateQueries({ queryKey: ["merged-televoting-rounds"] }),
        queryClient.invalidateQueries({ queryKey: ["merged-televoting-admin-overview"] }),
      ]);
    },
    onError: (caught) =>
      toast.error(caught instanceof Error ? caught.message : "Voting edition links could not be repaired"),
  });

  const repairCount = editions.filter((edition) => edition.health !== "linked").length;

  return (
    <div className="mx-auto max-w-5xl space-y-4" data-v3-organizer-voting-edition-links="read-only-load">
      <AdminPageHeader
        eyebrow="Voting service"
        title="Edition links"
        description="Solaris Studio owns edition identity. Viewing this page is read-only; Televoting reconciliation runs only when an organizer explicitly chooses Repair links."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isFetching}
              onClick={() => void refresh()}
              className="admin-action-secondary"
            >
              <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              disabled={adminLoading || isLoading || repairMutation.isPending}
              onClick={() => setRepairOpen(true)}
              className="admin-action-primary"
            >
              <Wrench className="size-4" />
              {repairCount ? `Repair ${repairCount}` : "Repair links"}
            </button>
          </div>
        }
      />

      <AdminCard>
        <AdminCardHeader
          eyebrow="Editions"
          title="Managed in Solaris"
          description="Create, rename and archive editions in Solaris. This diagnostic view reports projection drift without changing remote state."
          action={
            <Link to="/admin/editions" className="admin-action-secondary !min-h-10">
              Manage editions
            </Link>
          }
        />
      </AdminCard>

      {adminLoading || isLoading ? (
        <AdminCard>
          <p className="py-8 text-center text-sm text-muted-foreground">Checking edition links…</p>
        </AdminCard>
      ) : error ? (
        <AdminCard className="!border-rose-200/15 !bg-rose-200/[0.045]">
          <p className="text-sm text-rose-100">
            {error instanceof Error ? error.message : "Edition links could not be read."}
          </p>
        </AdminCard>
      ) : editions.length ? (
        <div className="space-y-3">
          {editions.map((edition) => (
            <AdminCard
              key={edition.solaris_id}
              className={cn("!p-4", edition.expected_archived && "opacity-70")}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100">
                  <Trophy className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-bold text-foreground">
                      SSC {edition.edition_number} · {edition.name}
                    </h2>
                    <EditionLinkStatus edition={edition} />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {editionLinkDescription(edition)}
                  </p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                      Technical link state
                    </summary>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      Solaris {edition.solaris_id} · voting projection {edition.remote_id ?? "not linked"}
                    </p>
                    {edition.sync_status || edition.last_synced_at ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {edition.sync_status ? `Sync ${edition.sync_status}` : "Sync state unavailable"}
                        {edition.last_synced_at
                          ? ` · last reconciled ${new Date(edition.last_synced_at).toLocaleString()}`
                          : ""}
                      </p>
                    ) : null}
                  </details>
                </div>
              </div>
            </AdminCard>
          ))}
        </div>
      ) : (
        <AdminCard>
          <AdminEmptyState
            icon={Trophy}
            title="No numbered Solaris editions"
            description="There are no numbered Solaris editions for the voting service to link."
            action={
              <Link to="/admin/editions" className="admin-action-primary">
                Manage editions
              </Link>
            }
          />
        </AdminCard>
      )}

      <AdminConfirmSheet
        open={repairOpen}
        onClose={() => !repairMutation.isPending && setRepairOpen(false)}
        onConfirm={() => repairMutation.mutate()}
        title="Repair voting edition links?"
        description="This explicitly reconciles Televoting edition projections and Solaris integration links. It may create missing voting projections and update their name, active state or archive state to match Solaris."
        confirmLabel="Repair edition links"
        busy={repairMutation.isPending}
      />
    </div>
  );
}

function EditionLinkStatus({ edition }: { edition: MergedTelevotingEditionLink }) {
  if (edition.health === "unlinked") return <AdminStatus tone="attention">Unlinked</AdminStatus>;
  if (edition.health === "missing_remote") {
    return <AdminStatus tone="attention">Missing projection</AdminStatus>;
  }
  if (edition.health === "drift") return <AdminStatus tone="attention">Needs repair</AdminStatus>;
  if (edition.expected_active) {
    return (
      <AdminStatus tone="ready">
        <CheckCircle2 className="size-3" /> Active
      </AdminStatus>
    );
  }
  if (edition.expected_archived) return <AdminStatus tone="neutral">Archived</AdminStatus>;
  return <AdminStatus tone="info">Linked</AdminStatus>;
}

function editionLinkDescription(edition: MergedTelevotingEditionLink) {
  switch (edition.health) {
    case "unlinked":
      return "Solaris has this edition, but no Televoting integration link exists. Repair is required before voting data can reference the canonical edition safely.";
    case "missing_remote":
      return "An integration link exists, but its Televoting edition projection is missing. Repair can recreate the projection without changing Solaris edition identity.";
    case "drift":
      return "The linked Televoting projection no longer matches the Solaris edition name or lifecycle state. Repair will reconcile that projection explicitly.";
    case "linked":
      return "The Televoting projection matches the current Solaris edition identity and lifecycle state.";
  }
}
