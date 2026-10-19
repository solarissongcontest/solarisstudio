import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, History, Info, Lightbulb, Plus, Trash2, UserRoundCog } from "lucide-react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  deleteHodAssignment,
  getHodHistory,
  getHodIdentitySuggestions,
  saveHodAssignments,
  saveHodPerson,
} from "@/integrations/unified/hod-history.functions";
import type { HodChannel } from "@/integrations/unified/hod-history.server";

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

type Assignment = {
  id: string;
  editionId: string;
  editionNumber: number | null;
  editionName: string;
  countryId: string;
  countryName: string;
  countryCode: string;
  personId: string;
  personName: string;
  identityKey: string;
  channel: HodChannel;
  source: string;
  confidence: number;
  notes: string | null;
};

type TenureSlotSnapshot = {
  editionId: string;
  editionLabel: string;
  assignmentId: string | null;
  personId: string | null;
  personName: string | null;
  source: string | null;
  confidence: number | null;
  notes: string | null;
};

type PendingTenureReview = {
  personId: string;
  personName: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  editionIds: string[];
  channel: HodChannel;
  notes: string | null;
  slots: TenureSlotSnapshot[];
  baselineFingerprint: string;
};

const controlClass = "mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30";

function editionOptionLabel(edition: EditionOption) {
  return `SSC${edition.editionNumber ?? "?"} · ${edition.name}`;
}

function snapshotTenureSlots(
  assignments: Assignment[],
  editions: EditionOption[],
  editionIds: string[],
  countryId: string,
  channel: HodChannel,
): TenureSlotSnapshot[] {
  const editionById = new Map(editions.map((edition) => [edition.id, edition]));
  return editionIds.map((editionId) => {
    const current = assignments.find(
      (assignment) =>
        assignment.editionId === editionId &&
        assignment.countryId === countryId &&
        assignment.channel === channel,
    );
    const edition = editionById.get(editionId);
    return {
      editionId,
      editionLabel: edition ? editionOptionLabel(edition) : editionId,
      assignmentId: current?.id ?? null,
      personId: current?.personId ?? null,
      personName: current?.personName ?? null,
      source: current?.source ?? null,
      confidence: current?.confidence ?? null,
      notes: current?.notes ?? null,
    };
  });
}

function tenureSlotFingerprint(slots: TenureSlotSnapshot[]) {
  return JSON.stringify(
    slots.map((slot) => ({
      editionId: slot.editionId,
      assignmentId: slot.assignmentId,
      personId: slot.personId,
      source: slot.source,
      confidence: slot.confidence,
      notes: slot.notes,
    })),
  );
}

function assignmentFingerprint(assignment: Assignment) {
  return JSON.stringify({
    id: assignment.id,
    editionId: assignment.editionId,
    editionNumber: assignment.editionNumber,
    editionName: assignment.editionName,
    countryId: assignment.countryId,
    countryName: assignment.countryName,
    countryCode: assignment.countryCode,
    personId: assignment.personId,
    personName: assignment.personName,
    identityKey: assignment.identityKey,
    channel: assignment.channel,
    source: assignment.source,
    confidence: assignment.confidence,
    notes: assignment.notes,
  });
}

