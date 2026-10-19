import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { confirmationEditionsById } from "@/lib/confirmation-edition-identity";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminActionItem,
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
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

type PendingEditingChange = {
  edition: CanonicalEdition;
  remoteId: string;
  previous: boolean;
  next: boolean;
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
  const [syncReviewOpen, setSyncReviewOpen] = useState(false);
  const [pendingEditing, setPendingEditing] = useState<PendingEditingChange | null>(null);
  const [editingBusy, setEditingBusy] = useState(false);
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
      const remoteById = confirmationEditionsById(remote);
      const solaris = solarisSupabase as any;
      let changed = 0;

      for (const edition of canonical) {
        const current = remoteById.get(edition.id);
        const desiredStatus = confirmationStatus(edition.status);
        const desiredDescription = edition.description ?? "";
        const editingEnabled = current?.editing_enabled ?? desiredStatus !== "finished";
        const needsMetadataSync = !current || current.name !== edition.name || (current.description ?? "") !== desiredDescription || current.status !== desiredStatus;
        let remoteId = current?.id;

        if (needsMetadataSync) {
          remoteId = await saveConfirmationEdition({
            id: edition.id,
            name: edition.name,
            edition_number: edition.edition_number,
            description: desiredDescription,
            status: desiredStatus,
            editing_enabled: editingEnabled,
          });
          changed += 1;
        }

        if (!remoteId) continue;
        const { error: deleteError } = await solaris.from("integration_links").delete().eq("service", "confirmations").eq("entity_type", "edition").eq("solaris_id", edition.id).neq("remote_id", remoteId);
        if (deleteError) throw deleteError;
        const { error: reverseDeleteError } = await solaris.from("integration_links").delete().eq("service", "confirmations").eq("entity_type", "edition").eq("remote_id", remoteId).neq("solaris_id", edition.id);
        if (reverseDeleteError) throw reverseDeleteError;
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
      if (showToast) toast.success(changed ? `Updated ${changed} delegation edition${changed === 1 ? "" : "s"}` : "Delegation editions already match Solaris");
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
        await refresh();
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Could not load editions.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [navigate, refresh]);

  const remoteById = useMemo(() => confirmationEditionsById(remoteEditions), [remoteEditions]);
  const orphanCount = useMemo(() => {
    const canonicalIds = new Set(canonicalEditions.map((edition) => edition.id));
    return remoteEditions.filter((edition) => !canonicalIds.has(edition.id)).length;
  }, [canonicalEditions, remoteEditions]);
  const metadataSyncCount = useMemo(() => canonicalEditions.filter((edition) => {
    const current = remoteById.get(edition.id);
    const desiredStatus = confirmationStatus(edition.status);
    return !current || current.name !== edition.name || (current.description ?? "") !== (edition.description ?? "") || current.status !== desiredStatus;
  }).length, [canonicalEditions, remoteById]);

  function reviewEditing(edition: CanonicalEdition, remote: ConfirmationEdition) {
    setPendingEditing({
      edition,
      remoteId: remote.id,
      previous: remote.editing_enabled,
      next: !remote.editing_enabled,
    });
  }

  async function applyEditingChange() {
    if (!pendingEditing || editingBusy) return;
    setEditingBusy(true);
    try {
      const latest = await refresh();
      const liveEdition = latest.canonical.find((edition) => edition.id === pendingEditing.edition.id);
      const liveRemote = confirmationEditionsById(latest.remote).get(pendingEditing.edition.id);
      if (
        !liveEdition ||
        liveEdition.name !== pendingEditing.edition.name ||
        liveEdition.edition_number !== pendingEditing.edition.edition_number ||
        !liveRemote ||
        liveRemote.id !== pendingEditing.remoteId ||
        liveRemote.editing_enabled !== pendingEditing.previous
      ) {
        setPendingEditing(null);
        toast.error("Edition or editing state changed while this review was open. Review the current state before applying again.");
        return;
      }

      await setConfirmationEditionEditing(pendingEditing.remoteId, pendingEditing.next);
      await refresh();
      toast.success(pendingEditing.next ? "Response editing opened" : "Response editing closed");
      setPendingEditing(null);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Editing status could not be changed");
    } finally {
      setEditingBusy(false);
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Delegations"
        title="Edition links"
        description="Keep delegation rounds connected to the correct Solaris edition and control whether submitted responses can still be edited. Opening this page is read-only; legacy synchronization runs only after explicit review."
        actions={
          <AdminMoreMenu label="Edition actions" title="Edition actions" description="Occasional delegation-edition controls.">
            <AdminActionItem icon={RefreshCw} title={syncing ? "Synchronizing…" : "Review edition link sync"} description="Review the legacy synchronization before it changes Confirmation editions or integration links." disabled={syncing || loading} onClick={() => setSyncReviewOpen(true)} />
          </AdminMoreMenu>
        }
      />

      {error ? <AdminCard><p className="text-sm text-rose-200">{error}</p></AdminCard> : null}
      {orphanCount ? <AdminCard><AdminCardHeader eyebrow="Unlinked data" title={`${orphanCount} unlinked delegation edition${orphanCount === 1 ? "" : "s"}`} description="These older records remain stored but are hidden because they are not connected to a Solaris edition." /></AdminCard> : null}

      {loading ? (
        <AdminCard><p className="py-6 text-center text-sm text-muted-foreground">Loading edition links…</p></AdminCard>
      ) : (
        <div className="space-y-3">
          {canonicalEditions.map((edition) => {
            const remote = remoteById.get(edition.id);
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
                    <p className="mt-1 text-xs text-muted-foreground">{remote ? `${remote.rounds.length} rounds · ${remote.response_count} responses` : "Delegation edition link requires an explicit synchronization review."}</p>
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
                    <button type="button" disabled={editingBusy} className="admin-action-secondary mt-3 w-full" onClick={() => reviewEditing(edition, remote)}>
                      {remote.editing_enabled ? "Review closing response editing" : "Review opening response editing"}
                    </button>
                  </div>
                ) : null}
              </AdminCard>
            );
          })}
          {!canonicalEditions.length ? <AdminCard><p className="py-6 text-center text-sm text-muted-foreground">No numbered Solaris editions exist yet.</p></AdminCard> : null}
        </div>
      )}

      <AdminConfirmSheet
        open={syncReviewOpen}
        onClose={syncing ? () => undefined : () => setSyncReviewOpen(false)}
        onConfirm={async () => {
          await synchronize(true);
          setSyncReviewOpen(false);
        }}
        title="Synchronize delegation edition links?"
        description={
          <div className="space-y-2">
            <p>
              This legacy synchronization inspects all <strong className="text-foreground">{canonicalEditions.length}</strong> numbered Solaris editions. At least <strong className="text-foreground">{metadataSyncCount}</strong> currently need Confirmation metadata created or updated.
            </p>
            <p>
              It also repairs the browser-managed Confirmation edition binding rows for every linked edition. That authority is not yet the canonical versioned/idempotent V3 command and remains tracked in System #702.
            </p>
            <p>
              Merely opening this page no longer performs this mutation. Confirm only when you intend to run the legacy reconciliation now.
            </p>
          </div>
        }
        confirmLabel="Run legacy edition-link sync"
        busy={syncing}
      />

      <AdminConfirmSheet
        open={Boolean(pendingEditing)}
        onClose={editingBusy ? () => undefined : () => setPendingEditing(null)}
        onConfirm={applyEditingChange}
        title={pendingEditing ? `${pendingEditing.next ? "Open" : "Close"} existing-response editing for SSC ${pendingEditing.edition.edition_number}?` : "Review response editing"}
        description={pendingEditing ? (
          <div className="space-y-2">
            <p>
              <strong className="text-foreground">SSC {pendingEditing.edition.edition_number} · {pendingEditing.edition.name}</strong>
            </p>
            <p>
              Existing-response editing: <strong className="text-foreground">{pendingEditing.previous ? "Open" : "Closed"}</strong> → <strong className="text-foreground">{pendingEditing.next ? "Open" : "Closed"}</strong>.
            </p>
            <p>
              {pendingEditing.next
                ? "Opening editing widens delegation access to already submitted responses. The current edition and editing state will be re-read before apply."
                : "Closing editing prevents delegations from changing already submitted responses. The current edition and editing state will be re-read before apply."}
            </p>
            <p>
              This still uses the legacy Confirmation editing authority. Canonical expected-version, receipt and idempotency semantics remain System-owned in #702.
            </p>
          </div>
        ) : "Review the current editing state before applying."}
        confirmLabel={pendingEditing?.next ? "Open response editing" : "Close response editing"}
        confirmationText={pendingEditing?.next ? `SSC ${pendingEditing.edition.edition_number}` : undefined}
        confirmationHint={pendingEditing?.next ? `Type SSC ${pendingEditing.edition.edition_number} exactly to confirm wider editing access` : undefined}
        busy={editingBusy}
        danger={Boolean(pendingEditing?.next)}
      />
    </AdminPage>
  );
}
