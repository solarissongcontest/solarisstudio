import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, RefreshCcw, Scale } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import {
  courtError, fetchCourtCaseFilings, fetchCourtWorkspace,
  fileCourtCase, isCourtResponseAllowed, submitCourtResponse,
  type CourtCase, type CourtOperation,
} from "@/lib/world-court-filing";

type Retry = { payload: string; op: CourtOperation };
const statusLabel = (status: string) =>
  status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function operation(previous: Retry | null, payload: string): Retry {
  if (previous?.payload === payload) return previous;
  const id = crypto.randomUUID();
  return { payload, op: { operationId: id, key: `world-court-${id}` } };
}

function Message({ children }: { children: ReactNode }) {
  return <p role="status" className="mt-4 rounded-xl border border-border p-5 text-sm leading-6 text-muted-foreground">{children}</p>;
}
function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mt-4 rounded-xl border border-destructive/50 p-4" role="alert">
      <p className="text-sm">{courtError(error)}</p>
      <button type="button" onClick={retry} className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">
        Retry securely
      </button>
    </div>
  );
}

function CaseFilings({ id }: { id: string }) {
  const filings = useQuery({
    queryKey: ["world", "court", "filings", id],
    gcTime: 0,
    queryFn: () => fetchCourtCaseFilings(id),
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  if (filings.isPending || filings.isFetching) return <Message>Checking private Court documents…</Message>;
  if (filings.isError) return <Failure error={filings.error} retry={() => void filings.refetch()} />;
  return (
    <ol className="mt-4 divide-y divide-border border-t border-border">
      {filings.data.map((filing) => (
        <li key={filing.id} className="py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <strong className="text-sm">{statusLabel(filing.filingType)} · Revision {filing.revision}</strong>
            <time className="text-xs text-muted-foreground" dateTime={filing.filedAt}>
              {new Date(filing.filedAt).toLocaleString()}
            </time>
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{filing.body}</p>
        </li>
      ))}
    </ol>
  );
}

function CourtCasePanel({
  record, countryId, responded, nameFor, refresh,
}: {
  record: CourtCase; countryId: string | null; responded: boolean;
  nameFor: (id: string) => string; refresh: () => void;
}) {
  const [showFilings, setShowFilings] = useState(false);
  const [response, setResponse] = useState("");
  const retry = useRef<Retry | null>(null);
  const eligible = isCourtResponseAllowed(record, countryId, responded);
  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        caseId: record.id,
        response: response.trim(),
        expectedRevision: record.revision,
      };
      retry.current = operation(retry.current, JSON.stringify(payload));
      return submitCourtResponse(payload, retry.current.op);
    },
    retry: false,
    onSuccess: () => {
      retry.current = null;
      setResponse("");
      refresh();
    },
  });
  return (
    <article className="border-b border-border py-6 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-foreground">{record.identifier}</h3>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
          {statusLabel(record.status)}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {nameFor(record.applicantCountryId)} v. {nameFor(record.respondentCountryId)}
      </p>
      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6">{record.claim}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold">Legal basis</dt><dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{record.legalBasis}</dd></div>
        <div><dt className="font-semibold">Requested remedy</dt><dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{record.requestedRemedy}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Filed {new Date(record.filedAt).toLocaleDateString()} · Revision {record.revision}
      </p>
      {eligible ? (
        <form
          className="mt-6 border-t border-border pt-5"
          onSubmit={(event) => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); }}
        >
          <h4 className="text-base font-semibold">Respond on behalf of your country</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            This files an immutable legal pleading. It does not decide the case or bypass preliminary review.
          </p>
          <label htmlFor={`court-response-${record.id}`} className="mt-4 block text-sm font-medium">
            Official response
          </label>
          <textarea
            id={`court-response-${record.id}`}
            value={response}
            onChange={(event) => { setResponse(event.target.value); retry.current = null; }}
            className="mt-2 min-h-36 w-full rounded-lg border border-border bg-background p-3 text-sm"
            required minLength={20} maxLength={12000}
          />
          <button type="submit" disabled={response.trim().length < 20 || mutation.isPending}
            className="mt-3 min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {mutation.isPending ? "Recording response…" : "File official response"}
          </button>
          {mutation.isError ? <Failure error={mutation.error} retry={() => mutation.mutate()} /> : null}
        </form>
      ) : null}
      <button
        type="button"
        onClick={() => setShowFilings((value) => !value)}
        aria-expanded={showFilings}
        className="mt-5 min-h-11 text-sm font-semibold underline underline-offset-4"
      >
        {showFilings ? "Hide private filings" : "View private filings"}
      </button>
      {showFilings ? <CaseFilings id={record.id} /> : null}
    </article>
  );
}

