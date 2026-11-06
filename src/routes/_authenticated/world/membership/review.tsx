import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardList, ShieldCheck } from "lucide-react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { useAuthenticatedUser } from "@/components/auth/AuthenticatedUserContext";
import { GLOBAL_MAINTENANCE_MODE } from "@/lib/maintenance";
import {
  advanceGuardReview,
  guardReviewErrorMessage,
  loadGuardReviewInbox,
  newGuardReviewOperation,
  type GuardReviewAction,
  type GuardReviewApplication,
  type GuardReviewCursor,
  type GuardReviewOperation,
  type GuardReviewPhase,
} from "@/lib/terra-governance-guard-review";

export const Route = createFileRoute("/_authenticated/world/membership/review")({
  beforeLoad: () => {
    if (GLOBAL_MAINTENANCE_MODE) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "GUARD application review — Solaris Studio" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: GuardApplicationReviewPage,
});

const PHASES: readonly { key: GuardReviewPhase; label: string }[] = [
  { key: "submitted", label: "New" },
  { key: "under_review", label: "Under review" },
  { key: "introduced", label: "Introduced" },
];

type PendingReview = {
  applicationId: string;
  action: GuardReviewAction;
  revision: number;
  operation: GuardReviewOperation;
};

function GuardApplicationReviewPage() {
  const currentUser = useAuthenticatedUser();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<GuardReviewPhase>("submitted");
  const [cursor, setCursor] = useState<GuardReviewCursor | null>(null);
  const [confirmationId, setConfirmationId] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  const pendingRef = useRef<PendingReview | null>(null);
  const review = useQuery({
    queryKey: [
      "world", "tg5", "guard-review", currentUser.id, phase,
      cursor?.submittedAt ?? null, cursor?.id ?? null,
    ],
    queryFn: () => loadGuardReviewInbox(phase, cursor),
    staleTime: 0,
    gcTime: 0, // Private documents must not survive a viewer/context change.
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: advanceGuardReview,
    onSuccess: async (result) => {
      pendingRef.current = null;
      setConfirmationId(null);
      setAcknowledged(
        result.status === "under_review"
          ? "Review started. The country application remains pending."
          : "Introduction recorded. A separate General Assembly vote is still required.",
      );
      await queryClient.invalidateQueries({
        queryKey: ["world", "tg5", "guard-review", currentUser.id],
      });
    },
  });

  function changePhase(next: GuardReviewPhase) {
    if (mutation.isPending) return;
    setPhase(next);
    setCursor(null);
    setConfirmationId(null);
    setAcknowledged(null);
    pendingRef.current = null;
    mutation.reset();
  }

  function performAction(application: GuardReviewApplication, action: GuardReviewAction) {
    if (!review.data || mutation.isPending || application.status !== phase) return;
    if (action === "review" && application.status !== "submitted") return;
    if (action === "introduce" && (
      application.status !== "under_review" || !review.data.canIntroduce ||
      confirmationId !== application.id
    )) return;

    const previous = pendingRef.current;
    const operation = previous?.applicationId === application.id
      && previous.action === action && previous.revision === application.revision
      ? previous.operation : newGuardReviewOperation();
    pendingRef.current = {
      applicationId: application.id,
      action,
      revision: application.revision,
      operation,
    };
    mutation.mutate({
      organizationId: review.data.organizationId,
      application,
      action,
      operation,
    });
  }

  const denied = review.error && (
    (review.error as { code?: string })?.code === "42501" ||
    String((review.error as Error).message ?? "").includes("AUTHORIZATION")
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Terra Solaris · GUARD"
        title="Membership applications"
        description="Review country submissions and introduce eligible applications for General Assembly consideration."
      />
      <main className="mx-auto w-full max-w-4xl space-y-5 pb-20">
        <section aria-label="Institutional admission safeguards" className="flex gap-3 border-b border-border pb-4">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Review is procedural, not admission. Introducing an application does not
            schedule a ballot, certify a vote, create GUARD membership, appoint a
            representative, or grant access to private institutional rooms.
            Admission still requires the General Assembly vote and its required threshold.
          </p>
        </section>

        <nav aria-label="Application review phases" className="flex flex-wrap gap-2">
          {PHASES.map((option) => (
            <button
              key={option.key}
              type="button"
              disabled={mutation.isPending}
              aria-pressed={phase === option.key}
              onClick={() => changePhase(option.key)}
              className={
                "min-h-11 rounded-xl border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 " +
                (phase === option.key
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40")
              }
            >
              {option.label}
            </button>
          ))}
        </nav>

        {acknowledged && (
          <div role="status" className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p>{acknowledged}</p>
          </div>
        )}

        {review.isPending ? (
          <p role="status" className="py-8 text-sm text-muted-foreground">
            Checking current GUARD authority and applications…
          </p>
        ) : denied ? (
          <div role="alert" className="rounded-xl border border-border p-5">
            <h2 className="font-semibold">Institutional review access required</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The current account has no active GUARD membership-review capability.
              Application details have not been loaded.
            </p>
          </div>
        ) : review.isError ? (
          <div role="alert" className="rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle aria-hidden="true" className="size-5 text-destructive" />
              Review inbox unavailable
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {guardReviewErrorMessage(review.error)}
            </p>
            <button
              type="button"
              onClick={() => void review.refetch()}
              className="mt-4 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold"
            >
              Retry authorization check
            </button>
          </div>
        ) : review.data ? (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {PHASES.find((item) => item.key === phase)?.label} applications
                </h2>
                <p className="text-xs text-muted-foreground">
                  {review.data.organizationName} · showing up to 20 per page
                </p>
              </div>
              <button
                type="button"
                className="min-h-11 rounded-lg border border-border px-4 text-sm"
                onClick={() => void review.refetch()}
              >
                Refresh
              </button>
            </div>

            {review.data.items.length === 0 ? (
              <div role="status" className="py-10 text-center">
                <ClipboardList className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
                <p className="mt-3 font-semibold">No applications in this view</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Only actual GUARD application records are displayed.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {review.data.items.map((application) => (
                  <article key={application.id} className="space-y-4 py-5">
                    <header className="flex flex-col justify-between gap-2 sm:flex-row">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                          {application.countryCode} · {application.countryName}
                        </p>
                        <h3 className="mt-1 text-lg font-semibold">{application.officialDesignation}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Submitted {new Date(application.submittedAt).toLocaleString()} · Revision {application.revision}
                        </p>
                      </div>
                      <span className="self-start rounded-full border border-border px-3 py-1 text-xs">
                        {PHASES.find((item) => item.key === application.status)?.label}
                      </span>
                    </header>

                    <details className="rounded-xl border border-border p-4">
                      <summary className="cursor-pointer font-medium">Read private application</summary>
                      <dl className="mt-4 space-y-4 text-sm">
                        <div><dt className="font-semibold">Government system</dt>
                          <dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                            {application.governmentSystem}
                          </dd></div>
                        <div><dt className="font-semibold">Motivation</dt>
                          <dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                            {application.motivation}
                          </dd></div>
                        <div><dt className="font-semibold">Proposed contributions</dt>
                          <dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                            {application.contributions}
                          </dd></div>
                        <div><dt className="font-semibold">Commitment to obligations</dt>
                          <dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                            {application.commitment}
                          </dd></div>
                      </dl>
                    </details>

                    {phase === "submitted" && (
                      <button
                        type="button"
                        disabled={mutation.isPending}
                        onClick={() => performAction(application, "review")}
                        className="min-h-11 rounded-xl border border-primary px-4 text-sm font-semibold disabled:opacity-60"
                      >
                        {mutation.isPending && pendingRef.current?.applicationId === application.id
                          ? "Recording review…" : "Start review"}
                      </button>
                    )}
                    {phase === "under_review" && review.data.canIntroduce && (
                      confirmationId === application.id ? (
                        <div className="space-y-3 rounded-xl border border-border p-4">
                          <p className="text-sm text-muted-foreground">
                            Record an official introduction for General Assembly consideration?
                            This does not schedule or certify a vote.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={mutation.isPending}
                              onClick={() => performAction(application, "introduce")}
                              className="min-h-11 rounded-xl border border-primary px-4 text-sm font-semibold disabled:opacity-60">
                              {mutation.isPending ? "Recording…" : "Confirm introduction"}
                            </button>
                            <button type="button" disabled={mutation.isPending}
                              onClick={() => setConfirmationId(null)}
                              className="min-h-11 rounded-xl border border-border px-4 text-sm">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" disabled={mutation.isPending}
                          onClick={() => setConfirmationId(application.id)}
                          className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">
                          Introduce to General Assembly
                        </button>
                      )
                    )}
                    {mutation.isError && pendingRef.current?.applicationId === application.id && (
                      <div role="alert" className="space-y-3 text-sm">
                        <p className="text-destructive">{guardReviewErrorMessage(mutation.error)}</p>
                        <button type="button" onClick={() => void review.refetch()}
                          className="min-h-11 rounded-lg border border-border px-4">
                          Check current state
                        </button>
                        <button type="button" disabled={mutation.isPending}
                          onClick={() => performAction(application, pendingRef.current!.action)}
                          className="ml-2 min-h-11 rounded-lg border border-border px-4">
                          Retry same operation
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              {cursor !== null && (
                <button type="button" disabled={mutation.isPending}
                  onClick={() => { setCursor(null); setConfirmationId(null); }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm">
                  <ArrowLeft className="size-4" aria-hidden="true" /> Newest applications
                </button>
              )}
              {review.data.nextCursor && (
                <button type="button" disabled={mutation.isPending}
                  onClick={() => { setCursor(review.data!.nextCursor); setConfirmationId(null); }}
                  className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">
                  Older applications
                </button>
              )}
            </div>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
