import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Globe, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import {
  deleteMergedCustomRoundEntry,
  getMergedRoundEntries,
  reorderMergedRoundEntries,
  saveMergedCustomRoundEntry,
  saveMergedRoundCountries,
  setMergedRoundSelfVotingMode,
  type MergedRoundEntry,
} from "@/integrations/televoting/entries.functions";

export const Route = createFileRoute("/televoting/admin/rounds/$id/entries")({
  head: () => ({ meta: [{ title: "Round Entries — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: RoundEntriesPage,
});

type CustomForm = {
  id?: string;
  customName: string;
  shortName: string;
  entryCode: string;
  subtitle: string;
  imageUrl: string;
  description: string;
};

const emptyCustom: CustomForm = {
  customName: "",
  shortName: "",
  entryCode: "",
  subtitle: "",
  imageUrl: "",
  description: "",
};

function displayName(entry: MergedRoundEntry) {
  return entry.entry_type === "country"
    ? entry.country?.name || entry.country_code || entry.entry_key
    : entry.custom_name || entry.entry_key;
}

function RoundEntriesPage() {
  const { id: roundId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const getEntries = useServerFn(getMergedRoundEntries);
  const saveCountries = useServerFn(saveMergedRoundCountries);
  const saveCustom = useServerFn(saveMergedCustomRoundEntry);
  const deleteCustom = useServerFn(deleteMergedCustomRoundEntry);
  const reorder = useServerFn(reorderMergedRoundEntries);
  const setSelfVoting = useServerFn(setMergedRoundSelfVotingMode);

  const [countrySearch, setCountrySearch] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [customForm, setCustomForm] = useState<CustomForm>(emptyCustom);

  const { data: admin, isLoading: adminLoading } = useQuery({
    queryKey: ["merged-televoting-admin"],
    queryFn: () => getAdmin(),
  });

  useEffect(() => {
    if (!adminLoading && !admin) void navigate({ to: "/televoting/admin/sign-in" });
  }, [admin, adminLoading, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["merged-televoting-round-entries", roundId],
    queryFn: () => getEntries({ data: { roundId } }),
    enabled: Boolean(admin),
  });

  useEffect(() => {
    if (!data) return;
    setSelectedCountries(data.entries.filter((entry) => entry.entry_type === "country").map((entry) => entry.country_code!).filter(Boolean));
  }, [data]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-round-entries", roundId] }),
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-rounds"] }),
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-open-round"] }),
    ]);
  };

  const saveCountriesMutation = useMutation({
    mutationFn: () => saveCountries({ data: { roundId, countryCodes: selectedCountries } }),
    onSuccess: async () => { toast.success("Country entries saved"); await refresh(); },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Countries could not be saved"),
  });

  const saveCustomMutation = useMutation({
    mutationFn: () => saveCustom({
      data: {
        roundId,
        ...(customForm.id ? { id: customForm.id } : {}),
        customName: customForm.customName,
        shortName: customForm.shortName,
        entryCode: customForm.entryCode,
        subtitle: customForm.subtitle,
        imageUrl: customForm.imageUrl,
        description: customForm.description,
      },
    }),
    onSuccess: async () => { toast.success(customForm.id ? "Custom entry updated" : "Custom entry added"); setCustomForm(emptyCustom); await refresh(); },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Custom entry could not be saved"),
  });

  const filteredCountries = useMemo(() => {
    const term = countrySearch.trim().toLowerCase();
    if (!term) return data?.countries ?? [];
    return (data?.countries ?? []).filter((country) => `${country.name} ${country.code}`.toLowerCase().includes(term));
  }, [countrySearch, data?.countries]);

  const editable = data?.round.status !== "open";
  const entries = data?.entries ?? [];

  async function move(entry: MergedRoundEntry, direction: -1 | 1) {
    const index = entries.findIndex((item) => item.id === entry.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= entries.length) return;
    const ids = entries.map((item) => item.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    try {
      await reorder({ data: { roundId, entryIds: ids } });
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Entries could not be reordered");
    }
  }

  return (
    <div className="mx-auto max-w-6xl py-4 sm:py-8">
      <div className="mb-5"><Link to="/televoting/admin/rounds" className="text-xs text-muted-foreground hover:text-foreground">← Televoting rounds</Link></div>

      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.22em] text-sky-100/65">Participant editor</p>
        <h1 className="font-display mt-2 text-5xl uppercase leading-none sm:text-6xl">{data?.round.name ?? "Round entries"}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Manage country entries, custom entries and ordering. Stable entry keys remain untouched so historical ballots and results stay valid.</p>
      </header>

      {adminLoading || isLoading ? (
        <section className="glass-strong p-8 text-center text-sm text-muted-foreground">Loading entries…</section>
      ) : error || !data ? (
        <section className="glass-strong border-destructive/30 p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Round could not be loaded."}</section>
      ) : (
        <div className="space-y-5">
          {!editable ? <div className="rounded-xl border border-amber-300/20 bg-amber-300/8 p-4 text-sm text-amber-100/85">This round is open. Close it before changing participants or ordering.</div> : null}

          <section className="glass-strong p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-lg font-medium">Voting identity rules</h2><p className="mt-1 text-sm text-muted-foreground">Participant mode is derived from the actual line-up. Self-voting rules can be changed while the round is not open.</p></div>
              <select value={data.round.self_voting_mode ?? "country_match"} disabled={!editable} onChange={async (event) => {
                try {
                  await setSelfVoting({ data: { roundId, mode: event.target.value as "country_match" | "linked_identity" | "disabled" | "unrestricted" } });
                  toast.success("Self-voting mode updated");
                  await refresh();
                } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Mode could not be updated"); }
              }} className="h-10 rounded-xl border border-white/12 bg-black/20 px-3 text-sm">
                <option value="country_match">Country match</option>
                <option value="linked_identity">Linked identity</option>
                <option value="disabled">Disabled</option>
                <option value="unrestricted">Unrestricted</option>
              </select>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Current participant mode: <span className="text-foreground">{data.round.participant_mode}</span></p>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="glass-strong p-5">
              <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl border border-sky-200/15 bg-sky-200/10 text-sky-100"><Globe className="size-4" /></div><div><h2 className="font-medium">Country entries</h2><p className="text-xs text-muted-foreground">Select 2–50 countries. Existing custom entries are preserved.</p></div></div>
              <div className="relative mt-4"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={countrySearch} onChange={(event) => setCountrySearch(event.target.value)} placeholder="Search countries…" className="pl-9" /></div>
              <div className="mt-3 max-h-80 space-y-1 overflow-y-auto pr-1">
                {filteredCountries.map((country) => {
                  const checked = selectedCountries.includes(country.code);
                  return <label key={country.code} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 px-3 py-2.5 text-sm"><span className="flex min-w-0 items-center gap-2"><span>{country.flag || "✦"}</span><span className="truncate">{country.name}</span><span className="text-[10px] text-muted-foreground">{country.code}</span></span><input type="checkbox" disabled={!editable} checked={checked} onChange={(event) => setSelectedCountries((current) => event.target.checked ? [...current, country.code] : current.filter((code) => code !== country.code))} /></label>;
                })}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{selectedCountries.length} selected</span><Button disabled={!editable || selectedCountries.length < 2 || saveCountriesMutation.isPending} onClick={() => saveCountriesMutation.mutate()}>Save country entries</Button></div>
            </section>

            <section className="glass-strong p-5">
              <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl border border-sky-200/15 bg-sky-200/10 text-sky-100"><Plus className="size-4" /></div><div><h2 className="font-medium">{customForm.id ? "Edit custom entry" : "Custom entry"}</h2><p className="text-xs text-muted-foreground">Add non-country participants without changing historical country keys.</p></div></div>
              <div className="mt-4 space-y-3">
                <div className="space-y-1.5"><Label>Display name</Label><Input disabled={!editable} value={customForm.customName} onChange={(event) => setCustomForm({ ...customForm, customName: event.target.value })} placeholder="Artist / entry name" /></div>
                <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Short name</Label><Input disabled={!editable} value={customForm.shortName} onChange={(event) => setCustomForm({ ...customForm, shortName: event.target.value })} /></div><div className="space-y-1.5"><Label>Entry code</Label><Input disabled={!editable} value={customForm.entryCode} onChange={(event) => setCustomForm({ ...customForm, entryCode: event.target.value })} /></div></div>
                <div className="space-y-1.5"><Label>Subtitle</Label><Input disabled={!editable} value={customForm.subtitle} onChange={(event) => setCustomForm({ ...customForm, subtitle: event.target.value })} /></div>
                <div className="space-y-1.5"><Label>Image URL</Label><Input disabled={!editable} value={customForm.imageUrl} onChange={(event) => setCustomForm({ ...customForm, imageUrl: event.target.value })} placeholder="https://…" /></div>
                <div className="space-y-1.5"><Label>Description</Label><textarea disabled={!editable} value={customForm.description} onChange={(event) => setCustomForm({ ...customForm, description: event.target.value })} className="min-h-24 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2 text-sm" /></div>
                <div className="flex gap-2"><Button disabled={!editable || !customForm.customName.trim() || saveCustomMutation.isPending} onClick={() => saveCustomMutation.mutate()}>{customForm.id ? "Save custom entry" : "Add custom entry"}</Button>{customForm.id ? <Button variant="ghost" onClick={() => setCustomForm(emptyCustom)}>Cancel</Button> : null}</div>
              </div>
            </section>
          </div>

          <section className="glass-strong p-5">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-medium">Running order</h2><p className="mt-1 text-sm text-muted-foreground">{entries.length} entries. Reordering is disabled while voting is open.</p></div></div>
            <div className="mt-4 space-y-2">
              {entries.map((entry, index) => (
                <article key={entry.id} className="grid gap-3 rounded-xl border border-white/8 bg-black/10 p-3 sm:grid-cols-[34px_1fr_auto] sm:items-center">
                  <span className="text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                  <div className="flex min-w-0 items-center gap-3"><div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">{entry.entry_type === "country" ? <span>{entry.country?.flag || "✦"}</span> : entry.image_url ? <img src={entry.image_url} alt="" className="h-full w-full object-cover" /> : <span>✦</span>}</div><div className="min-w-0"><p className="truncate font-medium">{displayName(entry)}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{entry.entry_type} · {entry.entry_code || entry.country_code || entry.entry_key}{entry.subtitle ? ` · ${entry.subtitle}` : ""}</p></div></div>
                  <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" disabled={!editable || index === 0} onClick={() => void move(entry, -1)}><ArrowUp className="size-3.5" /></Button><Button size="sm" variant="ghost" disabled={!editable || index === entries.length - 1} onClick={() => void move(entry, 1)}><ArrowDown className="size-3.5" /></Button>{entry.entry_type === "custom" ? <><Button size="sm" variant="ghost" disabled={!editable} onClick={() => setCustomForm({ id: entry.id, customName: entry.custom_name ?? "", shortName: entry.short_name ?? "", entryCode: entry.entry_code ?? "", subtitle: entry.subtitle ?? "", imageUrl: entry.image_url ?? "", description: entry.description ?? "" })}><Pencil className="size-3.5" /></Button><Button size="sm" variant="ghost" disabled={!editable} onClick={async () => { if (!confirm(`Delete ${displayName(entry)}?`)) return; try { await deleteCustom({ data: { roundId, entryId: entry.id } }); toast.success("Custom entry deleted"); await refresh(); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Entry could not be deleted"); } }}><Trash2 className="size-3.5" /></Button></> : null}</div>
                </article>
              ))}
              {!entries.length ? <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">No participant entries configured yet.</div> : null}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
