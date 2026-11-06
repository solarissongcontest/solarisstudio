import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Landmark, Pencil, Plus, Vote } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import {
  readWorldDomesticCountry, writeWorldDomesticCanon,
  type DomesticCountry, type DomesticParty, type DomesticElection, type DomesticRecordKind,
} from "@/lib/terra-world-domestic";

const field = "min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary";
const subsection = "mt-8 border-t border-border pt-7";

function dateToday() { return new Date().toLocaleDateString("sv-SE"); }

type FormPayload = Record<string, string | boolean | number | null>;
type PendingWrite = {
  kind: DomesticRecordKind;
  subjectId: string | null;
  revision: number;
  payload: FormPayload;
};
function DomesticEditor({ country }: { country: DomesticCountry }) {
  const client = useQueryClient();
  const priorAttempt = useRef<{ fingerprint: string; operationId: string } | null>(null);
  const [mode, setMode] = useState<DomesticRecordKind>("party");
  const [edit, setEdit] = useState<DomesticParty | null>(null);
  const [editElection, setEditElection] = useState<DomesticElection | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [ideology, setIdeology] = useState("");
  const [scope, setScope] = useState("general");
  const [heldOn, setHeldOn] = useState(dateToday);
  const [occurredAt, setOccurredAt] = useState(dateToday);
  const [winnerPartyId, setWinnerPartyId] = useState("");
  const [published, setPublished] = useState(false);
  const [dissolved, setDissolved] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: PendingWrite) => {
      const fingerprint = JSON.stringify({ countryId: country.countryId, ...input });
      if (!priorAttempt.current || priorAttempt.current.fingerprint !== fingerprint) {
        priorAttempt.current = { fingerprint, operationId: crypto.randomUUID() };
      }
      const operationId = priorAttempt.current.operationId;
      return writeWorldDomesticCanon({
        countryId: country.countryId, kind: input.kind,
        subjectId: input.subjectId, payload: input.payload,
        expectedRevision: input.revision, operationId, idempotencyKey: operationId,
      });
    },
    onSuccess: async (result) => {
      priorAttempt.current = null;
      setReceipt("Saved with authoritative receipt " + result.operationId.slice(0, 8) + "…");
      setEdit(null); setEditElection(null); setTitle(""); setSummary(""); setAbbreviation(""); setIdeology("");
      setWinnerPartyId(""); setPublished(false); setDissolved(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["world", "domestic", country.countryCode] }),
        client.invalidateQueries({ queryKey: ["world", "history"] }),
      ]);
    },
  });
  function chooseMode(next: DomesticRecordKind) {
    setMode(next); setEdit(null); setEditElection(null); setTitle(""); setSummary("");
    setAbbreviation(""); setIdeology(""); setPublished(false);
    mutation.reset(); setReceipt(null);
  }
  function chooseParty(party: DomesticParty) {
    setMode("party"); setEdit(party); setEditElection(null); setTitle(party.name);
    setAbbreviation(party.abbreviation ?? ""); setIdeology(party.ideology ?? "");
    setSummary(party.summary ?? ""); setDissolved(party.status === "dissolved");
    setPublished(party.published); setReceipt(null); mutation.reset();
    document.getElementById("world-domestic-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function chooseElection(election: DomesticElection) {
    if (election.published) return;
    setMode("election"); setEdit(null); setEditElection(election);
    setTitle(election.title); setSummary(election.resultSummary);
    setScope(election.scope); setHeldOn(election.heldOn);
    setWinnerPartyId(election.winnerPartyId ?? "");
    setPublished(false); setReceipt(null); mutation.reset();
    document.getElementById("world-domestic-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReceipt(null);
    const text = title.trim();
    const description = summary.trim();
    if (!text || (mode !== "party" && !description)) return;
    const payload: FormPayload = mode === "party"
      ? { name: text, summary: description, abbreviation: abbreviation.trim(),
          ideology: ideology.trim(), status: dissolved ? "dissolved" : "active", published }
      : mode === "election"
      ? { title: text, resultSummary: description, heldOn, scope, winnerPartyId, published }
      : { title: text, summary: description,
          occurredAt: new Date(occurredAt + "T12:00:00Z").toISOString(), published: true };
    mutation.mutate({ kind: mode,
      subjectId: mode === "party" ? edit?.id ?? null : mode === "election" ? editElection?.id ?? null : null,
      revision: mode === "party" ? edit?.revision ?? 0 : mode === "election" ? editElection?.revision ?? 0 : 0,
      payload });
  }
  return (
    <section className={subsection} id="world-domestic-editor" aria-labelledby="world-domestic-manage-title">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Country controller</p>
      <h2 id="world-domestic-manage-title" className="mt-2 text-xl font-semibold">Manage domestic canon</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Your country's domestic politics are fictional canon, not real Solaris voting.
        Published records become visible in the public government and historical Archive.
      </p>
      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Domestic record type">
        {(["party","election","editorial_history"] as const).map((kind) => (
          <button type="button" key={kind} disabled={mutation.isPending}
            aria-pressed={mode === kind} onClick={() => chooseMode(kind)}
            className={mode === kind ? button : secondary}>
            {kind === "party" ? "Party" : kind === "election" ? "Election" : "History"}
          </button>
        ))}
      </div>
      <form className="mt-5 max-w-2xl space-y-4" onSubmit={submit}>
        {edit || editElection ? <p className="text-sm text-muted-foreground">Editing {edit?.name ?? editElection?.title} · revision {edit?.revision ?? editElection?.revision}</p> : null}
        <label className="block space-y-2 text-sm font-medium">
          <span>{mode === "party" ? "Party name" : mode === "election" ? "Election title" : "Event title"}</span>
          <input className={field} required maxLength={mode === "party" ? 120 : 160}
            value={title} onChange={e => setTitle(e.target.value)} />
        </label>
        {mode === "party" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2 text-sm font-medium"><span>Abbreviation</span>
              <input className={field} maxLength={30} value={abbreviation} onChange={e => setAbbreviation(e.target.value)} /></label>
            <label className="block space-y-2 text-sm font-medium"><span>Ideology / position</span>
              <input className={field} maxLength={160} value={ideology} onChange={e => setIdeology(e.target.value)} /></label>
          </div>
        ) : null}
        {mode === "election" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2 text-sm font-medium"><span>Election type</span>
              <select className={field} value={scope} onChange={e => setScope(e.target.value)}>
                {["general","presidential","legislative","regional","local","other"].map(s => <option value={s} key={s}>{s}</option>)}
              </select></label>
            <label className="block space-y-2 text-sm font-medium"><span>Held on</span>
              <input className={field} type="date" required max={dateToday()} value={heldOn} onChange={e => setHeldOn(e.target.value)} /></label>
            <label className="block space-y-2 text-sm font-medium sm:col-span-2"><span>Winning party (optional)</span>
              <select className={field} value={winnerPartyId} onChange={e => setWinnerPartyId(e.target.value)}>
                <option value="">No declared party winner</option>
                {country.parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
          </div>
        ) : null}
        {mode === "editorial_history" ? (
          <label className="block space-y-2 text-sm font-medium"><span>Event date</span>
            <input type="date" className={field} required max={dateToday()} value={occurredAt}
              onChange={e => setOccurredAt(e.target.value)} /></label>
        ) : null}
        <label className="block space-y-2 text-sm font-medium">
          <span>{mode === "party" ? "Public description (optional)" : mode === "election" ? "Official fictional result summary" : "Editorial history summary"}</span>
          <textarea className={field} rows={4} required={mode !== "party"} maxLength={4000}
            value={summary} onChange={e => setSummary(e.target.value)} />
        </label>
        {mode === "party" ? (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={dissolved} onChange={e => setDissolved(e.target.checked)} />
            Mark as dissolved
          </label>
        ) : null}
        {mode !== "editorial_history" ? (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} />
            Publish this official fictional record
          </label>
        ) : <p className="text-sm text-muted-foreground">History events publish immediately and remain permanent.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button className={button} type="submit" disabled={mutation.isPending}>
            <Plus className="size-4" aria-hidden="true" />{mutation.isPending ? "Saving…" : (edit || editElection) ? "Save revision" : "Create record"}
          </button>
          {edit || editElection ? <button type="button" className={secondary} onClick={() => chooseMode(mode)}>Cancel edit</button> : null}
        </div>
        {mutation.isError ? <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p> : null}
        {receipt ? <p role="status" className="text-sm text-foreground">{receipt}</p> : null}
      </form>
      {country.elections.some(e => !e.published) ? <div className="mt-5">
        <h3 className="font-semibold">Continue a draft election</h3>
        <div className="mt-2 flex flex-wrap gap-2">{country.elections.filter(e => !e.published).map(e =>
          <button type="button" key={e.id} className={secondary}
            onClick={() => chooseElection(e)} disabled={mutation.isPending}>
            <Pencil className="size-3" aria-hidden="true" /> {e.title}
          </button>)}</div></div> : null}
      {country.parties.length ? <div className="mt-5">
        <h3 className="font-semibold">Edit an existing party</h3>
        <div className="mt-2 flex flex-wrap gap-2">{country.parties.map(p =>
          <button type="button" key={p.id} className={secondary}
            onClick={() => chooseParty(p)} disabled={mutation.isPending}>
            <Pencil className="size-3" aria-hidden="true" /> {p.name}
          </button>)}</div></div> : null}
    </section>
  );
}