export const Route = createFileRoute("/_authenticated/admin/hod-history")({
  head: () => ({
    meta: [
      { title: "HOD history — Solaris Organizer" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Manage historical Head-of-Delegation identity and edition tenures." },
    ],
  }),
  component: HodHistoryPage,
});

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
  const [removeTarget, setRemoveTarget] = useState<Assignment | null>(null);
  const [pendingTenureReview, setPendingTenureReview] = useState<PendingTenureReview | null>(null);

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
    mutationFn: async (review: PendingTenureReview) => {
      const live = await getHistory();
      const liveAssignments = (live.assignments ?? []) as Assignment[];
      const liveEditions = (live.editions ?? []) as EditionOption[];
      const liveSlots = snapshotTenureSlots(
        liveAssignments,
        liveEditions,
        review.editionIds,
        review.countryId,
        review.channel,
      );
      if (tenureSlotFingerprint(liveSlots) !== review.baselineFingerprint) {
        throw new Error(
          "HOD tenure history changed while this review was open. Nothing was saved. Refresh and review the current controllers before trying again.",
        );
      }
      return saveAssignmentsFn({
        data: {
          personId: review.personId,
          countryId: review.countryId,
          editionIds: review.editionIds,
          channel: review.channel,
          source: "manual",
          confidence: 100,
          notes: review.notes,
        },
      });
    },
    onSuccess: async (result) => {
      setPendingTenureReview(null);
      setNotes("");
      await invalidate();
      toast.success(`Saved ${result.updated} HOD assignment${result.updated === 1 ? "" : "s"}`);
    },
    onError: async (caught) => {
      const message = caught instanceof Error ? caught.message : "Could not save HOD tenure";
      if (message.startsWith("HOD tenure history changed")) {
        setPendingTenureReview(null);
        await invalidate();
      }
      toast.error(message);
    },
  });

  const removeAssignment = useMutation({
    mutationFn: async (review: Assignment) => {
      const live = await getHistory();
      const liveAssignment = ((live.assignments ?? []) as Assignment[]).find(
        (assignment) => assignment.id === review.id,
      );
      if (!liveAssignment || assignmentFingerprint(liveAssignment) !== assignmentFingerprint(review)) {
        throw new Error(
          "HOD assignment changed while this removal review was open. Nothing was removed. Refresh and review the current historical assignment before trying again.",
        );
      }
      return deleteAssignmentFn({ data: { id: review.id } });
    },
    onSuccess: async () => {
      setRemoveTarget(null);
      await invalidate();
      toast.success("HOD assignment removed");
    },
    onError: async (caught) => {
      const message = caught instanceof Error ? caught.message : "Could not remove assignment";
      if (message.startsWith("HOD assignment changed")) {
        setRemoveTarget(null);
        await invalidate();
      }
      toast.error(message);
    },
  });

  const filteredAssignments = useMemo(
    () => ((data?.assignments ?? []) as Assignment[]).filter((assignment) =>
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
    document.getElementById("hod-assignment")?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast.message("Suggestion prefilled. Verify the person, create or reuse the HOD identity, then save the tenure.");
  }

  const people = data?.people ?? [];
  const assignments = (data?.assignments ?? []) as Assignment[];
  const countries = (data?.countries ?? []) as CountryOption[];
  const visibleSuggestions = (suggestions as Suggestion[]).slice(0, 30);

  function openTenureReview() {
    const person = people.find((item) => item.id === personId);
    const country = countries.find((item) => item.id === countryId);
    if (!person || !country || !selectedEditionIds.length) return;
    const editionIds = [...selectedEditionIds];
    const slots = snapshotTenureSlots(assignments, editionsAscending, editionIds, country.id, channel);
    setPendingTenureReview({
      personId: person.id,
      personName: person.displayName,
      countryId: country.id,
      countryCode: country.code,
      countryName: country.name,
      editionIds,
      channel,
      notes: notes.trim() || null,
      slots,
      baselineFingerprint: tenureSlotFingerprint(slots),
    });
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Integrity history"
        title="HOD history"
        description="Track the real person controlling each delegation by edition. Country and HOD are deliberately separate identities so historical control changes do not rewrite old contest history."
        actions={<Link to="/admin/sync-health" className="admin-action-secondary"><ArrowLeft className="size-4" /> Sync health</Link>}
      />

      <div className="grid grid-cols-3 gap-2">
        <Metric label="People" value={people.length} />
        <Metric label="Assignments" value={assignments.length} />
        <Metric label="Suggestions" value={(suggestions as Suggestion[]).length} attention={(suggestions as Suggestion[]).some((item) => item.ambiguous)} />
      </div>

      <AdminCard className="mt-4 !border-sky-200/12 !bg-sky-200/[0.035]">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 size-5 shrink-0 text-sky-100" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Country identity is not the same thing as HOD identity</p>
            <div className="mt-2 grid gap-2 text-xs leading-relaxed text-muted-foreground sm:grid-cols-2">
              <p><strong className="text-foreground">Country:</strong> the permanent contest/delegation identity. The country name shown here is its current Solaris label, so an older edition may historically have used another public name.</p>
              <p><strong className="text-foreground">HOD:</strong> the real person/controller assigned only to specific editions and channels. Changing the HOD never transfers authorship of old entries, ballots or results to the new person.</p>
            </div>
          </div>
        </div>
      </AdminCard>

      {isLoading ? <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading delegation history…</p></AdminCard> : null}
      {error ? <AdminCard className="!border-rose-200/15 !bg-rose-200/[0.045]"><p className="text-sm text-rose-100">{error instanceof Error ? error.message : "HOD history could not be loaded."}</p></AdminCard> : null}

      {data ? (
        <>
          <div id="hod-assignment" className="mt-4 grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
            <AdminCard>
              <AdminCardHeader eyebrow="People" title="HOD identities" description="Create one identity per real person and reuse it across every edition they controlled. Country renames do not require a new person identity." />
              <div className="flex gap-2">
                <input value={personName} onChange={(event) => setPersonName(event.target.value)} placeholder="HOD display name" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30" />
                <button type="button" disabled={!personName.trim() || createPerson.isPending} onClick={() => createPerson.mutate()} className="admin-action-primary shrink-0"><Plus className="size-4" /> Add</button>
              </div>

              <div className="mt-4 max-h-[360px] divide-y divide-white/[0.07] overflow-y-auto pr-1 scroll-slim">
                {people.map((person) => {
                  const count = assignments.filter((assignment) => assignment.personId === person.id).length;
                  const selected = personId === person.id;
                  return (
                    <button key={person.id} type="button" onClick={() => setPersonId(person.id)} className="admin-list-row text-left">
                      <span className={`grid size-9 shrink-0 place-items-center rounded-xl border ${selected ? "border-sky-200/15 bg-sky-200/[0.08] text-sky-100" : "border-white/[0.07] bg-white/[0.03] text-muted-foreground"}`}><UserRoundCog className="size-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{person.displayName}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{person.identityKey} · {count} assignment{count === 1 ? "" : "s"}</span></span>
                      {selected ? <AdminStatus tone="info">Selected</AdminStatus> : null}
                    </button>
                  );
                })}
                {!people.length ? <AdminEmptyState icon={UserRoundCog} title="No HOD identities yet" description="Create the first real-person identity above." /> : null}
              </div>
            </AdminCard>

            <AdminCard>
              <AdminCardHeader eyebrow="Assign" title="HOD tenure" description="Choose a person, country and edition range. A range writes one assignment per edition so later corrections remain precise." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="HOD"><select value={personId} onChange={(event) => setPersonId(event.target.value)} className={controlClass}><option value="">Choose HOD</option>{people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></Field>
                <Field label="Country"><select value={countryId} onChange={(event) => setCountryId(event.target.value)} className={controlClass}><option value="">Choose country</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name} ({country.code})</option>)}</select></Field>
                <Field label="From edition"><select value={fromEditionId} onChange={(event) => { setFromEditionId(event.target.value); if (!toEditionId) setToEditionId(event.target.value); }} className={controlClass}><option value="">Choose edition</option>{editionsAscending.map((edition) => <option key={edition.id} value={edition.id}>{editionOptionLabel(edition)}</option>)}</select></Field>
                <Field label="Through edition"><select value={toEditionId} onChange={(event) => setToEditionId(event.target.value)} className={controlClass}><option value="">Same edition</option>{editionsAscending.map((edition) => <option key={edition.id} value={edition.id}>{editionOptionLabel(edition)}</option>)}</select></Field>
                <Field label="Controls"><select value={channel} onChange={(event) => setChannel(event.target.value as HodChannel)} className={controlClass}><option value="delegation">Delegation default · jury + televote</option><option value="jury">Jury override only</option><option value="televote">Televote override only</option></select></Field>
                <Field label="Notes"><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional historical name / handover note" className={controlClass} /></Field>
              </div>
              <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-xs leading-relaxed text-muted-foreground">This will assign {selectedEditionIds.length} edition{selectedEditionIds.length === 1 ? "" : "s"}. An existing assignment for the same country, edition and channel is replaced. Use Notes when a historical country name or handover needs context.</div>
              <div className="admin-sticky-actions mt-4"><button type="button" disabled={!personId || !countryId || !selectedEditionIds.length || saveTenure.isPending} onClick={openTenureReview} className="admin-action-primary w-full">{saveTenure.isPending ? "Saving…" : "Review tenure"}</button></div>
            </AdminCard>
          </div>

          <AdminCard className="mt-4">
            <AdminCardHeader eyebrow="Evidence" title="Identity suggestions" description="Username patterns from Televoting are clues about the real controller, not proof that a country's current name or current manager applies to older editions. Prefilling never writes history until you verify and save it yourself." action={suggestionsLoading ? <AdminStatus tone="neutral">Checking…</AdminStatus> : <AdminStatus tone={(suggestions as Suggestion[]).some((item) => item.ambiguous) ? "attention" : "info"}>{(suggestions as Suggestion[]).length} available</AdminStatus>} />
            {suggestionsLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Checking Televoting identity evidence…</p> : visibleSuggestions.length ? (
              <div className="divide-y divide-white/[0.07]">
                {visibleSuggestions.map((suggestion) => (
                  <div key={`${suggestion.editionId}:${suggestion.countryId}`} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-xs font-bold text-sky-100">{suggestion.editionNumber ?? "?"}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2"><p className="text-sm font-semibold text-foreground">{suggestion.countryName} → {suggestion.suggestedDisplayName}</p><AdminStatus tone={suggestion.ambiguous ? "attention" : "ready"}>{suggestion.confidence}%</AdminStatus></div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">SSC{suggestion.editionNumber ?? "?"} · {suggestion.dominantBallots}/{suggestion.totalBallots} ballots · {suggestion.evidenceRounds} round{suggestion.evidenceRounds === 1 ? "" : "s"} · username evidence · country label shown is current</p>
                        <button type="button" onClick={() => prefillSuggestion(suggestion)} className="admin-action-secondary mt-2 !min-h-10">Prefill tenure</button>
                      </div>
                    </div>
                  </div>
                ))}
                {(suggestions as Suggestion[]).length > visibleSuggestions.length ? <p className="pt-3 text-xs text-muted-foreground">Showing the first {visibleSuggestions.length} suggestions. Resolve these before working further down the evidence list.</p> : null}
              </div>
            ) : <AdminEmptyState icon={Lightbulb} title="No suggestions available" description="No unassigned HOD suggestions are currently available from Televoting evidence." />}
          </AdminCard>

          <AdminCard className="mt-4 !p-0 overflow-hidden">
            <div className="p-4 sm:p-[1.125rem]"><AdminCardHeader eyebrow="History" title="Assignment history" description="Each row binds one real controller to one country identity for one edition/channel. The country label displayed is the current Solaris name; the edition name and notes preserve historical context." /></div>
            <div className="grid gap-2 border-y border-white/[0.07] bg-white/[0.018] p-3 sm:grid-cols-2 sm:p-4">
              <select value={filterCountry} onChange={(event) => setFilterCountry(event.target.value)} className="min-h-11 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none"><option value="">All countries</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select>
              <select value={filterPerson} onChange={(event) => setFilterPerson(event.target.value)} className="min-h-11 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none"><option value="">All HODs</option>{people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select>
            </div>
            <div className="divide-y divide-white/[0.07] p-4 sm:p-[1.125rem]">
              {filteredAssignments.map((assignment) => (
                <div key={assignment.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-xs font-bold text-muted-foreground">{assignment.editionNumber ?? "?"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2"><p className="text-sm font-semibold text-foreground">SSC{assignment.editionNumber ?? "?"} · {assignment.editionName}</p><AdminStatus tone="neutral">{assignment.channel === "delegation" ? "Jury + televote" : `${assignment.channel} override`}</AdminStatus></div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground/85">Delegation:</strong> {assignment.countryName} ({assignment.countryCode}) <span className="opacity-70">· current country label</span></p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground/85">Controller:</strong> {assignment.personName} · {assignment.identityKey}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Source: {assignment.source} · confidence {assignment.confidence}%</p>
                      {assignment.notes ? <p className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">{assignment.notes}</p> : null}
                    </div>
                    <button type="button" onClick={() => setRemoveTarget(assignment)} className="admin-action-danger !min-h-10 !px-3" aria-label={`Remove ${assignment.personName} assignment for ${assignment.countryName}`}><Trash2 className="size-4" /></button>
                  </div>
                </div>
              ))}
              {!filteredAssignments.length ? <AdminEmptyState icon={History} title="No assignments match" description="Change the filters or add a new HOD tenure above." /> : null}
            </div>
          </AdminCard>
        </>
      ) : null}

      <AdminConfirmSheet
        open={!!pendingTenureReview}
        onClose={() => !saveTenure.isPending && setPendingTenureReview(null)}
        onConfirm={async () => {
          if (pendingTenureReview) await saveTenure.mutateAsync(pendingTenureReview);
        }}
        title={pendingTenureReview ? `Save ${pendingTenureReview.personName} as HOD for ${pendingTenureReview.countryName}?` : "Save HOD tenure?"}
        description={pendingTenureReview ? (
          <div className="space-y-3 text-xs leading-5 text-muted-foreground" data-v3-organizer-hod-tenure-review>
            <p>
              Review every historical controller slot that will be written. Existing assignments in the same edition, country and channel are replaced.
            </p>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <p className="font-semibold text-foreground">{pendingTenureReview.countryName} ({pendingTenureReview.countryCode})</p>
              <p className="mt-1">Channel: <strong className="text-foreground">{pendingTenureReview.channel === "delegation" ? "delegation default · jury + televote" : `${pendingTenureReview.channel} override`}</strong></p>
              <div className="mt-3 space-y-2">
                {pendingTenureReview.slots.map((slot) => (
                  <div key={slot.editionId} className="rounded-lg border border-white/[0.07] bg-black/10 p-2.5">
                    <p className="font-semibold text-foreground">{slot.editionLabel}</p>
                    <p className="mt-1">Current: {slot.personName ?? "No HOD assignment"}</p>
                    <p>After: <strong className="text-foreground">{pendingTenureReview.personName}</strong></p>
                  </div>
                ))}
              </div>
              <p className="mt-3 whitespace-pre-wrap"><span className="font-semibold text-foreground">Historical note:</span> {pendingTenureReview.notes ?? "None"}</p>
            </div>
            <p>
              Solaris reloads these exact slots immediately before apply and rejects the review if any controller, source, confidence or note changed. The legacy upsert is still not an atomic CAS/idempotent V3 operation; System #1071 owns that canonical authority and receipt contract.
            </p>
          </div>
        ) : "Review the exact historical controller changes before saving."}
        confirmLabel="Save reviewed tenure"
        confirmationText={pendingTenureReview?.countryCode}
        confirmationHint={pendingTenureReview ? `Type ${pendingTenureReview.countryCode} to confirm historical controller changes` : undefined}
        busy={saveTenure.isPending}
        danger={Boolean(pendingTenureReview?.slots.some((slot) => slot.personId && slot.personId !== pendingTenureReview.personId))}
      />

      <AdminConfirmSheet
        open={!!removeTarget}
        onClose={() => !removeAssignment.isPending && setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) removeAssignment.mutate(removeTarget);
        }}
        title={removeTarget ? `Remove ${removeTarget.personName} from SSC${removeTarget.editionNumber ?? "?"}?` : "Remove HOD assignment?"}
        description={removeTarget ? (
          <div className="space-y-3 text-xs leading-5 text-muted-foreground" data-v3-organizer-hod-removal-review>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <p className="font-semibold text-foreground">SSC{removeTarget.editionNumber ?? "?"} · {removeTarget.editionName}</p>
              <p className="mt-1">Delegation: <strong className="text-foreground">{removeTarget.countryName} ({removeTarget.countryCode})</strong></p>
              <p>Controller: <strong className="text-foreground">{removeTarget.personName}</strong> · {removeTarget.identityKey}</p>
              <p>Channel: <strong className="text-foreground">{removeTarget.channel === "delegation" ? "delegation default · jury + televote" : `${removeTarget.channel} override`}</strong></p>
              <p>Source: {removeTarget.source} · confidence {removeTarget.confidence}%</p>
              <p className="mt-2 whitespace-pre-wrap">Historical note: {removeTarget.notes ?? "None"}</p>
            </div>
            <p>This removes only this historical HOD assignment. It does not alter ballots, votes or official contest results.</p>
            <p>Solaris reloads HOD history immediately before apply and refuses the deletion if this exact assignment changed or disappeared while the review was open. The compatibility delete is still not a versioned/idempotent V3 operation; System #1071 owns canonical HOD mutation authority and receipts.</p>
          </div>
        ) : "Remove this historical assignment?"}
        confirmLabel="Remove reviewed assignment"
        confirmationText={removeTarget?.countryCode}
        confirmationHint={removeTarget ? `Type ${removeTarget.countryCode} to confirm permanent historical assignment removal` : undefined}
        busy={removeAssignment.isPending}
        danger
      />
    </AdminPage>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="admin-section-label">{label}</span>{children}</label>;
}

function Metric({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) {
  return <div className={`admin-card px-3 py-3 text-center ${attention ? "!border-amber-200/15 !bg-amber-200/[0.045]" : ""}`}><p className={`numeric text-xl font-bold ${attention ? "text-amber-100" : ""}`}>{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}