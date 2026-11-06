import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpenCheck, FileClock, RefreshCw, Scale } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { courtError } from "@/lib/world-court-filing";
import {
  COURT_ALLOWED_ADVANCES,
  advanceCourtCase, decideCourtReconsideration, fetchCourtJudgmentWorkspace,
  mayRequestCourtReconsideration, publishCourtJudgment, requestCourtReconsideration,
  type CourtJudgment, type CourtJudgmentOperation, type CourtJudgmentWorkspace,
} from "@/lib/world-court-judgments";

type ActionValue = string | boolean;
type ActionValues = Record<string, ActionValue>;
type ActionField = {
  name: string; label: string;
  kind: "text" | "textarea" | "select" | "checkbox";
  required?: boolean; minLength?: number; maxLength?: number;
  options?: readonly { value: string; label: string }[];
  initial?: string | boolean;
};
type ActionFormProps = {
  title: string; description: string; submitLabel: string;
  fields: readonly ActionField[];
  execute: (values: ActionValues, op: CourtJudgmentOperation) => Promise<unknown>;
  onSuccess: () => void;
  confirmCase?: string;
};

/** A possibly-lost HTTP response freezes the exact payload and operation ID.
 * Retrying does not invent a second Court action. Reload to re-review instead. */
function CourtActionForm({
  title, description, submitLabel, fields, execute, onSuccess, confirmCase,
}: ActionFormProps) {
  const [values, setValues] = useState<ActionValues>(() => Object.fromEntries(
    fields.map((field) => [field.name, field.initial ?? (field.kind === "checkbox" ? false : "")]),
  ));
  const [reviewedCase, setReviewedCase] = useState("");
  const [envelope, setEnvelope] = useState<{ id: string; payload: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const mutation = useMutation({
    mutationFn: async () => {
      const payload = JSON.stringify(values);
      if (envelope && envelope.payload !== payload) throw new Error("Official Court inputs changed during recovery.");
      const id = envelope?.id ?? crypto.randomUUID();
      if (!envelope) setEnvelope({ id, payload });
      return execute(values, { operationId: id, key: `world-court-${id}` });
    },
    retry: false,
    onSuccess: () => {
      setConfirmed(true);
      onSuccess();
    },
  });
  const locked = mutation.isPending || mutation.isError || confirmed;
  const confirmOk = !confirmCase || reviewedCase.trim() === confirmCase;
  return (
    <form
      className="mt-5 space-y-4 rounded-xl border border-border p-4 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!locked && confirmOk) mutation.mutate();
      }}
    >
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      {fields.map((field) => (
        <div key={field.name}>
          <label className="mb-1 block text-sm font-semibold" htmlFor={`court-form-${title}-${field.name}`}>
            {field.label}
          </label>
          {field.kind === "textarea" ? (
            <textarea
              id={`court-form-${title}-${field.name}`}
              className="min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm"
              value={String(values[field.name] ?? "")}
              minLength={field.minLength} maxLength={field.maxLength}
              required={field.required}
              disabled={locked}
              onChange={(event) => setValues((previous) => ({ ...previous, [field.name]: event.target.value }))}
            />
          ) : field.kind === "select" ? (
            <select
              id={`court-form-${title}-${field.name}`}
              value={String(values[field.name] ?? "")}
              required={field.required}
              disabled={locked}
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
              onChange={(event) => setValues((previous) => ({ ...previous, [field.name]: event.target.value }))}
            >
              <option value="">Choose an action</option>
              {(field.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : field.kind === "checkbox" ? (
            <input
              type="checkbox"
              id={`court-form-${title}-${field.name}`}
              className="size-5 accent-primary"
              checked={values[field.name] === true}
              disabled={locked}
              onChange={(event) => setValues((previous) => ({ ...previous, [field.name]: event.target.checked }))}
            />
          ) : (
            <input
              type="text"
              id={`court-form-${title}-${field.name}`}
              value={String(values[field.name] ?? "")}
              required={field.required}
              minLength={field.minLength} maxLength={field.maxLength}
              disabled={locked}
              onChange={(event) => setValues((previous) => ({ ...previous, [field.name]: event.target.value }))}
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
            />
          )}
        </div>
      ))}
      {confirmCase ? (
        <div>
          <label htmlFor={`court-confirm-${title}`} className="mb-2 block text-sm font-semibold">
            Confirm official case identifier: {confirmCase}
          </label>
          <input
            id={`court-confirm-${title}`}
            value={reviewedCase}
            onChange={(event) => setReviewedCase(event.target.value)}
            required
            disabled={locked}
            autoComplete="off"
            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
          />
        </div>
      ) : null}
      {!confirmed ? (
        <button
          type="submit"
          disabled={locked || !confirmOk}
          className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {mutation.isPending ? "Recording official Court action…" : submitLabel}
        </button>
      ) : <p role="status" className="text-sm font-semibold">Official Court operation confirmed. Reloading the case.</p>}
      {mutation.isError ? (
        <div role="alert" className="rounded-lg border border-destructive/50 p-4">
          <p className="text-sm">{courtError(mutation.error)}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            The original operation identity is preserved. Retry the unchanged action, or refresh this case before starting another.
          </p>
          <button type="button" disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">
            Retry same operation
          </button>
        </div>
      ) : null}
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mt-9 border-t border-border pt-6">
    <h2 className="text-xl font-semibold">{title}</h2>{children}
  </section>;
}

function Label({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
    {children}
  </span>;
}

function JudgmentRecord({ record }: { record: CourtJudgment }) {
  return (
    <article className="border-b border-border py-6 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold">Judgment {record.judgmentNumber}</h3>
        <Label>{record.kind === "revised" ? "Revised decision" : "Original decision"}</Label>
        {!record.publiclyListed ? <Label>Parties / Court only</Label> : null}
      </div>
      <time className="mt-2 block text-xs text-muted-foreground" dateTime={record.publishedAt}>
        Published {new Date(record.publishedAt).toLocaleString()}
      </time>
      <dl className="mt-4 grid gap-5 text-sm">
        {([
          ["Findings",record.findings],
          ["Reasoning",record.reasoning],
          ["Orders",record.orders],
          ["Remedies",record.remedies],
        ] as const).map(([name,value]) => (
          <div key={name}><dt className="font-semibold">{name}</dt>
            <dd className="mt-2 whitespace-pre-wrap break-words leading-6 text-muted-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function PartyAndJudgeActions({
  data,caseId,reload,
}: { data:CourtJudgmentWorkspace;caseId:string;reload:()=>void }) {
  const record=data.authorizedCase;
  if (!record) return null;
  const newest=data.judgments[data.judgments.length-1];
  const mayRequest=mayRequestCourtReconsideration(record,newest,data.countryId,data.requests);
  const advances=COURT_ALLOWED_ADVANCES[record.status].filter(
    (target)=>data.canJudge || !["closed","archived"].includes(target),
  );
  const pending=data.requests.filter((request)=>request.decision===null);
  const version=record.revision;

  return (
    <>
      {mayRequest && newest ? (
        <Section title="Request reconsideration">
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Each country may submit one request for reconsideration of each judgment.
            This is a request to the same Secretary-General, not an appeal to a different court.
            No deadline has been invented. The existing judgment remains unchanged.
          </p>
          <CourtActionForm
            key={`request-${version}`}
            title="Specific grounds for reconsideration"
            description="State a concrete error, newly discovered fact or legal ground. A request does not automatically change the judgment."
            submitLabel="Submit official reconsideration request"
            fields={[{ name:"grounds",label:"Grounds",kind:"textarea",required:true,minLength:30,maxLength:12000 }]}
            execute={(values,op)=>requestCourtReconsideration({
              caseId,judgmentId:newest.id,grounds:String(values.grounds),
              expectedRevision:version,op,
            })}
            onSuccess={reload}
          />
        </Section>
      ) : null}
      {data.requests.length ? (
        <Section title="Reconsideration history">
          <ol className="mt-4 divide-y divide-border">
            {data.requests.map((request) => (
              <li key={request.id} className="py-4 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>Judgment reconsideration</strong>
                  <Label>{request.decision ?? "Awaiting judicial review"}</Label>
                </div>
                <time className="mt-1 block text-xs text-muted-foreground" dateTime={request.filedAt}>
                  Filed {new Date(request.filedAt).toLocaleString()}
                </time>
                <p className="mt-2 whitespace-pre-wrap break-words leading-6 text-muted-foreground">{request.grounds}</p>
                {request.decisionReason ? <p className="mt-2 font-medium">Decision reason: {request.decisionReason}</p> : null}
                {data.canJudge && !request.decision &&
                 ["reconsideration_requested","reconsideration"].includes(record.status) ? (
                  <CourtActionForm
                    key={`decision-${version}-${request.id}`}
                    title={`Review request ${request.id.slice(0,8)}`}
                    description="Only the current UNITY Secretary-General may decide. Acceptance starts judicial reconsideration; rejection preserves the original judgment."
                    submitLabel="Record reconsideration decision"
                    fields={[
                      {name:"decision",label:"Decision",kind:"select",required:true,options:[
                        {value:"accepted",label:"Accept for reconsideration"},
                        {value:"rejected",label:"Reject reconsideration"},
                      ]},
                      {name:"reason",label:"Formal reason",kind:"textarea",required:true,minLength:10,maxLength:12000},
                    ]}
                    execute={(values,op)=>decideCourtReconsideration({
                      requestId:request.id,
                      decision:String(values.decision) as "accepted"|"rejected",
                      reason:String(values.reason),expectedRevision:version,op,
                    })}
                    confirmCase={record.identifier}
                    onSuccess={reload}
                  />
                ) : null}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
      {data.canManage && advances.length ? (
        <Section title="Procedural case administration">
          <p className="mt-2 text-sm text-muted-foreground">
            Review and record the next lawful procedural state. A procedural action cannot fabricate a final judgment.
          </p>
          <CourtActionForm key={`advance-${version}`}
            title="Advance Court proceedings"
            description="A reason is permanently recorded. Closing or archiving requires the current Secretary-General and no open reconsideration."
            submitLabel="Record procedural transition"
            fields={[
              {name:"state",label:"Next procedural state",kind:"select",required:true,
                options:advances.map((state)=>({value:state,label:state.replaceAll("_"," ")}))},
              {name:"reason",label:"Procedural justification",kind:"textarea",required:true,minLength:10,maxLength:3000},
            ]}
            execute={(values,op)=>advanceCourtCase({
              caseId,target:String(values.state) as (typeof advances)[number],
              reason:String(values.reason),expectedRevision:version,op,
            })}
            onSuccess={reload}
          />
        </Section>
      ) : null}
      {data.canJudge && (record.status==="judgment_pending" || record.status==="reconsideration") && (
        <Section title={record.status==="reconsideration" ? "Publish revised decision" : "Issue Court judgment"}>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Judgment authority belongs to the current UNITY Secretary-General.
            Publication is permanent. A revised judgment never deletes or overwrites the original.
            Public listing includes only the published judgment, never private pleadings or evidence.
          </p>
          <CourtActionForm key={`judgment-${version}`}
            title={record.status==="reconsideration" ? "Revised judgment" : "Original judgment"}
            description="Review all four sections and confirm the exact case identifier before issuing. A failed/uncertain request preserves the same operation identity."
            submitLabel="Publish official judgment"
            confirmCase={record.identifier}
            fields={[
              {name:"findings",label:"Findings of fact",kind:"textarea",required:true,minLength:20,maxLength:12000},
              {name:"reasoning",label:"Legal reasoning",kind:"textarea",required:true,minLength:20,maxLength:20000},
              {name:"orders",label:"Orders",kind:"textarea",required:true,minLength:10,maxLength:12000},
              {name:"remedies",label:"Remedies",kind:"textarea",required:true,minLength:10,maxLength:12000},
              {name:"public",label:"List this judgment publicly (without publishing pleadings)",kind:"checkbox",initial:false},
            ]}
            execute={(values,op)=>publishCourtJudgment({
              caseId,findings:String(values.findings),reasoning:String(values.reasoning),
              orders:String(values.orders),remedies:String(values.remedies),
              publiclyListed:values.public===true,expectedRevision:version,op,
            })}
            onSuccess={reload}
          />
        </Section>
      )}
      {data.proceedings.length ? (
        <Section title="Recorded procedural history">
          <ol className="mt-4 divide-y divide-border">
            {data.proceedings.map((action) => (
              <li key={action.id} className="py-3 text-sm">
                <strong>{action.fromState.replaceAll("_"," ")} → {action.toState.replaceAll("_"," ")}</strong>
                <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{action.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">Case revision {action.caseRevision}</p>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
      {pending.length > 0 ? (
        <p role="status" className="mt-8 rounded-lg border border-border p-4 text-sm text-muted-foreground">
          {pending.length} reconsideration request(s) awaiting decision.
          Archival and further judgment publication remain restricted until all are reviewed.
        </p>
      ) : null}
    </>
  );
}

export function WorldCourtJudgments({ caseId }: { caseId: string }) {
  const [authGeneration,setAuthGeneration]=useState(0);
  useEffect(()=>{
    const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>{
      setAuthGeneration((generation)=>generation+1);
    });
    return ()=>subscription.unsubscribe();
  },[]);
  const data=useQuery({
    queryKey:["world","court","judgments",caseId,authGeneration],
    queryFn:()=>fetchCourtJudgmentWorkspace(caseId),
    gcTime:0,staleTime:0,refetchOnMount:"always",retry:false,
  });
  const reload=()=>void data.refetch();
  const sorted=useMemo(
    ()=>[...(data.data?.judgments??[])].sort((a,b)=>a.judgmentNumber-b.judgmentNumber),
    [data.data?.judgments],
  );
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-5 sm:pt-8">
        <Link to="/world/court" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground">
          <ArrowLeft size={16} aria-hidden="true" /> Court cases
        </Link>
        <p className="mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <Scale className="text-primary" size={20} aria-hidden="true" /> International Terra Solaris Court
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Judgments & reconsideration</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Published Court decisions, historical versions and authorized judicial actions.
          Private proceedings are never part of public discovery.
        </p>
        <button type="button" onClick={reload}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold">
          <RefreshCw size={16} aria-hidden="true" /> Refresh official record
        </button>
        {data.isPending || data.isFetching ? (
          <p role="status" className="mt-7 rounded-lg border border-border p-5 text-sm text-muted-foreground">
            Verifying current Court authority and publication…
          </p>
        ) : data.isError ? (
          <div role="alert" className="mt-6 rounded-lg border border-destructive/50 p-5">
            <p className="text-sm">{courtError(data.error)}</p>
            <button type="button" onClick={reload}
              className="mt-4 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">Retry</button>
          </div>
        ) : data.data ? (
          <>
            {data.data.authorizedCase ? (
              <div className="mt-7">
                <h2 className="text-lg font-semibold">{data.data.authorizedCase.identifier}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Current state: {data.data.authorizedCase.status.replaceAll("_"," ")} · Revision {data.data.authorizedCase.revision}
                </p>
              </div>
            ) : null}
            <Section title="Official published judgments">
              {sorted.length===0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No judgment is currently available to your account or for public publication.
                </p>
              ) : (
                <div className="mt-2">{sorted.map((record)=><JudgmentRecord key={record.id} record={record}/>)}</div>
              )}
            </Section>
            {data.data.authorizedCase ? (
              <PartyAndJudgeActions
                data={data.data} caseId={caseId} reload={reload}
              />
            ) : (
              <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
                <FileClock size={18} aria-hidden="true" />
                Sign in as a current Court party or authorized official for private actions.
              </p>
            )}
          </>
        ) : null}
        <p className="mt-10 flex items-center gap-2 text-xs text-muted-foreground">
          <BookOpenCheck size={16} aria-hidden="true" /> Historical decisions remain immutable after publication.
        </p>
      </main>
    </AppShell>
  );
}
