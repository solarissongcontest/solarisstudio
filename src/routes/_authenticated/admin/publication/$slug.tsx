import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, Globe2, LockKeyhole, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { editionLabel, useEdition, useShows, type Show } from "@/lib/data";
import {
  PUBLICATION_LABELS,
  PUBLICATION_PRESETS,
  applyPublicationPreset,
  hasAnyPublicInformation,
  normalisePublicationDependencies,
  resolveShowPublication,
  type PublicationConfig,
  type PublicationKey,
  type PublicationPresetId,
} from "@/lib/publication";
import {
  isStudio2ResultReleaseReady,
  loadStudio2ResultsOperations,
} from "@/lib/studio2-results-operations";
import { validateEditionCommandScope } from "@/lib/solaris-v6-edition-context";
import {
  applyShowPublicationChange,
  loadShowPublicationControls,
  previewShowPublicationChange,
  reauthenticateShowPublicationR3,
  type ShowPublicationControl,
  type ShowPublicationPreview,
  type ShowPublicationState,
} from "@/lib/show-publication-lifecycle";

const PUBLICATION_KEYS = Object.keys(PUBLICATION_LABELS) as PublicationKey[];
const OUTCOME_KEYS: PublicationKey[] = ["qualifiers", "results", "jury_results", "televote_results", "detailed_voting"];

type DraftState = {
  show: Show;
  config: PublicationConfig;
};

type PendingRelease = {
  show: Show;
  preview: ShowPublicationPreview;
  operationId: string;
  idempotencyKey: string;
  editionId: string;
};

