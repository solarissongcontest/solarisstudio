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
import { useMemo, useState, type FormEvent } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
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
  preview: PlatformModeChangePreview;
  form: PlatformModeForm;
  operationId: string;
  idempotencyKey: string;
  exitPreflight: PlatformExitPreflightReceipt | null;
};

function AdminSystemPage() {
  const { editionId } = useAdminContext();
  const queryClient = useQueryClient();
  const { data: editions = [] } = useEditions();

  const selectedEdition = useMemo(() => {
    const ordered = [...editions].sort(
      (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
    );
    return ordered.find((edition) => edition.id === editionId) ?? ordered[0] ?? null;
  }, [editions, editionId]);

  const { data: deadlines = [] } = useAdminDeadlines(selectedEdition?.id ?? null);
  const {
    data: operationalSchedule = [],
    isLoading: scheduleLoading,
    isError: scheduleError,
    refetch: refetchSchedule,
  } = useAdminOperationalSchedule(selectedEdition?.id ?? null, selectedEdition?.slug ?? null);
  const { data: audit = [] } = useAdminAudit(80);
  const createDeadline = useCreateAdminDeadline();
  const toggleDeadline = useToggleAdminDeadline();

  const platformQuery = useQuery({
    queryKey: ["platform-operational-state"],
    queryFn: loadPlatformOperationalSnapshot,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const previewPlatformMode = useMutation({
    mutationFn: previewPlatformModeChange,
  });
  const runExitPreflight = useServerFn(runPlatformExitPreflight);
  const exitPreflight = useMutation({
    mutationFn: (targetMode: PlatformOperationalMode) =>
      runExitPreflight({ data: { targetMode } }),
  });

  const [createOpen, setCreateOpen] = useState(false);
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
  const [pendingModeChange, setPendingModeChange] =
    useState<PendingPlatformModeChange | null>(null);
  const [platformPassword, setPlatformPassword] = useState("");

  const applyPlatformMode = useMutation({
    mutationFn: async ({
      pending,
      password,
    }: {
      pending: PendingPlatformModeChange;
      password: string;
    }) => {
      if (pending.preview.riskClass === "R3") {
        await reauthenticatePlatformR3(password);
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
    onSuccess: async () => {
      setPendingModeChange(null);
      setPlatformPassword("");
      setModeForm({
        targetMode: "",
        reason: "",
        affectedServices: "",
        message: "",
        incidentReference: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["platform-operational-state"] });
    },
  });

  const openReminders = deadlines.filter((item) => !item.completed_at);
  const completedReminders = deadlines.filter((item) => Boolean(item.completed_at));
  const overdueReminders = openReminders.filter(
    (item) => new Date(item.due_at).getTime() < Date.now(),
  );
  const workflowSchedule = operationalSchedule.filter((item) => item.source !== "reminder");
  const relevantSchedule = workflowSchedule.filter(
    (item) => new Date(item.at).getTime() >= Date.now() - 24 * 60 * 60 * 1000,
  );

  const allowedPlatformModes = platformQuery.data
    ? nextPlatformModes(platformQuery.data.mode)
    : [];

  const reviewPlatformChange = async () => {
    if (!modeForm.targetMode || modeForm.reason.trim().length < 5) return;
    const preview = await previewPlatformMode.mutateAsync({
      targetMode: modeForm.targetMode,
      affectedServices: splitServices(modeForm.affectedServices),
      message: modeForm.message.trim() || null,
      incidentReference: modeForm.incidentReference.trim() || null,
    });
    const preflight = requiresExitPreflight(preview.currentMode, preview.targetMode)
      ? await exitPreflight.mutateAsync(preview.targetMode)
      : null;
    const operationId = crypto.randomUUID();
    setPlatformPassword("");
    setPendingModeChange({
      preview,
      form: { ...modeForm, reason: modeForm.reason.trim() },
      operationId,
      idempotencyKey: operationId,
      exitPreflight: preflight,
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedEdition || !form.label.trim() || !form.due_at) return;

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
            : "Operational schedule and organizer change history."
        }
      />

      <MetricStrip className="grid-cols-3 sm:grid-cols-3 xl:grid-cols-3">
        <Metric label="Workflow dates" value={relevantSchedule.length} />
        <Metric label="Custom reminders" value={openReminders.length} />
        <Metric label="Overdue reminders" value={overdueReminders.length} attention={overdueReminders.length > 0} />
      </MetricStrip>

      <AdminCard strong>
        <AdminCardHeader
          eyebrow="Control plane"
          title="Platform operational mode"
          description="Normal, Degraded, Read-only and Maintenance are canonical server states. The emergency Worker maintenance circuit breaker stays separate so it still works if Supabase itself is unavailable."
          action={
            platformQuery.data ? (
              <AdminStatus tone={platformTone(platformQuery.data.mode)}>
                {platformLabel(platformQuery.data.mode)} · v{platformQuery.data.version}
              </AdminStatus>
            ) : null
          }
        />

        {platformQuery.isLoading ? (
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
        ) : platformQuery.data ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SystemFact label="Current mode" value={platformLabel(platformQuery.data.mode)} />
              <SystemFact label="State version" value={`v${platformQuery.data.version}`} />
              <SystemFact
                label="Changed"
                value={new Date(platformQuery.data.changedAt).toLocaleString()}
              />
              <SystemFact
                label="Affected services"
                value={
                  platformQuery.data.affectedServices.length
                    ? platformQuery.data.affectedServices.join(", ")
                    : "None declared"
                }
              />
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <p className="text-xs font-semibold text-foreground">Current reason</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {platformQuery.data.reason}
              </p>
              {platformQuery.data.message ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Public/operator message: {platformQuery.data.message}
                </p>
              ) : null}
              {platformQuery.data.incidentReference ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Incident: {platformQuery.data.incidentReference}
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

            {platformQuery.data.mode === "maintenance" ? (
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
          eyebrow={selectedEdition ? editionLabel(selectedEdition) : "Current edition"}
          title="Operational schedule"
          description="These dates come from the source workflow. Edit them there, and every Solaris surface sees the same date."
        />

        {scheduleLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Verifying workflow dates…</p>
        ) : scheduleError ? (
          <AdminEmptyState
            icon={CalendarClock}
            title="Schedule could not be verified"
            description="Solaris will not substitute custom reminders or guessed dates when a workflow source cannot be read."
            action={
              <button type="button" onClick={() => void refetchSchedule()} className="admin-action-primary">
                Retry
              </button>
            }
          />
        ) : relevantSchedule.length ? (
          <div className="divide-y divide-white/[0.07]">
            {relevantSchedule.map((item) => {
              const past = new Date(item.at).getTime() < Date.now();
              return (
                <Link key={item.id} to={item.href as any} className="admin-list-row group">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-sky-200/12 bg-sky-200/[0.045] text-sky-100">
                    <Clock3 className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {new Date(item.at).toLocaleString()} · {item.detail}
                    </span>
                  </span>
                  <AdminStatus tone={past ? "neutral" : "info"}>{past ? "Passed" : "Scheduled"}</AdminStatus>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                </Link>
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
              onClick={() => setCreateOpen(true)}
              disabled={!selectedEdition}
              className="admin-action-secondary"
            >
              <Plus className="size-4" /> Add reminder
            </button>
          }
        />

        {!deadlines.length ? (
          <AdminEmptyState
            icon={CalendarClock}
            title="No custom reminders"
            description="Good. Workflow-owned dates should stay in their workflows rather than being duplicated here."
          />
        ) : (
          <WorkQueue>
            {[...deadlines]
              .sort((a, b) => {
                if (Boolean(a.completed_at) !== Boolean(b.completed_at)) return a.completed_at ? 1 : -1;
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
                      {complete ? <CheckCircle2 className="size-4" /> : <Clock3 className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{item.label}</span>
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

        {!audit.length ? (
          <AdminEmptyState
            icon={History}
            title="No audit rows yet"
            description="Important organizer changes will appear here when available."
          />
        ) : (
          <AuditTimeline>
            {audit.map((row) => (
              <li key={row.id} className="relative list-none py-3 first:pt-0 last:pb-0">
                <span className="absolute -left-[1.18rem] top-5 size-2 rounded-full bg-sky-200/65" aria-hidden="true" />
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-foreground">
                    <History className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-semibold text-foreground">{humanize(row.action)}</p>
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
        open={Boolean(pendingModeChange)}
        onClose={() => {
          if (!applyPlatformMode.isPending) {
            setPendingModeChange(null);
            setPlatformPassword("");
          }
        }}
        onConfirm={async () => {
          if (!pendingModeChange) return;
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
                    {Object.entries(pendingModeChange.exitPreflight.checks).map(
                      ([key, check]) => (
                        <div
                          key={key}
                          className="flex min-w-0 items-start justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground">
                              {preflightCheckLabel(key)}
                            </p>
                            <p className="mt-0.5 leading-5 text-muted-foreground">
                              {check.detail}
                            </p>
                          </div>
                          <AdminStatus
                            tone={check.pass ? "ready" : check.critical ? "blocked" : "attention"}
                          >
                            {check.pass ? "Pass" : check.critical ? "Block" : "Review"}
                          </AdminStatus>
                        </div>
                      ),
                    )}
                  </div>
                  <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
                    Receipt expires {new Date(pendingModeChange.exitPreflight.expiresAt).toLocaleString()}.
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
        onClose={() => !createDeadline.isPending && setCreateOpen(false)}
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
              onClick={() => setCreateOpen(false)}
              className="admin-action-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createDeadline.isPending || !selectedEdition || !form.label.trim() || !form.due_at}
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

function requiresExitPreflight(
  from: PlatformOperationalMode,
  to: PlatformOperationalMode,
) {
  return (
    (from === "maintenance" && to === "read_only") ||
    (from === "read_only" && to === "degraded")
  );
}

function preflightCheckLabel(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function splitServices(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))].slice(0, 20);
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
