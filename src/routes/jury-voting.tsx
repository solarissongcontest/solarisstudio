import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  Vote,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/AppShell";
import { DelayedConfirmationState } from "@/components/DelayedConfirmationState";
import { ParticipationRouteChrome, ParticipationServiceShell } from "@/components/ParticipationServiceShell";
import { Button } from "@/components/ui/button";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import {
  attestCountryJuryVote,
  preflightCountryJuryVote,
} from "@/integrations/jury-voting/jury-voting.functions";
import { buildTelevotingClientIdentity } from "@/integrations/televoting/anti-abuse";
import {
  VOTE_INTEGRITY_ATTESTATION,
  VOTE_INTEGRITY_CONSEQUENCE,
  type VoteIntegrityReport,
  type VoteIntegritySeverity,
} from "@/integrations/televoting/integrity";
import { cn } from "@/lib/utils";

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

type Stage = "vote" | "integrity" | "done";

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

function JuryVotingPage() {
  const queryClient = useQueryClient();
  const { data: context, isLoading, error } = useQuery<JuryContext>({
    queryKey: ["country-jury-voting-context"],
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

  const rounds = context?.rounds ?? [];
  const openRound = rounds.find(
    (round) => round.status === "open" && round.eligible && !round.already_submitted,
  );

  if (isLoading) {
    return (
      <JuryVotingFrame description="Loading the current jury voting status…">
        <Panel><p className="text-sm text-muted-foreground">Loading jury voting…</p></Panel>
      </JuryVotingFrame>
    );
  }

  if (error) {
    return (
      <JuryVotingFrame description="The jury voting service could not be loaded.">
        <Panel><p className="text-sm text-red-200">{error instanceof Error ? error.message : "Jury voting is unavailable."}</p></Panel>
      </JuryVotingFrame>
    );
  }

  if (!context?.ok) {
    const notSignedIn = context?.error === "not_authenticated";
    const needsCountry = context?.error === "country_account_required";
    return (
      <JuryVotingFrame description="Jury ballots are official delegation votes, so they can only be submitted from a signed-in country account.">
        <Panel title={notSignedIn ? "Sign in first" : needsCountry ? "Country account required" : "Jury voting unavailable"}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {notSignedIn
              ? "Sign in to Solaris Studio with the account connected to your delegation."
              : needsCountry
                ? "Finish your country-account setup before trying to submit a jury ballot."
                : "This account cannot jury vote right now."}
          </p>
          <Link
            to={notSignedIn ? "/auth" : "/my-solaris"}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            {notSignedIn ? "Sign in" : "Open My Solaris"}
          </Link>
        </Panel>
      </JuryVotingFrame>
    );
  }

  return (
    <JuryVotingFrame description={`Signed in for ${context.country?.name ?? "your country"}. Jury voting only becomes available when the organizer opens it for a show.`}>
      <div className="space-y-4">
        <Panel>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-amber-300/25 bg-amber-300/10 text-amber-200">
              <ShieldAlert className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">Friend voting is not allowed</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Your jury ballot must reflect your own independent preferences. Do not coordinate votes, trade support, reward friends, copy another delegation, or vote under pressure. Solaris automatically checks historical <strong className="text-foreground">jury and televote</strong> patterns before accepting the ballot.
              </p>
            </div>
          </div>
        </Panel>

        {openRound && context.country && context.accessToken ? (
          <JuryBallotBooth
            round={openRound}
            country={context.country}
            accessToken={context.accessToken}
            onSubmitted={() =>
              void queryClient.invalidateQueries({ queryKey: ["country-jury-voting-context"] })
            }
          />
        ) : (
          <Panel title="Current status" description="Show-by-show organizer control">
            {rounds.length ? (
              <div className="divide-y divide-border/60">
                {rounds.map((round) => (
                  <div key={round.show_id} className="flex min-w-0 items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">SSC {round.edition_number} · {round.show_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {round.already_submitted
                          ? "Your country's jury ballot is already recorded."
                          : !round.eligible
                            ? "Your country is not in this show's jury roster."
                            : round.status === "open"
                              ? "Jury voting is open."
                              : "Jury voting is closed."}
                      </p>
                    </div>
                    <span className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]",
                      round.already_submitted
                        ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
                        : round.status === "open"
                          ? "border-primary/25 bg-primary/10 text-primary"
                          : "border-border bg-surface text-muted-foreground",
                    )}>
                      {round.already_submitted ? "Recorded" : round.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-surface p-4">
                <LockKeyhole className="size-5 text-muted-foreground" />
                <p className="mt-2 text-sm font-semibold">No jury voting window is open</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  The organizer has not opened country-account jury voting for an active show yet.
                </p>
              </div>
            )}
          </Panel>
        )}
      </div>
    </JuryVotingFrame>
  );
}

function JuryVotingFrame({ children, description }: { children: ReactNode; description: string }) {
  return (
    <ParticipationRouteChrome>
      <ParticipationServiceShell service="jury" title="Jury voting" description={description} maxWidth="max-w-6xl">
        {children}
      </ParticipationServiceShell>
    </ParticipationRouteChrome>
  );
}

function JuryBallotBooth({
  round,
  country,
  accessToken,
  onSubmitted,
}: {
  round: JuryRound;
  country: JuryCountry;
  accessToken: string;
  onSubmitted: () => void;
}) {
  const preflight = useServerFn(preflightCountryJuryVote);
  const attest = useServerFn(attestCountryJuryVote);
  const [stage, setStage] = useState<Stage>("vote");
  const [selections, setSelections] = useState<Array<string | null>>(
    () => round.point_scale.map(() => null),
  );
  const [acceptedRule, setAcceptedRule] = useState(false);
  const [report, setReport] = useState<VoteIntegrityReport | null>(null);
  const [signedName, setSignedName] = useState("");
  const [acceptedAutomatic, setAcceptedAutomatic] = useState(false);
  const [acceptedIndependence, setAcceptedIndependence] = useState(false);
  const [acceptedConsequences, setAcceptedConsequences] = useState(false);

  const ballot = useMemo(
    () =>
      round.point_scale
        .map((points, index) => ({ target_country_id: selections[index], points }))
        .filter(
          (entry): entry is { target_country_id: string; points: number } =>
            Boolean(entry.target_country_id),
        ),
    [round.point_scale, selections],
  );
  const complete = ballot.length === round.point_scale.length;

  const submitMutation = useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.rpc("submit_country_jury_ballot", {
        _show_id: round.show_id,
        _entries: ballot,
        _preflight_id: token,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      setStage("done");
      onSubmitted();
      toast.success("Your jury ballot has been recorded");
    },
    onError: (caught) => {
      toast.error(caught instanceof Error ? caught.message : "Your jury ballot could not be submitted");
    },
  });

  const preflightMutation = useMutation({
    mutationFn: async () => {
      if (!complete) throw new Error("Assign every jury score before continuing");
      if (!acceptedRule) throw new Error("Confirm that you understand the friend-voting rule");
      const identity = await buildTelevotingClientIdentity();
      return preflight({
        data: {
          showId: round.show_id,
          entries: ballot,
          accessToken,
          fingerprintHash: identity.fingerprintHash,
          deviceTokenHash: identity.deviceTokenHash,
        },
      });
    },
    onSuccess: (nextReport) => {
      setReport(nextReport);
      if (nextReport.requiresAttestation) {
        setSignedName("");
        setAcceptedAutomatic(false);
        setAcceptedIndependence(false);
        setAcceptedConsequences(false);
        setStage("integrity");
      } else {
        submitMutation.mutate(nextReport.token);
      }
    },
    onError: (caught) => {
      toast.error(caught instanceof Error ? caught.message : "The automatic integrity check failed");
    },
  });

  const attestationMutation = useMutation({
    mutationFn: async () => {
      if (!report) throw new Error("Run the integrity check again");
      await attest({
        data: {
          token: report.token,
          signedName,
          acceptedAutomaticDetection: true,
          acceptedIndependence: true,
          acceptedConsequences: true,
        },
      });
      return report.token;
    },
    onSuccess: (token) => submitMutation.mutate(token),
    onError: (caught) => {
      toast.error(caught instanceof Error ? caught.message : "The integrity declaration could not be recorded");
    },
  });

  function selectCountry(index: number, countryId: string) {
    setReport(null);
    setSelections((previous) =>
      previous.map((value, itemIndex) => {
        if (itemIndex === index) return countryId || null;
        if (countryId && value === countryId) return null;
        return value;
      }),
    );
  }

  if (stage === "done") {
    return (
      <DelayedConfirmationState
        pendingTitle="Jury ballot stored"
        pendingDescription={`Solaris has accepted ${country.name}'s jury ballot for ${round.show_name}. The official vote is already in the database.`}
        confirmedTitle="Jury vote confirmed"
        confirmedDescription={`${country.name}'s jury ballot for ${round.show_name} is recorded. The organizer can still correct it from the existing admin jury workspace if needed.`}
      />
    );
  }

  if (stage === "integrity" && report) {
    const canSign =
      signedName.trim().toLowerCase() === country.username.trim().toLowerCase() &&
      acceptedAutomatic &&
      acceptedIndependence &&
      acceptedConsequences;

    return (
      <div className="space-y-4">
        <section className={cn("rounded-2xl border p-5 sm:p-7", severityClass(report.severity))}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <ShieldAlert className="size-6 shrink-0" />
                <p className="text-xs font-black uppercase tracking-[0.15em]">Automatic Voting Integrity System</p>
                <span className="rounded-full border border-current/20 px-2.5 py-1 text-[10px] font-bold">
                  {severityLabel(report.severity)} · {report.riskScore}/100
                </span>
              </div>
              <h2 className="mt-4 text-2xl font-black sm:text-3xl">Your jury ballot was automatically flagged</h2>
              <p className="mt-3 text-sm leading-6 opacity-90">
                <strong>No person flagged this ballot.</strong> Solaris compared it with historical jury and televote patterns connected to your delegation and HOD history.
              </p>
              <p className="mt-2 text-sm leading-6 opacity-80">
                A flag is not proof of misconduct. You may change the ballot, or review the evidence and sign the same integrity declaration used for flagged televotes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setReport(null);
                setStage("vote");
              }}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-current/25 bg-black/15 px-4 text-sm font-bold"
            >
              <ArrowLeft className="size-4" /> Change my votes
            </button>
          </div>
        </section>

        <Panel title="Why the system flagged it" description="Statistical context, not a verdict">
          <div className="space-y-3">
            {report.findings.length ? report.findings.map((finding, index) => (
              <article key={`${finding.lens}-${finding.targetCode}-${index}`} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{finding.targetName}</p>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {finding.lens === "hod" ? "HOD history" : "Country history"}
                  </span>
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[9px] font-bold text-amber-200">
                    Signal {finding.riskScore}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{finding.scopeLabel}</p>
                {finding.reasons.length ? (
                  <ul className="mt-3 space-y-1 text-xs leading-relaxed text-muted-foreground">
                    {finding.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
                  </ul>
                ) : null}
                {finding.crossChannelEditions > 0 ? (
                  <p className="mt-2 text-xs font-semibold text-amber-200">
                    Jury + televote reinforcement in {finding.crossChannelEditions} edition{finding.crossChannelEditions === 1 ? "" : "s"}.
                  </p>
                ) : null}
              </article>
            )) : (
              <p className="text-sm text-muted-foreground">The combined risk score crossed the automatic review threshold.</p>
            )}
          </div>
        </Panel>

        <Panel title="Integrity declaration" description="Sign only if this ballot is genuinely independent">
          <div className="space-y-3">
            <IntegrityCheckbox checked={acceptedAutomatic} onChange={setAcceptedAutomatic}>
              I understand that Solaris' automatic Voting Integrity System generated this warning and that the flag is not by itself a finding of misconduct.
            </IntegrityCheckbox>
            <IntegrityCheckbox checked={acceptedIndependence} onChange={setAcceptedIndependence}>
              {VOTE_INTEGRITY_ATTESTATION}
            </IntegrityCheckbox>
            <IntegrityCheckbox checked={acceptedConsequences} onChange={setAcceptedConsequences}>
              {VOTE_INTEGRITY_CONSEQUENCE}
            </IntegrityCheckbox>

            <label className="block rounded-xl border border-border bg-surface p-3">
              <span className="text-[10px] font-black uppercase tracking-[0.13em] text-muted-foreground">Type your Solaris username to sign</span>
              <input
                value={signedName}
                onChange={(event) => setSignedName(event.target.value)}
                placeholder={country.username}
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </label>

            <Button
              className="w-full"
              disabled={!canSign || attestationMutation.isPending || submitMutation.isPending}
              onClick={() => attestationMutation.mutate()}
            >
              {attestationMutation.isPending || submitMutation.isPending ? "Recording declaration…" : "Sign declaration and submit jury vote"}
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <Panel
      title={`${round.show_name} jury ballot`}
      description={`SSC ${round.edition_number} · Assign each jury score exactly once.`}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-200" />
            <div>
              <p className="text-sm font-semibold text-amber-100">Vote independently</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Friend voting, reciprocal deals and coordinated voting are forbidden. The automatic check runs before the ballot is accepted.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {round.point_scale.map((points, index) => {
            const selected = selections[index] ?? "";
            return (
              <div key={`${points}-${index}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 rounded-xl border border-border bg-surface p-2.5">
                <div className="text-center">
                  <p className="numeric text-xl font-black text-primary">{points}</p>
                  <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground">points</p>
                </div>
                <select
                  value={selected}
                  onChange={(event) => selectCountry(index, event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="">Choose entry…</option>
                  {round.entries
                    .filter((entry) => round.allow_self_vote || entry.country_id !== country.id)
                    .map((entry) => (
                      <option key={entry.country_id} value={entry.country_id}>
                        {entry.name} · {[entry.artist, entry.song].filter(Boolean).join(" — ") || entry.short_code}
                      </option>
                    ))}
                </select>
              </div>
            );
          })}
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
          <input
            type="checkbox"
            checked={acceptedRule}
            onChange={(event) => setAcceptedRule(event.target.checked)}
            className="mt-0.5"
          />
          <span className="leading-relaxed text-muted-foreground">
            I understand that <strong className="text-foreground">friend voting is not allowed</strong> and confirm that this jury ballot reflects my own independent preferences.
          </span>
        </label>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-xs text-muted-foreground">
          <span>{ballot.length}/{round.point_scale.length} scores assigned</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-primary" /> Automatic integrity check
          </span>
        </div>

        <Button
          className="w-full"
          disabled={!complete || !acceptedRule || preflightMutation.isPending || submitMutation.isPending}
          onClick={() => preflightMutation.mutate()}
        >
          <Vote className="size-4" />
          {preflightMutation.isPending || submitMutation.isPending ? "Checking ballot…" : "Review and submit jury vote"}
        </Button>
      </div>
    </Panel>
  );
}

function IntegrityCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3 text-sm leading-relaxed">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5"
      />
      <span className="text-muted-foreground">{children}</span>
    </label>
  );
}
