import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  History,
  Plus,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { useAuthenticatedUser } from "@/components/auth/AuthenticatedUserContext";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  AuditTimeline,
  MetricStrip,
  WorkQueue,
  WorkspaceActionBar,
  WorkspaceHeader,
} from "@/components/admin/AdminWorkspacePrimitives";
import {
  useAdminAudit,
  useAdminDeadlines,
  useCreateAdminDeadline,
  useToggleAdminDeadline,
} from "@/lib/admin-ops";
import { useAdminOperationalSchedule } from "@/lib/admin-schedule";
import { editionLabel, useEditions } from "@/lib/data";
import {
  applyPlatformModeChange,
  loadPlatformOperationalSnapshot,
  previewPlatformModeChange,
  reauthenticatePlatformR3,
  type PlatformModeChangePreview,
  type PlatformOperationalMode,
} from "@/lib/platform-operational-mode";
import {
  runPlatformExitPreflight,
  type PlatformExitPreflightReceipt,
} from "@/lib/platform-exit-preflight.functions";

export const Route = createFileRoute("/_authenticated/admin/system")({
  head: () => ({
    meta: [
      { title: "Schedule & system — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminSystemPage,
});

type PlatformModeForm = {
  targetMode: "" | PlatformOperationalMode;
  reason: string;
  affectedServices: string;
  message: string;
  incidentReference: string;
};

type PendingPlatformModeChange = {
  actorId: string;
  preview: PlatformModeChangePreview;
  form: PlatformModeForm;
  operationId: string;
  idempotencyKey: string;
  exitPreflight: PlatformExitPreflightReceipt | null;
};

function AdminSystemPage() {
  const { editionId, setEditionContext } = useAdminContext();
  const actorId = useAuthenticatedUser().id;
  const liveActorRef = useRef(actorId);
  liveActorRef.current = actorId;
  const [explicitChoice, setExplicitChoice] = useState<{ actorId: string; editionId: string } | null>(null);
  const explicitEditionId = explicitChoice?.actorId === actorId ? explicitChoice.editionId : "";
  const verifiedChoiceId = explicitEditionId && editionId === explicitEditionId ? explicitEditionId : "";
  const queryClient = useQueryClient();
  const editionsQuery = useEditions();
  const editions = editionsQuery.data ?? [];
  const editionsLoading = editionsQuery.isLoading || editionsQuery.isFetching;
  // Cached public edition rows are not verified on a failed or in-flight refresh.
  // Do not read private schedule/reminder projections until context is current.
  const editionsReady =
    editionsQuery.isSuccess && !editionsQuery.error && !editionsQuery.isFetching;
  const selectedEdition = useMemo(
        () => (editionsReady && verifiedChoiceId ? editions.find((edition) => edition.id === verifiedChoiceId) ?? null : null),
    [editions, verifiedChoiceId, editionsReady],
  );
  const editionContextMessage = editionsQuery.error
    ? "Solaris could not verify the selected Organizer edition. Edition-scoped schedule and reminders are unavailable until the lookup succeeds."
    : editionsLoading
      ? "Resolving the Organizer edition before loading edition-scoped schedule data."
      : !verifiedChoiceId
        ? "Explicitly choose an Organizer edition below before viewing workflow dates or custom reminders. Solaris will not guess a newest edition."
        : "The selected Organizer edition could not be resolved. Choose a valid edition before viewing or changing edition-scoped schedule data.";
  const editionRetryAction = editionsQuery.error ? (
    <button
      type="button"
      className="admin-action-primary"
      onClick={() => void editionsQuery.refetch()}
      disabled={editionsQuery.isFetching}
    >
      Retry edition lookup
    </button>
  ) : undefined;

  const {
    data: deadlines = [],
    isError: deadlinesError,
    refetch: refetchDeadlines,
  } = useAdminDeadlines(selectedEdition?.id ?? null);
  const {
    data: operationalSchedule = [],
    isLoading: scheduleLoading,
    isError: scheduleError,
    refetch: refetchSchedule,
  } = useAdminOperationalSchedule(selectedEdition?.id ?? null, selectedEdition?.slug ?? null);
  const {
    data: audit = [],
    isLoading: auditLoading,
    isError: auditError,
    error: auditReadError,
    refetch: refetchAudit,
  } = useAdminAudit(80);
  const createDeadline = useCreateAdminDeadline();
  const toggleDeadline = useToggleAdminDeadline();

  const platformQuery = useQuery({
    queryKey: ["platform-operational-state", actorId],
    queryFn: loadPlatformOperationalSnapshot,
    enabled: Boolean(actorId),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const verifiedPlatform =
    actorId && platformQuery.isSuccess && !platformQuery.isFetching && !platformQuery.error
      ? platformQuery.data
      : null;
  const livePlatformVerifiedRef = useRef(Boolean(verifiedPlatform));
  livePlatformVerifiedRef.current = Boolean(verifiedPlatform);
  const previewPlatformMode = useMutation({
    mutationFn: previewPlatformModeChange,
  });
  const runExitPreflight = useServerFn(runPlatformExitPreflight);
  const exitPreflight = useMutation({
    mutationFn: async (
      targetMode: PlatformOperationalMode,
    ): Promise<PlatformExitPreflightReceipt> =>
      (await runExitPreflight({ data: { targetMode } })) as PlatformExitPreflightReceipt,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createEditionId, setCreateEditionId] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: "",
    due_at: "",
    notes: "",
  });
  const [modeForm, setModeForm] = useState<PlatformModeForm>({
    targetMode: "",
    reason: "",
    affectedServices: "",
    message: "",
    incidentReference: "",
  });
  const [pendingModeChange, setPendingModeChange] = useState<PendingPlatformModeChange | null>(
    null,
  );
  const [platformPassword, setPlatformPassword] = useState("");

  // Account changes invalidate all local platform review and password state.
  // The server still owns permission/version checks at operation time.
  useEffect(() => {
    setPendingModeChange(null);
    setPlatformPassword("");
    setModeForm({
      targetMode: "",
      reason: "",
      affectedServices: "",
      message: "",
      incidentReference: "",
    });
  }, [actorId]);

  // Keep an unfinished reminder draft while the edition list revalidates.
  // Only a real scope switch or a confirmed missing edition discards the draft.
  // A background refresh/error must never silently erase typed Organizer work.
  useEffect(() => {
    if (
      createOpen &&
      createEditionId &&
      (editionId !== createEditionId ||
        verifiedChoiceId !== createEditionId ||
        (editionsReady && selectedEdition?.id !== createEditionId))
    ) {
      setCreateOpen(false);
      setCreateEditionId(null);
      setForm({ label: "", due_at: "", notes: "" });
    }
  }, [createOpen, createEditionId, editionId, verifiedChoiceId, editionsReady, selectedEdition?.id]);

  const applyPlatformMode = useMutation({
    mutationFn: async ({
      pending,
      password,
    }: {
      pending: PendingPlatformModeChange;
      password: string;
    }) => {
      const stillAuthorizedReview = () =>
        Boolean(pending.actorId) &&
        pending.actorId === liveActorRef.current &&
        livePlatformVerifiedRef.current;
      if (!stillAuthorizedReview()) {
        throw new Error("Platform review expired after an account or state verification change. Review the operation again.");
      }
      if (pending.preview.riskClass === "R3") {
        await reauthenticatePlatformR3(password);
      }
      // Reauthentication is asynchronous: an account may have changed while
      // the password step was waiting. Never carry its approval forward.
      if (!stillAuthorizedReview()) {
        throw new Error("Platform review expired after an account or state verification change. Review the operation again.");
      }
      return applyPlatformModeChange({
        preview: pending.preview,
        reason: pending.form.reason,
        affectedServices: splitServices(pending.form.affectedServices),
        message: pending.form.message.trim() || null,
        incidentReference: pending.form.incidentReference.trim() || null,
        operationId: pending.operationId,
        idempotencyKey: pending.idempotencyKey,
        exitPreflightId: pending.exitPreflight?.id ?? null,
      });
    },
    onSuccess: async (_, variables) => {
      if (variables.pending.actorId === liveActorRef.current) {
        setPendingModeChange(null);
        setPlatformPassword("");
        setModeForm({
        targetMode: "",
        reason: "",
        affectedServices: "",
        message: "",
          incidentReference: "",
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["platform-operational-state"] });
    },
  });

  const openReminders = deadlines.filter((item) => !item.completed_at);
  const completedReminders = deadlines.filter((item) => Boolean(item.completed_at));
  const overdueReminders = openReminders.filter(
    (item) => new Date(item.due_at).getTime() < Date.now(),
  );
  const workflowSchedule = operationalSchedule.filter((item) => item.source !== "reminder");
  const relevantSchedule = workflowSchedule.filter((item) => {
    if (isEditionCalendarItem(item)) {
      // The canonical edition event_date is a calendar DATE, not an event
      // start time. Do not use the schedule adapter's placeholder noon as
      // an instant for this list's past-date cutoff.
      const calendarDate = parseEditionCalendarDate(item.at);
      if (!calendarDate) return false;
      const yesterday = new Date();
      yesterday.setHours(0, 0, 0, 0);
      yesterday.setDate(yesterday.getDate() - 1);
      return calendarDate.getTime() >= yesterday.getTime();
    }
    return new Date(item.at).getTime() >= Date.now() - 24 * 60 * 60 * 1000;
  });

  const allowedPlatformModes = verifiedPlatform ? nextPlatformModes(verifiedPlatform.mode) : [];

  const reviewPlatformChange = async () => {
    if (!actorId || !verifiedPlatform || !modeForm.targetMode || modeForm.reason.trim().length < 5) return;
    const reviewedActorId = actorId;
    const preview = await previewPlatformMode.mutateAsync({
      targetMode: modeForm.targetMode,
      affectedServices: splitServices(modeForm.affectedServices),
      message: modeForm.message.trim() || null,
      incidentReference: modeForm.incidentReference.trim() || null,
    });
    if (reviewedActorId !== liveActorRef.current || !livePlatformVerifiedRef.current) return;
    const preflight = requiresExitPreflight(preview.currentMode, preview.targetMode)
      ? await exitPreflight.mutateAsync(preview.targetMode)
      : null;
    if (reviewedActorId !== liveActorRef.current || !livePlatformVerifiedRef.current) return;
    const operationId = crypto.randomUUID();
    setPlatformPassword("");
    setPendingModeChange({
      actorId: reviewedActorId,
      preview,
      form: { ...modeForm, reason: modeForm.reason.trim() },
      operationId,
      idempotencyKey: operationId,
      exitPreflight: preflight,
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedEdition || createEditionId !== selectedEdition.id || !form.label.trim() || !form.due_at) return;

    createDeadline.mutate(
      {
        edition_id: selectedEdition.id,
        show_id: null,
        kind: "other",
        label: form.label.trim(),
        due_at: new Date(form.due_at).toISOString(),
        notes: form.notes.trim() || null,
      },
      {
        onSuccess: () => {
          setForm({ label: "", due_at: "", notes: "" });
          setCreateEditionId(null);
          setCreateOpen(false);
        },
      },
    );
  };

  return (
    <AdminPage>
      <WorkspaceHeader
        eyebrow="Administration · System"
        title="Schedule & audit"
        description={
          selectedEdition
            ? `Operational dates for ${editionLabel(selectedEdition)} come from the workflows that actually control them. Custom reminders are kept separate.`
            : "Platform controls remain available globally. Edition-scoped schedule data requires an explicit Organizer edition."
        }
      />

      <AdminCard className="mb-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Choose the edition for this System review
          </span>
          <select
            className="admin-input"
            value={verifiedChoiceId}
            disabled={!editionsReady}
            onChange={(event) => {
              const choice = editions.find((edition) => edition.id === event.target.value);
              setExplicitChoice(choice ? { actorId, editionId: choice.id } : null);
              if (choice) {
                setEditionContext({ id: choice.id, slug: choice.slug, label: editionLabel(choice) });
              }
            }}
          >
            <option value="">Select an exact edition…</option>
            {(editionsReady ? editions : []).map((edition) => (
              <option key={edition.id} value={edition.id}>{editionLabel(edition)}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            The Organizer navigation may show a default edition, but scoped schedule and reminders require a deliberate selection here. The global platform mode remains separately governed.
          </span>
        </label>
      </AdminCard>

      {selectedEdition && !deadlinesError && !scheduleError ? (
        <MetricStrip className="grid-cols-3 sm:grid-cols-3 xl:grid-cols-3">
          <Metric label="Workflow dates" value={relevantSchedule.length} />
          <Metric label="Custom reminders" value={openReminders.length} />
          <Metric
            label="Overdue reminders"
            value={overdueReminders.length}
            attention={overdueReminders.length > 0}
          />
        </MetricStrip>
      ) : (
        <AdminCard>
          <AdminEmptyState
            icon={CalendarClock}
            title={
              editionsQuery.error
                ? "Edition lookup failed"
                : deadlinesError || scheduleError
                  ? "Operational metrics unavailable"
                  : editionsLoading
                    ? "Resolving Organizer edition"
                    : "Organizer edition required"
            }
            description={
              deadlinesError || scheduleError
                ? "Solaris could not verify every schedule or reminder source, so it will not show misleading zero totals."
                : editionContextMessage
            }
            action={editionRetryAction}
          />
        </AdminCard>
      )}

      <AdminCard strong>
        <AdminCardHeader
          eyebrow="Control plane"
          title="Platform operational mode"
          description="Normal, Degraded, Read-only and Maintenance are canonical server states. The emergency Worker maintenance circuit breaker stays separate so it still works if Supabase itself is unavailable."
          action={
            verifiedPlatform ? (
              <AdminStatus tone={platformTone(verifiedPlatform.mode)}>
                {platformLabel(verifiedPlatform.mode)} · v{verifiedPlatform.version}
              </AdminStatus>
            ) : null
          }
        />

        {platformQuery.isPending || platformQuery.isFetching ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Verifying canonical platform state…
          </p>
        ) : platformQuery.error ? (
          <AdminEmptyState
            icon={ShieldAlert}
            title="Platform state could not be verified"
            description={errorText(platformQuery.error)}
            action={
              <button
                type="button"
                className="admin-action-primary"
                onClick={() => void platformQuery.refetch()}
              >
                Retry
              </button>
            }
          />
        ) : verifiedPlatform ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SystemFact label="Current mode" value={platformLabel(verifiedPlatform.mode)} />
              <SystemFact label="State version" value={`v${verifiedPlatform.version}`} />
              <SystemFact
                label="Changed"
                value={new Date(verifiedPlatform.changedAt).toLocaleString()}
              />
              <SystemFact
                label="Affected services"
                value={
                  verifiedPlatform.affectedServices.length
                    ? verifiedPlatform.affectedServices.join(", ")
                    : "None declared"
                }
              />
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <p className="text-xs font-semibold text-foreground">Current reason</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {verifiedPlatform.reason}
              </p>
              {verifiedPlatform.message ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Public/operator message: {verifiedPlatform.message}
                </p>
              ) : null}
              {verifiedPlatform.incidentReference ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Incident: {verifiedPlatform.incidentReference}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <label className="block">
                <span className="admin-section-label">Next mode</span>
                <select
                  value={modeForm.targetMode}
                  onChange={(event) =>
                    setModeForm((value) => ({
                      ...value,
                      targetMode: event.target.value as "" | PlatformOperationalMode,
                    }))
                  }
                  className="admin-input mt-2"
                >
                  <option value="">Choose a legal transition</option>
                  {allowedPlatformModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {platformLabel(mode)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="admin-section-label">Reason</span>
                <input
                  value={modeForm.reason}
                  onChange={(event) =>
                    setModeForm((value) => ({ ...value, reason: event.target.value }))
                  }
                  placeholder="Why this mode is required"
                  className="admin-input mt-2"
                />
              </label>

              <label className="block">
                <span className="admin-section-label">Affected services</span>
                <input
                  value={modeForm.affectedServices}
                  onChange={(event) =>
                    setModeForm((value) => ({
                      ...value,
                      affectedServices: event.target.value,
                    }))
                  }
                  placeholder="push, voting, media"
                  className="admin-input mt-2"
                />
              </label>

              <label className="block">
                <span className="admin-section-label">Incident reference</span>
                <input
                  value={modeForm.incidentReference}
                  onChange={(event) =>
                    setModeForm((value) => ({
                      ...value,
                      incidentReference: event.target.value,
                    }))
                  }
                  placeholder="Optional incident ID"
                  className="admin-input mt-2"
                />
              </label>
            </div>

            <label className="block">
              <span className="admin-section-label">Operator / public message</span>
              <textarea
                value={modeForm.message}
                onChange={(event) =>
                  setModeForm((value) => ({ ...value, message: event.target.value }))
                }
                placeholder="Optional explanatory message"
                className="admin-input mt-2 min-h-20 resize-y py-2"
              />
            </label>

            {verifiedPlatform.mode === "maintenance" ? (
              <p className="rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-3 text-xs leading-5 text-amber-50/85">
                Maintenance cannot jump directly to Normal. Recovery must move to Read-only first,
                verify the system, then continue through Degraded before returning to Normal.
              </p>
            ) : null}

            {previewPlatformMode.error ? (
              <p className="text-xs text-rose-200">{errorText(previewPlatformMode.error)}</p>
            ) : null}
            {exitPreflight.error ? (
              <p className="text-xs text-rose-200">{errorText(exitPreflight.error)}</p>
            ) : null}
            {applyPlatformMode.error ? (
              <p className="text-xs text-rose-200">{errorText(applyPlatformMode.error)}</p>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                className="admin-action-primary"
                disabled={
                  previewPlatformMode.isPending ||
                  exitPreflight.isPending ||
                  !modeForm.targetMode ||
                  modeForm.reason.trim().length < 5
                }
                onClick={() => void reviewPlatformChange()}
              >
                {previewPlatformMode.isPending || exitPreflight.isPending
                  ? "Running checks…"
                  : "Review mode change"}
              </button>
            </div>
          </div>
        ) : null}
      </AdminCard>

      <AdminCard>
        <AdminCardHeader
          eyebrow={selectedEdition ? editionLabel(selectedEdition) : "Edition context required"}
          title="Operational schedule"
          description="These dates come from the source workflow. Edit them there, and every Solaris surface sees the same date."
        />

        {!selectedEdition ? (
          <AdminEmptyState
            icon={CalendarClock}
            title={editionsLoading ? "Resolving Organizer edition" : "Select an Organizer edition"}
            description={editionContextMessage}
            action={editionRetryAction}
          />
        ) : scheduleLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Verifying workflow dates…
          </p>
        ) : scheduleError ? (
          <AdminEmptyState
            icon={CalendarClock}
            title="Schedule could not be verified"
            description="Solaris will not substitute custom reminders or guessed dates when a workflow source cannot be read."
            action={
              <button
                type="button"
                onClick={() => void refetchSchedule()}
                className="admin-action-primary"
              >
                Retry
              </button>
            }
          />
        ) : relevantSchedule.length ? (
          <div className="divide-y divide-white/[0.07]">
            {relevantSchedule.map((item) => {
              const calendarDateOnly = isEditionCalendarItem(item);
              const past = !calendarDateOnly && new Date(item.at).getTime() < Date.now();
              const displayedDate = calendarDateOnly
                ? parseEditionCalendarDate(item.at)?.toLocaleDateString() ?? "Date unavailable"
                : new Date(item.at).toLocaleString();
              const content = (
                <>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-sky-200/12 bg-sky-200/[0.045] text-sky-100">
                    <Clock3 className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {displayedDate} · {item.detail}
                      {!item.href ? " · Select an edition first" : ""}
                    </span>
                  </span>
                  <AdminStatus tone={calendarDateOnly || past ? "neutral" : "info"}>
                    {calendarDateOnly ? "Calendar date" : past ? "Passed" : "Scheduled"}
                  </AdminStatus>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                </>
              );

              return item.href ? (
                <Link key={item.id} to={item.href as any} className="admin-list-row group">
                  {content}
                </Link>
              ) : (
                <div
                  key={item.id}
                  aria-disabled="true"
                  title="Select an edition first"
                  className="admin-list-row group cursor-not-allowed opacity-55"
                >
                  {content}
                </div>
              );
            })}
          </div>
        ) : (
          <AdminEmptyState
            icon={CalendarClock}
            title="No workflow dates scheduled"
            description="Set dates in Confirmations, entry publication, communications or the edition itself. They will appear here automatically."
          />
        )}
      </AdminCard>

      <AdminCard>
        <AdminCardHeader
          eyebrow="Organizer-only"
          title="Custom reminders"
          description="A custom reminder never controls a submission round, vote, publication or show. Use it only for work that has no owning Solaris workflow."
          action={
            <button
              type="button"
              onClick={() => {
                setCreateEditionId(selectedEdition?.id ?? null);
                setCreateOpen(true);
              }}
              disabled={!selectedEdition || deadlinesError}
              className="admin-action-secondary"
            >
              <Plus className="size-4" /> Add reminder
            </button>
          }
        />

        {!selectedEdition ? (
          <AdminEmptyState
            icon={CalendarClock}
            title={editionsLoading ? "Resolving Organizer edition" : "Select an Organizer edition"}
            description={editionContextMessage}
            action={editionRetryAction}
          />
        ) : deadlinesError ? (
          <AdminEmptyState
            icon={CalendarClock}
            title="Custom reminders could not be verified"
            description="The reminder list is unavailable until Solaris can reread the selected Organizer edition. Existing records are not treated as empty."
            action={
              <button
                type="button"
                className="admin-action-primary"
                onClick={() => void refetchDeadlines()}
              >
                Retry reminders
              </button>
            }
          />
        ) : !deadlines.length ? (
          <AdminEmptyState
            icon={CalendarClock}
            title="No custom reminders"
            description="Good. Workflow-owned dates should stay in their workflows rather than being duplicated here."
          />
        ) : (
          <WorkQueue>
            {[...deadlines]
              .sort((a, b) => {
                if (Boolean(a.completed_at) !== Boolean(b.completed_at))
                  return a.completed_at ? 1 : -1;
                return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
              })
              .map((item) => {
                const complete = Boolean(item.completed_at);
                const overdue = !complete && new Date(item.due_at).getTime() < Date.now();
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleDeadline.mutate({ id: item.id, complete: !complete })}
                    disabled={toggleDeadline.isPending}
                    className="admin-list-row w-full text-left disabled:opacity-60"
                  >
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-xl border ${
                        complete
                          ? "border-emerald-200/15 bg-emerald-200/[0.06] text-emerald-100"
                          : overdue
                            ? "border-rose-200/15 bg-rose-200/[0.06] text-rose-100"
                            : "border-amber-200/15 bg-amber-200/[0.05] text-amber-100"
                      }`}
                    >
                      {complete ? (
                        <CheckCircle2 className="size-4" />
                      ) : (
                        <Clock3 className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">
                        {item.label}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {new Date(item.due_at).toLocaleString()}
                      </span>
                      {item.notes ? (
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                          {item.notes}
                        </span>
                      ) : null}
                    </span>
                    <AdminStatus tone={complete ? "ready" : overdue ? "blocked" : "attention"}>
                      {complete ? "Done" : overdue ? "Overdue" : "Reminder"}
                    </AdminStatus>
                  </button>
                );
              })}
          </WorkQueue>
        )}
      </AdminCard>

      <AdminCard>
        <AdminCardHeader
          eyebrow="System history"
          title="Recent organizer changes"
          description="Read-only history of significant changes across contest and country data."
        />

        {auditLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Verifying Organizer audit history…
          </p>
        ) : auditError ? (
          <AdminEmptyState
            icon={History}
            title="Organizer audit history unavailable"
            description={
              auditReadError instanceof Error
                ? auditReadError.message
                : "Solaris could not verify the audit history. An unsuccessful read is not an empty history."
            }
            action={
              <button
                type="button"
                className="admin-action-primary"
                onClick={() => void refetchAudit()}
              >
                Retry audit history
              </button>
            }
          />
        ) : !audit.length ? (
          <AdminEmptyState
            icon={History}
            title="No audit rows yet"
            description="Important organizer changes will appear here when available."
          />
        ) : (
          <AuditTimeline>
            {audit.map((row) => (
              <li key={row.id} className="relative list-none py-3 first:pt-0 last:pb-0">
                <span
                  className="absolute -left-[1.18rem] top-5 size-2 rounded-full bg-sky-200/65"
                  aria-hidden="true"
                />
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-foreground">
                    <History className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {humanize(row.action)}
                      </p>
                      <AdminStatus tone="neutral">{humanize(row.table_name)}</AdminStatus>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </p>
                    {row.record_id ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                          Technical record
                        </summary>
                        <p className="mt-1 break-all text-xs leading-relaxed text-muted-foreground">
                          {row.record_id}
                        </p>
                      </details>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </AuditTimeline>
        )}
      </AdminCard>

      <AdminConfirmSheet
        open={Boolean(pendingModeChange?.actorId === actorId && verifiedPlatform)}
        onClose={() => {
          if (!applyPlatformMode.isPending) {
            setPendingModeChange(null);
            setPlatformPassword("");
          }
        }}
        onConfirm={async () => {
          if (!pendingModeChange || pendingModeChange.actorId !== actorId || !verifiedPlatform) return;
          await applyPlatformMode.mutateAsync({
            pending: pendingModeChange,
            password: platformPassword,
          });
        }}
        title={
          pendingModeChange
            ? `Move Solaris to ${platformLabel(pendingModeChange.preview.targetMode)}?`
            : "Confirm platform mode change"
        }
        description={
          pendingModeChange ? (
            <div className="space-y-3">
              <p>
                <strong className="text-foreground">
                  {platformLabel(pendingModeChange.preview.currentMode)} →{" "}
                  {platformLabel(pendingModeChange.preview.targetMode)}
                </strong>{" "}
                is a {pendingModeChange.preview.riskClass} operation against platform state version{" "}
                {pendingModeChange.preview.expectedVersion}.
              </p>
              <p>{pendingModeChange.preview.writePolicy}</p>
              <p>
                Reason: <strong className="text-foreground">{pendingModeChange.form.reason}</strong>
              </p>
              {pendingModeChange.preview.requiresRecoveryStep ? (
                <p className="text-amber-100">
                  This is a staged recovery transition. Further verification is required before
                  Solaris may return to Normal.
                </p>
              ) : null}
              {pendingModeChange.exitPreflight ? (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-foreground">
                      Maintenance exit preflight
                    </p>
                    <AdminStatus tone={pendingModeChange.exitPreflight.ready ? "ready" : "blocked"}>
                      {pendingModeChange.exitPreflight.ready ? "Critical checks passed" : "Blocked"}
                    </AdminStatus>
                  </div>
                  <div className="mt-3 space-y-2">
                    {Object.entries(pendingModeChange.exitPreflight.checks).map(([key, check]) => (
                      <div
                        key={key}
                        className="flex min-w-0 items-start justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">
                            {preflightCheckLabel(key)}
                          </p>
                          <p className="mt-0.5 leading-5 text-muted-foreground">{check.detail}</p>
                        </div>
                        <AdminStatus
                          tone={check.pass ? "ready" : check.critical ? "blocked" : "attention"}
                        >
                          {check.pass ? "Pass" : check.critical ? "Block" : "Review"}
                        </AdminStatus>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
                    Receipt expires{" "}
                    {new Date(pendingModeChange.exitPreflight.expiresAt).toLocaleString()}.
                    Database-critical checks run again when you apply the transition.
                  </p>
                </div>
              ) : null}
              {pendingModeChange.preview.riskClass === "R3" ? (
                <label className="block">
                  <span className="text-xs font-semibold text-foreground">
                    Fresh authentication required
                  </span>
                  <input
                    type="password"
                    value={platformPassword}
                    onChange={(event) => setPlatformPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Current Solaris password"
                    className="admin-input mt-2"
                  />
                </label>
              ) : null}
            </div>
          ) : (
            "Review the canonical platform transition."
          )
        }
        confirmLabel="Apply platform mode"
        confirmationText={
          pendingModeChange ? platformLabel(pendingModeChange.preview.targetMode) : undefined
        }
        confirmationHint={
          pendingModeChange
            ? `Type ${platformLabel(pendingModeChange.preview.targetMode)} to confirm`
            : undefined
        }
        busy={applyPlatformMode.isPending}
        confirmDisabled={
          (Boolean(pendingModeChange?.preview.riskClass === "R3") && !platformPassword) ||
          Boolean(pendingModeChange?.exitPreflight && !pendingModeChange.exitPreflight.ready)
        }
        danger={pendingModeChange?.preview.riskClass === "R3"}
      />

      <AdminSheet
        open={createOpen}
        onClose={() => {
          if (!createDeadline.isPending) {
            setCreateOpen(false);
            setCreateEditionId(null);
            setForm({ label: "", due_at: "", notes: "" });
          }
        }}
        title="Add custom reminder"
        description={
          selectedEdition
            ? `Add an organizer-only reminder for ${editionLabel(selectedEdition)}. Workflow dates must be changed in their owning workflow.`
            : "Choose an edition before adding a reminder."
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="admin-section-label">Reminder</span>
            <input
              value={form.label}
              onChange={(event) => setForm((value) => ({ ...value, label: event.target.value }))}
              placeholder="Prepare rehearsal assets"
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            />
          </label>

          <label className="block">
            <span className="admin-section-label">Due date & time</span>
            <input
              type="datetime-local"
              value={form.due_at}
              onChange={(event) => setForm((value) => ({ ...value, due_at: event.target.value }))}
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            />
          </label>

          <label className="block">
            <span className="admin-section-label">Organizer note</span>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))}
              placeholder="Optional"
              className="mt-2 min-h-24 w-full resize-y rounded-xl border border-white/[0.1] bg-white/[0.035] p-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            />
          </label>

          <WorkspaceActionBar className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <button
              type="button"
              disabled={createDeadline.isPending}
              onClick={() => {
                setCreateOpen(false);
                setCreateEditionId(null);
                setForm({ label: "", due_at: "", notes: "" });
              }}
              className="admin-action-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                createDeadline.isPending || !selectedEdition || !form.label.trim() || !form.due_at
              }
              className="admin-action-primary w-full"
            >
              {createDeadline.isPending ? "Saving…" : "Add reminder"}
            </button>
          </WorkspaceActionBar>
        </form>
      </AdminSheet>
    </AdminPage>
  );
}

function requiresExitPreflight(from: PlatformOperationalMode, to: PlatformOperationalMode) {
  return (
    (from === "maintenance" && to === "read_only") || (from === "read_only" && to === "degraded")
  );
}

function preflightCheckLabel(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function nextPlatformModes(mode: PlatformOperationalMode): PlatformOperationalMode[] {
  switch (mode) {
    case "normal":
      return ["degraded", "read_only", "maintenance"];
    case "degraded":
      return ["normal", "read_only", "maintenance"];
    case "read_only":
      return ["degraded", "maintenance"];
    case "maintenance":
      return ["read_only"];
  }
}

function platformLabel(mode: PlatformOperationalMode) {
  switch (mode) {
    case "normal":
      return "Normal";
    case "degraded":
      return "Degraded";
    case "read_only":
      return "Read-only";
    case "maintenance":
      return "Maintenance";
  }
}

function platformTone(mode: PlatformOperationalMode): "ready" | "info" | "attention" | "blocked" {
  switch (mode) {
    case "normal":
      return "ready";
    case "degraded":
      return "attention";
    case "read_only":
      return "info";
    case "maintenance":
      return "blocked";
  }
}

/** The edition's event_date is a date-only fact, never a scheduled show start instant. */
function isEditionCalendarItem(item: { id: string; source: string }) {
  return item.source === "edition" && item.id.startsWith("edition-event:");
}

function parseEditionCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Construct a LOCAL calendar date, not UTC midnight, to avoid an off-by-one
  // day in time zones west of UTC.
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;
  return date;
}

function splitServices(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Solaris could not complete this operation.";
}

function SystemFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: number;
  attention?: boolean;
}) {
  return (
    <div
      className={`admin-card px-3 py-3 text-center ${
        attention ? "!border-rose-200/15 !bg-rose-200/[0.045]" : ""
      }`}
    >
      <p className={`numeric text-xl font-bold ${attention ? "text-rose-100" : ""}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
