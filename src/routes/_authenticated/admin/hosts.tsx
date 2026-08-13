import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useAdminContext } from "@/components/admin/AdminContext";
import { Field, Select, TextInput } from "@/components/studio/Controls";
import { supabase } from "@/integrations/supabase/client";
import { reportSupabaseError } from "@/lib/errors";
import { editionLabel, useAllShows, useCountries, useEditions, type Show } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/admin/hosts")({
  head: () => ({ meta: [{ title: "Host settings — Solaris Studio" }] }),
  component: HostSettingsPage,
});

type HostedShow = Show & { host_country_id?: string | null; host_city?: string | null };
type Draft = { countryId: string; city: string };

function HostSettingsPage() {
  const qc = useQueryClient();
  const { editionId } = useAdminContext();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: countries } = useCountries();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedEdition = useMemo(() => {
    const list = [...(editions ?? [])].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1));
    return list.find((edition) => edition.id === editionId) ?? list[0] ?? null;
  }, [editions, editionId]);

  const editionShows = useMemo(
    () => ((shows ?? []) as HostedShow[]).filter((show) => show.edition_id === selectedEdition?.id).sort((a, b) => a.sort_order - b.sort_order),
    [shows, selectedEdition?.id],
  );

  useEffect(() => {
    setDrafts({});
    setMessage(null);
    setError(null);
  }, [selectedEdition?.id]);

  const draftFor = (show: HostedShow): Draft => drafts[show.id] ?? {
    countryId: show.host_country_id ?? selectedEdition?.host_country_id ?? "",
    city: show.host_city ?? selectedEdition?.host_city ?? "",
  };

  const setDraft = (show: HostedShow, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [show.id]: { ...draftFor(show), ...patch } }));
  };

  const saveShow = async (show: HostedShow) => {
    const draft = draftFor(show);
    setSavingId(show.id);
    setError(null);
    setMessage(null);
    try {
      const { error: saveError } = await (supabase.from("shows") as any).update({
        host_country_id: draft.countryId || null,
        host_city: draft.city.trim() || null,
      }).eq("id", show.id);
      if (saveError) {
        setError(reportSupabaseError(saveError, "Could not save this host location."));
        return;
      }
      setMessage(`${show.name} host updated.`);
      setDrafts((current) => { const next = { ...current }; delete next[show.id]; return next; });
      await qc.invalidateQueries({ queryKey: ["shows"] });
      await qc.invalidateQueries({ queryKey: ["show"] });
    } finally {
      setSavingId(null);
    }
  };

  const copyToAll = async (source: HostedShow) => {
    const draft = draftFor(source);
    if (!selectedEdition || !editionShows.length) return;
    if (!window.confirm(`Use ${draft.city || "this city"} as the host for every show in ${editionLabel(selectedEdition)}?`)) return;
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
      setDrafts({});
      setMessage(`Every show in ${editionLabel(selectedEdition)} now uses the same host.`);
      await qc.invalidateQueries({ queryKey: ["shows"] });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Organizer studio"
        title="Host settings"
        description={selectedEdition ? `Manage show-level hosting for ${editionLabel(selectedEdition)}. Split-host editions can use a different country or city for each show.` : "Assign a host country and city to each show."}
      />

      {error && <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {!error && message && <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{message}</div>}

      <div className="space-y-3">
        {editionShows.map((show) => {
          const draft = draftFor(show);
          const selectedCountry = (countries ?? []).find((country) => country.id === draft.countryId);
          return (
            <Panel key={show.id} title={show.name} description={`${show.kind.replaceAll("-", " ")} · show ${show.sort_order}`}>
              <div className="grid min-w-0 gap-3 md:grid-cols-2">
                <Field label="Host country">
                  <Select value={draft.countryId} onChange={(event) => setDraft(show, { countryId: event.target.value })}>
                    <option value="">Host country TBC</option>
                    {(countries ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((country) => (
                      <option key={country.id} value={country.id}>{country.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Host city">
                  <TextInput value={draft.city} placeholder="Host city" onChange={(event) => setDraft(show, { city: event.target.value })} />
                </Field>
              </div>
              <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 text-xs text-muted-foreground">{selectedCountry?.name || "Country TBC"}{draft.city ? ` · ${draft.city}` : " · City TBC"}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={savingId != null} onClick={() => void saveShow(show)} className="min-h-10 rounded-xl border border-border bg-surface px-3 text-xs font-semibold disabled:opacity-50">{savingId === show.id ? "Saving…" : "Save host"}</button>
                  <button type="button" disabled={savingId != null} onClick={() => void copyToAll(show)} className="min-h-10 rounded-xl border border-border bg-surface px-3 text-xs font-semibold disabled:opacity-50">Use for every show</button>
                </div>
              </div>
            </Panel>
          );
        })}
        {selectedEdition && editionShows.length === 0 && (
          <Panel><p className="text-sm text-muted-foreground">Create the shows for {editionLabel(selectedEdition)} first, then their host locations can be assigned here.</p></Panel>
        )}
      </div>
    </AppShell>
  );
}
