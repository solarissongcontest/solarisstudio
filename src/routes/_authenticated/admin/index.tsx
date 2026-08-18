import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  EyeOff,
  MapPin,
  Plus,
  RadioTower,
  Settings2,
  Trash2,
  Trophy,
} from "lucide-react";

import {
  AdminActionItem,
  AdminCard,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminMoreMenu,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { Field, Select, TextInput } from "@/components/studio/Controls";
import { supabase } from "@/integrations/supabase/client";
import { reportSupabaseError } from "@/lib/errors";
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

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Editions — Solaris Organizer" },
      {
        name: "description",
        content: "Create and manage Solaris Song Contest editions from the organizer workspace.",
      },
    ],
  }),
  component: AdminHome,
});

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

function AdminHome() {
  const { data: editions = [], isLoading: editionsLoading } = useEditions();
  const { data: countries = [] } = useCountries();
  const { data: shows = [] } = useAllShows();
  const { data: participants = [] } = useAllParticipants();
  const { data: isOrganizer } = useIsOrganizer();
  const qc = useQueryClient();

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
  const [privateEdition, setPrivateEdition] = useState<Edition | null>(null);
  const [deleteEdition, setDeleteEdition] = useState<Edition | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
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
  }, [nextNumber, numberTouched, form.edition_number]);

  const refresh = () => {
    ["editions", "edition", "shows", "show", "participants", "results"].forEach((key) =>
      qc.invalidateQueries({ queryKey: [key] }),
    );
  };

  const createEdition = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;

    setMsg(null);
    setError(null);

    const num = Number(form.edition_number);
    if (!Number.isInteger(num) || num < 1) {
      setError("Enter a whole edition number of 1 or higher.");
      return;
    }

    const slug = `ssc-${num}`;
    const clash = editions.find(
      (edition) => edition.edition_number === num || edition.slug === slug,
    );
    if (clash) {
      setError(`Edition ${num} already exists (“${clash.name}”). Pick a different number.`);
      return;
    }

    setSaving(true);
    try {
      const { error: insertError } = await supabase.from("editions").insert({
        edition_number: num,
        name: form.name || `Solaris Song Contest ${num}`,
        year: form.year ? Number(form.year) : null,
        slug,
        host_city: form.host_city || null,
        host_country_id: form.host_country_id || null,
        status: "draft",
        published: false,
      });

      if (insertError) {
        setError(reportSupabaseError(insertError, "Could not create the edition. Nothing was saved."));
        return;
      }

      setNumberTouched(false);
      setForm({
        edition_number: num + 1,
        name: "",
        year: "",
        host_city: "",
        host_country_id: "",
      });
      setCreateOpen(false);
      setMsg(`SSC ${num} created as a private draft.`);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const makeEditionPrivate = async (edition: Edition) => {
    const actionKey = `private:${edition.id}`;
    setBusyAction(actionKey);
    setError(null);
    setMsg(null);

    try {
      const { error: showError } = await supabase
        .from("shows")
        .update({ published: false })
        .eq("edition_id", edition.id);

      if (showError) {
        setError(reportSupabaseError(showError, "Could not make the edition private."));
        return false;
      }

      const { error: editionError } = await supabase
        .from("editions")
        .update({ published: false, status: "draft" })
        .eq("id", edition.id);

      if (editionError) {
        setError(
          reportSupabaseError(
            editionError,
            "The shows were made private, but the edition status could not be updated.",
          ),
        );
        return false;
      }

      setMsg(`${editionLabel(edition)} is private. Its saved publication choices are still available.`);
      refresh();
      return true;
    } finally {
      setBusyAction(null);
    }
  };

  const removeEdition = async (edition: Edition) => {
    const actionKey = `delete:${edition.id}`;
    setBusyAction(actionKey);
    setError(null);
    setMsg(null);

    try {
      const { error: deleteError } = await supabase.from("editions").delete().eq("id", edition.id);
      if (deleteError) {
        setError(reportSupabaseError(deleteError, "Could not delete this edition."));
        return false;
      }

      setMsg(`Deleted ${editionLabel(edition)}.`);
      refresh();
      return true;
    } finally {
      setBusyAction(null);
    }
  };

  const publicEditionCount = editions.filter((edition) => {
    const editionShows = shows.filter((show) => show.edition_id === edition.id);
    return derivedEditionStatus(edition, editionShows).published;
  }).length;

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        eyebrow="Contest archive"
        title="Editions"
        description="Open an edition to work on it. Creation and destructive actions stay out of the way until you actually need them."
        actions={
          <button type="button" onClick={() => setCreateOpen(true)} className="admin-action-primary">
            <Plus className="size-4" /> New edition
          </button>
        }
      />

      {isOrganizer === false ? (
        <div className="mb-4 rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-3 text-sm leading-relaxed text-rose-100">
          This account does not have organizer access, so changes will be rejected.
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!error && msg ? (
        <div className="mb-4 rounded-xl border border-emerald-200/15 bg-emerald-200/[0.05] p-3 text-sm text-emerald-100">
          {msg}
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        <MiniMetric label="Editions" value={editions.length} />
        <MiniMetric label="Public" value={publicEditionCount} />
        <MiniMetric label="Shows" value={shows.length} />
      </div>

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
                      <AdminStatus tone={derived.status === "completed" ? "ready" : derived.published ? "info" : "neutral"}>
                        {derived.label}
                      </AdminStatus>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.018] p-3 text-center">
                      <EditionMetric label="Shows" value={editionShows.length} />
                      <EditionMetric label="Entries" value={entryCount} />
                      <EditionMetric label="Public" value={publicShows.length} />
                    </div>

                    {editionShows.length ? (
                      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 scroll-slim">
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
                        description={`${editionLabel(edition)} · edition actions`}
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
                              description="Hide all public shows without deleting their saved publication settings."
                              onClick={() => setPrivateEdition(edition)}
                            />
                          ) : null}
                          <AdminActionItem
                            icon={Trash2}
                            title="Delete edition"
                            description="Permanently remove the edition and related contest data."
                            tone="danger"
                            onClick={() => setDeleteEdition(edition)}
                          />
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

      <AdminSheet
        open={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        title="Create edition"
        description="Only the essentials first. The new edition starts as a private draft."
      >
        <form onSubmit={createEdition} className="space-y-4">
          <Field
            label="Edition number"
            hint={editionsLoading ? "Loading existing editions…" : "Suggested from the latest edition"}
          >
            <TextInput
              type="number"
              min={1}
              required
              disabled={editionsLoading}
              className="numeric"
              value={form.edition_number}
              onChange={(event) => {
                setNumberTouched(true);
                setForm({
                  ...form,
                  edition_number: event.target.value === "" ? "" : Number(event.target.value),
                });
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
              <Select
                value={form.host_country_id}
                onChange={(event) => setForm({ ...form, host_country_id: event.target.value })}
              >
                <option value="" className="bg-background">Undecided</option>
                {countries.map((country) => (
                  <option key={country.id} value={country.id} className="bg-background">
                    {country.name}
                  </option>
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
              <Field label="Year" hint="Optional calendar metadata">
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
            <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <div className="admin-sticky-actions grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <button type="button" disabled={saving} onClick={() => setCreateOpen(false)} className="admin-action-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving || editionsLoading} className="admin-action-primary w-full">
              {saving ? "Creating…" : "Create private edition"}
            </button>
          </div>
        </form>
      </AdminSheet>

      <AdminConfirmSheet
        open={Boolean(privateEdition)}
        onClose={() => setPrivateEdition(null)}
        title={privateEdition ? `Make ${editionLabel(privateEdition)} private?` : "Make edition private?"}
        description={
          <>
            All shows in this edition will disappear from the public site. Nothing is deleted, and the saved publication choices remain available.
          </>
        }
        confirmLabel="Make private"
        busy={Boolean(privateEdition && busyAction === `private:${privateEdition.id}`)}
        onConfirm={async () => {
          if (!privateEdition) return;
          const success = await makeEditionPrivate(privateEdition);
          if (success) setPrivateEdition(null);
        }}
      />

      <AdminConfirmSheet
        open={Boolean(deleteEdition)}
        onClose={() => setDeleteEdition(null)}
        title={deleteEdition ? `Delete ${editionLabel(deleteEdition)}?` : "Delete edition?"}
        description={
          <>
            This permanently deletes the edition and data linked to it. This is intentionally harder to do than ordinary organizer actions.
          </>
        }
        confirmLabel="Delete edition"
        confirmationText={deleteEdition ? editionLabel(deleteEdition) : undefined}
        confirmationHint={deleteEdition ? `Type ${editionLabel(deleteEdition)} to confirm` : undefined}
        danger
        busy={Boolean(deleteEdition && busyAction === `delete:${deleteEdition.id}`)}
        onConfirm={async () => {
          if (!deleteEdition) return;
          const success = await removeEdition(deleteEdition);
          if (success) setDeleteEdition(null);
        }}
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