export const Route = createFileRoute("/_authenticated/admin/publication/$slug")({
  head: () => ({ meta: [{ title: "Publication — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: PublicationWorkspace,
});

function PublicationWorkspace() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const { data: edition, isLoading: loadingEdition } = useEdition(slug);
  const { data: shows = [], isLoading: loadingShows } = useShows(edition?.id);
  const resultOperationsQuery = useQuery({
    queryKey: ["studio2-results-operations", edition?.id ?? "none"],
    enabled: Boolean(edition?.id),
    queryFn: () => loadStudio2ResultsOperations(edition!.id),
    staleTime: 10_000,
  });
  const publicationControlsQuery = useQuery({
    queryKey: ["studio2-show-publication-controls", edition?.id ?? "none"],
    enabled: Boolean(edition?.id),
    queryFn: () => loadShowPublicationControls(edition!.id),
    staleTime: 5_000,
  });
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [pendingRelease, setPendingRelease] = useState<PendingRelease | null>(null);
  const [discardDraftOpen, setDiscardDraftOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [publicationPassword, setPublicationPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const orderedShows = useMemo(() => [...shows].sort((a, b) => a.sort_order - b.sort_order), [shows]);
  const resultOperationByShow = useMemo(
    () => new Map((resultOperationsQuery.data ?? []).map((row) => [row.showId, row] as const)),
    [resultOperationsQuery.data],
  );
  const publicationControlByShow = useMemo(
    () =>
      new Map(
        (publicationControlsQuery.data ?? []).map((row) => [row.showId, row] as const),
      ),
    [publicationControlsQuery.data],
  );
  const publicCount = orderedShows.filter((show) => show.published && hasAnyPublicInformation(resolveShowPublication(show))).length;
  const resultCount = orderedShows.filter((show) => show.published && resolveShowPublication(show).results).length;

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["shows"] }),
      qc.invalidateQueries({ queryKey: ["edition"] }),
      qc.invalidateQueries({ queryKey: ["editions"] }),
      qc.invalidateQueries({ queryKey: ["studio2-show-publication-controls"] }),
    ]);
  }

  function openShow(show: Show) {
    const control = publicationControlByShow.get(show.id);
    setScheduleAt("");
    setDraft({
      show,
      config: control?.state === "scheduled" ? control.frozenConfig : resolveShowPublication(show),
    });
  }

  function presetFor(config: PublicationConfig) {
    return PUBLICATION_PRESETS.find((preset) => PUBLICATION_KEYS.every((key) => preset.config[key] === config[key]))?.id ?? null;
  }

  function setPreset(id: PublicationPresetId) {
    setDraft((current) => current ? { ...current, config: applyPublicationPreset(id) } : current);
  }

  function toggleLayer(key: PublicationKey) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        config: normalisePublicationDependencies({ ...current.config, [key]: !current.config[key] }),
      };
    });
  }

  function newlyExposesOutcome(show: Show, next: PublicationConfig) {
    const current = resolveShowPublication(show);
    return OUTCOME_KEYS.some(
      (key) => next[key] && (!show.published || !current[key]),
    );
  }

  function needsResultConfirmation(show: Show, next: PublicationConfig) {
    return newlyExposesOutcome(show, next);
  }

  function canReleaseResults(show: Show) {
    return isStudio2ResultReleaseReady(resultOperationByShow.get(show.id));
  }

  async function reviewChange(
    show: Show,
    config: PublicationConfig,
    targetState: ShowPublicationState,
    scheduledFor: string | null = null,
  ) {
    setBusy(true);
    try {
      const normalized = normalisePublicationDependencies(config);
      if (
        targetState !== "hidden" &&
        newlyExposesOutcome(show, normalized) &&
        !canReleaseResults(show)
      ) {
        throw new Error(
          "New outcome publication is blocked. Finish result review, lock and reveal readiness first.",
        );
      }

      const preview = await previewShowPublicationChange({
        showId: show.id,
        targetState,
        config: normalized,
        scheduledFor,
      });
      if (preview.alreadyApplied) {
        toast.success(`${show.name} publication is already current`);
        setDraft(null);
        await refresh();
        return;
      }

      const operationId = crypto.randomUUID();
      setPublicationPassword("");
      setPendingRelease({
        show,
        preview,
        operationId,
        idempotencyKey: operationId,
        editionId: edition?.id ?? show.edition_id,
      });
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Publication change could not be reviewed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function applyPendingRelease() {
    if (!pendingRelease) return;
    setBusy(true);
    try {
      const scope = validateEditionCommandScope({
        routeEditionId: edition?.id ?? null,
        commandEditionId: pendingRelease.editionId,
        entityEditionId: pendingRelease.show.edition_id,
        capabilityEditionId: null,
      });

      if (!scope.ok) {
        setPendingRelease(null);
        setPublicationPassword("");
        await refresh();
        throw Object.assign(
          new Error(
            `Edition context changed before publication (${scope.mismatches.join(", ")}). Canonical state was refreshed and nothing was applied.`,
          ),
          { status: 409 },
        );
      }

      if (pendingRelease.preview.riskClass === "R3") {
        await reauthenticateShowPublicationR3(publicationPassword);
      }
      const receipt = await applyShowPublicationChange({
        preview: pendingRelease.preview,
        operationId: pendingRelease.operationId,
        idempotencyKey: pendingRelease.idempotencyKey,
      });
      const label =
        receipt.state === "scheduled"
          ? `scheduled for ${receipt.scheduledFor ? new Date(receipt.scheduledFor).toLocaleString() : "later"}`
          : receipt.state === "hidden"
            ? "hidden"
            : receipt.state === "public"
              ? "public"
              : "saved as draft";
      toast.success(`${pendingRelease.show.name} ${label}`);
      setDraft(null);
      setPendingRelease(null);
      setPublicationPassword("");
      setScheduleAt("");
      await refresh();
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Publication settings could not be saved",
      );
    } finally {
      setBusy(false);
    }
  }

  function draftHasUnsavedChanges() {
    if (!draft) return false;
    const current = resolveShowPublication(draft.show);
    return PUBLICATION_KEYS.some((key) => current[key] !== draft.config[key]);
  }

  function requestCloseDraft() {
    if (busy || !draft) return;
    if (draftHasUnsavedChanges()) {
      setDiscardDraftOpen(true);
      return;
    }
    setDraft(null);
    setScheduleAt("");
  }

  function requestSave() {
    if (!draft) return;
    const targetState = hasAnyPublicInformation(draft.config) ? "public" : "hidden";
    void reviewChange(draft.show, draft.config, targetState);
  }

  function requestSchedule() {
    if (!draft || !hasAnyPublicInformation(draft.config) || !scheduleAt) return;
    const scheduled = new Date(scheduleAt);
    if (Number.isNaN(scheduled.getTime())) {
      toast.error("Choose a valid future publication time.");
      return;
    }
    void reviewChange(draft.show, draft.config, "scheduled", scheduled.toISOString());
  }

  async function makePrivate(show: Show) {
    await reviewChange(show, resolveShowPublication(show), "hidden");
  }

  if (loadingEdition || loadingShows || publicationControlsQuery.isLoading) {
    return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading publication controls…</p></AdminCard>;
  }

  if (!edition) {
    return <AdminCard><AdminEmptyState icon={Globe2} title="Edition not found" description="Choose another edition from the organizer workspace." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={editionLabel(edition)}
        title="Publication"
        description="Release each show in stages without changing its underlying entries, votes or results. Visibility is the only thing controlled here."
      />

      <Link to="/admin/$slug" params={{ slug }} className="admin-action-quiet mb-4 inline-flex"><ArrowLeft className="size-4" /> Edition home</Link>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Metric label="Shows" value={orderedShows.length} />
        <Metric label="Public" value={publicCount} />
        <Metric label="Results live" value={resultCount} />
      </div>

      <AdminCard strong className="mb-4">
        <AdminCardHeader eyebrow="Release model" title="Public information is staged" description="Entries and outcomes are separate. Result layers cannot become public until the current calculation has been reviewed, locked and marked reveal ready in Results operations." />
        <div className="grid gap-2 sm:grid-cols-3">
          <GuideStep title="1 · Entries" text="Countries, artists, songs and running order." />
          <GuideStep title="2 · Outcomes" text="Qualifiers and overall results when the show is ready." />
          <GuideStep title="3 · Voting detail" text="Jury/televote totals and detailed ballots only when intentionally released." />
        </div>
      </AdminCard>

      {!orderedShows.length ? (
        <AdminCard><AdminEmptyState icon={Globe2} title="No shows to publish" description="Create the contest stages first. Publication is configured separately for each show." action={<Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">Create show</Link>} /></AdminCard>
      ) : (
        <div className="space-y-3">
          {orderedShows.map((show) => {
            const control = publicationControlByShow.get(show.id);
            const config =
              control?.state === "scheduled" ? control.frozenConfig : resolveShowPublication(show);
            const resultOperation = resultOperationByShow.get(show.id);
            const resultReleaseReady = canReleaseResults(show);
            const isPublic = control?.state === "public" || (
              !control && show.published && hasAnyPublicInformation(config)
            );
            const preset = presetFor(config);
            const visibleLayers = PUBLICATION_KEYS.filter((key) => config[key]).length;
            return (
              <AdminCard key={show.id} className="!p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-muted-foreground">
                    {isPublic ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-bold text-foreground">{show.name}</h2>
                      <AdminStatus
                        tone={
                          control?.state === "scheduled"
                            ? "attention"
                            : isPublic
                              ? config.results
                                ? "ready"
                                : "info"
                              : "neutral"
                        }
                      >
                        {control?.state === "scheduled"
                          ? `Scheduled · ${control.scheduledFor ? new Date(control.scheduledFor).toLocaleString() : "pending"}`
                          : isPublic
                            ? config.results
                              ? "Results live"
                              : "Public"
                            : control?.state === "hidden"
                              ? "Hidden"
                              : "Draft"}
                      </AdminStatus>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{preset ? PUBLICATION_PRESETS.find((item) => item.id === preset)?.name : "Custom release"} · {visibleLayers}/10 layers visible</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <AdminStatus tone={resultOperation?.calculationVersion ? "info" : "neutral"}>
                        {resultOperation?.calculationVersion ? `Results v${resultOperation.calculationVersion}` : "No calculated results"}
                      </AdminStatus>
                      <AdminStatus tone={resultOperation && resultOperation.reviewedVersion === resultOperation.calculationVersion && resultOperation.calculationVersion > 0 ? "ready" : "neutral"}>
                        Reviewed
                      </AdminStatus>
                      <AdminStatus tone={resultOperation && resultOperation.lockedVersion === resultOperation.calculationVersion && resultOperation.calculationVersion > 0 ? "ready" : "neutral"}>
                        Locked
                      </AdminStatus>
                      <AdminStatus tone={resultReleaseReady ? "ready" : "attention"}>
                        {resultReleaseReady ? "Release ready" : "Not release ready"}
                      </AdminStatus>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => openShow(show)} className="admin-action-primary w-full"><Settings2 className="size-4" /> Manage release</button>
                  {isPublic ? <button type="button" disabled={busy} onClick={() => void makePrivate(show)} className="admin-action-secondary w-full"><LockKeyhole className="size-4" /> Make private</button> : <button type="button" onClick={() => openShow(show)} className="admin-action-secondary w-full"><Eye className="size-4" /> Choose reveal</button>}
                </div>
              </AdminCard>
            );
          })}
        </div>
      )}

      <AdminSheet
        open={!!draft}
        onClose={requestCloseDraft}
        title={draft ? `${draft.show.name} publication` : "Publication"}
        description="Choose a safe release stage or fine-tune individual public layers. Dependencies are added automatically."
      >
        {draft ? (
          <div className="space-y-5">
            <section>
              <p className="admin-section-label mb-2">Release stage</p>
              <div className="space-y-2">
                {PUBLICATION_PRESETS.map((preset) => {
                  const active = presetFor(draft.config) === preset.id;
                  const risky = OUTCOME_KEYS.some((key) => preset.config[key]);
                  const blocked =
                    newlyExposesOutcome(draft.show, preset.config) &&
                    !canReleaseResults(draft.show);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setPreset(preset.id)}
                      disabled={blocked}
                      className={`admin-action-row w-full text-left disabled:cursor-not-allowed disabled:opacity-45 ${active ? "!border-sky-200/25 !bg-sky-200/[0.07]" : ""}`}
                    >
                      <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-semibold text-foreground">{preset.name}{risky ? <AdminStatus tone="attention">Outcome release</AdminStatus> : null}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{preset.description}</span></span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <p className="admin-section-label mb-2">Fine tune</p>
              <div className="divide-y divide-white/[0.07] rounded-xl border border-white/[0.08]">
                {PUBLICATION_KEYS.map((key) => (
                  <label key={key} className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{PUBLICATION_LABELS[key].title}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{PUBLICATION_LABELS[key].description}</span></span>
                    <input
                      type="checkbox"
                      checked={draft.config[key]}
                      disabled={OUTCOME_KEYS.includes(key) && !draft.config[key] && !canReleaseResults(draft.show)}
                      onChange={() => toggleLayer(key)}
                      className="size-5 shrink-0 accent-sky-200 disabled:opacity-40"
                    />
                  </label>
                ))}
              </div>
            </section>

            {hasAnyPublicInformation(draft.config) ? (
              <label className="block">
                <span className="admin-section-label">Schedule exact frozen release</span>
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(event) => setScheduleAt(event.target.value)}
                  className="admin-input mt-2"
                />
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Solaris freezes this configuration, then revalidates show version, result version,
                  permission, integrity blockers and platform mode when the time arrives.
                </span>
              </label>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
              <button
                type="button"
                disabled={busy}
                onClick={requestCloseDraft}
                className="admin-action-secondary"
              >
                Close
              </button>
              {hasAnyPublicInformation(draft.config) ? (
                <button
                  type="button"
                  disabled={busy || !scheduleAt}
                  onClick={requestSchedule}
                  className="admin-action-secondary w-full"
                >
                  Schedule
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={requestSave}
                className="admin-action-primary w-full"
              >
                {busy
                  ? "Checking…"
                  : hasAnyPublicInformation(draft.config)
                    ? "Review publication"
                    : "Review hide"}
              </button>
            </div>
          </div>
        ) : null}
      </AdminSheet>

      <AdminConfirmSheet
        open={discardDraftOpen}
        onClose={() => !busy && setDiscardDraftOpen(false)}
        onConfirm={() => {
          setDiscardDraftOpen(false);
          setDraft(null);
        }}
        title="Discard unsaved publication changes?"
        description={<>Your unsaved release choices will be discarded. The currently published state will not change.</>}
        confirmLabel="Discard changes"
        busy={busy}
      />

      <AdminConfirmSheet
        open={!!pendingRelease}
        onClose={() => {
          if (!busy) {
            setPendingRelease(null);
            setPublicationPassword("");
          }
        }}
        onConfirm={applyPendingRelease}
        title={
          pendingRelease
            ? `${publicationActionLabel(pendingRelease.preview.targetState)} ${pendingRelease.show.name}?`
            : "Confirm publication change"
        }
        description={
          pendingRelease ? (
            <div className="space-y-3">
              <p>
                <strong className="text-foreground">
                  {publicationStateLabel(pendingRelease.preview.currentState)} →{" "}
                  {publicationStateLabel(pendingRelease.preview.targetState)}
                </strong>{" "}
                is a {pendingRelease.preview.riskClass} operation against publication version{" "}
                {pendingRelease.preview.expectedVersion}.
              </p>
              {pendingRelease.preview.scheduledFor ? (
                <p>
                  Frozen execution time:{" "}
                  <strong className="text-foreground">
                    {new Date(pendingRelease.preview.scheduledFor).toLocaleString()}
                  </strong>
                </p>
              ) : null}
              <p>
                Visible layers:{" "}
                <strong className="text-foreground">
                  {PUBLICATION_KEYS.filter((key) => pendingRelease.preview.config[key]).length}/10
                </strong>
                {pendingRelease.preview.hasOutcomes ? " · includes contest outcomes" : ""}
              </p>
              {pendingRelease.preview.riskClass === "R3" ? (
                <label className="block">
                  <span className="text-xs font-semibold text-foreground">
                    Fresh authentication required
                  </span>
                  <input
                    type="password"
                    value={publicationPassword}
                    onChange={(event) => setPublicationPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Current Solaris password"
                    className="admin-input mt-2"
                  />
                </label>
              ) : null}
            </div>
          ) : (
            "Review the publication impact before continuing."
          )
        }
        confirmLabel={pendingRelease ? publicationActionLabel(pendingRelease.preview.targetState) : "Apply"}
        confirmationText={pendingRelease?.show.name}
        confirmationHint={pendingRelease ? `Type ${pendingRelease.show.name} to confirm` : undefined}
        busy={busy}
        confirmDisabled={
          pendingRelease?.preview.riskClass === "R3" && !publicationPassword
        }
        danger={pendingRelease?.preview.riskClass === "R3"}
      />
    </AdminPage>
  );
}

function publicationStateLabel(state: ShowPublicationState) {
  switch (state) {
    case "draft":
      return "Draft";
    case "scheduled":
      return "Scheduled";
    case "public":
      return "Public";
    case "hidden":
      return "Hidden";
  }
}

function publicationActionLabel(state: ShowPublicationState) {
  switch (state) {
    case "draft":
      return "Save draft";
    case "scheduled":
      return "Schedule publication";
    case "public":
      return "Publish";
    case "hidden":
      return "Hide";
  }
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}

function GuideStep({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-sm font-semibold text-foreground">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p></div>;
}
