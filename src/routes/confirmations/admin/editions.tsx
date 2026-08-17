import "@/confirmations.css";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ConfirmationsAdminNav } from "@/components/confirmations/ConfirmationsAdminNav";
import { Button } from "@/components/ui/button";
import {
  loadConfirmationEditions,
  requireConfirmationsAdmin,
  saveConfirmationEdition,
  setConfirmationEditionEditing,
  type ConfirmationEdition,
} from "@/integrations/confirmations/admin";
import { supabase as solarisSupabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/confirmations/admin/editions")({
  head: () => ({ meta: [{ title: "Confirmation Editions — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
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
        const needsMetadataSync =
          !current ||
          current.name !== edition.name ||
          (current.description ?? "") !== desiredDescription ||
          current.status !== desiredStatus;

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

        await solaris
          .from("integration_links")
          .delete()
          .eq("service", "confirmations")
          .eq("entity_type", "edition")
          .eq("solaris_id", edition.id)
          .neq("remote_id", remoteId);
        await solaris
          .from("integration_links")
          .delete()
          .eq("service", "confirmations")
          .eq("entity_type", "edition")
          .eq("remote_id", remoteId)
          .neq("solaris_id", edition.id);

        const { error: linkError } = await solaris.from("integration_links").upsert(
          {
            service: "confirmations",
            entity_type: "edition",
            solaris_id: edition.id,
            remote_id: remoteId,
            edition_id: edition.id,
            sync_status: "linked",
            metadata: { edition_number: edition.edition_number },
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "service,entity_type,remote_id" },
        );
        if (linkError) throw linkError;
      }

      await refresh();
      if (showToast) toast.success(changed ? `Synchronized ${changed} edition projection${changed === 1 ? "" : "s"}` : "Confirmation editions already match Solaris");
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
          await navigate({ to: "/confirmations/admin/sign-in" });
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
    return () => {
      alive = false;
    };
  }, [navigate, synchronize]);

  const remoteByNumber = useMemo(
    () => new Map(remoteEditions.map((edition) => [edition.edition_number, edition])),
    [remoteEditions],
  );

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
      toast.success(enabled ? "Confirmation editing opened" : "Confirmation editing closed");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Editing status could not be changed");
    }
  }

  return (
    <div className="confirmations-theme min-h-screen">
      <div className="confirmations-backdrop" aria-hidden="true" />
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6"><Link to="/confirmations/admin" className="text-xs text-white/55 hover:text-white">← Organiser overview</Link></div>
        <ConfirmationsAdminNav current="/confirmations/admin/editions" />

        <header className="mb-7">
          <p className="text-[10px] uppercase tracking-[0.22em] text-sky-200/65">Canonical contest structure</p>
          <h1 className="confirmations-display mt-2 text-5xl font-normal uppercase leading-none sm:text-6xl">Editions</h1>
          <p className="mt-3 max-w-3xl text-sm text-white/55">
            Solaris Studio owns edition identity. Confirmations keeps linked local projections for its rounds and responses, but names, numbers and lifecycle status are synchronized from Solaris instead of being authored again here.
          </p>
        </header>

        <section className="confirmations-surface mb-5 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white">Single edition catalog</p>
            <p className="mt-1 text-xs text-white/40">SSC21 means the same canonical Solaris edition here, in Studio and in Televoting. Confirmation-specific response editing remains a local control.</p>
          </div>
          <Button variant="outline" disabled={syncing} onClick={() => void synchronize(true)}>
            <RefreshCw className={cn("size-4", syncing && "animate-spin")} /> {syncing ? "Synchronizing…" : "Sync from Solaris"}
          </Button>
        </section>

        {error ? <div className="mb-4 rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">{error}</div> : null}
        {orphanCount ? <div className="mb-4 rounded-xl border border-amber-300/20 bg-amber-300/8 p-3 text-xs text-amber-100/80">{orphanCount} legacy Confirmations edition {orphanCount === 1 ? "record is" : "records are"} not linked to the Solaris catalog and hidden here. No historical data was deleted.</div> : null}

        {loading ? (
          <div className="confirmations-surface p-8 text-center text-sm text-white/55">Synchronizing editions…</div>
        ) : (
          <section className="space-y-3">
            {canonicalEditions.map((edition) => {
              const remote = remoteByNumber.get(edition.edition_number);
              const projectedStatus = confirmationStatus(edition.status);
              return (
                <article key={edition.id} className="confirmations-surface p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] text-white/50">SSC {edition.edition_number}</span>
                        <span className={cn("rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[0.16em]", projectedStatus === "active" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-white/10 text-white/45")}>{projectedStatus}</span>
                        {remote ? <span className="inline-flex items-center gap-1 rounded-full border border-sky-200/20 bg-sky-200/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] text-sky-100"><CheckCircle2 className="size-3" /> Linked</span> : null}
                      </div>
                      <h2 className="mt-3 text-xl font-medium text-white">{edition.name}</h2>
                      {edition.description ? <p className="mt-1 text-sm text-white/45">{edition.description}</p> : null}
                      <p className="mt-3 text-xs text-white/35">
                        Solaris {edition.id.slice(0, 8)}…
                        {remote ? ` · Confirmations ${remote.id.slice(0, 8)}… · ${remote.rounds.length} rounds · ${remote.response_count} responses` : " · Projection pending"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-sky-200/15 bg-sky-200/[0.06] px-3 py-2 text-xs text-sky-100/75">Metadata managed by Solaris</div>
                  </div>

                  {remote ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 p-3">
                      <div>
                        <p className="text-sm text-white/70">Existing-response editing</p>
                        <p className="mt-0.5 text-xs text-white/35">Confirmation-specific permission. This does not change the canonical Solaris edition.</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant={remote.editing_enabled ? "default" : "outline"} onClick={() => void setEditing(edition, true)}>Open</Button>
                        <Button size="sm" variant={!remote.editing_enabled ? "default" : "outline"} onClick={() => void setEditing(edition, false)}>Closed</Button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
            {!canonicalEditions.length ? <div className="confirmations-surface p-8 text-center text-sm text-white/55">No numbered Solaris editions exist yet.</div> : null}
          </section>
        )}
      </main>
    </div>
  );
}