export function WorldCourtWorkspace() {
  const workspace = useQuery({
    queryKey: ["world", "court", "workspace"],
    gcTime: 0,
    queryFn: fetchCourtWorkspace,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  const [respondentCountryId, setRespondentCountryId] = useState("");
  const [claim, setClaim] = useState("");
  const [legalBasis, setLegalBasis] = useState("");
  const [remedy, setRemedy] = useState("");
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  const retry = useRef<Retry | null>(null);
  const countryNames = useMemo(() => new Map(
    (workspace.data?.countries ?? []).map((country) => [country.id, country.name]),
  ), [workspace.data?.countries]);
  const countryId = workspace.data?.countryId ?? null;
  const organizationId = workspace.data?.courtOrganizationId ?? null;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!organizationId || !countryId || !respondentCountryId) throw new Error("VALIDATION");
      const payload = {
        organizationId, applicantCountryId: countryId, respondentCountryId,
        claim: claim.trim(), legalBasis: legalBasis.trim(), requestedRemedy: remedy.trim(),
      };
      retry.current = operation(retry.current, JSON.stringify(payload));
      return fileCourtCase(payload, retry.current.op);
    },
    retry: false,
    onSuccess: (receipt) => {
      retry.current = null;
      setLastReceipt(`Court case ${receipt.identifier} filed, revision ${receipt.revision}.`);
      setRespondentCountryId("");
      setClaim(""); setLegalBasis(""); setRemedy("");
      void workspace.refetch();
    },
  });
  const refresh = () => void workspace.refetch();
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-5 sm:pt-8">
        <Link to="/world" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground">
          <ArrowLeft size={16} aria-hidden="true" /> Terra Solaris
        </Link>
        <p className="mt-5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <Scale size={20} aria-hidden="true" className="text-primary" />
          UNITY judicial organ
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">International Terra Solaris Court</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          File official disputes, respond as a sovereign country, and read published-safe Court docket entries.
          Private claims and pleadings are restricted to the parties and authorized Court officials.
        </p>
        {(workspace.isPending || workspace.isFetching) ? <Message>Checking Court availability and access…</Message> : null}
        {workspace.isError ? <Failure error={workspace.error} retry={refresh} /> : null}
        {workspace.isSuccess && !workspace.isFetching ? (
          <>
            <section className="mt-9 border-t border-border pt-6" aria-labelledby="public-court-docket">
              <h2 id="public-court-docket" className="text-xl font-semibold">Public Court docket</h2>
              {workspace.data.docket.length === 0 ? (
                <Message>No cases have been officially listed for public disclosure.</Message>
              ) : (
                <ol className="mt-4 divide-y divide-border">
                  {workspace.data.docket.map((record) => (
                    <li key={record.id} className="flex flex-wrap justify-between gap-3 border-b border-border py-3 text-sm">
                      <div>
                        <strong>{record.identifier}</strong>
                        <p className="mt-1 text-muted-foreground">
                          {countryNames.get(record.applicantCountryId) ?? "Applicant"} v. {countryNames.get(record.respondentCountryId) ?? "Respondent"}
                        </p>
                      </div>
                      <span className="text-muted-foreground">{statusLabel(record.status)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className="mt-10 border-t border-border pt-6" aria-labelledby="court-file">
              <div className="flex items-center gap-2">
                <BookOpen size={20} aria-hidden="true" className="text-primary" />
                <h2 id="court-file" className="text-xl font-semibold">File a case</h2>
              </div>
              {!workspace.data.signedIn ? (
                <Message>Sign in to file or respond to a Court case. Anonymous visitors may see only officially public docket metadata.</Message>
              ) : !countryId ? (
                <Message>No active country control is linked to this account. Current country authority is required to file a Court case.</Message>
              ) : !organizationId ? (
                <Message>UNITY's Court is not currently available for new case filings.</Message>
              ) : (
                <form className="mt-5 grid max-w-xl gap-4" onSubmit={(event) => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); }}>
                  <p className="text-sm text-muted-foreground">Applicant: <strong className="text-foreground">{countryNames.get(countryId) ?? "Your country"}</strong></p>
                  <div>
                    <label htmlFor="court-respondent" className="mb-2 block text-sm font-medium">Respondent country</label>
                    <select id="court-respondent" value={respondentCountryId}
                      onChange={(event) => { setRespondentCountryId(event.target.value); retry.current = null; }}
                      className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" required>
                      <option value="">Select respondent</option>
                      {workspace.data.countries.filter((country) => country.id !== countryId).map((country) =>
                        <option key={country.id} value={country.id}>{country.name}</option>)}
                    </select>
                  </div>
                  {([
                    ["court-claim", "Statement of claim", claim, setClaim, 20, 12000],
                    ["court-basis", "Legal basis", legalBasis, setLegalBasis, 10, 10000],
                    ["court-remedy", "Requested remedy", remedy, setRemedy, 10, 10000],
                  ] as const).map(([id, label, value, update, minimum, maximum]) => (
                    <div key={id}>
                      <label htmlFor={id} className="mb-2 block text-sm font-medium">{label}</label>
                      <textarea id={id} value={value} onChange={(event) => { update(event.target.value); retry.current = null; }}
                        minLength={minimum} maxLength={maximum} required
                        className="min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm" />
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Filing is official and recorded. A filed case is not a judgment or confirmation of the allegations.
                  </p>
                  <button type="submit"
                    disabled={!respondentCountryId || claim.trim().length < 20 || legalBasis.trim().length < 10 || remedy.trim().length < 10 || mutation.isPending}
                    className="min-h-11 w-fit rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                    {mutation.isPending ? "Filing Court case…" : "File official Court case"}
                  </button>
                  {mutation.isError ? <Failure error={mutation.error} retry={() => mutation.mutate()} /> : null}
                  {lastReceipt ? <p role="status" className="text-sm font-semibold">{lastReceipt}</p> : null}
                </form>
              )}
            </section>
            {workspace.data.signedIn ? (
              <section className="mt-10 border-t border-border pt-6" aria-labelledby="court-cases">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="court-cases" className="text-xl font-semibold">Your authorized cases</h2>
                  <button type="button" onClick={refresh}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold">
                    <RefreshCcw size={16} aria-hidden="true" /> Refresh
                  </button>
                </div>
                {workspace.data.cases.length === 0 ? <Message>No private Court case is available to this account.</Message> : (
                  <div className="mt-4">
                    {workspace.data.cases.map((record) => (
                      <CourtCasePanel
                        key={record.id}
                        record={record}
                        countryId={countryId}
                        responded={workspace.data.respondedCaseIds.includes(record.id)}
                        nameFor={(id) => countryNames.get(id) ?? "Country"}
                        refresh={refresh}
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
