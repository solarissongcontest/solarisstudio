import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw, Scale } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { ethicsError } from "@/lib/world-ethics";
import {
  ETHICS_RECOMMENDATIONS, canSubmitEthicsFinding,
  fetchEthicsFindingsWorkspace, prepareEthicsFinding,
  type EthicsRecommendation, type EthicsFindingsOperation,
} from "@/lib/world-ethics-findings";
import { useTg13PrivateActor } from "@/lib/world-tg13-private-session";

const titles: Record<EthicsRecommendation,string> = {
  none: "No disciplinary recommendation", warning: "Recommend warning",
  censure: "Recommend censure", voting_suspension: "Recommend voting suspension",
  assistance_freeze: "Recommend assistance freeze",
  court_referral: "Recommend Court referral", other: "Other recommendation",
};
type Retry = { payload: string; op: EthicsFindingsOperation };

export function WorldEthicsFindings({ caseId }: { caseId: string }) {
  const actor = useTg13PrivateActor();
  const actorScope = actor.ready && actor.userId ? `${actor.userId}:${actor.epoch}` : null;
  const [draftScope,setDraftScope] = useState<string|null>(null);
  const activeScope = useRef(actorScope);
  activeScope.current = actorScope;
  const opScope = useRef<string|null>(null);
  const retry = useRef<Retry|null>(null);
  const [findings,setFindings] = useState("");
  const [reasoning,setReasoning] = useState("");
  const [recommendation,setRecommendation] = useState<EthicsRecommendation>("none");
  const [details,setDetails] = useState("");
  const [confirm,setConfirm] = useState("");
  const [uncertain,setUncertain] = useState(false);
  const [completed,setCompleted] = useState(false);
  const [receipt,setReceipt] = useState<string|null>(null);
  const query = useQuery({
    queryKey: ["world","ethics","findings",actor.userId,actor.epoch,caseId],
    queryFn: () => fetchEthicsFindingsWorkspace(caseId,actor.userId!),
    enabled: actor.ready && !!actor.userId,
    gcTime: 0, staleTime: 0, refetchOnMount: "always", retry: false,
  });
  useEffect(() => {
    retry.current=null;opScope.current=null;
    setFindings("");setReasoning("");setDetails("");
    setRecommendation("none");setConfirm("");
    setUncertain(false);setCompleted(false);setReceipt(null);
    setDraftScope(actorScope);
  },[actorScope]);

  const safe=actorScope!==null && draftScope===actorScope && query.isSuccess && !query.isFetching;
  const record=safe?query.data.record:null;
  const canPrepare=safe && canSubmitEthicsFinding(query.data);
  const locked=uncertain || completed;
  const submitReady=canPrepare && record?.id===confirm.trim()
    && findings.trim().length>=20 && reasoning.trim().length>=20
    && (recommendation==="none" || details.trim().length>=10);
  const mutation=useMutation({
    mutationFn: async () => {
      if (!actorScope || !record || !canPrepare) throw new Error("AUTHORIZATION");
      const input={
        caseId:record.id,findings:findings.trim(),reasoning:reasoning.trim(),
        recommendation,recommendationText:recommendation==="none"?null:details.trim(),
        expectedRevision:record.revision,
      };
      const payload=JSON.stringify(input);
      if(retry.current && retry.current.payload!==payload)
        throw new Error("This official operation cannot be modified during recovery.");
      if(!retry.current){
        const operationId=crypto.randomUUID();
        retry.current={payload,op:{operationId,key:`world-ethics-${operationId}`}};
      }
      opScope.current=actorScope;
      return prepareEthicsFinding(input,retry.current.op);
    },
    retry:false,
    onSuccess:(result)=>{
      if(opScope.current!==activeScope.current)return;
      setReceipt(`Finding ${result.findingId} recorded at revision ${result.revision}.`);
      setCompleted(true);setUncertain(false);
      void query.refetch();
    },
    onError:()=>{
      if(opScope.current===activeScope.current)setUncertain(true);
    },
  });
  const refresh=()=>void query.refetch();
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-5 sm:pt-8">
        <Link to="/world/ethics" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft size={17} aria-hidden="true"/> Ethics Committee
        </Link>
        <p className="mt-5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Scale size={18} aria-hidden="true"/> UNITY Ethics Committee
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Official case findings</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Confidential factual findings and nonbinding committee recommendations.
          Recording a recommendation never imposes a sanction or changes membership.
        </p>
        <button onClick={refresh} type="button" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold">
          <RefreshCw size={16} aria-hidden="true"/> Refresh authority
        </button>
        {!actor.ready || (actor.userId && (!safe && !query.isError)) ? (
          <p role="status" className="mt-6 text-sm text-muted-foreground">Verifying this account and confidential Ethics records…</p>
        ) : null}
        {actor.ready && !actor.userId ? (
          <p role="status" className="mt-6 text-sm text-muted-foreground">Sign in to access private Ethics case findings.</p>
        ) : null}
        {actor.ready && actor.userId && query.isError ? (
          <p role="alert" className="mt-6 text-sm text-destructive">{ethicsError(query.error)}</p>
        ) : null}
        {safe && !record ? (
          <p role="status" className="mt-6 text-sm">No authorized case is available to your current account.</p>
        ) : null}
        {safe && record ? (
          <>
            <section className="mt-8 border-t border-border pt-6">
              <h2 className="text-xl font-semibold">Private case {record.id.slice(0,8)}</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                State {record.state.replaceAll("_"," ")} · Revision {record.revision}
              </p>
              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{record.allegation}</p>
            </section>
            {query.data.finding ? (
              <section className="mt-8 space-y-4 border-t border-border pt-6">
                <h2 className="text-xl font-semibold">Immutable prepared finding</h2>
                <p className="text-xs text-muted-foreground">
                  Prepared {new Date(query.data.finding.preparedAt).toLocaleString()}
                  · Revision {query.data.finding.caseRevision}
                  · Evidence count {query.data.finding.evidenceCount}
                </p>
                <h3 className="text-sm font-semibold">Factual findings</h3>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{query.data.finding.findings}</p>
                <h3 className="text-sm font-semibold">Reasoning</h3>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{query.data.finding.reasoning}</p>
                <h3 className="text-sm font-semibold">Nonbinding recommendation</h3>
                <p className="text-sm">{titles[query.data.finding.recommendation]}</p>
                {query.data.finding.recommendationText ? (
                  <p className="whitespace-pre-wrap break-words text-sm">{query.data.finding.recommendationText}</p>
                ) : null}
              </section>
            ) : canPrepare ? (
              <section className="mt-8 border-t border-border pt-6">
                <h2 className="text-xl font-semibold">Prepare official finding</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Only the current assigned committee member with an explicit findings capability can submit.
                  Once recorded, the original is immutable.
                </p>
                <form className="mt-5 grid max-w-2xl gap-4" onSubmit={(event)=>{
                  event.preventDefault();
                  if(submitReady&&!uncertain&&!mutation.isPending)mutation.mutate();
                }}>
                  {([
                    ["findings","Factual findings",findings,setFindings],
                    ["reasoning","Legal and factual reasoning",reasoning,setReasoning],
                  ] as const).map(([key,label,value,setValue])=>(
                    <div key={key}>
                      <label htmlFor={`ethics-${key}`} className="mb-2 block text-sm font-semibold">{label}</label>
                      <textarea id={`ethics-${key}`} value={value} disabled={locked}
                        onChange={(event)=>setValue(event.target.value)}
                        required minLength={20} maxLength={12000}
                        className="min-h-36 w-full rounded-lg border border-border bg-background p-3 text-sm"/>
                    </div>
                  ))}
                  <div>
                    <label htmlFor="ethics-recommendation" className="mb-2 block text-sm font-semibold">Nonbinding recommendation</label>
                    <select id="ethics-recommendation" value={recommendation} disabled={locked}
                      onChange={(event)=>setRecommendation(event.target.value as EthicsRecommendation)}
                      className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
                      {ETHICS_RECOMMENDATIONS.map((kind)=><option key={kind} value={kind}>{titles[kind]}</option>)}
                    </select>
                  </div>
                  {recommendation!=="none"?(
                    <div>
                      <label htmlFor="ethics-recommendation-reason" className="mb-2 block text-sm font-semibold">Reason for recommendation</label>
                      <textarea id="ethics-recommendation-reason" value={details} disabled={locked}
                        onChange={(event)=>setDetails(event.target.value)}
                        required minLength={10} maxLength={12000}
                        className="min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm"/>
                    </div>
                  ):null}
                  <div>
                    <label htmlFor="ethics-finding-confirm" className="mb-2 block text-sm font-semibold">
                      Confirm exact case ID: {record.id}
                    </label>
                    <input id="ethics-finding-confirm" value={confirm} disabled={locked}
                      onChange={(event)=>setConfirm(event.target.value)} required autoComplete="off"
                      className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"/>
                  </div>
                  {!completed && !uncertain ? (
                    <button type="submit" disabled={!submitReady||mutation.isPending}
                      className="min-h-11 w-fit rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                      {mutation.isPending?"Recording permanently…":"Record official finding"}
                    </button>
                  ):null}
                  {mutation.isError && uncertain ? (
                    <div role="alert" className="rounded-lg border border-destructive/50 p-4">
                      <p className="text-sm">{ethicsError(mutation.error)}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        The submission is frozen. Retrying uses the identical operation ID.
                      </p>
                      <button type="button" disabled={mutation.isPending} onClick={()=>mutation.mutate()}
                        className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">
                        Retry original operation
                      </button>
                    </div>
                  ):null}
                  {receipt?<p role="status" className="text-sm font-semibold">{receipt}</p>:null}
                </form>
              </section>
            ) : (
              <p role="status" className="mt-6 text-sm text-muted-foreground">
                No finding has been prepared. Assignment to an active Committee member and a scoped findings permission are required.
              </p>
            )}
          </>
        ):null}
      </main>
    </AppShell>
  );
}
