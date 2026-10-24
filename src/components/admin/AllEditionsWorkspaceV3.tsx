import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowRight,
  CalendarDays,
  EyeOff,
  MapPin,
  Plus,
  RadioTower,
  Settings2,
  ShieldAlert,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  AdminActionItem,
  AdminCard,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminMoreMenu,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  MetricStrip,
  WorkspaceActionBar,
  WorkspaceHeader,
} from "@/components/admin/AdminWorkspacePrimitives";
import { Field, Select, TextInput } from "@/components/studio/Controls";
import {
  editionLabel,
  useAllParticipants,
  useAllShows,
  useCountries,
  useEditions,
  useIsOrganizer,
  type Edition,
  type Show,
} from "@/lib/data";
import {
  hasAnyPublicInformation,
  resolveAutomaticEditionStatus,
  resolveShowPublication,
} from "@/lib/publication";
import {
  createEditionDraftV3,
  makeEditionPrivateV3,
  previewEditionDraftV3,
  previewEditionMakePrivateV3,
  type EditionMakePrivatePreview,
} from "@/lib/v3-all-editions-lifecycle";

function derivedEditionStatus(edition: Edition, editionShows: Show[]) {
  if (!editionShows.length) {
    return { label: "Draft", published: false, status: "draft" };
  }

  const status = resolveAutomaticEditionStatus(
    editionShows.map((show) => ({
      kind: show.kind,
      published: show.published,
      publication_config: show.publication_config,
    })),
  );

  return {
    label: status === "completed" ? "Completed" : status === "published" ? "Published" : "Draft",
    published: status !== "draft",
    status,
  };
}

type PendingPrivateReview = EditionMakePrivatePreview & {
  displayLabel: string;
  reason: string;
};

