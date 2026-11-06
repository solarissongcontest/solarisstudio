import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Landmark, RefreshCw, Scale } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import {
  allowedMediationTargets,
  fetchMediationHistory,
  fetchMediationWorkspace,
  mediationError,
  mediationReasonRequired,
  requestMediation,
  transitionMediation,
  type MediationCase,
  type MediationOperation,
  type MediationState,
} from "@/lib/world-mediation";

type RetryEnvelope = { fingerprint: string; operation: MediationOperation };
const labelState = (state: MediationState): string =>
  state.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

const issueOperation = (previous: RetryEnvelope | null, fingerprint: string): RetryEnvelope => {
  if (previous?.fingerprint === fingerprint) return previous;
  const operationId = crypto.randomUUID();
  return { fingerprint, operation: { operationId, key: `world-mediation-${operationId}` } };
};

function StateMessage({ children }: { children: React.ReactNode }) {
  return <div role="status" className="rounded-xl border border-border p-5 text-sm leading-6 text-muted-foreground">{children}</div>;
}

function ErrorMessage({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-destructive/50 p-5">
      <p className="text-sm text-foreground">{mediationError(error)}</p>
      <button type="button" onClick={retry} className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">
        Retry
      </button>
    </div>
  );
}

function History({ caseId }: { caseId: string }) {
  const history = useQuery({
    queryKey: ["world", "mediation", "history", caseId],
    queryFn: () => fetchMediationHistory(caseId),
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  if (history.isPending) return <StateMessage>Loading private case history…</StateMessage>;
  if (history.isError) return <ErrorMessage error={history.error} retry={() => void history.refetch()} />;
  if (!history.data.length) return <StateMessage>No actions have been recorded yet.</StateMessage>;
  return (
    <ol className="mt-4 divide-y divide-border border-t border-border">
      {history.data.map((entry) => (
        <li key={entry.id} className="py-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <strong className="text-foreground">{labelState(entry.toState)}</strong>
            <time className="text-xs text-muted-foreground" dateTime={entry.occurredAt}>
              {new Date(entry.occurredAt).toLocaleString()}
            </time>
          </div>
          {entry.reason ? <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{entry.reason}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">Revision {entry.revision}</p>
        </li>
      ))}
    </ol>
  );
}

function CasePanel({
  record, requesterCountryId, canManage, countryName, onChanged,
}: {
  record: MediationCase;
  requesterCountryId: string | null;
  canManage: boolean;
  countryName: (countryId: string) => string;
  onChanged: () => void;
}) {
  const [target, setTarget] = useState<MediationState | "">("");
  const [reason, setReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const retry = useRef<RetryEnvelope | null>(null);
  const available = allowedMediationTargets(
    record.state, requesterCountryId === record.respondentCountryId, canManage,
  );
  const effectiveTarget = target && available.includes(target) ? target : "";
  const transition = useMutation({
    mutationFn: async () => {
      if (!effectiveTarget) throw new Error("VALIDATION");
      const input = {
        caseId: record.id, target: effectiveTarget,
        reason: reason.trim(), expectedRevision: record.revision,
      };
      const fingerprint = JSON.stringify(input);
      retry.current = issueOperation(retry.current, fingerprint);
      return transitionMediation(input, retry.current.operation);
    },
    retry: false,
    onSuccess: () => {
      retry.current = null;
      setTarget("");
      setReason("");
      onChanged();
    },
  });
  return (
    <article className="border-b border-border py-6 last:border-0" aria-label={`Mediation case ${record.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-base font-semibold">
          {countryName(record.requesterCountryId)} / {countryName(record.respondentCountryId)}
        </strong>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
          {labelState(record.state)}
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{record.summary}</p>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>Revision {record.revision}</span>
        <span>Filed {new Date(record.submittedAt).toLocaleDateString()}</span>
      </div>
      {record.closureReason ? (
        <p className="mt-3 rounded-lg border border-border p-3 text-sm">
          Official closure reason: {record.closureReason}
        </p>
      ) : null}
      {available.length ? (
        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (effectiveTarget && !transition.isPending) transition.mutate();
          }}
        >
          <label className="block text-sm font-medium" htmlFor={`transition-${record.id}`}>
            {record.state === "requested" ? "Respond to request" : "Official case action"}
          </label>
          <select
            id={`transition-${record.id}`}
            value={effectiveTarget}
            onChange={(event) => { setTarget(event.target.value as MediationState); retry.current = null; }}
            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
            required
          >
            <option value="">Choose a state transition</option>
            {available.map((next) => <option key={next} value={next}>{labelState(next)}</option>)}
          </select>
          <label className="block text-sm font-medium" htmlFor={`reason-${record.id}`}>
            Record a reason {effectiveTarget && mediationReasonRequired(effectiveTarget) ? "(required, at least 10 characters)" : "(optional)"}
          </label>
          <textarea
            id={`reason-${record.id}`}
            className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm"
            value={reason}
            onChange={(event) => { setReason(event.target.value); retry.current = null; }}
            maxLength={1500}
            minLength={effectiveTarget && mediationReasonRequired(effectiveTarget) ? 10 : undefined}
            required={!!effectiveTarget && mediationReasonRequired(effectiveTarget)}
          />
          <button
            type="submit"
            disabled={!effectiveTarget || transition.isPending || (mediationReasonRequired(effectiveTarget || "requested") && reason.trim().length < 10)}
            className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {transition.isPending ? "Recording official decision…" : "Submit recorded decision"}
          </button>
          {transition.isError ? (
            <ErrorMessage error={transition.error} retry={() => transition.mutate()} />
          ) : null}
        </form>
      ) : null}
      <button
        type="button"
        onClick={() => setShowHistory((value) => !value)}
        aria-expanded={showHistory}
        className="mt-4 min-h-11 text-sm font-semibold underline underline-offset-4"
      >
        {showHistory ? "Hide" : "View"} private case history
      </button>
      {showHistory ? <History caseId={record.id} /> : null}
    </article>
  );
}

export function WorldMediationWorkspace() {
  const data = useQuery({
    queryKey: ["world", "mediation", "workspace"],
    queryFn: fetchMediationWorkspace,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  const [respondentCountryId, setRespondentCountryId] = useState("");
  const [summary, setSummary] = useState("");
  const retry = useRef<RetryEnvelope | null>(null);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  const organizations = data.data?.organizations ?? [];
  const unity = organizations[0] ?? null;
  const ownCountry = data.data?.requesterCountryId ?? null;
  const countryNames = useMemo(() =>
    new Map((data.data?.countries ?? []).map((country) => [country.id, country.name])),
  [data.data?.countries]);
  const request = useMutation({
    mutationFn: async () => {
      if (!unity || !ownCountry || !respondentCountryId) throw new Error("VALIDATION");
      const input = {
        organizationId: unity.id,
        requesterCountryId: ownCountry,
        respondentCountryId,
        summary: summary.trim(),
      };
      const fingerprint = JSON.stringify(input);
      retry.current = issueOperation(retry.current, fingerprint);
      return requestMediation(input, retry.current.operation);
    },
    retry: false,
    onSuccess: (receipt) => {
      retry.current = null;
      setLastReceipt(`Case ${receipt.caseId} filed at revision ${receipt.revision}.`);
      setSummary("");
      setRespondentCountryId("");
      void data.refetch();
    },
  });

  const refresh = () => void data.refetch();
  const countries = data.data?.countries ?? [];
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-5 sm:pt-8">
        <Link to="/world" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft size={17} aria-hidden="true" /> Terra Solaris
        </Link>
        <div className="mt-5 flex items-center gap-3">
          <Scale size={24} aria-hidden="true" className="text-primary" />
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Institutional mediation</p>
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Resolve disputes formally</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Private, recorded mediation between Terra Solaris countries. Informal diplomacy remains freeform.
          A request begins only when the other country accepts. No mediator can accept for it.
        </p>
        {data.isPending ? <StateMessage>Checking your institutional access and cases…</StateMessage> : null}
        {data.isError ? <div className="mt-6"><ErrorMessage error={data.error} retry={refresh} /></div> : null}
        {data.isSuccess && !data.data.signedIn ? (
          <div className="mt-7"><StateMessage>Sign in with your Solaris account to access mediation. Private case records are never available anonymously.</StateMessage></div>
        ) : null}
        {data.isSuccess && data.data.signedIn ? (
          <>
            <section className="mt-9 border-t border-border pt-6" aria-labelledby="mediation-request">
              <div className="flex flex-wrap items-center gap-3">
                <Landmark aria-hidden="true" className="text-primary" size={20} />
                <h2 id="mediation-request" className="text-xl font-semibold">Request mediation</h2>
              </div>
              {!ownCountry ? (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  No active country control is linked to this account. Only the current country controller may file a request.
                </p>
              ) : !unity ? (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  UNITY is not currently available as an active mediation organization.
                </p>
              ) : (
                <form
                  className="mt-4 grid max-w-xl gap-4"
                  onSubmit={(event) => { event.preventDefault(); if (!request.isPending) request.mutate(); }}
                >
                  <p className="text-sm text-muted-foreground">
                    Filing for <strong className="text-foreground">{countryNames.get(ownCountry) ?? "your country"}</strong> via {unity.name}.
                  </p>
                  <div>
                    <label htmlFor="mediation-respondent" className="mb-2 block text-sm font-medium">Other country</label>
                    <select
                      id="mediation-respondent"
                      className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                      value={respondentCountryId}
                      onChange={(event) => { setRespondentCountryId(event.target.value); retry.current = null; }}
                      required
                    >
                      <option value="">Select a country</option>
                      {countries.filter((country) => country.id !== ownCountry).map((country) => (
                        <option key={country.id} value={country.id}>{country.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="mediation-summary" className="mb-2 block text-sm font-medium">What needs mediation?</label>
                    <textarea
                      id="mediation-summary"
                      value={summary}
                      onChange={(event) => { setSummary(event.target.value); retry.current = null; }}
                      required
                      minLength={20}
                      maxLength={5000}
                      className="min-h-36 w-full rounded-lg border border-border bg-background p-3 text-sm"
                      placeholder="Describe the dispute, the parties' positions and what you seek to resolve."
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{summary.trim().length}/5000 characters. Only authorized parties and mediators can read the record.</p>
                  </div>
                  <button
                    type="submit"
                    disabled={!respondentCountryId || summary.trim().length < 20 || request.isPending}
                    className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {request.isPending ? "Filing securely…" : <>File request <ArrowRight size={16} aria-hidden="true" /></>}
                  </button>
                  {request.isError ? <ErrorMessage error={request.error} retry={() => request.mutate()} /> : null}
                  {lastReceipt ? <div role="status" className="text-sm font-medium text-foreground">{lastReceipt}</div> : null}
                </form>
              )}
            </section>
            <section className="mt-10 border-t border-border pt-6" aria-labelledby="my-mediation">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="my-mediation" className="text-xl font-semibold">Authorized mediation cases</h2>
                <button type="button" onClick={refresh}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium">
                  <RefreshCw size={16} aria-hidden="true" /> Refresh
                </button>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Current participant/controller cases and explicitly granted institutional cases only.
                Records are private and revision checked.
              </p>
              {data.data.cases.length === 0 ? (
                <div className="mt-5"><StateMessage>No mediation cases are available to your account.</StateMessage></div>
              ) : (
                <div className="mt-3">
                  {data.data.cases.map((record) => (
                    <CasePanel
                      key={record.id}
                      record={record}
                      requesterCountryId={ownCountry}
                      canManage={data.data.managedOrganizations.includes(record.organizationId)}
                      countryName={(id) => countryNames.get(id) ?? "Country"}
                      onChanged={refresh}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
