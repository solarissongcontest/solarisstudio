import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ClipboardCheck, FileText, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyWorldControlledCountry } from "@/lib/world-measure-commands";
import {
  amendmentUuid,getWorldAmendments,submitWorldAmendment,
  validateAmendInput,withdrawWorldAmendment,
  type AmendInput,type WithdrawInput,type WorldAmendmentReceipt,
} from "@/lib/world-measure-amendments";

type Attempt = ({kind:"propose"}&AmendInput)|({kind:"withdraw"}&WithdrawInput);
const definite=(e:unknown)=>Boolean(e&&typeof e==="object"&&"code" in e&&
  ["42501","40001","23514","23505","22023","25006"].includes(String(e.code)));
function message(e:unknown):string{
  if(e&&typeof e==="object"&&"code" in e){
    switch(String(e.code)){
      case "42501":return "Your current sponsor-country or institutional permission was denied.";
      case "40001":return "The measure or amendment revision changed. Recheck authoritative history.";
      case "23514":return "The sponsor membership, published base version or subject state is no longer valid.";
      case "23505":return "This same amendment content was already submitted for this base version.";
      case "22023":return "The source excerpt is missing, ambiguous or does not meet formal text rules.";
      case "25006":return "The official World workflow is unavailable during rollout or maintenance.";
    }
  }
  return "The operation may already have committed. Retain and retry its exact operation ID.";
}
function useActor(){
  const cache=useQueryClient();
  const [id,setId]=useState<string|null>(null);
  const [ready,setReady]=useState(false);
  const [generation,setGeneration]=useState(0);
  const current=useRef<string|null>(null);
  useEffect(()=>{
    let live=true, newerEvent=false;
    const apply=(next:string|null)=>{
      if(!live)return;
      if(current.current!==next){
        current.current=next;
        cache.removeQueries({queryKey:["world","measures","amendments","private"]});
        setGeneration(n=>n+1);
      }
      setId(next);setReady(true);
    };
    void supabase.auth.getUser().then(({data,error})=>{
      if(!newerEvent)apply(error?null:data.user?.id??null);
    }).catch(()=>{if(!newerEvent)apply(null);});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
      newerEvent=true;apply(session?.user.id??null);
    });
    return ()=>{live=false;subscription.unsubscribe();};
  },[cache]);
  return {id,ready,generation,current};
}
function AmendmentWorkspace({
  measureId,actor,
}: {measureId:string;actor:ReturnType<typeof useActor>}){
  const cache=useQueryClient();
  const query=useQuery({
    queryKey:["world","measures","amendments","private",actor.id,measureId],
    queryFn:()=>getWorldAmendments(measureId),
    enabled:actor.ready&&Boolean(actor.id)&&amendmentUuid(measureId),
    staleTime:0,gcTime:0,refetchOnMount:"always",retry:false,
  });
  const country=useQuery({
    queryKey:["world","measures","amendments","my-country",actor.id],
    queryFn:getMyWorldControlledCountry,enabled:actor.ready&&Boolean(actor.id),
    retry:false,staleTime:0,gcTime:0,
  });
  const [oldText,setOldText]=useState("");
  const [newText,setNewText]=useState("");
  const [reason,setReason]=useState("");
  const [review,setReview]=useState<Attempt|null>(null);
  const uncertain=useRef<Attempt|null>(null);
  const [busy,setBusy]=useState(false);
  const [problem,setProblem]=useState<string|null>(null);
  const [receipt,setReceipt]=useState<WorldAmendmentReceipt|null>(null);
  const record=query.data;
  const canPropose=Boolean(record?.canSubmit&&country.data&&
    ["registered","scheduled","under_debate"].includes(record.measureState));
  const locked=busy||Boolean(review)||Boolean(uncertain.current);
  const canWithdraw=(item:{state:string;sponsorCountryId:string;baseVersionId:string})=>
    item.state==="proposed"&&item.sponsorCountryId===country.data&&
    item.baseVersionId===record?.currentVersionId&&canPropose;

  function prepareSubmit(event:FormEvent){
    event.preventDefault();
    if(!record||!country.data||!canPropose||locked)return;
    const action:Attempt={kind:"propose",
      measureId:record.measureId,sponsorCountryId:country.data,
      baseVersionId:record.currentVersionId,currentText:oldText,
      proposedText:newText,reasoning:reason,
      expectedMeasureRevision:record.measureRevision,operationId:crypto.randomUUID()};
    const invalid=validateAmendInput(action);
    if(invalid){setProblem(invalid);return;}
    const excerpt=action.currentText.trim();
    const full=record.currentVersionText;
    const first=full.indexOf(excerpt);
    if(first<0||full.indexOf(excerpt,first+excerpt.length)>=0){
      setProblem("Select an exact, uniquely occurring excerpt from the official current text.");
      return;
    }
    setProblem(null);setReview(action);
  }
  function prepareWithdrawal(item:{id:string;revision:number}){
    if(locked)return;
    setProblem(null);
    setReview({kind:"withdraw",amendmentId:item.id,
      expectedAmendmentRevision:item.revision,operationId:crypto.randomUUID()});
  }
  async function execute(action:Attempt){
    if(busy||!actor.id)return;
    const submittingActor=actor.id;
    uncertain.current=action;
    setReview(null);setBusy(true);setProblem(null);setReceipt(null);
    try{
      const next=action.kind==="propose"?
        await submitWorldAmendment(action):await withdrawWorldAmendment(action);
      if(actor.current.current!==submittingActor)return;
      uncertain.current=null;
      setReceipt(next);
      setOldText("");setNewText("");setReason("");
      await cache.invalidateQueries({
        queryKey:["world","measures","amendments","private",submittingActor,measureId],
      });
    }catch(cause){
      if(actor.current.current!==submittingActor)return;
      setProblem(message(cause));
      if(definite(cause)){
        uncertain.current=null;
        await cache.invalidateQueries({
          queryKey:["world","measures","amendments","private",submittingActor,measureId],
        });
      }
    }finally{if(actor.current.current===submittingActor)setBusy(false);}
  }
  return <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-5 sm:px-6 sm:pt-9">
    <Link to="/world/measures/$measureId" params={{measureId}}
      className="inline-flex min-h-11 items-center gap-2 text-sm">
      <ArrowLeft className="size-4"/> Official measure
    </Link>
    <p className="mt-5 text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
      Terra Solaris · Institutional amendment workflow
    </p>
    <h1 className="mt-2 text-3xl font-semibold tracking-tight">Proposed amendments</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">
      Proposals are version-bound and recorded with their sponsor and source wording.
      Submitting or withdrawing an amendment does not enact the change. Incorporation
      requires the institution's separate governed decision or certified vote.
    </p>
    {!actor.ready?<p role="status" className="mt-5">Checking your institutional identity…</p>:
     !actor.id?<p className="mt-5 text-sm">Sign in as the current country controller or authorized officer.</p>:null}
    {!amendmentUuid(measureId)?<p role="alert" className="mt-6">Invalid measure ID.</p>:
     query.isPending&&actor.id?<p role="status" className="mt-5">Verifying the official published measure…</p>:
     query.isError?<section role="alert" className="mt-5">
       <h2 className="font-semibold">Amendment authority unavailable</h2>
       <button type="button" onClick={()=>void query.refetch()}
         className="mt-3 min-h-11 rounded-lg border px-4 text-sm">Retry</button>
     </section>:
     !record&&actor.id?<p role="status" className="mt-5">
       This measure is not registered and published, or you have no authorized institutional access.
     </p>:null}
    {record&&<div className="mt-6 space-y-6">
      <section className="border-b border-border pb-6">
        <h2 className="text-xl font-semibold">{record.measureTitle}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Official measure revision {record.measureRevision} · {record.measureState.replaceAll("_"," ")}
        </p>
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold">
            Read current version before proposing an amendment
          </summary>
          <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">
            {record.currentVersionText}
          </p>
        </details>
      </section>
      {country.isError?<p role="alert" className="text-sm">
        Current country authority could not be verified.
        <button type="button" className="ml-2 underline" onClick={()=>void country.refetch()}>Retry</button>
      </p>:null}
      {problem&&<p role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm">{problem}</p>}
      {receipt&&<section role="status" className="rounded-lg border border-primary/40 p-5">
        <h3 className="flex items-center gap-2 font-semibold">
          <ClipboardCheck className="size-4"/> Recorded institution operation
        </h3>
        <p className="mt-2 text-sm capitalize">{receipt.status} · Revision {receipt.revision}
          {receipt.replayed?" · Existing receipt reconciled":""}
        </p>
        <p className="mt-2 break-all font-mono text-xs">Operation {receipt.operationId}</p>
      </section>}
      {review&&<section className="rounded-lg border border-primary/40 p-5" aria-label="Confirm amendment operation">
        <h3 className="font-semibold">Confirm governed {review.kind==="propose"?"amendment submission":"withdrawal"}</h3>
        <p className="mt-2 text-sm">
          {review.kind==="propose"?
            "The original measure stays unchanged. This is a proposed textual amendment only.":
            "Withdrawal preserves this amendment as a historical record."}
        </p>
        <code className="mt-2 block break-all text-xs">{review.operationId}</code>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={()=>void execute(review)}
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
            Confirm official action
          </button>
          <button type="button" disabled={busy} onClick={()=>setReview(null)}
            className="min-h-11 rounded-lg border px-4 text-sm">Cancel</button>
        </div>
      </section>}
      {uncertain.current&&<section role="alert" className="rounded-lg border p-5">
        <h3 className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="size-4"/> Acknowledgement uncertain
        </h3>
        <p className="mt-2 text-sm">Do not submit a duplicate proposal or withdrawal.
          Retry the identical operation to retrieve the durable receipt.</p>
        <code className="mt-2 block break-all text-xs">{uncertain.current.operationId}</code>
        <button type="button" disabled={busy} onClick={()=>void execute(uncertain.current!)}
          className="mt-4 min-h-11 rounded-lg border px-4 text-sm">Reconcile same operation</button>
      </section>}
      {canPropose&&<section className="border-t border-border pt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="size-5"/> Submit exact-text amendment
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Copy a uniquely occurring passage from the official current version,
          supply its replacement and explain why. You cannot amend a frozen
          ballot or change an adopted text with this form.
        </p>
        <form className="mt-5 grid gap-4" onSubmit={prepareSubmit}>
          <label className="block text-sm font-medium">Existing excerpt
            <textarea required rows={4} maxLength={5000} value={oldText} disabled={locked}
              onChange={e=>setOldText(e.target.value)}
              className="mt-2 w-full rounded-lg border bg-background p-3"/>
          </label>
          <label className="block text-sm font-medium">Replacement wording
            <textarea required rows={4} maxLength={5000} value={newText} disabled={locked}
              onChange={e=>setNewText(e.target.value)}
              className="mt-2 w-full rounded-lg border bg-background p-3"/>
          </label>
          <label className="block text-sm font-medium">Reason for this amendment
            <textarea required rows={3} maxLength={3000} value={reason} disabled={locked}
              onChange={e=>setReason(e.target.value)}
              className="mt-2 w-full rounded-lg border bg-background p-3"/>
          </label>
          <button type="submit" disabled={locked}
            className="min-h-11 justify-self-start rounded-lg border px-5 text-sm font-semibold">
            Review amendment submission
          </button>
        </form>
      </section>}
      <section className="border-t border-border pt-6">
        <h2 className="text-lg font-semibold">Recorded amendment history</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Showing up to 30 entries you are currently authorized to inspect.
        </p>
        {!record.amendments.length?<p className="mt-5 text-sm text-muted-foreground">
          No visible amendment proposals are recorded for this measure.</p>:
        <ol className="mt-4 divide-y divide-border">
          {record.amendments.map(item=><li key={item.id} className="py-5">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{item.sponsorCountryCode}</span>
              <span aria-hidden="true">·</span><span className="capitalize">{item.state}</span>
              <span aria-hidden="true">·</span><span>{item.submittedAt.slice(0,10)}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm line-through">{item.currentText}</p>
            <p className="mt-2 whitespace-pre-wrap border-l-2 border-primary pl-3 text-sm">
              {item.proposedText}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
              Reason: {item.reasoning}</p>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
              Source hash {item.contentHash}
            </p>
            {canWithdraw(item)&&<button type="button" disabled={locked}
              onClick={()=>prepareWithdrawal(item)}
              className="mt-4 min-h-11 rounded-lg border px-4 text-sm font-semibold">
              Review sponsor withdrawal
            </button>}
          </li>)}
        </ol>}
      </section>
    </div>}
  </main>;
}
export function WorldMeasureAmendments({measureId}:{measureId:string}){
 const actor=useActor();
 return <AmendmentWorkspace key={actor.id+":"+actor.generation+":"+measureId}
   actor={actor} measureId={measureId}/>;
}
