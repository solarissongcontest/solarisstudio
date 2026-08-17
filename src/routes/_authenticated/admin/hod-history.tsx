import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Lightbulb, Plus, Trash2, UserRoundCog } from "lucide-react";
import { toast } from "sonner";

import {
  deleteHodAssignment,
  getHodHistory,
  getHodIdentitySuggestions,
  saveHodAssignments,
  saveHodPerson,
} from "@/integrations/unified/hod-history.functions";
import type { HodChannel } from "@/integrations/unified/hod-history.server";

export const Route = createFileRoute("/_authenticated/admin/hod-history")({
  head: () => ({
    meta: [
      { title: "HOD History — Solaris Operations" },
      { name: "description", content: "Manage historical Head-of-Delegation identity and edition tenures." },
    ],
  }),
  component: HodHistoryPage,
});

type CountryOption = { id: string; code: string; name: string; flagImage: string | null };
type EditionOption = { id: string; editionNumber: number | null; name: string; status: string };
type Suggestion = {
  editionId: string;
  editionNumber: number | null;
  editionName: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  suggestedDisplayName: string;
  normalizedUsername: string;
  dominantBallots: number;
  totalBallots: number;
  confidence: number;
  ambiguous: boolean;
  evidenceRounds: number;
};

const controlClass = "min-h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-violet-200/30";

