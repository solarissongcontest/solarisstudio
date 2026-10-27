import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CheckCircle2,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  Vote,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/AppShell";
import { DelayedConfirmationState } from "@/components/DelayedConfirmationState";
import { GovernanceInlineReference, GovernanceSnapshot, RulesApplyingHere } from "@/components/rules/GovernanceRules";
import { ParticipationRouteChrome, ParticipationServiceShell } from "@/components/ParticipationServiceShell";
import { Button } from "@/components/ui/button";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import {
  attestCountryJuryVote,
  preflightCountryJuryVote,
} from "@/integrations/jury-voting/jury-voting.functions";
import { buildTelevotingClientIdentity } from "@/integrations/televoting/anti-abuse";
import {
  VOTE_INTEGRITY_AUTOMATION,
  VOTE_INTEGRITY_CONSEQUENCE,
  VOTE_INTEGRITY_COORDINATION,
  VOTE_INTEGRITY_INDEPENDENCE,
  VOTE_INTEGRITY_PRESSURE,
  type VoteIntegrityReport,
  type VoteIntegritySeverity,
} from "@/integrations/televoting/integrity";
import { captureGovernanceSnapshot, type GovernanceReceiptSnapshot } from "@/lib/governance-v5";
import { useFanSession } from "@/lib/prediction-data";
import { trackPublicUxEvent } from "@/lib/public-ux-events";
import { cn } from "@/lib/utils";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import {
  lookupV3JuryReceipt,
  loadV3JuryDraft,
  reconcileV3JurySubmission,
  saveV3JuryDraft,
  submitV3JuryBallot,
  type V3JuryReceipt,
} from "@/lib/v3-jury.functions";
import {
  clearV3JuryOperation,
  prepareV3JuryOperation,
  readV3JuryOperation,
  updateV3JuryOperation,
  writeV3JuryOperation,
} from "@/lib/v3-jury-operation";

const supabase = typedSupabase as any;

type JuryEntry = {
  country_id: string;
  name: string;
  short_code: string;
  flag_image: string | null;
  artist: string | null;
  song: string | null;
  running_order: number | null;
};

type JuryRound = {
  show_id: string;
  show_name: string;
  show_kind: string;
  edition_id: string;
  edition_name: string;
  edition_number: number;
  status: "open" | "closed";
  opened_at: string | null;
  closed_at: string | null;
  point_scale: number[];
  allow_self_vote: boolean;
  eligible: boolean;
  already_submitted: boolean;
  entries: JuryEntry[];
};

type JuryCountry = {
  id: string;
  name: string;
  short_code: string;
  flag_image: string | null;
  username: string;
};

type JuryContext = {
  ok: boolean;
  error?: "not_authenticated" | "country_account_required" | "account_suspended" | string;
  country?: JuryCountry;
  rounds?: JuryRound[];
  accessToken?: string;
};

type Stage = "vote" | "review" | "integrity" | "done";

export const Route = createFileRoute("/jury-voting")({
  head: () => ({
    meta: [
      { title: "Jury voting — Solaris Studio" },
      {
        name: "description",
        content: "Cast an official SSC jury ballot from your signed-in country account when jury voting is open.",
      },
    ],
  }),
  component: JuryVotingPage,
});

function severityLabel(severity: VoteIntegritySeverity) {
  if (severity === "critical") return "Critical pattern";
  if (severity === "high") return "High concern";
  if (severity === "strong") return "Strong pattern";
  if (severity === "review") return "Review required";
  if (severity === "notable") return "Notable pattern";
  return "No notable pattern";
}

function severityClass(severity: VoteIntegritySeverity) {
  if (severity === "critical") return "border-red-300/30 bg-red-300/10 text-red-100";
  if (severity === "high") return "border-orange-300/30 bg-orange-300/10 text-orange-100";
  if (severity === "strong") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  if (severity === "review") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  return "border-sky-300/20 bg-sky-300/10 text-sky-100";
}

function getOrCreateBrowserId(storage: Storage | null, key: string) {
  if (!storage) return null;
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    storage.setItem(key, created);
    return created;
  } catch {
    return null;
  }
}

