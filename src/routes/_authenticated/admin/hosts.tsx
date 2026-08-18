import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, MapPin, Pencil, RadioTower } from "lucide-react";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { useAdminContext } from "@/components/admin/AdminContext";
import { supabase } from "@/integrations/supabase/client";
import { reportSupabaseError } from "@/lib/errors";
import { editionLabel, useAllShows, useCountries, useEditions, type Show } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/admin/hosts")({
  head: () => ({ meta: [{ title: "Hosting — Solaris Organizer" }, { name: "robots", content: "noindex" }] }),
  component: HostSettingsPage,
});

type HostedShow = Show & { host_country_id?: string | null; host_city?: string | null };
type Draft = { countryId: string; city: string };

const emptyDraft: Draft = { countryId: "", city: "" };

function HostSettingsPage() {
  const qc = useQueryClient();
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const { data: shows = [] } = useAllShows();
  const { data: countries = [] } = useCountries();

  const [editTarget, setEditTarget] = useState<HostedShow | null>(null);
  const [copyTarget, setCopyTarget] = useState<HostedShow | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedEdition = useMemo(() => {
    const list = [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1));
    return list.find((edition) => edition.id === editionId) ?? list[0] ?? null;
  }, [editions, editionId]);

  const editionShows = useMemo(
    () => (shows as HostedShow[]).filter((show) => show.edition_id === selectedEdition?.id).sort((a, b) => a.sort_order - b.sort_order),
    [shows, selectedEdition?.id],
  );

  useEffect(() => {
    setEditTarget(null);
    setCopyTarget(null);
    setDraft(emptyDraft);
    setMessage(null);
    setError(null);
  }, [selectedEdition?.id]);

  function resolvedHost(show: HostedShow): Draft {
    return {
      countryId: show.host_country_id ?? selectedEdition?.host_country_id ?? "",
      city: show.host_city ?? selectedEdition?.host_city ?? "",
    };
  }

  function openEdit(show: HostedShow) {
    setEditTarget(show);
    setDraft(resolvedHost(show));
    setError(null);
  }

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["shows"] }),
      qc.invalidateQueries({ queryKey: ["show"] }),
    ]);
  }

  async function saveShow() {
    if (!editTarget) return;
    setSavingId(editTarget.id);
    setError(null);
    setMessage(null);
    try {
      const { error: saveError } = await (supabase.from("shows") as any).update({
        host_country_id: draft.countryId || null,
        host_city: draft.city.trim() || null,
      }).eq("id", editTarget.id);
      if (saveError) {
        setError(reportSupabaseError(saveError, "Could not save this host location."));
        return;
      }
      setMessage(`${editTarget.name} host updated.`);
      setEditTarget(null);
      await refresh();
    } finally {
      setSavingId(null);
    }
  }

  function requestCopyToAll() {
    if (!editTarget || !selectedEdition) return;
    setCopyTarget(editTarget);
  }

  async function copyToAll() {
    if (!selectedEdition || !copyTarget || !editionShows.length) return;
    setSavingId("all");
    setError(null);
    setMessage(null);
    try {
      const { error: saveError } = await (supabase.from("shows") as any).update({
        host_country_id: draft.countryId || null,
        host_city: draft.city.trim() || null,
      }).eq("edition_id", selectedEdition.id);
      if (saveError) {
        setError(reportSupabaseError(saveError, "Could not update all show hosts."));
        return;
      }
      setMessage(`Every show in ${editionLabel(selectedEdition)} now uses the same host.`);
      setCopyTarget(null);
      setEditTarget(null);
      await refresh();
    } finally {
      setSavingId(null);
    }
  }

  const configured = editionShows.filter((show) => {
    const host = resolvedHost(show);
    return Boolean(host.countryId || host.city.trim());
  }).length;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Contest management"
        title="Hosting"
        description={selectedEdition ? `Assign show-level hosts for ${editionLabel(selectedEdition)}. Split-host editions can use a different country or city for each show.` : "Choose an edition before assigning show hosts."}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {selectedEdition ? <Link to="/admin/$slug" params={{ slug: selectedEdition.slug }} className="admin-action-quiet"><ArrowLeft className="size-4" /> Edition home</Link> : null}
        {selectedEdition ? <Link to="/admin/design/$slug" params={{ slug: selectedEdition.slug }} className="admin-action-quiet"><RadioTower className="size-4" /> Design & broadcast</Link> : null}
      </div>

      {error ? <div className="mb-4 rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-3 text-sm text-rose-100">{error}</div> : null}
      {!error && message ? <div className="mb-4 rounded-xl border border-emerald-200/15 bg-emerald-200/[0.05] p-3 text-sm text-emerald-100">{message}</div> : null}

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Metric label="Shows" value={editionShows.length} />
        <Metric label="Configured" value={configured} />
        <Metric label="TBC" value={Math.max(0, editionShows.length - configured)} />
      </div>

      {!selectedEdition ? (
        <AdminCard><AdminEmptyState icon={MapPin} title="No edition selected" description="Choose an edition from the organizer header first." action={<Link to="/admin" className="admin-action-primary">Manage editions</Link>} /></AdminCard>
      ) : !editionShows.length ? (
        <AdminCard><AdminEmptyState icon={MapPin} title="No shows yet" description={`Create the shows for ${editionLabel(selectedEdition)} before assigning their host locations.`} action={<Link to="/admin/shows/$slug" params={{ slug: selectedEdition.slug }} className="admin-action-primary">Create shows</Link>} /></AdminCard>
      ) : (
        <div className="space-y-3">
          {editionShows.map((show) => {
            const host = resolvedHost(show);
            const country = countries.find((item) => item.id === host.countryId);
            const configuredShow = Boolean(host.countryId || host.city.trim());
            return (
              <AdminCard key={show.id} className="!p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100"><MapPin className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-bold text-foreground">{show.name}</h2>
                      <AdminStatus tone={configuredShow ? "ready" : "attention"}>{configuredShow ? "Set" : "TBC"}</AdminStatus>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{show.kind.replaceAll("-", " ")} · show {show.sort_order}</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{country?.name || "Host country TBC"}{host.city ? ` · ${host.city}` : " · City TBC"}</p>
                  </div>
                  <button type="button" onClick={() => openEdit(show)} className="admin-action-secondary !min-h-10 !px-3" aria-label={`Edit host for ${show.name}`}><Pencil className="size-4" /></button>
                </div>
              </AdminCard>
            );
          })}
        </div>
      )}

      <AdminSheet
        open={!!editTarget}
        onClose={() => !savingId && setEditTarget(null)}
        title={editTarget ? `${editTarget.name} host` : "Edit host"}
        description="Show-level host details override the edition default for this stage."
      >
        <div className="space-y-4">
          <label className="block">
            <span className="admin-section-label">Host country</span>
            <select value={draft.countryId} onChange={(event) => setDraft((current) => ({ ...current, countryId: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30">
              <option value="">Host country TBC</option>
              {[...countries].sort((a, b) => a.name.localeCompare(b.name)).map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="admin-section-label">Host city</span>
            <input value={draft.city} placeholder="Host city" onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30" />
          </label>

          <button type="button" disabled={savingId != null} onClick={requestCopyToAll} className="admin-action-secondary w-full"><Copy className="size-4" /> Use for every show</button>

          <div className="admin-sticky-actions grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <button type="button" disabled={savingId != null} onClick={() => setEditTarget(null)} className="admin-action-secondary">Cancel</button>
            <button type="button" disabled={savingId != null} onClick={() => void saveShow()} className="admin-action-primary w-full">{savingId === editTarget?.id ? "Saving…" : "Save host"}</button>
          </div>
        </div>
      </AdminSheet>

      <AdminConfirmSheet
        open={!!copyTarget}
        onClose={() => savingId !== "all" && setCopyTarget(null)}
        onConfirm={copyToAll}
        title={`Use this host for every ${selectedEdition ? editionLabel(selectedEdition) : "edition"} show?`}
        description={<>This will replace the show-level host country and city on all {editionShows.length} configured show{editionShows.length === 1 ? "" : "s"}. It does not change entries, results or voting data.</>}
        confirmLabel="Use for every show"
        confirmationText={selectedEdition ? editionLabel(selectedEdition) : undefined}
        confirmationHint={selectedEdition ? `Type ${editionLabel(selectedEdition)} to confirm` : undefined}
        busy={savingId === "all"}
      />
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}
