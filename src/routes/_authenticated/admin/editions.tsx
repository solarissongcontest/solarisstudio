import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, EyeOff, MapPin, Plus, RadioTower, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { AdminCard, AdminStatus, WorkspaceHeader } from "@/components/admin/AdminUI";
import { MetricStrip, WorkspaceActionBar } from "@/components/admin/AdminWorkspacePrimitives";
import { createEdition } from "@/lib/edition-authority";
import {
  editionLabel,
  useAllShows,
  useCountries,
  useEditions,
  useIsOrganizer,
  type Edition,
  type Show,
} from "@/lib/data";
import {
  resolveAutomaticEditionStatus,
  resolveShowPublication,
} from "@/lib/publication";
import {
  applyShowPublicationChange,
  loadShowPublicationControls,
  previewShowPublicationChange,
} from "@/lib/show-publication-lifecycle";

export const Route = createFileRoute("/_authenticated/admin/editions")({
  head: () => ({
    meta: [
      { title: "Editions — Solaris Organizer" },
      {
        name: "description",
        content: "Create and manage Solaris Song Contest editions from the organizer workspace.",
      },
    ],
  }),
  component: EditionsPage,
});

function derivedEditionStatus(edition: Edition, editionShows: Show[]) {
  if (!editionShows.length) return { label: "Draft", tone: "neutral" as const };
  const status = resolveAutomaticEditionStatus(
    editionShows.map((show) => ({
      kind: show.kind,
      published: show.published,
      publication_config: show.publication_config,
    })),
  );
  return {
    label: status === "completed" ? "Completed" : status === "published" ? "Published" : "Draft",
    tone: status === "draft" ? ("neutral" as const) : ("ready" as const),
  };
}

