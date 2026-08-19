import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminActionItem,
  AdminCard,
  AdminCardHeader,
  AdminMoreMenu,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  loadConfirmationEditions,
  requireConfirmationsAdmin,
  saveConfirmationEdition,
  setConfirmationEditionEditing,
  type ConfirmationEdition,
} from "@/integrations/confirmations/admin";
import { supabase as solarisSupabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/confirmations/admin/editions")({
  head: () => ({ meta: [{ title: "Delegation Editions — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: EditionsPage,
});

type CanonicalEdition = {
  id: string;
  name: string;
  edition_number: number;
  description: string | null;
  status: string;
};

function confirmationStatus(status: string): ConfirmationEdition["status"] {
  if (status === "active") return "active";
  if (status === "completed" || status === "finished") return "finished";
  return "draft";
}

function EditionsPage() {
  const navigate = useNavigate();
  const [canonicalEditions, setCanonicalEditions] = useState<CanonicalEdition[]>([]);
  const [remoteEditions, setRemoteEditions] = useState<ConfirmationEdition[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCanonical = useCallback(async () => {
    const { data, error: queryError } = await (solarisSupabase as any)
      .from("editions")
      .select("id,name,edition_number,description,status")
      .not("edition_number", "is", null)
      .order("edition_number", { ascending: false });
    if (queryError) throw queryError;
    return (data ?? []) as CanonicalEdition[];
  }, []);

  const refresh = useCallback(async () => {
    const [canonical, remote] = await Promise.all([loadCanonical(), loadConfirmationEditions()]);
    setCanonicalEditions(canonical);
    setRemoteEditions(remote);
    return { canonical, remote };
  }, [loadCanonical]);

  const synchronize = useCallback(async (showToast = true) => {
    setSyncing(true);
    setError(null);
    try {
      const { canonical, remote } = await refresh();
      const remoteByNumber = new Map(remote.map((edition) => [edition.edition_number, edition]));
      const solaris = solarisSupabase as any;
      let changed = 0;

      for (const edition of canonical) {
        const current = remoteByNumber.get(edition.edition_number);
        const desiredStatus = confirmationStatus(edition.status);
        const desiredDescription = edition.description ?? "";
        const editingEnabled = current?.editing_enabled ?? desiredStatus !== "finished";
        const needsMetadataSync = !current || current.name !== edition.name || (current.description ?? "") !== desiredDescription || current.status !== desiredStatus;
        let remoteId = current?.id;

        if (needsMetadataSync) {
          remoteId = await saveConfirmationEdition({
            ...(current ? { id: current.id } : {}),
            name: edition.name,
            edition_number: edition.edition_number,
            description: desiredDescription,
            status: desiredStatus,
            editing_enabled: editingEnabled,
          });
          changed += 1;
        }

        if (!remoteId) continue;
        await solaris.from("integration_links").delete().eq("service", "confirmations").eq("entity_type", "edition").eq("solaris_id", edition.id).neq("remote_id", remoteId);
        await solaris.from("integration_links").delete().eq("service", "confirmations").eq("entity_type", "edition").eq("remote_id", remoteId).neq("solaris_id", edition.id);
        const { error: linkError } = await solaris.from("integration_links").upsert({
          service: "confirmations",
          entity_type: "edition",
          solaris_id: edition.id,
          remote_id: remoteId,
          edition_id: edition.id,
          sync_status: "linked",
          metadata: { edition_number: edition.edition_number },
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "service,entity_type,remote_id" });
        if (linkError) throw linkError;
      }

      await refresh();
      if (showToast) toast.success(changed ? `Synchronized ${changed} edition projection${changed === 1 ? "" : "s"}` : "Delegation editions already match Solaris");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not synchronize editions.";
      setError(message);
      if (showToast) toast.error(message);
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const admin = await requireConfirmationsAdmin();
        if (!admin) {
          await navigate({ to: "/auth", search: { redirect: "/confirmations/admin/editions" } });
          return;
        }
        if (!alive) return;
        await synchronize(false);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Could not load editions.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [navigate, synchronize]);

  const remoteByNumber = useMemo(() => new Map(remoteEditions.map((edition) => [edition.edition_number, edition])), [remoteEditions]);
  const orphanCount = useMemo(() => {
    const canonicalNumbers = new Set(canonicalEditions.map((edition) => edition.edition_number));
    return remoteEditions.filter((edition) => !canonicalNumbers.has(edition.edition_number)).length;
  }, [canonicalEditions, remoteEditions]);

  async function setEditing(edition: CanonicalEdition, enabled: boolean) {
    const remote = remoteByNumber.get(edition.edition_number);
    if (!remote) return;
    try {
      await setConfirmationEditionEditing(remote.id, enabled);
      await refresh();
      toast.success(enabled ? "Response editing opened" : "Response editing closed");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Editing status could not be changed");
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Delegations"
        title="Edition links"
        description="Keep delegation rounds connected to the correct Solaris edition and control whether submitted responses can still be edited."
        actions={
          <AdminMoreMenu label="Edition actions" title="Edition actions" description="Occasional delegation-edition controls.">
            <AdminActionItem icon={RefreshCw} title={syncing ? "Synchronizing…" : "Sync edition links"} description="Refresh delegation edition links from Solaris." disabled={syncing} onClick={() => void synchronize(true)} />
          </AdminMoreMenu>
        }
      />

      {error ? <AdminCard><p className="text-sm text-rose-200">{error}</p></AdminCard> : null}
      {orphanCount ? <AdminCard><AdminCardHeader eyebrow="Unlinked data" title={`${orphanCount} unlinked delegation edition${orphanCount === 1 ? "" : "s"}`} description="These older records remain stored but are hidden because they are not connected to a Solaris edition." /></AdminCard> : null}

      {loading ? (
        <AdminCard><p className="py-6 text-center text-sm text-muted-foreground">Synchronizing edition links…</p></AdminCard>
      ) : (
        <div className="space-y-3">
          {canonicalEditions.map((edition) => {
            const remote = remoteByNumber.get(edition.edition_number);
            const projectedStatus = confirmationStatus(edition.status);
            return (
              <AdminCard key={edition.id} className="!p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-foreground">SSC {edition.edition_number}</h2>
                      <AdminStatus tone={projectedStatus === "active" ? "ready" : "neutral"}>{projectedStatus}</AdminStatus>
                      <AdminStatus tone={remote ? "info" : "attention"}>{remote ? "Linked" : "Needs link"}</AdminStatus>
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground">{edition.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{remote ? `${remote.rounds.length} rounds · ${remote.response_count} responses` : "Delegation edition link will be created on synchronization."}</p>
                  </div>
                  <SlidersHorizontal className="mt-1 size-4 shrink-0 text-muted-foreground" />
                </div>

                {remote ? (
                  <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Existing-response editing</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Controls whether delegations can continue correcting an already submitted response. It does not change the Solaris edition itself.</p>
                      </div>
                      <AdminStatus tone={remote.editing_enabled ? "ready" : "neutral"}>{remote.editing_enabled ? "Open" : "Closed"}</AdminStatus>
                    </div>
                    <button type="button" className="admin-action-secondary mt-3 w-full" onClick={() => void setEditing(edition, !remote.editing_enabled)}>
                      {remote.editing_enabled ? "Close response editing" : "Open response editing"}
                    </button>
                  </div>
                ) : null}
              </AdminCard>
            );
          })}
          {!canonicalEditions.length ? <AdminCard><p className="py-6 text-center text-sm text-muted-foreground">No numbered Solaris editions exist yet.</p></AdminCard> : null}
        </div>
      )}
    </AdminPage>
  );
}