export function WorldDomesticPolitics({ code }: { code: string }) {
  const query = useQuery({
    queryKey: ["world", "domestic", code], queryFn: ({ signal }) => readWorldDomesticCountry(code, signal),
    retry: false, staleTime: 0, gcTime: 0, refetchOnMount: "always",
  });
  // A cached response can include the previous controller's private drafts.
  // Do not render it while the current mount is verifying fresh authority.
  const country = query.isFetching || !query.isFetchedAfterMount || query.isError ? null : query.data;
  return <div className="mx-auto w-full max-w-5xl px-3 pb-28 pt-5 sm:px-6 sm:pt-8">
    <Link to="/world/countries/$code" params={{ code }} className={secondary}>
      <ArrowLeft className="size-4" aria-hidden="true" /> Country International
    </Link>
    {(query.isPending || query.isFetching) ? <div role="status" className="mt-8 animate-pulse motion-reduce:animate-none">Loading government…</div> : null}
    {query.isError ? <div role="alert" className="mt-8"><p>Government data could not be retrieved.</p>
      <button className={secondary} onClick={() => void query.refetch()}>Try again</button></div> : null}
    {query.isSuccess && !query.isFetching && query.isFetchedAfterMount && !country ? <div className="mt-8"><h1 className="text-2xl font-semibold">Country not found</h1>
      <Link to="/world/countries" className={secondary}>Browse countries</Link></div> : null}
    {country ? <>
      <header className="mt-7 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Terra Solaris · Government</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">{country.countryName}</h1>
        <p className="mt-3 text-base text-muted-foreground">{country.governmentType ?? "Government system not yet described"}</p>
        {(country.leaderName || country.leaderTitle) ? <p className="mt-2 text-sm">
          {country.leaderTitle ? country.leaderTitle + ": " : ""}{country.leaderName ?? "Not recorded"}</p> : null}
        <div className="mt-5"><Link to="/world/archive" search={{ code: country.countryCode }} className={secondary}>
          <BookOpen className="size-4" aria-hidden="true" /> Country history
        </Link></div>
      </header>
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(250px,0.6fr)]">
        <section aria-labelledby="domestic-parties-title">
          <div className="flex items-center gap-2"><Landmark className="size-5" aria-hidden="true" />
            <h2 id="domestic-parties-title" className="text-xl font-semibold">Political parties</h2></div>
          {country.parties.length ? <ul className="mt-4 divide-y divide-border">{country.parties.map(p =>
            <li key={p.id} className="py-4"><div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{p.name}{p.abbreviation ? " (" + p.abbreviation + ")" : ""}</h3>
              {p.status === "dissolved" ? <span className="text-xs text-muted-foreground">Dissolved</span> : null}
              {!p.published ? <span className="text-xs font-semibold text-muted-foreground">Private draft</span> : null}
              </div>{p.ideology ? <p className="mt-1 text-sm text-muted-foreground">{p.ideology}</p> : null}
              {p.summary ? <p className="mt-2 text-sm leading-6">{p.summary}</p> : null}
            </li>)}</ul> :
            <p className="mt-4 text-sm text-muted-foreground">No published political parties recorded.</p>}
        </section>
        <section aria-labelledby="domestic-elections-title">
          <div className="flex items-center gap-2"><Vote className="size-5" aria-hidden="true" />
            <h2 id="domestic-elections-title" className="text-xl font-semibold">Recent elections</h2></div>
          {country.elections.length ? <ol className="mt-4 divide-y divide-border">{country.elections.map(e =>
            <li key={e.id} className="py-4"><time className="text-xs text-muted-foreground" dateTime={e.heldOn}>{e.heldOn}</time>
              <h3 className="mt-1 font-semibold">{e.title}</h3>
              <p className="mt-1 text-sm leading-6">{e.resultSummary}</p>
              <p className="mt-1 text-xs text-muted-foreground">{e.scope}{e.turnoutPercent !== null ? " · Turnout " + e.turnoutPercent + "%" : ""}</p>
              {!e.published ? <span className="text-xs text-muted-foreground">Private draft</span> : null}
            </li>)}</ol> :
            <p className="mt-4 text-sm text-muted-foreground">No published domestic election history yet.</p>}
        </section>
      </div>
      {country.isController ? <DomesticEditor country={country} /> : null}
    </> : null}
  </div>;
}
