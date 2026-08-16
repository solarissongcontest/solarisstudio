import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Minus, Plus, RotateCcw, Search, Vote } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildTelevotingClientIdentity, hasSubmittedTelevotingRound, markTelevotingRoundSubmitted } from "@/integrations/televoting/anti-abuse";
import { televotingSupabase } from "@/integrations/televoting/client";
import { submitMergedTelevotingVote } from "@/integrations/televoting/vote.functions";
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

type Stage = "register" | "vote" | "done";

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

  const submitMutation = useMutation({
    mutationFn: async () => {
      const identity = await buildTelevotingClientIdentity();
      const ballot = Object.entries(points)
        .filter(([, value]) => value > 0)
        .map(([entryKey, value]) => ({ target_country_code: entryKey, points: value }));

      const result = await submitVote({
        data: {
          roundId,
          username: username.trim(),
          countryCode: home,
          entries: ballot,
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
      }
    },
  });

  function adjust(entryKey: string, delta: number) {
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
          Your ballot for {roundName} has been recorded. The same durable duplicate checks used by the existing Televoting system apply here.
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
          <p className="mt-2 text-sm text-muted-foreground">Choose a display name and the Solaris country you are voting from.</p>
        </header>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="merged-vote-username" className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Username</label>
            <Input id="merged-vote-username" className="mt-2" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={40} placeholder="e.g. NordicFan21" />
          </div>
          <div>
            <label htmlFor="merged-vote-country" className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Your home country</label>
            <select id="merged-vote-country" value={home} onChange={(event) => setHome(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/12 bg-black/20 px-3 text-sm" disabled={countriesLoading}>
              <option value="">{countriesLoading ? "Loading countries…" : "Select your country…"}</option>
              {countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
            </select>
            <p className="mt-2 text-[11px] text-muted-foreground">{unrestricted ? "Self-voting is allowed in this round." : "Your own country entry is locked where applicable."}</p>
          </div>
        </div>

        <Button className="mt-6 w-full" disabled={!canContinue} onClick={() => setStage("vote")}><Vote className="size-4" /> Enter voting booth</Button>
      </section>
    );
  }

  const canSubmit = used === TOTAL && entriesUsed >= MIN_ENTRIES;

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
                  {entry.image ? <img src={entry.image} alt="" className="h-full w-full object-cover" /> : <span className="text-lg">{entry.flag || "✦"}</span>}
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

      <div className="glass-strong flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={() => setPoints({})} disabled={!used}><RotateCcw className="size-4" /> Reset ballot</Button>
        <div className="text-xs text-muted-foreground sm:text-right">Exactly 20 points · at least 5 entries · max 10 per entry</div>
        <Button disabled={!canSubmit || submitMutation.isPending} onClick={() => submitMutation.mutate()}><Vote className="size-4" /> {submitMutation.isPending ? "Submitting…" : "Submit vote"}</Button>
      </div>
    </section>
  );
}