function JuryVotingPage() {
  const queryClient = useQueryClient();
  const session = useFanSession();
  const userId = session.data?.id ?? "anonymous";
  const rollout = useV3RolloutProbe(!session.isLoading);
  const v3ReliabilityEnabled = rollout.data?.juryEnabled === true;
  const { data: context, isLoading: contextLoading, error } = useQuery<JuryContext>({
    queryKey: ["country-jury-voting-context", userId],
    enabled: !session.isLoading,
    queryFn: async () => {
      const { data: sessionData } = await typedSupabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return { ok: false, error: "not_authenticated" };
      const { data, error: rpcError } = await supabase.rpc("country_jury_voting_context");
      if (rpcError) throw rpcError;
      return { ...(data as JuryContext), accessToken };
    },
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
  const isLoading = session.isLoading || contextLoading;

  const rounds = context?.rounds ?? [];
  const openRound = rounds.find((round) => round.status === "open" && round.eligible && !round.already_submitted);

  if (isLoading) {
    return <JuryVotingFrame description="Loading the current jury voting status…"><Panel><p className="text-sm text-muted-foreground">Loading jury voting…</p></Panel></JuryVotingFrame>;
  }
  if (error) {
    return <JuryVotingFrame description="The jury voting service could not be loaded."><Panel><p className="text-sm text-red-200">{error instanceof Error ? error.message : "Jury voting is unavailable."}</p></Panel></JuryVotingFrame>;
  }
  if (!context?.ok) {
    const notSignedIn = context?.error === "not_authenticated";
    const needsCountry = context?.error === "country_account_required";
    return (
      <JuryVotingFrame description="Jury ballots are official delegation votes, so they can only be submitted from a signed-in country account.">
        <Panel title={notSignedIn ? "Sign in first" : needsCountry ? "Country account required" : "Jury voting unavailable"}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {notSignedIn ? "Sign in to Solaris Studio with the account connected to your delegation." : needsCountry ? "Finish your country-account setup before trying to submit a jury ballot." : "This account cannot jury vote right now."}
          </p>
          <Link to={notSignedIn ? "/auth" : "/my-solaris"} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
            {notSignedIn ? "Sign in" : "Open My Solaris"}
          </Link>
        </Panel>
      </JuryVotingFrame>
    );
  }

  return (
    <JuryVotingFrame description={`Signed in for ${context.country?.name ?? "your country"}. Jury voting only becomes available when the organizer opens it for a show.`}>
      <div className="space-y-4">
        <RulesApplyingHere
          context="jury.vote"
          title="Before you vote"
          primaryLimit={3}
        />

        {openRound && context.country && context.accessToken ? (
          <JuryBallotBooth
            key={`${userId}:${context.country.id}:${openRound.show_id}`}
            userId={userId}
            round={openRound}
            country={context.country}
            accessToken={context.accessToken}
            v3ReliabilityEnabled={v3ReliabilityEnabled}
            onSubmitted={() => void queryClient.invalidateQueries({ queryKey: ["country-jury-voting-context", userId] })}
          />
        ) : (
          <Panel title="Current status" description="Show-by-show organizer control">
            {rounds.length ? (
              <div className="divide-y divide-border/60">
                {rounds.map((round) => (
                  <div key={round.show_id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold">SSC {round.edition_number} · {round.show_name}</p><p className="mt-1 text-xs text-muted-foreground">{round.already_submitted ? "Your country's jury ballot is already recorded." : !round.eligible ? "Your country is not in this show's jury roster." : round.status === "open" ? "Jury voting is open." : "Jury voting is closed."}</p></div>
                      <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]", round.already_submitted ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : round.status === "open" ? "border-primary/25 bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground")}>{round.already_submitted ? "Recorded" : round.status}</span>
                    </div>
                    {round.already_submitted && v3ReliabilityEnabled ? <JuryRecordedReceipt round={round} /> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-surface p-4"><LockKeyhole className="size-5 text-muted-foreground" /><p className="mt-2 text-sm font-semibold">No jury voting window is open</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">The organizer has not opened country-account jury voting for an active show yet.</p></div>
            )}
          </Panel>
        )}
      </div>
    </JuryVotingFrame>
  );
}

function JuryVotingFrame({ children, description }: { children: ReactNode; description: string }) {
  return <ParticipationRouteChrome><ParticipationServiceShell service="jury" title="Jury voting" description={description} maxWidth="max-w-6xl">{children}</ParticipationServiceShell></ParticipationRouteChrome>;
}

function JuryRecordedReceipt({ round }: { round: JuryRound }) {
  const lookupReceipt = useServerFn(lookupV3JuryReceipt);
  const receiptQuery = useQuery({
    queryKey: ["v3-jury-receipt", round.show_id],
    queryFn: () => lookupReceipt({ data: { showId: round.show_id } }),
    staleTime: 60_000,
  });
  const receipt = receiptQuery.data?.receipt;

  if (receiptQuery.isLoading) {
    return <p className="mt-2 text-xs text-muted-foreground">Checking authoritative receipt…</p>;
  }
  if (receiptQuery.error) {
    return <p className="mt-2 text-xs text-amber-200">The ballot is recorded, but its receipt could not be loaded.</p>;
  }
  if (!receipt) {
    return <p className="mt-2 text-xs text-muted-foreground" data-v3-jury-receipt="legacy-unavailable">This ballot predates V3 receipt evidence. Solaris does not manufacture a receipt from browser state.</p>;
  }
  return (
    <div className="mt-2 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.04] px-3 py-2 text-xs text-muted-foreground" data-v3-jury-receipt="authoritative">
      <span className="font-semibold text-emerald-200">Receipt {receipt.receiptId}</span>
      <span className="mx-2" aria-hidden="true">·</span>
      <time dateTime={receipt.acceptedAt}>{new Date(receipt.acceptedAt).toLocaleString()}</time>
    </div>
  );
}

function JuryBallotBooth({ userId, round, country, accessToken, v3ReliabilityEnabled, onSubmitted }: { userId: string; round: JuryRound; country: JuryCountry; accessToken: string; v3ReliabilityEnabled: boolean; onSubmitted: () => void }) {
  const preflight = useServerFn(preflightCountryJuryVote);
  const attest = useServerFn(attestCountryJuryVote);
  const loadDraft = useServerFn(loadV3JuryDraft);
  const saveDraft = useServerFn(saveV3JuryDraft);
  const submitBallot = useServerFn(submitV3JuryBallot);
  const reconcileSubmission = useServerFn(reconcileV3JurySubmission);
  const draftKey = `solaris:jury-ballot-draft:${userId}:${country.id}:${round.show_id}`;
  const [deviceId] = useState(() => getOrCreateBrowserId(
    typeof window === "undefined" ? null : window.localStorage,
    "ssc.v3.jury.device",
  ));
  const [sessionId] = useState(() => getOrCreateBrowserId(
    typeof window === "undefined" ? null : window.sessionStorage,
    "ssc.v3.jury.session",
  ));
  const [stage, setStage] = useState<Stage>("vote");
  const [selections, setSelections] = useState<Array<string | null>>(() => {
    if (typeof window === "undefined") return round.point_scale.map(() => null);
    try {
      const raw = window.sessionStorage.getItem(draftKey);
      if (!raw) return round.point_scale.map(() => null);
      const parsed = JSON.parse(raw) as { selections?: Array<string | null> };
      return Array.isArray(parsed.selections) && parsed.selections.length === round.point_scale.length
        ? parsed.selections
        : round.point_scale.map(() => null);
    } catch {
      return round.point_scale.map(() => null);
    }
  });
  const [acceptedRule, setAcceptedRule] = useState(false);
  const [report, setReport] = useState<VoteIntegrityReport | null>(null);
  const [signedName, setSignedName] = useState("");
  const [acceptedAutomatic, setAcceptedAutomatic] = useState(false);
  const [acceptedIndependence, setAcceptedIndependence] = useState(false);
  const [acceptedCoordination, setAcceptedCoordination] = useState(false);
  const [acceptedPressure, setAcceptedPressure] = useState(false);
  const [acceptedConsequences, setAcceptedConsequences] = useState(false);
  const [governanceReceipt, setGovernanceReceipt] = useState<GovernanceReceiptSnapshot | null>(null);
  const [submissionReceipt, setSubmissionReceipt] = useState<V3JuryReceipt | null>(null);
  const [checkingSubmission, setCheckingSubmission] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [serverRevision, setServerRevision] = useState(0);
  const [draftStatus, setDraftStatus] = useState<"loading" | "saved" | "saving" | "offline" | "conflict">("loading");
  const [draftConflict, setDraftConflict] = useState<{ selections: Array<string | null>; revision: number } | null>(null);
  const lastSavedFingerprint = useRef<string | null>(null);

  const ballot = useMemo(() => round.point_scale.map((points, index) => ({ target_country_id: selections[index], points })).filter((entry): entry is { target_country_id: string; points: number } => Boolean(entry.target_country_id)), [round.point_scale, selections]);
  const complete = ballot.length === round.point_scale.length;

  useEffect(() => {
    if (!v3ReliabilityEnabled) {
      setDraftReady(false);
      setDraftStatus("offline");
      return;
    }
    let cancelled = false;
    void loadDraft({ data: { showId: round.show_id } })
      .then((result) => {
        if (cancelled) return;
        const remoteSelections = result.payload?.selections ?? null;
        if (result.found === true && remoteSelections?.length === round.point_scale.length) {
          setSelections(remoteSelections);
          lastSavedFingerprint.current = JSON.stringify(remoteSelections);
        }
        setServerRevision(result.serverRevision);
        setDraftStatus("saved");
        setDraftReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setDraftStatus("offline");
        setDraftReady(true);
      });
    return () => { cancelled = true; };
  }, [loadDraft, round.point_scale.length, round.show_id, v3ReliabilityEnabled]);

  useEffect(() => {
    if (typeof window === "undefined" || stage === "done") return;
    try {
      window.sessionStorage.setItem(
        draftKey,
        JSON.stringify({ selections, savedAt: new Date().toISOString() }),
      );
    } catch {
      // The live ballot remains authoritative in memory.
    }
  }, [draftKey, selections, stage]);

  useEffect(() => {
    if (!v3ReliabilityEnabled || !draftReady || stage !== "vote" || draftConflict) return;
    const fingerprint = JSON.stringify(selections);
    if (lastSavedFingerprint.current === fingerprint) return;
    const expectedRevision = serverRevision;
    const timer = window.setTimeout(() => {
      setDraftStatus("saving");
      void saveDraft({
        data: {
          showId: round.show_id,
          selections,
          expectedRevision,
          deviceId,
          sessionId,
        },
      }).then((result) => {
        const nextRevision = result.serverRevision;
        if (result.conflict === true) {
          const newerSelections = result.payload?.selections ?? [];
          if (newerSelections.length === round.point_scale.length) {
            setDraftConflict({ selections: newerSelections, revision: nextRevision });
            setDraftStatus("conflict");
            return;
          }
        }
        if (result.ok === true) {
          lastSavedFingerprint.current = fingerprint;
          setServerRevision(nextRevision);
          setDraftStatus("saved");
          return;
        }
        setDraftStatus("offline");
      }).catch(() => setDraftStatus("offline"));
    }, 750);
    return () => window.clearTimeout(timer);
  }, [deviceId, draftConflict, draftReady, round.point_scale.length, round.show_id, saveDraft, selections, serverRevision, sessionId, stage, v3ReliabilityEnabled]);

  const submitMutation = useMutation({
    mutationFn: async (token: string) => {
      const fingerprint = JSON.stringify(ballot);
      const prepared = prepareV3JuryOperation({
        existing: readV3JuryOperation(round.show_id),
        showId: round.show_id,
        ballotFingerprint: fingerprint,
        newOperationId: crypto.randomUUID(),
        now: new Date().toISOString(),
      });
      const dispatched = updateV3JuryOperation(
        prepared.operation,
        "dispatched",
        new Date().toISOString(),
      );
      writeV3JuryOperation(dispatched);

      try {
        const result = await submitBallot({
          data: {
            showId: round.show_id,
            entries: ballot,
            preflightId: token,
            operationId: dispatched.operationId,
          },
        });
        if (!result.receipt) throw new Error("The jury authority returned no receipt.");
        return result.receipt;
      } catch (submitError) {
        const uncertain = updateV3JuryOperation(
          dispatched,
          "uncertain",
          new Date().toISOString(),
        );
        writeV3JuryOperation(uncertain);
        setCheckingSubmission(true);
        try {
          const recovered = await reconcileSubmission({
            data: { operationId: uncertain.operationId },
          });
          if (recovered.found && recovered.receipt) return recovered.receipt;
        } catch {
          // Preserve the original uncertainty and operation id for an exact retry.
        } finally {
          setCheckingSubmission(false);
        }
        throw new Error(
          submitError instanceof Error
            ? `Submission status is not yet confirmed. Retry safely to check the same operation. ${submitError.message}`
            : "Submission status is not yet confirmed. Retry safely to check the same operation.",
        );
      }
    },
    onSuccess: (receipt) => {
      clearV3JuryOperation(round.show_id);
      setSubmissionReceipt(receipt);
      setGovernanceReceipt(captureGovernanceSnapshot("jury.vote"));
      try {
        window.sessionStorage.removeItem(draftKey);
      } catch {
        // Submission is already authoritative.
      }
      setStage("done");
      onSubmitted();
      trackPublicUxEvent("task_completed", {
        target: "/jury-voting",
        metadata: { area: "participate", task_status: "submitted" },
      });
      toast.success("Your jury ballot has been recorded");
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Your jury ballot could not be submitted"),
  });

  function resetDeclaration() {
    setSignedName("");
    setAcceptedAutomatic(false);
    setAcceptedIndependence(false);
    setAcceptedCoordination(false);
    setAcceptedPressure(false);
    setAcceptedConsequences(false);
  }

  const preflightMutation = useMutation({
    mutationFn: async () => {
      if (!complete) throw new Error("Assign every jury score before continuing");
      if (!acceptedRule) throw new Error("Confirm that you understand the friend-voting rule");
      const identity = await buildTelevotingClientIdentity();
      return preflight({ data: { showId: round.show_id, entries: ballot, accessToken, fingerprintHash: identity.fingerprintHash, deviceTokenHash: identity.deviceTokenHash } });
    },
    onSuccess: (nextReport) => {
      setReport(nextReport);
      resetDeclaration();
      if (nextReport.requiresAttestation) {
        setStage("integrity");
      } else if (nextReport.interventionLevel === "notice" || nextReport.interventionLevel === "review") {
        setStage("review");
      } else {
        submitMutation.mutate(nextReport.token);
      }
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "The automatic integrity check failed"),
  });

  const attestationMutation = useMutation({
    mutationFn: async () => {
      if (!report) throw new Error("Run the integrity check again");
      await attest({ data: {
        token: report.token,
        signedName,
        acceptedAutomaticDetection: acceptedAutomatic,
        acceptedIndependence,
        acceptedCoordination,
        acceptedPressure,
        acceptedConsequences,
      } });
      return report.token;
    },
    onSuccess: (token) => submitMutation.mutate(token),
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "The integrity declaration could not be recorded"),
  });

  function returnToBallot() {
    setReport(null);
    resetDeclaration();
    setStage("vote");
  }

  function selectCountry(index: number, countryId: string) {
    setReport(null);
    setSelections((previous) => previous.map((value, itemIndex) => itemIndex === index ? countryId || null : countryId && value === countryId ? null : value));
  }

  function useServerDraft() {
    if (!draftConflict) return;
    setSelections(draftConflict.selections);
    setServerRevision(draftConflict.revision);
    lastSavedFingerprint.current = JSON.stringify(draftConflict.selections);
    setDraftConflict(null);
    setDraftStatus("saved");
  }

  function overwriteAfterConflict() {
    if (!draftConflict) return;
    setServerRevision(draftConflict.revision);
    lastSavedFingerprint.current = null;
    setDraftConflict(null);
    setDraftStatus("saving");
  }

  if (stage === "done") {
    return (
      <div className="space-y-4">
        <DelayedConfirmationState pendingTitle="Jury ballot stored" pendingDescription={`Solaris has accepted ${country.name}'s jury ballot for ${round.show_name}. The official vote is already in the database.`} confirmedTitle="Jury vote confirmed" confirmedDescription={`${country.name}'s jury ballot for ${round.show_name} is recorded. The organizer can still correct it from the existing admin jury workspace if needed.`} />
        {submissionReceipt ? (
          <Panel title="Authoritative receipt" description="Issued by Solaris after the canonical ballot commit">
            <dl className="grid gap-3 text-sm sm:grid-cols-2" data-v3-jury-receipt="authoritative">
              <div><dt className="text-xs text-muted-foreground">Receipt ID</dt><dd className="mt-1 break-all font-mono text-xs">{submissionReceipt.receiptId}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Server accepted</dt><dd className="mt-1"><time dateTime={submissionReceipt.acceptedAt}>{new Date(submissionReceipt.acceptedAt).toLocaleString()}</time></dd></div>
            </dl>
          </Panel>
        ) : null}
        <GovernanceSnapshot
          context="jury.vote"
          label="Rules shown for this jury ballot"
          snapshot={governanceReceipt}
        />
      </div>
    );
  }

  if (stage === "review" && report) {
    return (
      <div className="space-y-4">
        <section className={cn("rounded-2xl border p-5 sm:p-7", severityClass(report.severity))}>
          <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-6 shrink-0" /><div><p className="text-xs font-black uppercase tracking-[0.15em]">Voting integrity review</p><h2 className="mt-2 text-2xl font-black">Review your jury ballot before submitting</h2><p className="mt-2 text-sm leading-6 opacity-85">Solaris found an unusual pattern, but the evidence does not require a declaration. This is not a finding of misconduct.</p></div></div>
        </section>
        <IntegrityEvidence report={report} />
        <Panel title="Your choice" description="Nothing has been submitted yet">
          <div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={returnToBallot}><ArrowLeft className="size-4" /> Change my votes</Button><Button disabled={submitMutation.isPending} onClick={() => submitMutation.mutate(report.token)}><CheckCircle2 className="size-4" /> {checkingSubmission ? "Checking submission status…" : submitMutation.isPending ? "Submitting…" : "My ballot is correct · submit"}</Button></div>
        </Panel>
      </div>
    );
  }

  if (stage === "integrity" && report) {
    const canSign = signedName.trim().toLowerCase() === country.username.trim().toLowerCase() && acceptedAutomatic && acceptedIndependence && acceptedCoordination && acceptedPressure && acceptedConsequences;
    return (
      <div className="space-y-4">
        <section className={cn("rounded-2xl border p-4 sm:p-5", severityClass(report.severity))}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <ShieldAlert className="size-5 shrink-0" />
                <p className="text-[10px] font-bold uppercase tracking-[0.14em]">Voting integrity review</p>
                <span className="rounded-full border border-current/20 px-2.5 py-1 text-[10px] font-semibold">
                  Risk signal {report.riskScore}/100
                </span>
              </div>
              <h2 className="mt-3 text-xl font-bold tracking-[-.02em]">Solaris found an unusual pattern</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 opacity-90">
                This is not a finding of misconduct. Automated analysis compared this ballot with recent-weighted historical jury and televote patterns connected to your delegation and HOD history.
              </p>
              <p className="mt-2 text-sm leading-6 opacity-80">
                You can change the ballot, or continue with the declaration if the ballot genuinely reflects your independent preferences.
              </p>
            </div>
            <button type="button" onClick={returnToBallot} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-current/25 bg-black/10 px-4 text-sm font-semibold"><ArrowLeft className="size-4" /> Change ballot</button>
          </div>
        </section>
        <IntegrityEvidence report={report} />
        <Panel title="Voting Integrity Declaration" description={report.interventionLevel === "provisional_review" ? "This ballot will be recorded for organizer review after you sign. Automated analysis does not delete it." : "Sign only if this ballot is genuinely independent."}>
          <div className="space-y-3">
            <IntegrityCheckbox checked={acceptedAutomatic} onChange={setAcceptedAutomatic}>{VOTE_INTEGRITY_AUTOMATION}</IntegrityCheckbox>
            <IntegrityCheckbox checked={acceptedIndependence} onChange={setAcceptedIndependence}>{VOTE_INTEGRITY_INDEPENDENCE}</IntegrityCheckbox>
            <IntegrityCheckbox checked={acceptedCoordination} onChange={setAcceptedCoordination}>{VOTE_INTEGRITY_COORDINATION}</IntegrityCheckbox>
            <IntegrityCheckbox checked={acceptedPressure} onChange={setAcceptedPressure}>{VOTE_INTEGRITY_PRESSURE}</IntegrityCheckbox>
            <IntegrityCheckbox checked={acceptedConsequences} onChange={setAcceptedConsequences}>{VOTE_INTEGRITY_CONSEQUENCE}</IntegrityCheckbox>
            <label className="block rounded-xl border border-border bg-surface p-3"><span className="text-[10px] font-black uppercase tracking-[0.13em] text-muted-foreground">Type your Solaris username to sign</span><input value={signedName} onChange={(event) => setSignedName(event.target.value)} placeholder={country.username} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>
            <div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={returnToBallot}><ArrowLeft className="size-4" /> Change my votes</Button><Button disabled={!canSign || attestationMutation.isPending || submitMutation.isPending} onClick={() => attestationMutation.mutate()}>{attestationMutation.isPending || submitMutation.isPending ? "Recording declaration…" : "Sign declaration and submit jury vote"}</Button></div>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <Panel title={`${round.show_name} jury ballot`} description={`SSC ${round.edition_number} · Assign each jury score exactly once.`}>
      <div className="space-y-4">
        {draftConflict ? (
          <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-4" role="alert" data-v3-jury-draft="conflict">
            <p className="text-sm font-semibold text-amber-100">A newer ballot draft was saved on another device.</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/80">Solaris stopped this device from overwriting it. Choose which draft to continue with.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={useServerDraft}>Use newer server draft</Button>
              <Button onClick={overwriteAfterConflict}>Keep this device’s draft</Button>
            </div>
          </div>
        ) : null}
        <div className="space-y-2">
          {round.point_scale.map((points, index) => {
            const selected = selections[index] ?? "";
            return (
              <div key={`${points}-${index}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 rounded-xl border border-border bg-surface p-2.5">
                <div className="text-center"><p className="numeric text-xl font-black text-primary">{points}</p><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">points</p></div>
                <select value={selected} onChange={(event) => selectCountry(index, event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="">Choose entry…</option>{round.entries.filter((entry) => round.allow_self_vote || entry.country_id !== country.id).map((entry) => <option key={entry.country_id} value={entry.country_id}>{entry.name} · {[entry.artist, entry.song].filter(Boolean).join(" — ") || entry.short_code}</option>)}</select>
              </div>
            );
          })}
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3 text-sm"><input type="checkbox" checked={acceptedRule} onChange={(event) => setAcceptedRule(event.target.checked)} className="mt-0.5" /><span className="leading-relaxed text-muted-foreground">I confirm that this ballot reflects my own independent preferences and is not part of an agreed or reciprocal voting arrangement.</span></label>
        <GovernanceInlineReference context="jury.vote" ruleIds={["9.2", "11.2", "11.4"]} label="Voting rules" />
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-xs text-muted-foreground"><span>{ballot.length}/{round.point_scale.length} scores assigned</span><span aria-live="polite">{!v3ReliabilityEnabled ? "Saved on this device" : draftStatus === "loading" ? "Loading server draft…" : draftStatus === "saving" ? "Saving…" : draftStatus === "saved" ? `Saved · revision ${serverRevision}` : draftStatus === "conflict" ? "Save conflict" : "Saved on this device · reconnect to sync"}</span><span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-primary" /> Integrity v4 · recent editions weighted most</span></div>
        <Button className="w-full" disabled={!complete || !acceptedRule || preflightMutation.isPending || submitMutation.isPending} onClick={() => preflightMutation.mutate()}><Vote className="size-4" />{preflightMutation.isPending || submitMutation.isPending ? "Checking ballot…" : "Review and submit jury vote"}</Button>
      </div>
    </Panel>
  );
}

function IntegrityEvidence({ report }: { report: VoteIntegrityReport }) {
  return (
    <Panel title="Why Solaris raised this" description="Statistical context, not a verdict">
      <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span className="rounded-full border border-border px-2.5 py-1">Risk {report.riskScore}/100</span>{report.confidence != null ? <span className="rounded-full border border-border px-2.5 py-1">Confidence {report.confidence}/100</span> : null}{report.modelVersion ? <span className="rounded-full border border-border px-2.5 py-1">{report.modelVersion}</span> : null}</div>
      <div className="mt-3 space-y-3">
        {report.findings.length ? report.findings.map((finding, index) => (
          <article key={`${finding.lens}-${finding.targetCode}-${index}`} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{finding.targetName}</p><span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{finding.lens === "hod" ? "HOD history" : "Country history"}</span><span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[9px] font-bold text-amber-200">Signal {finding.riskScore}</span></div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{finding.scopeLabel}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">{finding.recentRisk != null ? <span>recent {finding.recentRisk}</span> : null}{finding.lifetimeRisk != null ? <span>lifetime {finding.lifetimeRisk}</span> : null}{finding.effectiveRecentEditions != null ? <span>{finding.effectiveRecentEditions.toFixed(2)} effective recent editions</span> : null}</div>
            {finding.reasons.length ? <ul className="mt-3 space-y-1 text-xs leading-relaxed text-muted-foreground">{finding.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul> : null}
          </article>
        )) : <p className="text-sm text-muted-foreground">The combined risk score crossed the automatic review threshold.</p>}
      </div>
    </Panel>
  );
}

function IntegrityCheckbox({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return <label className={cn("flex items-start gap-3 rounded-xl border p-3 text-sm leading-relaxed transition", checked ? "border-emerald-300/20 bg-emerald-300/[0.05]" : "border-border bg-surface")}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5" /><span className="text-muted-foreground">{children}</span></label>;
}
