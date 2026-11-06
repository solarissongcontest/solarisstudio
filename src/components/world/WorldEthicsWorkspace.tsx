import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileText, RefreshCw, Scale } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  appendEthicsEvidence, assignEthicsCase, canAssignEthicsCase,
  configureEthicsMember, ethicsError, fetchEthicsEvidence,
  fetchEthicsWorkspace, fileEthicsCase,
  type EthicsCase, type EthicsCommitteeMember, type EthicsOperation,
} from "@/lib/world-ethics";
import { useTg13PrivateActor } from "@/lib/world-tg13-private-session";

type Retry = { fingerprint: string; operation: EthicsOperation };
function useOperation() {
  const ref = useRef<Retry | null>(null);
  return useMemo(() => ({
    current: (fingerprint: string): EthicsOperation => {
      if (ref.current?.fingerprint === fingerprint) return ref.current.operation;
      const id = crypto.randomUUID();
      const operation = { operationId: id, key: `world-ethics-${id}` };
      ref.current = { fingerprint, operation };
      return operation;
    },
    reset: () => { ref.current = null; },
  }), []);
}
function Status({ children }: { children: React.ReactNode }) {
  return <p role="status" className="mt-4 rounded-xl border border-border p-5 text-sm leading-6 text-muted-foreground">{children}</p>;
}
function ErrorInfo({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert" className="mt-4 rounded-xl border border-destructive/50 p-4">
      <p className="text-sm">{ethicsError(error)}</p>
      <button type="button" className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold"
        onClick={retry}>Retry safely</button>
    </div>
  );
}

