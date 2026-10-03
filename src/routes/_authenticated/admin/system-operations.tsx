import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ServerCog,
} from "lucide-react";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";

type DeliveryStatus = "pending" | "processing" | "sent" | "failed" | "suppressed";

type DeliveryRow = {
  id: string;
  category: string;
  eventType: string;
  route: string;
  status: DeliveryStatus;
  scheduledFor: string;
  sentAt: string | null;
  openedAt: string | null;
  createdAt: string;
  error: string | null;
};

type JobRow = {
  jobId: number;
  name: string;
  schedule: string;
  active: boolean;
  lastStatus: string | null;
  lastStartAt: string | null;
  lastEndAt: string | null;
  lastMessage: string | null;
  consecutiveFailures: number;
  deadLettered: boolean;
  recoveryMode:
    | "healthy"
    | "scheduled_retry"
    | "scheduled_retry_dead_letter"
    | "operator_intervention";
};

type RuntimeHealth = {
  generatedAt: string;
  push: {
    subscriptions: { active: number; disabled: number };
    deliveries: {
      pending: number;
      sent24h: number;
      failed24h: number;
      suppressed24h: number;
    };
    recent: DeliveryRow[];
  };
  jobs: JobRow[];
};

export const Route = createFileRoute("/_authenticated/admin/system-operations")({
  head: () => ({
    meta: [
      { title: "System operations — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SystemOperationsPage,
});

function SystemOperationsPage() {
  const queryClient = useQueryClient();
  const health = useQuery({
    queryKey: ["admin-system-runtime-health"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_system_runtime_health", {
        p_delivery_limit: 50,
      });
      if (error) throw error;
      return data as RuntimeHealth;
    },
    refetchInterval: 60_000,
  });

  const retry = useMutation({
    mutationFn: async (deliveryId: string) => {
      const command = createOrganisationCommand({
        command: "system.push.retry_failed",
        riskClass: "R1",
        scope: { entityId: deliveryId },
        payload: { deliveryId },
      });
      const { data, error } = await (supabase as any).rpc(
        "admin_retry_failed_notification_delivery",
        {
          p_delivery_id: deliveryId,
          p_operation_id: command.operationId,
          p_idempotency_key: command.idempotencyKey,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-system-runtime-health"] }),
  });

  const data = health.data;
  const pushAttention = Boolean(
    data &&
      (data.push.deliveries.failed24h > 0 ||
        data.push.recent.some((item) => item.status === "processing")),
  );
  const jobAttention = Boolean(
    data?.jobs.some(
      (job) =>
        !job.active ||
        job.deadLettered ||
        (job.lastStatus && !["succeeded", "success"].includes(job.lastStatus.toLowerCase())),
    ),
  );

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl space-y-4">
        <AdminPageHeader
          eyebrow="System · Operations"
          title="Delivery & background jobs"
          description="Protected diagnostics for push delivery and Solaris-owned scheduled jobs. Recipient identities, push endpoints, keys and notification bodies are deliberately not exposed here."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/sync-health" className="admin-action-secondary">
                Integration health
              </Link>
              <button
                type="button"
                className="admin-action-secondary"
                onClick={() => void health.refetch()}
                disabled={health.isFetching}
              >
                <RefreshCw className={health.isFetching ? "size-4 animate-spin" : "size-4"} />
                {health.isFetching ? "Checking…" : "Refresh"}
              </button>
            </div>
          }
        />

        {health.isLoading ? (
          <AdminCard>
            <p className="py-12 text-center text-sm text-muted-foreground">
              Checking delivery and scheduler state…
            </p>
          </AdminCard>
        ) : health.error || !data ? (
          <AdminCard>
            <AdminEmptyState
              icon={AlertTriangle}
              title="System operations could not be loaded"
              description={
                health.error instanceof Error
                  ? health.error.message
                  : "Protected system diagnostics are unavailable."
              }
            />
          </AdminCard>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Active push devices"
                value={data.push.subscriptions.active}
                tone="neutral"
              />
              <Metric
                label="Sent · 24h"
                value={data.push.deliveries.sent24h}
                tone="ready"
              />
              <Metric
                label="Failed · 24h"
                value={data.push.deliveries.failed24h}
                tone={data.push.deliveries.failed24h ? "blocked" : "ready"}
              />
              <Metric
                label="Pending"
                value={data.push.deliveries.pending}
                tone={data.push.deliveries.pending ? "attention" : "neutral"}
              />
            </section>

            <AdminCard strong>
              <AdminCardHeader
                eyebrow="Push delivery"
                title="Recent delivery state"
                description="The dispatcher leases pending rows before sending so concurrent schedulers cannot intentionally claim the same delivery."
                action={
                  <AdminStatus tone={pushAttention ? "attention" : "ready"}>
                    {pushAttention ? "Review" : "Healthy"}
                  </AdminStatus>
                }
              />
              {data.push.recent.length ? (
                <div className="mt-4 divide-y divide-white/[0.07]">
                  {data.push.recent.map((delivery) => (
                    <div
                      key={delivery.id}
                      className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">
                            {humanize(delivery.eventType)}
                          </p>
                          <AdminStatus tone={deliveryTone(delivery.status)}>
                            {delivery.status}
                          </AdminStatus>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {humanize(delivery.category)} · {delivery.route}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Created {formatDate(delivery.createdAt)}
                        </p>
                        {delivery.error ? (
                          <p className="mt-2 max-w-3xl text-xs leading-5 text-amber-100/80">
                            {delivery.error}
                          </p>
                        ) : null}
                      </div>
                      {delivery.status === "failed" ? (
                        <button
                          type="button"
                          className="admin-action-secondary shrink-0"
                          disabled={retry.isPending}
                          onClick={() => retry.mutate(delivery.id)}
                        >
                          <RefreshCw className="size-4" />
                          Retry failed delivery
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No delivery receipts are available yet.
                </p>
              )}
              {retry.error ? (
                <p className="mt-3 text-xs text-rose-200">
                  {retry.error instanceof Error
                    ? retry.error.message
                    : "The failed delivery could not be retried."}
                </p>
              ) : null}
            </AdminCard>

            <AdminCard>
              <AdminCardHeader
                eyebrow="Scheduler"
                title="Solaris background jobs"
                description="Only Solaris-owned cron jobs are shown. A failed scheduled action remains operational evidence instead of disappearing into the database scheduler."
                action={
                  <AdminStatus tone={jobAttention ? "attention" : "ready"}>
                    {jobAttention ? "Review" : "Healthy"}
                  </AdminStatus>
                }
              />
              {data.jobs.length ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {data.jobs.map((job) => (
                    <div
                      key={job.jobId}
                      className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{job.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {job.schedule}
                          </p>
                        </div>
                        <AdminStatus
                          tone={
                            !job.active || job.deadLettered
                              ? "blocked"
                              : job.lastStatus &&
                                  !["succeeded", "success"].includes(job.lastStatus.toLowerCase())
                                ? "attention"
                                : "ready"
                          }
                        >
{!job.active
                            ? "inactive"
                            : job.deadLettered
                              ? "dead-letter"
                              : job.lastStatus ?? "waiting"}
                        </AdminStatus>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <Info
                          icon={Clock3}
                          label="Last start"
                          value={job.lastStartAt ? formatDate(job.lastStartAt) : "No run recorded"}
                        />
                        <Info
                          icon={CheckCircle2}
                          label="Last end"
                          value={job.lastEndAt ? formatDate(job.lastEndAt) : "—"}
                        />
                      </div>
                      {job.lastMessage ? (
                        <p className="mt-3 break-words text-xs leading-5 text-muted-foreground">
                          {job.lastMessage}
                        </p>
                      ) : null}
                      <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          Recovery
                        </p>
                        <p className="mt-1 text-xs font-semibold">
                          {job.recoveryMode === "healthy"
                            ? "No recovery needed"
                            : job.recoveryMode === "scheduled_retry"
                              ? "Automatic retry on the next scheduled run"
                              : job.recoveryMode === "scheduled_retry_dead_letter"
                                ? "Dead-letter attention · scheduler still retries automatically"
                                : "Operator intervention required · scheduler job is inactive"}
                        </p>
                        {job.consecutiveFailures > 0 ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {job.consecutiveFailures} recent completed run
                            {job.consecutiveFailures === 1 ? "" : "s"} failed.
                            {job.deadLettered
                              ? " A canonical Organizer Task remains open until a successful run clears it."
                              : " Solaris has created an Organizer Task for the failure."}
                          </p>
                        ) : null}
                      </div>


                    </div>
                  ))}
                </div>
              ) : (
                <AdminEmptyState
                  icon={ServerCog}
                  title="No Solaris scheduler jobs found"
                  description="The cron extension may be unavailable or no Solaris-owned jobs are registered."
                />
              )}
            </AdminCard>

            <p className="px-1 text-[11px] text-muted-foreground">
              Snapshot generated {formatDate(data.generatedAt)}. Failed delivery retry is available only
              for rows the dispatcher conclusively marked failed; processing rows are recovered by the
              bounded queue lease instead of being replayed manually.
            </p>
          </>
        )}
      </div>
    </AdminPage>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "ready" | "attention" | "blocked";
}) {
  return (
    <AdminCard>
      <p className="admin-section-label">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <AdminStatus tone={tone}>{tone}</AdminStatus>
      </div>
    </AdminCard>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BellRing;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-1 text-xs font-semibold">{value}</p>
    </div>
  );
}

function deliveryTone(status: DeliveryStatus) {
  if (status === "sent") return "ready" as const;
  if (status === "failed") return "blocked" as const;
  if (status === "processing" || status === "pending") return "attention" as const;
  return "neutral" as const;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
