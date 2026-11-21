import { canReuseTelevoteAttempt, initialTelevoteStage, recoverTelevoteTransportResponse, type TelevoteAttemptSnapshot } from "@/lib/v3-televote-reconciliation";
import { readTelevoteReceipt, writeTelevoteReceipt } from "@/lib/v3-televote-receipt-storage";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CheckCircle2,
  Minus,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Vote,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildTelevotingClientIdentity,
  hasSubmittedTelevotingRound,
  markTelevotingRoundSubmitted,
} from "@/integrations/televoting/anti-abuse";
import { televotingSupabase } from "@/integrations/televoting/client";
import { VotingDeclarationCheckbox, VotingIntegrityReasonList } from "@/components/voting/VotingIntegrityExplanation";
import { VOTER_DECLARATION_LABELS, voterIntegrityMessage } from "@/integrations/televoting/voter-integrity-copy";
import {
  VOTE_INTEGRITY_AUTOMATION,
  VOTE_INTEGRITY_CONSEQUENCE,
  VOTE_INTEGRITY_COORDINATION,
  VOTE_INTEGRITY_INDEPENDENCE,
  VOTE_INTEGRITY_PRESSURE,
  type VoteIntegrityReport,
  type VoteIntegritySeverity,
} from "@/integrations/televoting/integrity";
import {
  attestMergedTelevotingVote,
  preflightMergedTelevotingVote,
  submitMergedTelevotingVote,
  reconcileMergedTelevotingVote,
  type TelevotingVoteEntry,
} from "@/integrations/televoting/vote.functions";
import { cn } from "@/lib/utils";

export type MergedTelevotingEntry = {
  id: string;
  entry_key: string;
  entry_type: string;
  country_code: string | null;
  display_name: string;
  display_code: string;
  subtitle: string | null;
  image: string | null;
  flag: string | null;
  display_order: number;
};

type Country = {
  code: string;
  name: string;
  flag: string | null;
  flag_url: string | null;
};

type Stage = "remembered" | "register" | "vote" | "review" | "integrity" | "done";
type ClientIdentity = Awaited<ReturnType<typeof buildTelevotingClientIdentity>>;

const TOTAL = 20;
const MAX_PER_ENTRY = 10;
const MIN_ENTRIES = 5;
const taskDraftKey = (roundId: string) => `solaris:televote-task-draft:${roundId}`;

type TelevoteTaskDraft = {
  username: string;
  home: string;
  points: Record<string, number>;
  stage: "register" | "vote";
};

function readTaskDraft(roundId: string): TelevoteTaskDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(taskDraftKey(roundId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TelevoteTaskDraft>;
    return {
      username: typeof parsed.username === "string" ? parsed.username : "",
      home: typeof parsed.home === "string" ? parsed.home : "",
      points: parsed.points && typeof parsed.points === "object" ? parsed.points as Record<string, number> : {},
      stage: parsed.stage === "vote" ? "vote" : "register",
    };
  } catch {
    return null;
  }
}

function storedReceipt(roundId: string) {
  if (typeof window === "undefined") return false;
  try {
    return readTelevoteReceipt(window.localStorage, roundId) !== null;
  } catch {
    // Accessing localStorage itself may throw in restricted browser contexts.
    return false;
  }
}

function severityClass(severity: VoteIntegritySeverity) {
  if (severity === "critical") return "border-red-300/30 bg-red-300/10 text-red-100";
  if (severity === "high") return "border-orange-300/30 bg-orange-300/10 text-orange-100";
  if (severity === "strong") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  if (severity === "review") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  return "border-sky-300/20 bg-sky-300/10 text-sky-100";
}