export function AllEditionsWorkspaceV3() {
  const { data: editions = [], isLoading: editionsLoading } = useEditions();
  const { data: countries = [] } = useCountries();
  const { data: shows = [] } = useAllShows();
  const { data: participants = [] } = useAllParticipants();
  const { data: isOrganizer } = useIsOrganizer();
  const queryClient = useQueryClient();

  const nextNumber = editionsLoading
    ? null
    : Math.max(0, ...editions.map((edition) => edition.edition_number ?? 0)) + 1;

  const [form, setForm] = useState({
    edition_number: "" as number | "",
    name: "",
    year: "",
    host_city: "",
    host_country_id: "",
  });
  const [numberTouched, setNumberTouched] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [privateReview, setPrivateReview] = useState<PendingPrivateReview | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const participantCountByShow = useMemo(() => {
    const counts = new Map<string, number>();
    participants.forEach((participant) => {
      if (!participant.show_id) return;
      counts.set(participant.show_id, (counts.get(participant.show_id) ?? 0) + 1);
    });
    return counts;
  }, [participants]);

  const editionParticipantCount = useMemo(() => {
    const counts = new Map<string, number>();
    participants.forEach((participant) => {
      counts.set(participant.edition_id, (counts.get(participant.edition_id) ?? 0) + 1);
    });
    return counts;
  }, [participants]);

  useEffect(() => {
    if (nextNumber !== null && !numberTouched && form.edition_number === "") {
      setForm((current) => ({ ...current, edition_number: nextNumber }));
    }
  }, [form.edition_number, nextNumber, numberTouched]);

  function refresh() {
    ["editions", "edition", "shows", "show", "participants", "results"].forEach((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    );
  }

  async function createEdition(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    setError(null);
    setMessage(null);

    const editionNumber = Number(form.edition_number);
    if (!Number.isInteger(editionNumber) || editionNumber < 1) {
      setError("Enter a whole edition number of 1 or higher.");
      return;
    }

    const year = form.year.trim() ? Number(form.year) : null;
    if (year !== null && !Number.isInteger(year)) {
      setError("Enter a whole calendar year or leave it blank.");
      return;
    }

    setSaving(true);
    try {
      const preview = await previewEditionDraftV3({
        editionNumber,
        name: form.name || null,
        year,
        hostCity: form.host_city || null,
        hostCountryId: form.host_country_id || null,
      });

      if (!preview.canCommit || preview.blockers.length) {
        setError(preview.blockers[0] || "This edition draft cannot be created.");
        return;
      }

      const result = await createEditionDraftV3(preview);
      setNumberTouched(false);
      setForm({
        edition_number: result.editionNumber + 1,
        name: "",
        year: "",
        host_city: "",
        host_country_id: "",
      });
      setCreateOpen(false);
      setMessage(
        result.replayed
          ? `${editionLabel({ edition_number: result.editionNumber } as Edition)} creation was recovered from its durable receipt.`
          : `${editionLabel({ edition_number: result.editionNumber } as Edition)} created as a private draft.`,
      );
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the edition draft.");
    } finally {
      setSaving(false);
    }
  }

  async function prepareMakePrivate(edition: Edition) {
    const actionKey = `review-private:${edition.id}`;
    if (busyAction) return;
    setBusyAction(actionKey);
    setError(null);
    setMessage(null);

    try {
      const preview = await previewEditionMakePrivateV3(edition.id);
      if (!preview.canCommit || preview.blockers.length) {
        setError(preview.blockers[0] || "This edition cannot be made private right now.");
        return;
      }
      if (preview.alreadyApplied) {
        setMessage(`${editionLabel(edition)} is already private.`);
        refresh();
        return;
      }
      setPrivateReview({
        ...preview,
        displayLabel: editionLabel(edition),
        reason: "",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not review edition visibility.");
    } finally {
      setBusyAction(null);
    }
  }

  async function applyMakePrivate() {
    const review = privateReview;
    if (!review || busyAction || review.reason.trim().length < 5) return;

    const actionKey = `private:${review.editionId}`;
    setBusyAction(actionKey);
    setError(null);
    setMessage(null);

    try {
      const result = await makeEditionPrivateV3(review, review.reason);
      setPrivateReview(null);
      setMessage(
        result.replayed
          ? `${review.displayLabel} visibility was reconciled from its durable receipt.`
          : `${review.displayLabel} is private. ${result.hiddenShowCount} public or scheduled show${result.hiddenShowCount === 1 ? " was" : "s were"} hidden atomically.`,
      );
      refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The edition changed or the authoritative operation could not be reconciled.",
      );
      setPrivateReview(null);
      refresh();
    } finally {
      setBusyAction(null);
    }
  }

  const publicEditionCount = editions.filter((edition) => {
    const editionShows = shows.filter((show) => show.edition_id === edition.id);
    return derivedEditionStatus(edition, editionShows).published;
  }).length;

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceHeader
        eyebrow="Contest archive"
        title="Editions"
        description="Create private drafts and manage exact edition visibility through versioned, receipted Solaris operations. Historical retirement belongs to the canonical Archive lifecycle, not raw deletion."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/anniversary-dates" className="admin-action-secondary">
              <CalendarDays className="size-4" /> Edition dates
            </Link>
            <button type="button" onClick={() => setCreateOpen(true)} className="admin-action-primary">
              <Plus className="size-4" /> New edition
            </button>
          </div>
        }
      />

      {isOrganizer === false ? (
        <div className="mb-4 rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-3 text-sm leading-relaxed text-rose-100">
          This account does not have Organizer access. The server will reject lifecycle changes.
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!error && message ? (
        <div className="mb-4 rounded-xl border border-emerald-200/15 bg-emerald-200/[0.05] p-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}

      <MetricStrip className="mb-4 grid-cols-3 sm:grid-cols-3 xl:grid-cols-3">
        <MiniMetric label="Editions" value={editions.length} />
        <MiniMetric label="Public" value={publicEditionCount} />
        <MiniMetric label="Shows" value={shows.length} />
      </MetricStrip>

      {editions.length ? (
        <div className="space-y-3">
          {[...editions]
            .sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))
            .map((edition) => {
              const editionShows = shows.filter((show) => show.edition_id === edition.id);
              const derived = derivedEditionStatus(edition, editionShows);
              const publicShows = editionShows.filter(
                (show) => show.published && hasAnyPublicInformation(resolveShowPublication(show)),
              );
              const entryCount = editionParticipantCount.get(edition.id) ?? 0;

              return (
                <AdminCard key={edition.id} className="!p-0 overflow-hidden">
                  <div className="p-4 sm:p-5">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="admin-section-label">{editionLabel(edition)}</p>
                        <h2 className="mt-1 break-words text-lg font-bold tracking-[-.025em] sm:text-xl">
                          {edition.name}
                        </h2>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="size-3.5" /> {edition.host_city ?? "Host TBC"}
                          </span>
                          {edition.year ? (
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="size-3.5" /> {edition.year}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <AdminStatus
                        tone={
                          derived.status === "completed"
                            ? "ready"
                            : derived.published
                              ? "info"
                              : "neutral"
                        }
                      >
                        {derived.label}
                      </AdminStatus>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.018] p-3 text-center">
                      <EditionMetric label="Shows" value={editionShows.length} />
                      <EditionMetric label="Entries" value={entryCount} />
                      <EditionMetric label="Public" value={publicShows.length} />
                    </div>

                    {editionShows.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {editionShows.slice(0, 5).map((show) => (
                          <span
                            key={show.id}
                            className="shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-[11px] text-muted-foreground"
                          >
                            {show.name} · {participantCountByShow.get(show.id) ?? 0}
                          </span>
                        ))}
                        {editionShows.length > 5 ? (
                          <span className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-muted-foreground">
                            +{editionShows.length - 5} more
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <Link
                        to="/admin/$slug"
                        params={{ slug: edition.slug }}
                        className="admin-action-primary w-full"
                      >
                        Open edition <ArrowRight className="size-4" />
                      </Link>

                      <AdminMoreMenu
                        label={`${editionLabel(edition)} actions`}
                        title={edition.name}
                        description={`${editionLabel(edition)} · governed edition actions`}
                      >
                        <div className="divide-y divide-white/[0.07]">
                          <Link
                            to="/admin/$slug"
                            params={{ slug: edition.slug }}
                            className="admin-action-row"
                          >
                            <span className="admin-action-row-icon"><Settings2 className="size-4" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold">Manage edition</span>
                              <span className="mt-1 block text-xs text-muted-foreground">Shows, entries, results and publication.</span>
                            </span>
                            <ArrowRight className="size-4 text-muted-foreground" />
                          </Link>
                          <Link
                            to="/admin/anniversary-dates"
                            search={{ edition: edition.id }}
                            className="admin-action-row"
                          >
                            <span className="admin-action-row-icon"><CalendarDays className="size-4" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold">Edit historical date</span>
                              <span className="mt-1 block text-xs text-muted-foreground">Set the exact main event date for this edition.</span>
                            </span>
                            <ArrowRight className="size-4 text-muted-foreground" />
                          </Link>
                          <Link
                            to="/admin/design/$slug"
                            params={{ slug: edition.slug }}
                            className="admin-action-row"
                          >
                            <span className="admin-action-row-icon"><RadioTower className="size-4" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold">Design & broadcast</span>
                              <span className="mt-1 block text-xs text-muted-foreground">Artwork, theme and broadcast presentation.</span>
                            </span>
                            <ArrowRight className="size-4 text-muted-foreground" />
                          </Link>
                          {derived.published ? (
                            <AdminActionItem
                              icon={EyeOff}
                              title="Make edition private"
                              description="Atomically hide public/scheduled shows while preserving their saved publication configuration."
                              onClick={() => void prepareMakePrivate(edition)}
                            />
                          ) : null}
                          <Link to="/admin/control-room" className="admin-action-row">
                            <span className="admin-action-row-icon"><Archive className="size-4" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold">Archive / retire edition</span>
                              <span className="mt-1 block text-xs text-muted-foreground">Use the canonical edition lifecycle. Permanent browser deletion is retired.</span>
                            </span>
                            <ArrowRight className="size-4 text-muted-foreground" />
                          </Link>
                        </div>
                      </AdminMoreMenu>
                    </div>
                  </div>
                </AdminCard>
              );
            })}
        </div>
      ) : (
        <AdminCard>
          <AdminEmptyState
            icon={Trophy}
            title="No editions yet"
            description="Create the first Solaris Song Contest edition. It starts private and can be configured before anything is published."
            action={
              <button type="button" onClick={() => setCreateOpen(true)} className="admin-action-primary">
                <Plus className="size-4" /> Create edition
              </button>
            }
          />
        </AdminCard>
      )}

      <AdminCard className="mt-4 !p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-200" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">Permanent edition deletion is retired</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Editions are referenced by results, ballots, entries, historical identities, audit evidence and domain events. Use the canonical Archive lifecycle for historical retirement instead of cascading deletion.
            </p>
          </div>
        </div>
      </AdminCard>

      <AdminSheet
        open={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        title="Create edition"
        description="The server reviews uniqueness and scope first. A successful draft has one durable operation receipt."
      >
        <form onSubmit={createEdition} className="space-y-4">
          <Field label="Edition number" hint={editionsLoading ? "Loading existing editions…" : "Suggested from the latest edition"}>
            <TextInput
              type="number"
              min={1}
              required
              disabled={editionsLoading}
              className="numeric"
              value={form.edition_number}
              onChange={(event) => {
                setNumberTouched(true);
                setForm({ ...form, edition_number: event.target.value === "" ? "" : Number(event.target.value) });
              }}
            />
          </Field>

          <Field label="Name" hint={`Defaults to “Solaris Song Contest ${form.edition_number || "…"}”`}>
            <TextInput
              value={form.name}
              placeholder={`Solaris Song Contest ${form.edition_number || ""}`}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Host country">
              <Select value={form.host_country_id} onChange={(event) => setForm({ ...form, host_country_id: event.target.value })}>
                <option value="" className="bg-background">Undecided</option>
                {countries.map((country) => (
                  <option key={country.id} value={country.id} className="bg-background">{country.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Host city">
              <TextInput
                value={form.host_city}
                placeholder="Beïmoth"
                onChange={(event) => setForm({ ...form, host_city: event.target.value })}
              />
            </Field>
          </div>

          <details className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <summary className="cursor-pointer text-sm font-semibold">More details</summary>
            <div className="mt-3">
              <Field label="Year" hint="Optional calendar year">
                <TextInput
                  type="number"
                  className="numeric"
                  value={form.year}
                  onChange={(event) => setForm({ ...form, year: event.target.value })}
                />
              </Field>
            </div>
          </details>

          {error ? (
            <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-3 text-sm text-rose-100">{error}</div>
          ) : null}

          <WorkspaceActionBar className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <button type="button" disabled={saving} onClick={() => setCreateOpen(false)} className="admin-action-secondary">Cancel</button>
            <button type="submit" disabled={saving || editionsLoading} className="admin-action-primary w-full">
              {saving ? "Creating…" : "Create private edition"}
            </button>
          </WorkspaceActionBar>
        </form>
      </AdminSheet>

      <AdminConfirmSheet
        open={Boolean(privateReview)}
        onClose={() => {
          if (!busyAction) setPrivateReview(null);
        }}
        title={privateReview ? `Make ${privateReview.displayLabel} private?` : "Review edition visibility"}
        description={privateReview ? (
          <div className="space-y-3">
            <p><strong className="text-foreground">{privateReview.displayLabel} · {privateReview.name}</strong></p>
            <p>
              Solaris will hide <strong className="text-foreground">{privateReview.activePublicationCount}</strong> public or scheduled show{privateReview.activePublicationCount === 1 ? "" : "s"} and then clear the edition’s public visibility inside one database transaction.
            </p>
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/[0.08] bg-black/10 p-3 text-center">
              <EditionMetric label="Shows" value={privateReview.showPublicationControls.length} />
              <EditionMetric label="Active" value={privateReview.activePublicationCount} />
              <EditionMetric label="Revision" value={privateReview.stateVersion} />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Apply rechecks this exact aggregate revision after locking the edition and every child publication control. Any intervening edit fails closed with a stale-state conflict.
            </p>
            <label className="block">
              <span className="text-xs font-semibold text-foreground">Reason</span>
              <textarea
                value={privateReview.reason}
                onChange={(event) => setPrivateReview((current) => current ? { ...current, reason: event.target.value } : current)}
                rows={3}
                placeholder="Why should this edition stop being public?"
                className="mt-2 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 py-2 text-sm text-foreground outline-none focus:border-sky-200/30"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">At least 5 characters. The reason is stored in Organizer audit evidence.</span>
            </label>
            <div className="rounded-lg border border-amber-200/15 bg-amber-200/[0.04] p-2 text-xs leading-relaxed text-amber-50/80">
              This is an R3 cross-domain operation. The server requires authentication from the last five minutes and returns one durable parent receipt plus the child show-publication operations.
            </div>
          </div>
        ) : "Review the exact edition scope before continuing."}
        confirmLabel="Make edition private"
        confirmationText={privateReview?.displayLabel}
        confirmationHint={privateReview ? `Type ${privateReview.displayLabel} exactly to confirm this visibility change` : undefined}
        confirmDisabled={privateReview ? privateReview.reason.trim().length < 5 : true}
        danger
        busy={Boolean(privateReview && busyAction === `private:${privateReview.editionId}`)}
        onConfirm={applyMakePrivate}
      />
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-card px-3 py-3 text-center">
      <p className="numeric text-xl font-bold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function EditionMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="numeric text-base font-bold text-foreground">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