function EditionsPage() {
  const { data: editions = [], isLoading } = useEditions();
  const { data: countries = [] } = useCountries();
  const { data: shows = [] } = useAllShows();
  const { data: isOrganizer } = useIsOrganizer();
  const qc = useQueryClient();

  const nextNumber = useMemo(
    () => Math.max(0, ...editions.map((edition) => edition.edition_number ?? 0)) + 1,
    [editions],
  );
  const [form, setForm] = useState({
    edition_number: "" as number | "",
    name: "",
    year: "",
    host_city: "",
    host_country_id: "",
  });
  const [numberTouched, setNumberTouched] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!numberTouched && form.edition_number === "") {
      setForm((current) => ({ ...current, edition_number: nextNumber }));
    }
  }, [form.edition_number, nextNumber, numberTouched]);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["editions"] }),
      qc.invalidateQueries({ queryKey: ["edition"] }),
      qc.invalidateQueries({ queryKey: ["shows"] }),
      qc.invalidateQueries({ queryKey: ["show"] }),
    ]);
  };

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setMessage(null);

    const editionNumber = Number(form.edition_number);
    const year = form.year.trim() ? Number(form.year) : null;
    if (!Number.isInteger(editionNumber) || editionNumber < 1) {
      setError("Enter a whole edition number of 1 or higher.");
      return;
    }
    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 9999)) {
      setError("Enter a valid four-digit edition year or leave it empty.");
      return;
    }

    setBusy("create");
    try {
      const receipt = await createEdition({
        editionNumber,
        name: form.name.trim() || `Solaris Song Contest ${editionNumber}`,
        year,
        hostCountryId: form.host_country_id || null,
        hostCity: form.host_city.trim() || null,
        reason: "Create reviewed Organizer edition",
      });
      setForm({
        edition_number: editionNumber + 1,
        name: "",
        year: "",
        host_city: "",
        host_country_id: "",
      });
      setNumberTouched(false);
      setCreateOpen(false);
      setMessage(
        `${receipt.edition.edition_number ? `SSC ${receipt.edition.edition_number}` : receipt.edition.name} created with canonical operation ${receipt.operationId.slice(0, 8)}…`,
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the edition.");
    } finally {
      setBusy(null);
    }
  };

  const makePrivate = async (edition: Edition) => {
    if (busy) return;
    setBusy(`private:${edition.id}`);
    setError(null);
    setMessage(null);
    try {
      const controls = await loadShowPublicationControls(edition.id);
      const showById = new Map(
        shows.filter((show) => show.edition_id === edition.id).map((show) => [show.id, show] as const),
      );

      for (const control of controls) {
        if (control.state !== "public" && control.state !== "scheduled") continue;
        const show = showById.get(control.showId);
        if (!show) throw new Error(`Publication control ${control.showId} has no matching show.`);
        const preview = await previewShowPublicationChange({
          showId: show.id,
          targetState: "hidden",
          config: resolveShowPublication(show),
          scheduledFor: null,
        });
        if (preview.alreadyApplied) continue;
        const operationId = crypto.randomUUID();
        await applyShowPublicationChange({
          preview,
          operationId,
          idempotencyKey: operationId,
        });
      }

      // public.editions.published/status are compatibility projections maintained
      // by the show-publication trigger. This page deliberately does not write
      // them a second time.
      setMessage(`${editionLabel(edition)} publication is hidden. Canonical show state owns the projection.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not hide edition publication.");
    } finally {
      setBusy(null);
    }
  };

  const publishedCount = editions.filter((edition) =>
    derivedEditionStatus(edition, shows.filter((show) => show.edition_id === edition.id)).label !== "Draft",
  ).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-24">
      <WorkspaceHeader
        eyebrow="Contest control"
        title="Editions"
        description="Edition identity and metadata are governed server-side. Lifecycle transitions, publication, hosting and visual design keep their own scoped authorities instead of competing for the same row."
        actions={
          <button
            type="button"
            className="admin-action-primary"
            onClick={() => setCreateOpen((open) => !open)}
            disabled={!isOrganizer}
          >
            <Plus className="size-4" /> {createOpen ? "Close" : "New edition"}
          </button>
        }
      />

      {error ? (
        <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
      {!error && message ? (
        <div className="rounded-xl border border-emerald-200/15 bg-emerald-200/[0.05] p-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}

      <MetricStrip className="sm:grid-cols-3 xl:grid-cols-3">
        <AdminCard className="!p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Editions</p>
          <p className="mt-1 text-2xl font-black">{editions.length}</p>
        </AdminCard>
        <AdminCard className="!p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Public/completed</p>
          <p className="mt-1 text-2xl font-black">{publishedCount}</p>
        </AdminCard>
        <AdminCard className="!p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Next number</p>
          <p className="mt-1 text-2xl font-black">SSC {nextNumber}</p>
        </AdminCard>
      </MetricStrip>

      {createOpen ? (
        <AdminCard>
          <form className="space-y-4" onSubmit={submitCreate}>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Create edition</p>
              <h2 className="mt-1 text-lg font-bold">Canonical edition identity</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The server enforces global edition.manage, uniqueness, atomic initial state, audit, receipt and
                the first edition.changed event. Direct table insertion is no longer an authority.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold">Edition number</span>
                <input
                  className="admin-input w-full"
                  inputMode="numeric"
                  value={form.edition_number}
                  onChange={(event) => {
                    setNumberTouched(true);
                    setForm((current) => ({ ...current, edition_number: event.target.value ? Number(event.target.value) : "" }));
                  }}
                  required
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold">Name</span>
                <input
                  className="admin-input w-full"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder={`Solaris Song Contest ${form.edition_number || nextNumber}`}
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold">Year</span>
                <input
                  className="admin-input w-full"
                  inputMode="numeric"
                  value={form.year}
                  onChange={(event) => setForm((current) => ({ ...current, year: event.target.value }))}
                  placeholder="2027"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold">Host country</span>
                <select
                  className="admin-input w-full"
                  value={form.host_country_id}
                  onChange={(event) => setForm((current) => ({ ...current, host_country_id: event.target.value }))}
                >
                  <option value="">Not chosen</option>
                  {countries.map((country) => (
                    <option key={country.id} value={country.id}>{country.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold">Host city</span>
                <input
                  className="admin-input w-full"
                  value={form.host_city}
                  onChange={(event) => setForm((current) => ({ ...current, host_city: event.target.value }))}
                  placeholder="TBA"
                />
              </label>
            </div>
            <WorkspaceActionBar>
              <button type="submit" className="admin-action-primary" disabled={busy === "create" || !isOrganizer}>
                <Plus className="size-4" /> {busy === "create" ? "Creating…" : "Create private draft"}
              </button>
            </WorkspaceActionBar>
          </form>
        </AdminCard>
      ) : null}

      <section className="space-y-3">
        {isLoading ? <p className="py-8 text-sm text-muted-foreground">Loading editions…</p> : null}
        {!isLoading && editions.length === 0 ? (
          <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">No editions yet.</p></AdminCard>
        ) : null}
        {editions
          .slice()
          .sort((left, right) => (right.edition_number ?? 0) - (left.edition_number ?? 0))
          .map((edition) => {
            const editionShows = shows.filter((show) => show.edition_id === edition.id);
            const state = derivedEditionStatus(edition, editionShows);
            const hiding = busy === `private:${edition.id}`;
            return (
              <AdminCard key={edition.id} className="!p-0 overflow-hidden">
                <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-xl font-black">{editionLabel(edition)}</h2>
                      <AdminStatus tone={state.tone}>{state.label}</AdminStatus>
                    </div>
                    <p className="mt-1 truncate text-sm text-foreground/85">{edition.name}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" /> {edition.year ?? "Year TBA"}</span>
                      <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {edition.host_city || "Host TBA"}</span>
                      <span className="inline-flex items-center gap-1"><RadioTower className="size-3.5" /> {editionShows.length} shows</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to="/admin/design/$slug"
                      params={{ slug: edition.slug }}
                      className="admin-action-secondary"
                    >
                      <Settings2 className="size-4" /> Design
                    </Link>
                    <Link
                      to="/admin/anniversary-dates"
                      search={{ edition: edition.id }}
                      className="admin-action-secondary"
                    >
                      <CalendarDays className="size-4" /> Date
                    </Link>
                    {state.label !== "Draft" ? (
                      <button
                        type="button"
                        className="admin-action-secondary"
                        onClick={() => void makePrivate(edition)}
                        disabled={Boolean(busy)}
                      >
                        <EyeOff className="size-4" /> {hiding ? "Hiding…" : "Hide publication"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="border-t border-white/[0.07] bg-white/[0.015] px-4 py-3 text-xs leading-5 text-muted-foreground sm:px-5">
                  Permanent deletion is intentionally not offered here. Official editions retire through the canonical lifecycle/archive authority, preserving historical truth instead of turning a trash icon into governance.
                </div>
              </AdminCard>
            );
          })}
      </section>
    </div>
  );
}