export function TelevotingBooth({
  roundId,
  roundName,
  editionName,
  entries,
  selfVotingMode,
}: {
  roundId: string;
  roundName: string;
  editionName?: string | null;
  entries: MergedTelevotingEntry[];
  selfVotingMode?: string | null;
}) {
  const alreadyVoted = hasSubmittedTelevotingRound(roundId) || storedReceipt(roundId);
  const restoredTask = useMemo(() => readTaskDraft(roundId), [roundId]);
  const [stage, setStage] = useState<Stage>(initialTelevoteStage(alreadyVoted, restoredTask?.stage));
  const [username, setUsername] = useState(restoredTask?.username ?? "");
  const [home, setHome] = useState(restoredTask?.home ?? "");
  const [points, setPoints] = useState<Record<string, number>>(restoredTask?.points ?? {});
  const [search, setSearch] = useState("");
  const [integrityReport, setIntegrityReport] = useState<VoteIntegrityReport | null>(null);
  const [pendingBallot, setPendingBallot] = useState<TelevotingVoteEntry[]>([]);
  const [pendingIdentity, setPendingIdentity] = useState<ClientIdentity | null>(null);
  const [attemptedBallot, setAttemptedBallot] = useState<TelevoteAttemptSnapshot | null>(null);
  const [signedName, setSignedName] = useState("");
  const [acceptedAutomatic, setAcceptedAutomatic] = useState(false);
  const [acceptedIndependence, setAcceptedIndependence] = useState(false);
  const [acceptedCoordination, setAcceptedCoordination] = useState(false);
  const [acceptedPressure, setAcceptedPressure] = useState(false);
  const [acceptedConsequences, setAcceptedConsequences] = useState(false);

  const { data: countries = [], isLoading: countriesLoading } = useQuery({
    queryKey: ["merged-televoting-countries"],
    queryFn: async () => {
      const { data, error } = await televotingSupabase
        .from("countries")
        .select("code,name,flag,flag_url")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Country[];
    },
    staleTime: 60_000,
  });

  const preflightVote = useServerFn(preflightMergedTelevotingVote);
  const attestVote = useServerFn(attestMergedTelevotingVote);
  const submitVote = useServerFn(submitMergedTelevotingVote);
  const reconcileVote = useServerFn(reconcileMergedTelevotingVote);
  const used = Object.values(points).reduce((sum, value) => sum + value, 0);
  const entriesUsed = Object.values(points).filter((value) => value > 0).length;
  const remaining = Math.max(0, TOTAL - used);
  const unrestricted = selfVotingMode === "unrestricted";

  useEffect(() => {
    if (typeof window === "undefined" || alreadyVoted || stage === "done") return;
    try {
      window.sessionStorage.setItem(
        taskDraftKey(roundId),
        JSON.stringify({
          username,
          home,
          points,
          stage: stage === "register" ? "register" : "vote",
        } satisfies TelevoteTaskDraft),
      );
    } catch {
      // The active ballot still remains in memory.
    }
  }, [alreadyVoted, home, points, roundId, stage, username]);

  const visibleEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((entry) =>
      [entry.display_name, entry.display_code, entry.subtitle ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [entries, search]);

  function currentBallot() {
    return Object.entries(points)
      .filter(([, value]) => value > 0)
      .map(([entryKey, value]) => ({ target_country_code: entryKey, points: value }));
  }

  const submitMutation = useMutation({
    mutationFn: async ({
      token,
      ballot,
      identity,
    }: {
      token: string;
      ballot: TelevotingVoteEntry[];
      identity: ClientIdentity;
    }) => {
      const data = {
          roundId,
          username: username.trim(),
          countryCode: home,
          entries: ballot,
          preflightToken: token,
          fingerprintHash: identity.fingerprintHash,
          deviceTokenHash: identity.deviceTokenHash,
      };
      setAttemptedBallot({ roundId: data.roundId, preflightToken: token, username: data.username, countryCode: data.countryCode, entries: ballot.map((entry) => ({ ...entry })) });
      const result = await recoverTelevoteTransportResponse(
        () => submitVote({ data }),
        () => reconcileVote({ data }),
      );
      return { result, ballot };
    },
    onSuccess: ({ result }) => {
      const governance = markTelevotingRoundSubmitted(roundId, {
        submissionId: result.id,
        acknowledgedAt: result.accepted_at ?? null,
      });
      try {
        writeTelevoteReceipt(window.localStorage, roundId, governance);
      } catch {
        // The database remains authoritative.
      }
      try {
        window.sessionStorage.removeItem(taskDraftKey(roundId));
      } catch {
        // The recorded ballot is authoritative.
      }
      setStage("done");
      toast.success("Your vote has been recorded");
    },
    onError: (caught) => {
      const message = caught instanceof Error ? caught.message : "Could not submit your vote";
      toast.error(message);
      // A duplicate identity or device is not proof that this ballot was accepted.
      // Keep the ballot available until an authoritative submission is returned.
      if (/integrity check|ballot changed|connection or device identity changed/i.test(message)) {
        returnToBallot();
      }
    },
  });

  const preflightMutation = useMutation({
    mutationFn: async () => {
      const identity = await buildTelevotingClientIdentity();
      const ballot = currentBallot();
      const report = await preflightVote({
        data: {
          roundId,
          username: username.trim(),
          countryCode: home,
          entries: ballot,
          fingerprintHash: identity.fingerprintHash,
          deviceTokenHash: identity.deviceTokenHash,
        },
      });
      return { report, identity, ballot };
    },
    onSuccess: ({ report, identity, ballot }) => {
      setIntegrityReport(report);
      setPendingIdentity(identity);
      setPendingBallot(ballot);
      if (report.requiresAttestation) {
        resetDeclarationState();
        setStage("integrity");
        return;
      }
      if (report.interventionLevel === "notice" || report.interventionLevel === "review") {
        setStage("review");
        return;
      }
      submitMutation.mutate({ token: report.token, ballot, identity });
    },
    onError: (caught) => {
      toast.error(caught instanceof Error ? caught.message : "Automatic voting integrity check failed");
    },
  });

  const attestationMutation = useMutation({
    mutationFn: async () => {
      if (!integrityReport || !pendingIdentity || !pendingBallot.length) {
        throw new Error("Return to the ballot and run the integrity check again");
      }
      await attestVote({
        data: {
          token: integrityReport.token,
          signedName,
          acceptedAutomaticDetection: acceptedAutomatic,
          acceptedIndependence,
          acceptedCoordination,
          acceptedPressure,
          acceptedConsequences,
        },
      });
      return { token: integrityReport.token, ballot: pendingBallot, identity: pendingIdentity };
    },
    onSuccess: (payload) => submitMutation.mutate(payload),
    onError: (caught) => {
      toast.error(caught instanceof Error ? caught.message : "Could not record the integrity declaration");
    },
  });

  function resetDeclarationState() {
    setSignedName("");
    setAcceptedAutomatic(false);
    setAcceptedIndependence(false);
    setAcceptedCoordination(false);
    setAcceptedPressure(false);
    setAcceptedConsequences(false);
  }

  function clearIntegrityState() {
    setIntegrityReport(null);
    setPendingBallot([]);
    setPendingIdentity(null);
    resetDeclarationState();
  }

  function returnToBallot() {
    clearIntegrityState();
    setStage("vote");
  }

  function reviewOrRetryBallot() {
    const retained = integrityReport && pendingIdentity && canReuseTelevoteAttempt(attemptedBallot, {
      roundId, preflightToken: integrityReport.token, username, countryCode: home, entries: currentBallot(),
    });
    if (retained) {
      submitPendingReviewedBallot();
      return;
    }
    preflightMutation.mutate();
  }

  function submitPendingReviewedBallot() {
    if (!integrityReport || !pendingIdentity || !pendingBallot.length) return;
    submitMutation.mutate({
      token: integrityReport.token,
      ballot: pendingBallot,
      identity: pendingIdentity,
    });
  }

  function adjust(entryKey: string, delta: number) {
    if (preflightMutation.isPending || submitMutation.isPending || attestationMutation.isPending) return;
    clearIntegrityState();
    setPoints((previous) => {
      const current = previous[entryKey] ?? 0;
      const otherTotal = Object.values(previous).reduce((sum, value) => sum + value, 0) - current;
      let next = Math.max(0, Math.min(MAX_PER_ENTRY, current + delta));
      if (otherTotal + next > TOTAL) next = Math.max(0, TOTAL - otherTotal);
      const output = { ...previous, [entryKey]: next };
      if (next === 0) delete output[entryKey];
      return output;
    });
  }

  if (stage === "remembered") {
    return (
      <section className="glass-strong p-7 text-center sm:p-9">
        <h2 className="text-2xl font-medium">This device remembers a vote</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          A browser record cannot verify the ballot on the server. The normal server duplicate protections still apply.
        </p>
        <Button className="mt-5" onClick={() => setStage("register")}>Review a ballot</Button>
      </section>
    );
  }

  if (stage === "done") {
    return (
      <section className="glass-strong p-7 text-center sm:p-9">
        <CheckCircle2 className="mx-auto size-9 text-emerald-200" />
        <h2 className="mt-4 text-2xl font-medium">{integrityReport?.interventionLevel === "provisional_review" ? "Vote submitted for review" : integrityReport?.requiresAttestation ? "Declaration submitted" : "Vote recorded"}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {integrityReport?.interventionLevel === "provisional_review"
            ? `Your vote for ${roundName} has been recorded for organizer review. It has not been automatically rejected.`
            : integrityReport?.requiresAttestation
              ? `Your vote and signed declaration for ${roundName} have been recorded. Organizers may review the vote if needed.`
              : `Your vote for ${roundName} has been recorded.`}
        </p>
      </section>
    );
  }

  if (stage === "register") {
    const canContinue = username.trim().length >= 2 && Boolean(home) && !countriesLoading;
    return (
      <section className="glass-strong mx-auto max-w-lg p-6 sm:p-8">
        <header className="text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-sky-100/65">{editionName ? `${editionName} · ` : ""}{roundName}</p>
          <h2 className="mt-2 text-2xl font-medium">Register to vote</h2>
          <p className="mt-2 text-sm text-muted-foreground">Choose a display name and the fictional Solaris country you represent.</p>
        </header>
        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="merged-vote-username" className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Username</label>
            <Input id="merged-vote-username" className="mt-2" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={40} placeholder="e.g. NordicFan21" />
          </div>
          <div>
            <label htmlFor="merged-vote-country" className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Your Solaris country</label>
            <select id="merged-vote-country" value={home} onChange={(event) => setHome(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/12 bg-black/20 px-3 text-sm" disabled={countriesLoading}>
              <option value="">{countriesLoading ? "Loading countries…" : "Select your country…"}</option>
              {countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
            </select>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              This is your fictional delegation identity. Solaris does <strong className="text-foreground">not</strong> expect your real-world IP location to match this country.
              {unrestricted ? " Self-voting is allowed in this round." : " Your own country entry is locked where applicable."}
            </p>
          </div>
        </div>
        <Button className="mt-6 w-full" disabled={!canContinue} onClick={() => setStage("vote")}><Vote className="size-4" /> Enter voting booth</Button>
      </section>
    );
  }

  if (stage === "review" && integrityReport) {
    const message = voterIntegrityMessage(integrityReport.interventionLevel);
    return (
      <section className="mx-auto max-w-2xl space-y-4">
        <div className={cn("rounded-2xl border p-5 sm:p-6", severityClass(integrityReport.severity))}>
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-6 shrink-0" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide">Voting check</p>
              <h2 className="mt-2 text-xl font-bold">{message.title}</h2>
              <p className="mt-2 text-sm leading-6">{message.body}</p>
            </div>
          </div>
        </div>
        <VotingIntegrityReasonList categories={integrityReport.reasonCategories} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" className="min-h-12" onClick={returnToBallot} disabled={attestationMutation.isPending || submitMutation.isPending}>
            <ArrowLeft className="size-4" /> Change my votes
          </Button>
          <Button className="min-h-12" onClick={submitPendingReviewedBallot} disabled={submitMutation.isPending}>
            <ShieldCheck className="size-4" /> {submitMutation.isPending ? "Submitting…" : "My votes are correct"}
          </Button>
        </div>
      </section>
    );
  }

  if (stage === "integrity" && integrityReport) {
    const canSign =
      signedName.trim().toLowerCase() === username.trim().toLowerCase() &&
      acceptedAutomatic &&
      acceptedIndependence &&
      acceptedCoordination &&
      acceptedPressure &&
      acceptedConsequences;
    const provisional = integrityReport.interventionLevel === "provisional_review";
    const message = voterIntegrityMessage(integrityReport.interventionLevel);

    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <div className={cn("rounded-2xl border p-5 sm:p-7", severityClass(integrityReport.severity))}>
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-6 shrink-0" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide">Voting check</p>
              <h2 className="mt-2 text-2xl font-bold">{message.title}</h2>
              <p className="mt-2 text-sm leading-6">{message.body}</p>
              <p className="mt-2 text-sm leading-6">Nothing has been submitted yet. You can go back and change your votes.</p>
            </div>
          </div>
        </div>
        <VotingIntegrityReasonList categories={integrityReport.reasonCategories} />
        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <h3 className="text-xl font-bold">Voting declaration</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {provisional
              ? "Your vote will be recorded for organizer review after you sign. It will not be rejected automatically."
              : "Please read and confirm each statement before submitting."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">The full wording of each statement is available below it and is part of what you sign.</p>
          <div className="mt-4 space-y-3">
            <VotingDeclarationCheckbox checked={acceptedAutomatic} onChange={setAcceptedAutomatic} shortText={VOTER_DECLARATION_LABELS.automation} fullText={VOTE_INTEGRITY_AUTOMATION} />
            <VotingDeclarationCheckbox checked={acceptedIndependence} onChange={setAcceptedIndependence} shortText={VOTER_DECLARATION_LABELS.independence} fullText={VOTE_INTEGRITY_INDEPENDENCE} />
            <VotingDeclarationCheckbox checked={acceptedCoordination} onChange={setAcceptedCoordination} shortText={VOTER_DECLARATION_LABELS.coordination} fullText={VOTE_INTEGRITY_COORDINATION} />
            <VotingDeclarationCheckbox checked={acceptedPressure} onChange={setAcceptedPressure} shortText={VOTER_DECLARATION_LABELS.pressure} fullText={VOTE_INTEGRITY_PRESSURE} />
            <VotingDeclarationCheckbox checked={acceptedConsequences} onChange={setAcceptedConsequences} shortText={VOTER_DECLARATION_LABELS.consequences} fullText={VOTE_INTEGRITY_CONSEQUENCE} />
          </div>
          <label className="mt-5 block">
            <span className="text-sm font-semibold">Type your voting username to sign</span>
            <Input value={signedName} onChange={(event) => setSignedName(event.target.value)} placeholder={username.trim()} autoComplete="off" className="mt-2" />
          </label>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="min-h-12" onClick={returnToBallot} disabled={attestationMutation.isPending || submitMutation.isPending}>
              <ArrowLeft className="size-4" /> Change my votes
            </Button>
            <Button type="button" className="min-h-12" disabled={!canSign || attestationMutation.isPending || submitMutation.isPending} onClick={() => attestationMutation.mutate()}>
              <PenLine className="size-4" /> {attestationMutation.isPending || submitMutation.isPending ? "Recording declaration…" : provisional ? "Sign and submit for review" : "Sign and submit"}
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const canSubmit = used === TOTAL && entriesUsed >= MIN_ENTRIES;
  const checking = preflightMutation.isPending || submitMutation.isPending;

  return (
    <section className="space-y-4">
      <div className="glass-strong sticky top-20 z-20 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-sky-100/65">{roundName}</p>
            <p className="mt-1 text-sm text-muted-foreground">Voting as <span className="text-foreground">{username}</span> · {home}</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className={cn("rounded-full border px-3 py-1.5", remaining === 0 ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-white/10 text-muted-foreground")}>{remaining} points left</span>
            <span className={cn("rounded-full border px-3 py-1.5", entriesUsed >= MIN_ENTRIES ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-white/10 text-muted-foreground")}>{entriesUsed}/{MIN_ENTRIES}+ entries</span>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${Math.min(100, (used / TOTAL) * 100)}%` }} /></div>
      </div>

      <div className="glass p-3">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search entries…" className="pl-9" /></div>
      </div>

      <div className="space-y-2">
        {visibleEntries.map((entry) => {
          const value = points[entry.entry_key] ?? 0;
          const ownEntry = !unrestricted && Boolean(home) && entry.entry_type === "country" && entry.country_code === home;
          return (
            <article key={entry.id} className={cn("glass grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center", ownEntry && "opacity-45")}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                  {entry.image ? <img src={entry.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <span className="text-lg">{entry.flag || "✦"}</span>}
                </div>
                <div className="min-w-0"><p className="truncate font-medium">{entry.display_name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{entry.display_code}{entry.subtitle ? ` · ${entry.subtitle}` : ""}{ownEntry ? " · your entry" : ""}</p></div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" size="sm" variant="outline" disabled={checking || ownEntry || value <= 0} onClick={() => adjust(entry.entry_key, -1)}><Minus className="size-3.5" /></Button>
                <span className="w-8 text-center text-xl font-medium tabular-nums">{value}</span>
                <Button type="button" size="sm" variant="outline" disabled={checking || ownEntry || value >= MAX_PER_ENTRY || remaining <= 0} onClick={() => adjust(entry.entry_key, 1)}><Plus className="size-3.5" /></Button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="televote-submit-bar glass-strong flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={() => { clearIntegrityState(); setPoints({}); }} disabled={!used || checking}><RotateCcw className="size-4" /> Reset ballot</Button>
        <div className="televote-submit-help text-xs leading-5 text-muted-foreground sm:text-right">Exactly 20 points · at least 5 entries · max 10 per entry<br /><span className="text-sky-100/65">Every ballot is checked for current and historical integrity patterns before submission.</span></div>
        <Button disabled={!canSubmit || checking} onClick={reviewOrRetryBallot}><ShieldAlert className="size-4" /> {checking ? "Checking ballot…" : "Review & submit"}</Button>
      </div>
    </section>
  );
}
