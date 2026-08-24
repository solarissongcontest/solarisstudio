import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Minus,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
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
import {
  VOTE_INTEGRITY_ATTESTATION,
  VOTE_INTEGRITY_CONSEQUENCE,
  type VoteIntegrityReport,
  type VoteIntegritySeverity,
} from "@/integrations/televoting/integrity";
import {
  attestMergedTelevotingVote,
  preflightMergedTelevotingVote,
  submitMergedTelevotingVote,
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

type Stage = "register" | "vote" | "integrity" | "done";
type ClientIdentity = Awaited<ReturnType<typeof buildTelevotingClientIdentity>>;

const TOTAL = 20;
const MAX_PER_ENTRY = 10;
const MIN_ENTRIES = 5;
const receiptKey = (roundId: string) => `ssc_vote_receipt:${roundId}`;

function storedReceipt(roundId: string) {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(localStorage.getItem(receiptKey(roundId)));
  } catch {
    return false;
  }
}

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
  const [stage, setStage] = useState<Stage>(alreadyVoted ? "done" : "register");
  const [username, setUsername] = useState("");
  const [home, setHome] = useState("");
  const [points, setPoints] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [integrityReport, setIntegrityReport] = useState<VoteIntegrityReport | null>(null);
  const [pendingBallot, setPendingBallot] = useState<TelevotingVoteEntry[]>([]);
  const [pendingIdentity, setPendingIdentity] = useState<ClientIdentity | null>(null);
  const [signedName, setSignedName] = useState("");
  const [acceptedAutomatic, setAcceptedAutomatic] = useState(false);
  const [acceptedIndependence, setAcceptedIndependence] = useState(false);
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
  const used = Object.values(points).reduce((sum, value) => sum + value, 0);
  const entriesUsed = Object.values(points).filter((value) => value > 0).length;
  const remaining = Math.max(0, TOTAL - used);
  const unrestricted = selfVotingMode === "unrestricted";

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
      const result = await submitVote({
        data: {
          roundId,
          username: username.trim(),
          countryCode: home,
          entries: ballot,
          preflightToken: token,
          fingerprintHash: identity.fingerprintHash,
          deviceTokenHash: identity.deviceTokenHash,
        },
      });
      return { result, ballot };
    },
    onSuccess: ({ ballot }) => {
      markTelevotingRoundSubmitted(roundId);
      try {
        localStorage.setItem(
          receiptKey(roundId),
          JSON.stringify({ username: username.trim(), home, breakdown: ballot }),
        );
      } catch {
        // The database remains authoritative.
      }
      setStage("done");
      toast.success("Your vote has been recorded");
    },
    onError: (caught) => {
      const message = caught instanceof Error ? caught.message : "Could not submit your vote";
      toast.error(message);
      if (/already voted|already recorded/i.test(message)) {
        markTelevotingRoundSubmitted(roundId);
        setStage("done");
      } else if (/integrity check|ballot changed|connection or device identity changed/i.test(message)) {
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
        setSignedName("");
        setAcceptedAutomatic(false);
        setAcceptedIndependence(false);
        setAcceptedConsequences(false);
        setStage("integrity");
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
          acceptedConsequences,
        },
      });
      return {
        token: integrityReport.token,
        ballot: pendingBallot,
        identity: pendingIdentity,
      };
    },
    onSuccess: (payload) => submitMutation.mutate(payload),
    onError: (caught) => {
      toast.error(caught instanceof Error ? caught.message : "Could not record the integrity declaration");
    },
  });

  function clearIntegrityState() {
    setIntegrityReport(null);
    setPendingBallot([]);
    setPendingIdentity(null);
    setSignedName("");
    setAcceptedAutomatic(false);
    setAcceptedIndependence(false);
    setAcceptedConsequences(false);
  }

  function returnToBallot() {
    clearIntegrityState();
    setStage("vote");
  }

  function adjust(entryKey: string, delta: number) {
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

  if (stage === "done") {
    return (
      <section className="glass-strong p-7 text-center sm:p-9">
        <CheckCircle2 className="mx-auto size-9 text-emerald-200" />
        <h2 className="mt-4 text-2xl font-medium">Vote recorded</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Your ballot for {roundName} has been recorded. Automatic integrity checks and the normal duplicate protections are complete.
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

  if (stage === "integrity" && integrityReport) {
    const canSign =
      signedName.trim().toLowerCase() === username.trim().toLowerCase() &&
      acceptedAutomatic &&
      acceptedIndependence &&
      acceptedConsequences;

    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <div className={cn("rounded-2xl border p-5 sm:p-7", severityClass(integrityReport.severity))}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <ShieldAlert className="size-6 shrink-0" />
                <p className="text-xs font-black uppercase tracking-[0.15em]">Automatic Voting Integrity System</p>
                <span className="rounded-full border border-current/20 px-2.5 py-1 text-[10px] font-bold">{severityLabel(integrityReport.severity)} · {integrityReport.riskScore}/100</span>
              </div>
              <h2 className="mt-4 text-2xl font-black sm:text-3xl">Your ballot was automatically flagged before submission</h2>
              <p className="mt-3 text-sm leading-6 opacity-90">
                <strong>No person flagged this ballot.</strong> Solaris' automatic voting-fraud system compared the ballot with historical voting patterns linked to your HOD and your country, including previous televotes and jury votes.
              </p>
              <p className="mt-2 text-sm leading-6 opacity-80">
                A flag is not proof of misconduct. It means the statistical pattern is strong enough that you must review the ballot and make an explicit declaration if you still want to submit it.
              </p>
            </div>
            <button type="button" onClick={returnToBallot} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-current/25 bg-black/15 px-4 text-sm font-bold">
              <ArrowLeft className="size-4" /> Change my votes
            </button>
          </div>
        </div>

        <div className="glass-strong p-5 sm:p-6">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200/15 bg-emerald-200/[0.055] p-4">
            <PenLine className="mt-0.5 size-5 shrink-0 text-emerald-100" />
            <div>
              <p className="text-sm font-bold text-emerald-100">Nothing has been submitted yet</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">You can go back, change any points you want, and run the automatic check again. The current warning does not lock your ballot.</p>
              <Button type="button" variant="outline" className="mt-3" onClick={returnToBallot}><ArrowLeft className="size-4" /> Go back and change votes</Button>
            </div>
          </div>
        </div>

        <div className="glass-strong p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-100/65">Why the automatic system flagged this</p>
              <h3 className="mt-1 text-xl font-bold">Detected historical relationships</h3>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] text-muted-foreground">Relationship risk {integrityReport.relationshipRisk}/100</span>
          </div>

          <div className="mt-4 space-y-3">
            {integrityReport.findings.map((finding, index) => (
              <article key={`${finding.lens}-${finding.targetCode}-${index}`} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{finding.targetName}</p>
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold">{finding.lens === "hod" ? "HOD history" : "Country history"}</span>
                      <span className="rounded-full border border-amber-200/20 bg-amber-200/[0.07] px-2 py-1 text-[10px] font-semibold text-amber-100">Signal {finding.riskScore}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{finding.scopeLabel}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center text-[10px] sm:grid-cols-3">
                    <MiniStat label="Editions" value={String(finding.uniqueEditions)} />
                    <MiniStat label="Support" value={`${finding.supportFrequency}%`} />
                    <MiniStat label="Confidence" value={`${finding.confidence}%`} />
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs leading-5 text-muted-foreground">
                  {finding.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
                  {finding.crossChannelEditions > 0 ? <li>• Jury + televote reinforcement appears in {finding.crossChannelEditions} edition{finding.crossChannelEditions === 1 ? "" : "s"}.</li> : null}
                  {finding.reciprocalSupport > 0 ? <li>• Historical reciprocal support rate: {finding.reciprocalSupport}%.</li> : null}
                </ul>
              </article>
            ))}
          </div>

          {integrityReport.technicalSignals.length ? (
            <div className="mt-4 space-y-2">
              {integrityReport.technicalSignals.map((signal) => (
                <div key={signal.key} className="rounded-xl border border-violet-200/15 bg-violet-200/[0.045] p-3">
                  <p className="text-xs font-bold text-violet-100">{signal.title}</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{signal.description}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 rounded-xl border border-white/8 bg-black/10 p-3 text-[11px] leading-5 text-muted-foreground">
            Historical check scanned {integrityReport.history.televoteBallotsConsidered} stored televote ballot{integrityReport.history.televoteBallotsConsidered === 1 ? "" : "s"} and {integrityReport.history.juryBallotsConsidered} jury ballot{integrityReport.history.juryBallotsConsidered === 1 ? "" : "s"}. {integrityReport.history.hodHistoryAvailable ? "A historical HOD identity was available for this edition." : "No HOD identity was available for this edition, so country history carries more of the comparison."}
          </div>
        </div>

        <div className="glass-strong border border-red-200/15 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-6 shrink-0 text-red-200" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-100/70">Declaration required to continue</p>
              <h3 className="mt-1 text-xl font-black">If you still want to submit this ballot, sign this declaration</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">You can still avoid signing entirely by going back and changing your votes.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <IntegrityCheckbox checked={acceptedAutomatic} onChange={setAcceptedAutomatic}>
              I understand that <strong>Solaris' automatic Voting Integrity System</strong>, not a person, generated this warning. I have read why my ballot was flagged and understand that an automated flag is not by itself a finding of misconduct.
            </IntegrityCheckbox>
            <IntegrityCheckbox checked={acceptedIndependence} onChange={setAcceptedIndependence}>
              {VOTE_INTEGRITY_ATTESTATION}
            </IntegrityCheckbox>
            <IntegrityCheckbox checked={acceptedConsequences} onChange={setAcceptedConsequences}>
              {VOTE_INTEGRITY_CONSEQUENCE}
            </IntegrityCheckbox>
          </div>

          <label className="mt-5 block">
            <span className="text-xs font-bold text-foreground">Sign by typing your voting username exactly</span>
            <Input value={signedName} onChange={(event) => setSignedName(event.target.value)} placeholder={username.trim()} autoComplete="off" className="mt-2" />
            <span className="mt-2 block text-[11px] text-muted-foreground">Signature must match “{username.trim()}”. The signed declaration is stored with this ballot's integrity record.</span>
          </label>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="min-h-12" onClick={returnToBallot} disabled={attestationMutation.isPending || submitMutation.isPending}>
              <ArrowLeft className="size-4" /> Change my votes instead
            </Button>
            <Button
              type="button"
              className="min-h-12 bg-red-600 text-white hover:bg-red-500"
              disabled={!canSign || attestationMutation.isPending || submitMutation.isPending}
              onClick={() => attestationMutation.mutate()}
            >
              <PenLine className="size-4" />
              {attestationMutation.isPending || submitMutation.isPending ? "Recording declaration…" : "Sign declaration & submit"}
            </Button>
          </div>
        </div>

        <button type="button" onClick={returnToBallot} className="mx-auto flex min-h-11 items-center gap-2 px-4 text-sm font-semibold text-sky-100 underline underline-offset-4">
          <ArrowLeft className="size-4" /> I want to review and change my ballot first
        </button>
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
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, (used / TOTAL) * 100)}%` }} /></div>
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
                <Button type="button" size="sm" variant="outline" disabled={ownEntry || value <= 0} onClick={() => adjust(entry.entry_key, -1)}><Minus className="size-3.5" /></Button>
                <span className="w-8 text-center text-xl font-medium tabular-nums">{value}</span>
                <Button type="button" size="sm" variant="outline" disabled={ownEntry || value >= MAX_PER_ENTRY || remaining <= 0} onClick={() => adjust(entry.entry_key, 1)}><Plus className="size-3.5" /></Button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="televote-submit-bar glass-strong flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={() => { clearIntegrityState(); setPoints({}); }} disabled={!used || checking}><RotateCcw className="size-4" /> Reset ballot</Button>
        <div className="televote-submit-help text-xs leading-5 text-muted-foreground sm:text-right">Exactly 20 points · at least 5 entries · max 10 per entry<br /><span className="text-sky-100/65">Every ballot is automatically checked against HOD, country, jury and televote history before submission.</span></div>
        <Button disabled={!canSubmit || checking} onClick={() => preflightMutation.mutate()}><ShieldAlert className="size-4" /> {checking ? "Checking ballot…" : "Review & submit"}</Button>
      </div>
    </section>
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
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition", checked ? "border-emerald-200/20 bg-emerald-200/[0.055]" : "border-white/10 bg-white/[0.025]")}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 size-4 shrink-0 accent-emerald-400" />
      <span className="text-xs leading-5 text-muted-foreground">{children}</span>
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/8 bg-black/10 px-2 py-2"><p className="font-bold text-foreground">{value}</p><p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p></div>;
}