function PrivateEvidence({ caseId, actorId, actorEpoch }: { caseId: string; actorId: string; actorEpoch: number }) {
  const evidence = useQuery({
    queryKey: ["world", "ethics", "evidence", actorId, actorEpoch, caseId],
    queryFn: () => fetchEthicsEvidence(caseId, actorId),
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  if (evidence.isPending || evidence.isFetching) return <Status>Checking protected evidence…</Status>;
  if (evidence.isError) return <ErrorInfo error={evidence.error} retry={() => void evidence.refetch()} />;
  return evidence.data.length ? (
    <ol className="mt-4 divide-y divide-border">
      {evidence.data.map((record) => (
        <li key={record.id} className="py-3 text-sm">
          <time className="text-xs text-muted-foreground" dateTime={record.createdAt}>
            {new Date(record.createdAt).toLocaleString()}
          </time>
          <p className="mt-2 whitespace-pre-wrap break-words leading-6 text-foreground">{record.statement}</p>
        </li>
      ))}
    </ol>
  ) : <Status>No additional evidence statements have been filed.</Status>;
}

function EthicsCasePanel({
  record, canManage, currentCountryId, committee, countryName, refresh, actorId, actorEpoch,
}: {
  record: EthicsCase; canManage: boolean; currentCountryId: string | null;
  actorId: string; actorEpoch: number;
  committee: readonly EthicsCommitteeMember[];
  countryName: (id: string) => string;
  refresh: () => void;
}) {
  const [memberId, setMemberId] = useState("");
  const [statement, setStatement] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);
  const assignOp = useOperation();
  const evidenceOp = useOperation();
  const eligible = canAssignEthicsCase(record, committee, canManage);
  const canAppendEvidence = currentCountryId === record.reportingCountryId || canManage;
  const assign = useMutation({
    mutationFn: async () => {
      const input = { caseId: record.id, memberId, expectedRevision: record.revision };
      return assignEthicsCase(input, assignOp.current(JSON.stringify(input)));
    },
    retry: false,
    onSuccess: () => { assignOp.reset(); setMemberId(""); refresh(); },
  });
  const addEvidence = useMutation({
    mutationFn: async () => {
      const input = { caseId: record.id, statement: statement.trim() };
      return appendEthicsEvidence(input, evidenceOp.current(JSON.stringify(input)));
    },
    retry: false,
    onSuccess: () => { evidenceOp.reset(); setStatement(""); refresh(); },
  });
  return (
    <article className="border-b border-border py-6 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-base font-semibold">
          Case {record.id.slice(0, 8).toUpperCase()} · {countryName(record.reportingCountryId)}
        </h3>
        <span className="rounded-full border border-border px-3 py-1 text-xs capitalize text-muted-foreground">
          {record.state.replaceAll("_", " ")}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Subject: {record.subjectCountryId ? countryName(record.subjectCountryId) : "Individual"}
        {record.subjectPersonId ? ` · Person reference ${record.subjectPersonId}` : ""}
      </p>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{record.allegation}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        Filed {new Date(record.openedAt).toLocaleDateString()} · Revision {record.revision} · Private
      </p>
      {canManage && record.state === "filed" && !eligible ? (
        <Status>Committee assignment is blocked. UNITY must explicitly configure at least one active Ethics Committee member under its Charter.</Status>
      ) : null}
      {eligible ? (
        <form
          className="mt-5 border-t border-border pt-5"
          onSubmit={(event) => { event.preventDefault(); if (!assign.isPending) assign.mutate(); }}
        >
          <label htmlFor={`ethics-member-${record.id}`} className="mb-2 block text-sm font-semibold">
            Assign an active committee member
          </label>
          <select
            id={`ethics-member-${record.id}`}
            value={memberId}
            onChange={(event) => { setMemberId(event.target.value); assignOp.reset(); }}
            required className="min-h-11 w-full max-w-lg rounded-lg border border-border bg-background px-3 text-sm"
          >
            <option value="">Select an authorized appointee</option>
            {committee.filter((item) => item.organId === record.organId).map((item) => (
              <option key={item.id} value={item.id}>
                Person {item.personId.slice(0, 8)} · {item.appointmentReference}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!memberId || assign.isPending}
            className="mt-3 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {assign.isPending ? "Assigning…" : "Record formal case assignment"}
          </button>
          {assign.isError ? <ErrorInfo error={assign.error} retry={() => assign.mutate()} /> : null}
        </form>
      ) : null}
      {canAppendEvidence && !["concluded", "archived"].includes(record.state) ? (
        <form
          className="mt-5 border-t border-border pt-5"
          onSubmit={(event) => { event.preventDefault(); if (!addEvidence.isPending) addEvidence.mutate(); }}
        >
          <label htmlFor={`ethics-statement-${record.id}`} className="mb-2 block text-sm font-semibold">
            Append an immutable evidence statement
          </label>
          <textarea
            id={`ethics-statement-${record.id}`} value={statement}
            onChange={(event) => { setStatement(event.target.value); evidenceOp.reset(); }}
            minLength={20} maxLength={12000} required
            className="min-h-28 w-full max-w-xl rounded-lg border border-border bg-background p-3 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Submitted statements cannot be edited or removed after recording. This is not a finding or sanction.
          </p>
          <button type="submit" disabled={statement.trim().length < 20 || addEvidence.isPending}
            className="mt-3 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {addEvidence.isPending ? "Recording evidence…" : "Record evidence"}
          </button>
          {addEvidence.isError ? <ErrorInfo error={addEvidence.error} retry={() => addEvidence.mutate()} /> : null}
        </form>
      ) : null}
      <button type="button" onClick={() => setShowEvidence((old) => !old)}
        aria-expanded={showEvidence}
        className="mt-4 min-h-11 text-sm font-semibold underline underline-offset-4">
        {showEvidence ? "Hide private evidence" : "View private evidence"}
      </button>
      {showEvidence ? <PrivateEvidence caseId={record.id} actorId={actorId} actorEpoch={actorEpoch} /> : null}
    </article>
  );
}

function CommitteeConfiguration({
  organizationId, refresh,
}: { organizationId: string; refresh: () => void }) {
  const [personId, setPersonId] = useState("");
  const [userId, setUserId] = useState("");
  const [reference, setReference] = useState("");
  const op = useOperation();
  const mutation = useMutation({
    mutationFn: async () => {
      const input = {
        organizationId, personId: personId.trim(),
        userId: userId.trim() || null, appointmentReference: reference.trim(),
      };
      return configureEthicsMember(input, op.current(JSON.stringify(input)));
    },
    retry: false,
    onSuccess: () => {
      op.reset(); setPersonId(""); setUserId(""); setReference(""); refresh();
    },
  });
  return (
    <section className="mt-9 border-t border-border pt-6" aria-labelledby="ethics-committee-configuration">
      <h2 id="ethics-committee-configuration" className="text-xl font-semibold">Configure Ethics Committee membership</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        A specifically authorized official must record a real durable person identity and a valid appointment reference.
        No member count or appointment is inferred from an office title.
        Do not appoint anyone until the revised UNITY Charter authorizes the appointment procedure.
      </p>
      <form className="mt-4 grid max-w-xl gap-4"
        onSubmit={(event) => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); }}>
        {([
          ["ethics-person-id", "Durable delegation person ID", personId, setPersonId, true],
          ["ethics-user-id", "Current account user ID (optional)", userId, setUserId, false],
          ["ethics-appointment", "Constitutional appointment reference", reference, setReference, true],
        ] as const).map(([id, label, value, update, required]) => (
          <div key={id}>
            <label htmlFor={id} className="mb-2 block text-sm font-medium">{label}</label>
            <input id={id} value={value}
              onChange={(event) => { update(event.target.value); op.reset(); }}
              required={required}
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
          </div>
        ))}
        <button type="submit" disabled={!personId || reference.trim().length < 10 || mutation.isPending}
          className="min-h-11 w-fit rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {mutation.isPending ? "Recording appointment…" : "Record authorized appointment"}
        </button>
        {mutation.isError ? <ErrorInfo error={mutation.error} retry={() => mutation.mutate()} /> : null}
      </form>
    </section>
  );
}

export function WorldEthicsWorkspace() {
  const actor = useTg13PrivateActor();
  const actorScope = actor.ready && actor.userId ? `${actor.userId}:${actor.epoch}` : null;
  const [subjectCountryId, setSubjectCountryId] = useState("");
  const [subjectPersonId, setSubjectPersonId] = useState("");
  const [allegation, setAllegation] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const op = useOperation();
  const [draftScope, setDraftScope] = useState<string | null>(null);
  const activeScope = useRef(actorScope);
  activeScope.current = actorScope;
  const operationScope = useRef<string | null>(null);
  useEffect(() => {
    setSubjectCountryId("");
    setSubjectPersonId("");
    setAllegation("");
    setReceipt(null);
    op.reset();
    operationScope.current = null;
    setDraftScope(actorScope);
  }, [actorScope, op]);
  const showPrivate = actorScope !== null && actorScope === draftScope;
  const workspace = useQuery({
    queryKey: ["world", "ethics", "workspace", actor.userId, actor.epoch],
    enabled: actor.ready && !!actor.userId,
    queryFn: () => fetchEthicsWorkspace(actor.userId!),
    gcTime: 0, staleTime: 0,
    refetchOnMount: "always", retry: false,
  });
  const countries = workspace.data?.countries ?? [];
  const names = useMemo(() => new Map(countries.map((item) => [item.id, item.name])), [countries]);
  const organizationId = workspace.data?.organizationId ?? null;
  const currentCountryId = workspace.data?.countryId ?? null;
  const create = useMutation({
    mutationFn: async () => {
      operationScope.current = actorScope;
      if (!actorScope || !organizationId || !currentCountryId) throw new Error("VALIDATION");
      const input = {
        organizationId, reportingCountryId: currentCountryId,
        subjectCountryId: subjectCountryId || null,
        subjectPersonId: subjectPersonId.trim() || null,
        allegation: allegation.trim(),
      };
      return fileEthicsCase(input, op.current(JSON.stringify(input)));
    },
    retry: false,
    onSuccess: ({ caseId, revision }) => {
      if (operationScope.current !== activeScope.current) return;
      op.reset(); setSubjectCountryId(""); setSubjectPersonId(""); setAllegation("");
      setReceipt(`Private Ethics case ${caseId} filed at revision ${revision}.`);
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
          <Scale size={20} aria-hidden="true" className="text-primary" /> UNITY Ethics Committee
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Institutional ethics</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Submit a formal confidential allegation, record evidence and follow authorized committee review.
          A filed allegation is not a finding; committee recommendations are not automatically sanctions.
        </p>
        {!actor.ready || (actor.userId && (!showPrivate || workspace.isPending || workspace.isFetching)) ? (
          <Status>Checking current country authority and private Ethics access…</Status>
        ) : null}
        {actor.ready && !actor.userId ? <Status>Sign in with an authorized country account to access private Ethics records.</Status> : null}
        {actor.ready && actor.userId && showPrivate && workspace.isError ? <ErrorInfo error={workspace.error} retry={refresh} /> : null}
        {actor.ready && actor.userId && showPrivate && workspace.isSuccess && !workspace.isFetching ? (
          <>
            {!workspace.data.signedIn ? <Status>Sign in with an authorized country account to access private Ethics records.</Status> : (
              <>
                <section className="mt-9 border-t border-border pt-6" aria-labelledby="ethics-file">
                  <div className="flex items-center gap-3">
                    <FileText size={20} aria-hidden="true" className="text-primary" />
                    <h2 id="ethics-file" className="text-xl font-semibold">File a confidential allegation</h2>
                  </div>
                  {!currentCountryId || !organizationId ? (
                    <Status>An active country controller and an active UNITY institution are required to file a case.</Status>
                  ) : (
                    <form className="mt-5 grid max-w-xl gap-4"
                      onSubmit={(event) => { event.preventDefault(); if (!create.isPending) create.mutate(); }}>
                      <p className="text-sm text-muted-foreground">
                        Reporting country: <strong>{names.get(currentCountryId) ?? "Your country"}</strong>
                      </p>
                      <div>
                        <label htmlFor="ethics-subject-country" className="mb-2 block text-sm font-medium">Subject country (if applicable)</label>
                        <select id="ethics-subject-country" value={subjectCountryId}
                          onChange={(event) => { setSubjectCountryId(event.target.value); op.reset(); }}
                          className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
                          <option value="">No country specified</option>
                          {countries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="ethics-subject-person" className="mb-2 block text-sm font-medium">Durable subject person ID (if applicable)</label>
                        <input id="ethics-subject-person" value={subjectPersonId}
                          onChange={(event) => { setSubjectPersonId(event.target.value); op.reset(); }}
                          placeholder="Optional UUID for an individual"
                          className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
                      </div>
                      <div>
                        <label htmlFor="ethics-allegation" className="mb-2 block text-sm font-medium">Detailed allegation</label>
                        <textarea id="ethics-allegation" value={allegation}
                          onChange={(event) => { setAllegation(event.target.value); op.reset(); }}
                          required minLength={20} maxLength={10000}
                          className="min-h-40 w-full rounded-lg border border-border bg-background p-3 text-sm" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Name at least one subject country or durable person. Allegations and evidence stay private.
                      </p>
                      <button type="submit"
                        disabled={(!subjectCountryId && !subjectPersonId.trim()) || allegation.trim().length < 20 || create.isPending}
                        className="min-h-11 w-fit rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                        {create.isPending ? "Filing privately…" : "File official ethics case"}
                      </button>
                      {create.isError ? <ErrorInfo error={create.error} retry={() => create.mutate()} /> : null}
                      {receipt ? <p role="status" className="text-sm font-semibold">{receipt}</p> : null}
                    </form>
                  )}
                </section>
                {workspace.data.canConfigure && organizationId ? (
                  <CommitteeConfiguration key={actorScope} organizationId={organizationId} refresh={refresh} />
                ) : null}
                <section className="mt-9 border-t border-border pt-6" aria-labelledby="ethics-cases">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="ethics-cases" className="text-xl font-semibold">Authorized private cases</h2>
                    <button type="button" onClick={refresh}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold">
                      <RefreshCw size={16} aria-hidden="true" /> Refresh
                    </button>
                  </div>
                  {workspace.data.cases.length ? (
                    <div className="mt-4">
                      {workspace.data.cases.map((record) => (
                        <EthicsCasePanel key={`${actorScope}:${record.id}`} record={record}
                          actorId={actor.userId} actorEpoch={actor.epoch}
                          canManage={workspace.data.canManage}
                          currentCountryId={currentCountryId}
                          committee={workspace.data.committee}
                          countryName={(id) => names.get(id) ?? "Country"}
                          refresh={refresh}
                        />
                      ))}
                    </div>
                  ) : <Status>No private Ethics case is currently available to this account.</Status>}
                </section>
              </>
            )}
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