function HodHistoryPage() {
  const queryClient = useQueryClient();
  const getHistory = useServerFn(getHodHistory);
  const getSuggestions = useServerFn(getHodIdentitySuggestions);
  const savePersonFn = useServerFn(saveHodPerson);
  const saveAssignmentsFn = useServerFn(saveHodAssignments);
  const deleteAssignmentFn = useServerFn(deleteHodAssignment);

  const { data, isLoading, error } = useQuery({ queryKey: ["hod-history"], queryFn: () => getHistory() });
  const { data: suggestions = [], isLoading: suggestionsLoading } = useQuery({
    queryKey: ["hod-identity-suggestions"],
    queryFn: () => getSuggestions(),
  });

  const [personName, setPersonName] = useState("");
  const [countryId, setCountryId] = useState("");
  const [personId, setPersonId] = useState("");
  const [fromEditionId, setFromEditionId] = useState("");
  const [toEditionId, setToEditionId] = useState("");
  const [channel, setChannel] = useState<HodChannel>("delegation");
  const [notes, setNotes] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterPerson, setFilterPerson] = useState("");

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hod-history"] }),
      queryClient.invalidateQueries({ queryKey: ["hod-identity-suggestions"] }),
    ]);
  };

  const createPerson = useMutation({
    mutationFn: () => savePersonFn({ data: { displayName: personName } }),
    onSuccess: async (result) => {
      setPersonName("");
      setPersonId(result.id);
      await invalidate();
      toast.success("HOD identity created");
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Could not create HOD"),
  });

  const editionsAscending = useMemo(
    () => ([...(data?.editions ?? [])] as EditionOption[]).sort((a, b) => (a.editionNumber ?? 0) - (b.editionNumber ?? 0)),
    [data?.editions],
  );

  const selectedEditionIds = useMemo(() => {
    if (!fromEditionId) return [];
    const start = editionsAscending.findIndex((edition) => edition.id === fromEditionId);
    const end = toEditionId ? editionsAscending.findIndex((edition) => edition.id === toEditionId) : start;
    if (start < 0 || end < 0) return [];
    return editionsAscending.slice(Math.min(start, end), Math.max(start, end) + 1).map((edition) => edition.id);
  }, [editionsAscending, fromEditionId, toEditionId]);

  const saveTenure = useMutation({
    mutationFn: () => saveAssignmentsFn({
      data: { personId, countryId, editionIds: selectedEditionIds, channel, source: "manual", confidence: 100, notes: notes || null },
    }),
    onSuccess: async (result) => {
      setNotes("");
      await invalidate();
      toast.success(`Saved ${result.updated} HOD assignment${result.updated === 1 ? "" : "s"}`);
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Could not save HOD tenure"),
  });

  const removeAssignment = useMutation({
    mutationFn: (id: string) => deleteAssignmentFn({ data: { id } }),
    onSuccess: async () => {
      await invalidate();
      toast.success("HOD assignment removed");
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Could not remove assignment"),
  });

  const filteredAssignments = useMemo(
    () => (data?.assignments ?? []).filter((assignment) =>
      (!filterCountry || assignment.countryId === filterCountry) && (!filterPerson || assignment.personId === filterPerson)),
    [data?.assignments, filterCountry, filterPerson],
  );

  function prefillSuggestion(suggestion: Suggestion) {
    setPersonName(suggestion.suggestedDisplayName);
    setCountryId(suggestion.countryId);
    setFromEditionId(suggestion.editionId);
    setToEditionId(suggestion.editionId);
    setChannel("delegation");
    setNotes(`Televoting username evidence: ${suggestion.normalizedUsername} (${suggestion.confidence}% consistency). Verify identity before saving.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.message("Suggestion prefilled. Verify the person, create/reuse the HOD identity, then save the tenure.");
  }

  return (
    <div className="mx-auto max-w-[1350px] space-y-5">
      <header className="glass-strong p-5 sm:p-7">
        <Link to="/admin/operations" className="text-xs text-muted-foreground hover:text-foreground">← Solaris Operations</Link>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-violet-200/15 bg-violet-200/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-100/75"><UserRoundCog className="h-3.5 w-3.5" /> Identity history</div>
        <h1 className="font-display mt-3 text-5xl uppercase leading-none sm:text-6xl">HOD History</h1>
        <p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">A country remains the official delegation identity, but behaviour analytics follows the person who actually controlled it in each edition. The delegation assignment controls both jury and televote by default; add a channel override only when an edition genuinely used a different controller.</p>
      </header>

      {isLoading ? <section className="glass-strong p-8 text-center text-sm text-muted-foreground">Loading delegation history…</section> : null}
      {error ? <section className="glass-strong border-destructive/30 p-5 text-sm text-destructive">{error instanceof Error ? error.message : "HOD history could not be loaded."}</section> : null}

      {data ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[.8fr_1.4fr]">
            <article className="glass-strong p-5">
              <h2 className="font-display text-3xl uppercase">People</h2>
              <p className="mt-1 text-xs text-muted-foreground">Create one identity per real HOD. Reuse it across every edition they controlled.</p>
              <div className="mt-4 flex gap-2">
                <input value={personName} onChange={(event) => setPersonName(event.target.value)} placeholder="HOD display name" className={controlClass} />
                <button type="button" disabled={!personName.trim() || createPerson.isPending} onClick={() => createPerson.mutate()} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-violet-200/15 bg-violet-200/10 px-4 text-xs font-semibold disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Add</button>
              </div>
              <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {data.people.map((person) => {
                  const count = data.assignments.filter((assignment) => assignment.personId === person.id).length;
                  return <button key={person.id} type="button" onClick={() => setPersonId(person.id)} className={`w-full rounded-xl border p-3 text-left transition ${personId === person.id ? "border-violet-200/25 bg-violet-200/10" : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"}`}><p className="text-sm font-medium">{person.displayName}</p><p className="mt-1 text-[11px] text-muted-foreground">{person.identityKey} · {count} assignment{count === 1 ? "" : "s"}</p></button>;
                })}
                {!data.people.length ? <p className="py-6 text-center text-xs text-muted-foreground">No historical HOD identities yet.</p> : null}
              </div>
            </article>

            <article className="glass-strong p-5">
              <h2 className="font-display text-3xl uppercase">Assign tenure</h2>
              <p className="mt-1 text-xs text-muted-foreground">A range writes one assignment per edition, so later corrections can split a tenure precisely.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="HOD"><select value={personId} onChange={(e) => setPersonId(e.target.value)} className={controlClass}><option value="">Choose HOD</option>{data.people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></Field>
                <Field label="Country"><select value={countryId} onChange={(e) => setCountryId(e.target.value)} className={controlClass}><option value="">Choose country</option>{(data.countries as CountryOption[]).map((country: CountryOption) => <option key={country.id} value={country.id}>{country.name} ({country.code})</option>)}</select></Field>
                <Field label="From edition"><select value={fromEditionId} onChange={(e) => { setFromEditionId(e.target.value); if (!toEditionId) setToEditionId(e.target.value); }} className={controlClass}><option value="">Choose edition</option>{editionsAscending.map((edition) => <option key={edition.id} value={edition.id}>SSC{edition.editionNumber ?? "?"} · {edition.name}</option>)}</select></Field>
                <Field label="Through edition"><select value={toEditionId} onChange={(e) => setToEditionId(e.target.value)} className={controlClass}><option value="">Same edition</option>{editionsAscending.map((edition) => <option key={edition.id} value={edition.id}>SSC{edition.editionNumber ?? "?"} · {edition.name}</option>)}</select></Field>
                <Field label="Controls"><select value={channel} onChange={(e) => setChannel(e.target.value as HodChannel)} className={controlClass}><option value="delegation">Delegation default (jury + televote)</option><option value="jury">Jury override only</option><option value="televote">Televote override only</option></select></Field>
                <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional historical note" className={controlClass} /></Field>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 p-3"><p className="text-xs text-muted-foreground">This will assign {selectedEditionIds.length} edition{selectedEditionIds.length === 1 ? "" : "s"}. Existing assignment for the same country/edition/channel is replaced.</p><button type="button" disabled={!personId || !countryId || !selectedEditionIds.length || saveTenure.isPending} onClick={() => saveTenure.mutate()} className="rounded-xl border border-violet-200/15 bg-violet-200/10 px-4 py-2 text-xs font-semibold disabled:opacity-50">Save tenure</button></div>
            </article>
          </section>

          <section className="glass-strong overflow-hidden">
            <div className="border-b border-white/10 p-5"><div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-100/75" /><h2 className="font-display text-3xl uppercase">Identity suggestions</h2></div><p className="mt-2 max-w-4xl text-xs leading-relaxed text-muted-foreground">These are clues from usernames submitted with Televoting ballots, not confirmed identities. Using one only prefills the form above. Nothing becomes historical fact until you verify the person and save it yourself.</p></div>
            {suggestionsLoading ? <p className="p-6 text-center text-xs text-muted-foreground">Checking Televoting identity evidence…</p> : (
              <div className="divide-y divide-white/8">{(suggestions as Suggestion[]).slice(0, 80).map((suggestion: Suggestion) => <div key={`${suggestion.editionId}:${suggestion.countryId}`} className="grid gap-3 p-4 lg:grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)_130px_120px] lg:items-center"><div><p className="text-xs font-semibold">SSC{suggestion.editionNumber ?? "?"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{suggestion.evidenceRounds} round{suggestion.evidenceRounds === 1 ? "" : "s"}</p></div><div><p className="text-sm font-medium">{suggestion.countryName}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{suggestion.countryCode}</p></div><div><p className="text-sm font-medium">{suggestion.suggestedDisplayName}</p><p className="mt-0.5 text-[10px] text-muted-foreground">username evidence · {suggestion.dominantBallots}/{suggestion.totalBallots} ballots</p></div><div><span className={`rounded-full border px-2.5 py-1 text-[10px] ${suggestion.ambiguous ? "border-amber-200/20 bg-amber-200/[0.07] text-amber-100" : "border-emerald-200/20 bg-emerald-200/[0.07] text-emerald-100"}`}>{suggestion.confidence}% consistent</span></div><button type="button" onClick={() => prefillSuggestion(suggestion)} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold hover:bg-white/[0.07]">Prefill form</button></div>)}</div>
            )}
            {!suggestionsLoading && !suggestions.length ? <p className="p-7 text-center text-xs text-muted-foreground">No unassigned HOD suggestions are available from Televoting evidence.</p> : null}
          </section>

          <section className="glass-strong overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-white/10 p-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2"><History className="h-4 w-4 text-violet-100/70" /><h2 className="font-display text-3xl uppercase">Assignment history</h2></div><p className="mt-1 text-xs text-muted-foreground">Channel overrides take precedence over the delegation default only for that edition.</p></div><div className="flex flex-col gap-2 sm:flex-row"><select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} className={`${controlClass} min-w-[180px]`}><option value="">All countries</option>{(data.countries as CountryOption[]).map((country: CountryOption) => <option key={country.id} value={country.id}>{country.name}</option>)}</select><select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)} className={`${controlClass} min-w-[180px]`}><option value="">All HODs</option>{data.people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></div></div>
            <div className="divide-y divide-white/8">{filteredAssignments.map((assignment) => <div key={assignment.id} className="grid gap-3 p-4 sm:grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)_130px_50px] sm:items-center"><div><p className="text-xs font-semibold">SSC{assignment.editionNumber ?? "?"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{assignment.channel}</p></div><div><p className="text-sm font-medium">{assignment.countryName}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{assignment.countryCode}</p></div><div><p className="text-sm font-medium">{assignment.personName}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{assignment.identityKey}</p></div><div className="text-xs text-muted-foreground">{assignment.channel === "delegation" ? "Jury + televote" : `${assignment.channel} override`}</div><button type="button" onClick={() => removeAssignment.mutate(assignment.id)} className="grid size-9 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:text-red-200" aria-label="Remove assignment"><Trash2 className="h-3.5 w-3.5" /></button></div>)}{!filteredAssignments.length ? <p className="p-8 text-center text-sm text-muted-foreground">No HOD assignments match these filters.</p> : null}</div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</span>{children}</label>;
}