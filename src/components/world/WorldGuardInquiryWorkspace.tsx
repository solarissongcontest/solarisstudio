import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileClock, RefreshCw, ShieldAlert, ClipboardCheck } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  canRespondToGuardInquiry, canReviewGuardInquiry, fetchGuardInquiryHistory,
  fetchGuardInquiryWorkspace, guardInquiryError, openGuardInquiry,
  respondGuardInquiry, reviewGuardInquiry,
  type GuardInquiry, type GuardInquiryHistory, type GuardInquiryOperation,
  type GuardInquiryResponse, type GuardInquiryReview,
  type GuardRecommendation, type GuardReviewKind,
} from "@/lib/world-guard-inquiry";

type OperationEnvelope = { fingerprint: string; op: GuardInquiryOperation };
function useOfficialOperation() {
  const pending=useRef<OperationEnvelope|null>(null);
  return {
    exact: (input: unknown): GuardInquiryOperation => {
      const fingerprint=JSON.stringify(input);
      if(pending.current?.fingerprint===fingerprint) return pending.current.op;
      const id=crypto.randomUUID();
      const op={operationId:id,key:`world-guard-inquiry-${id}`};
      pending.current={fingerprint,op};
      return op;
    },
    reset:()=>{pending.current=null;},
  };
}
function Message({children}:{children:ReactNode}) {
  return <p role="status" className="mt-5 rounded-xl border border-border px-5 py-6 text-sm leading-6 text-muted-foreground">
    {children}
  </p>;
}
function Failure({error,retry}:{error:unknown;retry:()=>void}) {
  return <div role="alert" className="mt-4 rounded-xl border border-destructive/50 p-4">
    <p className="text-sm">{guardInquiryError(error)}</p>
    <p className="mt-1 text-xs text-muted-foreground">
      The previous operation identity is retained. Retry unchanged to avoid a duplicate official action.
    </p>
    <button type="button" onClick={retry}
      className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">
      Retry same operation
    </button>
  </div>;
}
const formatDate = (value:string) => new Date(value).toLocaleString();
const labelState = (value:string) =>
  value.replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase());

function InquiryHistory({inquiryId}:{inquiryId:string}) {
  const history=useQuery({
    queryKey:["world","guard","inquiry","history",inquiryId],
    queryFn:()=>fetchGuardInquiryHistory(inquiryId),
    gcTime:0,staleTime:0,refetchOnMount:"always",retry:false,
  });
  if(history.isPending||history.isFetching) return <Message>Verifying the private inquiry history…</Message>;
  if(history.isError) return <Failure error={history.error} retry={()=>void history.refetch()}/>;
  if(!history.data.length) return <Message>No authenticated inquiry history is available.</Message>;
  return <ol className="mt-4 divide-y divide-border border-t border-border" aria-label="Official inquiry history">
    {history.data.map((entry:GuardInquiryHistory)=>(
      <li key={entry.id} className="py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-foreground">{labelState(entry.action)}</strong>
          <time className="text-xs text-muted-foreground" dateTime={entry.recordedAt}>
            {formatDate(entry.recordedAt)}
          </time>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Revision {entry.revision} · {entry.fromState ? labelState(entry.fromState) : "Opened"} → {labelState(entry.toState)}
        </p>
      </li>
    ))}
  </ol>;
}

function OpenInquiryForm({
  organizationId,countries,onChanged,
}:{
  organizationId:string;countries:readonly {id:string;name:string}[];onChanged:()=>void;
}) {
  const [countryId,setCountryId]=useState("");
  const [allegation,setAllegation]=useState("");
  const [source,setSource]=useState("");
  const [deadline,setDeadline]=useState("");
  const [receiptMessage,setReceiptMessage]=useState<string|null>(null);
  const operation=useOfficialOperation();
  const mutation=useMutation({
    mutationFn:()=>{
      const input={
        organizationId,targetCountryId:countryId,
        allegation:allegation.trim(),sourceReference:source.trim(),responseDueAt:deadline,
      };
      return openGuardInquiry(input,operation.exact(input));
    },
    retry:false,
    onSuccess:(receipt)=>{
      operation.reset();
      setReceiptMessage(`Inquiry ${receipt.inquiryId} officially opened (revision ${receipt.revision}).`);
      setCountryId("");setAllegation("");setSource("");setDeadline("");
      onChanged();
    },
  });
  const locked=mutation.isPending||mutation.isError;
  const validDate=deadline.length>0&&Number.isFinite(Date.parse(deadline))&&Date.parse(deadline)>Date.now();
  return (
    <section className="mt-10 border-t border-border pt-6" aria-labelledby="guard-open-title">
      <h2 id="guard-open-title" className="text-xl font-semibold">Open formal non-compliance inquiry</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Only the current effective GUARD Chairperson can open an inquiry. A rule/source reference and response deadline are required.
        Opening an inquiry does not suspend voting, assistance or membership.
      </p>
      <form className="mt-5 grid max-w-2xl gap-4" onSubmit={(event)=>{
        event.preventDefault(); if(!locked) mutation.mutate();
      }}>
        <div>
          <label htmlFor="guard-target" className="mb-2 block text-sm font-semibold">Responding country</label>
          <select id="guard-target" required value={countryId}
            disabled={locked}
            onChange={(event)=>{setCountryId(event.target.value);setReceiptMessage(null);}}
            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
            <option value="">Select a country</option>
            {countries.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="guard-source" className="mb-2 block text-sm font-semibold">Official rule or source reference</label>
          <input id="guard-source" type="text" required minLength={10} maxLength={500}
            value={source} disabled={locked}
            onChange={(event)=>{setSource(event.target.value);setReceiptMessage(null);}}
            placeholder="GUARD Charter article, formal decision or inquiry basis"
            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"/>
        </div>
        <div>
          <label htmlFor="guard-allegation" className="mb-2 block text-sm font-semibold">Non-compliance allegation</label>
          <textarea id="guard-allegation" required minLength={20} maxLength={8000}
            value={allegation} disabled={locked}
            onChange={(event)=>{setAllegation(event.target.value);setReceiptMessage(null);}}
            placeholder="State the alleged non-compliance, relevant circumstances and requested response."
            className="min-h-36 w-full rounded-lg border border-border bg-background p-3 text-sm"/>
        </div>
        <div>
          <label htmlFor="guard-due" className="mb-2 block text-sm font-semibold">Official response deadline (local time)</label>
          <input id="guard-due" type="datetime-local" required
            value={deadline} disabled={locked} onChange={(event)=>{setDeadline(event.target.value);setReceiptMessage(null);}}
            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"/>
          <p className="mt-2 text-xs text-muted-foreground">
            Solaris stores the exact UTC instant. Deadline expiry alone is never an automatic sanction.
          </p>
        </div>
        <button type="submit"
          disabled={locked||!countryId||allegation.trim().length<20||source.trim().length<10||!validDate}
          className="min-h-11 w-fit rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {mutation.isPending?"Recording official inquiry…":"Open and record inquiry"}
        </button>
        {mutation.isError ? <Failure error={mutation.error} retry={()=>mutation.mutate()}/> : null}
        {receiptMessage ? <p role="status" className="text-sm font-semibold">{receiptMessage}</p> : null}
      </form>
    </section>
  );
}

function InquiryPanel({
  inquiry,response,review,countryId,canReview,countryName,onChanged,
}:{
  inquiry:GuardInquiry;response:GuardInquiryResponse|undefined;
  review:GuardInquiryReview|undefined;countryId:string|null;
  canReview:boolean;countryName:(id:string)=>string;onChanged:()=>void;
}) {
  const [showHistory,setShowHistory]=useState(false);
  const [responseText,setResponseText]=useState("");
  const [findings,setFindings]=useState("");
  const [decision,setDecision]=useState<GuardReviewKind|"">("");
  const [proposedAction,setProposedAction]=useState<GuardRecommendation|"">("");
  const responseOp=useOfficialOperation(), reviewOp=useOfficialOperation();
  const responseMutation=useMutation({
    mutationFn:()=>{
      const input={
        inquiryId:inquiry.id,response:responseText.trim(),expectedRevision:inquiry.revision,
      };
      return respondGuardInquiry(input,responseOp.exact(input));
    },
    retry:false,
    onSuccess:()=>{responseOp.reset();setResponseText("");onChanged();},
  });
  const reviewMutation=useMutation({
    mutationFn:()=>{
      if(!decision) throw new Error("VALIDATION");
      const input={
        inquiryId:inquiry.id,
        decisionKind:decision,
        proposedAction:decision==="recommend_action" ? proposedAction as GuardRecommendation : null,
        findings:findings.trim(),expectedRevision:inquiry.revision,
      };
      return reviewGuardInquiry(input,reviewOp.exact(input));
    },
    retry:false,
    onSuccess:()=>{reviewOp.reset();setFindings("");setDecision("");setProposedAction("");onChanged();},
  });
  const canRespond=canRespondToGuardInquiry(inquiry,countryId);
  const mayReview=canReviewGuardInquiry(inquiry,canReview,Date.now());
  const deadlinePast=Date.parse(inquiry.responseDueAt)<=Date.now();
  const disabledResponse=responseMutation.isPending||responseMutation.isError;
  const disabledReview=reviewMutation.isPending||reviewMutation.isError;
  const validReviewChoice=decision==="no_action"||
    (decision==="recommend_action" && proposedAction!=="");
  return (
    <article className="border-b border-border py-7 last:border-b-0" aria-label={`GUARD inquiry ${inquiry.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-semibold text-foreground">{countryName(inquiry.targetCountryId)}</h3>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
          {labelState(inquiry.status)}
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{inquiry.allegation}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold">Source of authority</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{inquiry.sourceReference}</dd></div>
        <div><dt className="font-semibold">Response due</dt>
          <dd className="mt-1 text-muted-foreground">
            <time dateTime={inquiry.responseDueAt}>{formatDate(inquiry.responseDueAt)}</time>
            {inquiry.status==="awaiting_response"&&deadlinePast?" · Deadline elapsed":""}
          </dd>
        </div>
        <div><dt className="font-semibold">Opened</dt>
          <dd className="mt-1 text-muted-foreground">{formatDate(inquiry.openedAt)}</dd></div>
        <div><dt className="font-semibold">Record revision</dt>
          <dd className="mt-1 text-muted-foreground">{inquiry.revision}</dd></div>
      </dl>
      {response ? (
        <section className="mt-5 rounded-lg border border-border p-4">
          <h4 className="text-sm font-semibold">Official country response</h4>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{response.responseText}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Filed {formatDate(response.submittedAt)}
            {response.wasLate ? " · Filed after official deadline" : ""}
          </p>
        </section>
      ) : null}
      {review ? (
        <section className="mt-5 rounded-lg border border-border p-4">
          <h4 className="text-sm font-semibold">Chairperson's formal review</h4>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{review.findings}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {review.decisionKind==="no_action"?"No further action recommended":`Recommendation only: ${labelState(review.proposedAction??"")}`}.
            No suspension, freeze, sanction or expulsion was executed by this review.
          </p>
        </section>
      ) : null}
      {canRespond ? (
        <form
          className="mt-6 border-t border-border pt-5"
          onSubmit={(event)=>{event.preventDefault();if(!disabledResponse)responseMutation.mutate();}}
        >
          <h4 className="font-semibold">Respond officially for your country</h4>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Your current sovereign country account must authorize this one-time response.
            {deadlinePast?" The deadline has elapsed, but a late response may be recorded until official review.":""}
          </p>
          <label className="mt-4 block text-sm font-semibold" htmlFor={`guard-response-${inquiry.id}`}>Country response</label>
          <textarea id={`guard-response-${inquiry.id}`} required
            minLength={20} maxLength={12000}
            value={responseText} disabled={disabledResponse}
            onChange={(event)=>setResponseText(event.target.value)}
            className="mt-2 min-h-32 w-full rounded-lg border border-border bg-background p-3 text-sm"/>
          <button type="submit" disabled={disabledResponse||responseText.trim().length<20}
            className="mt-3 min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {responseMutation.isPending?"Submitting official response…":"Submit immutable country response"}
          </button>
          {responseMutation.isError ?
            <Failure error={responseMutation.error} retry={()=>responseMutation.mutate()}/> : null}
        </form>
      ) : null}
      {mayReview && !review ? (
        <form className="mt-6 border-t border-border pt-5" onSubmit={(event)=>{
          event.preventDefault();if(!disabledReview)reviewMutation.mutate();
        }}>
          <h4 className="font-semibold">Chairperson's formal review</h4>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Review a submitted country response, or an unanswered inquiry after its deadline.
            This records findings and a recommendation only. Any real enforcement requires separate legal authority.
          </p>
          <label htmlFor={`guard-decision-${inquiry.id}`}
            className="mt-4 block text-sm font-semibold">Review outcome</label>
          <select id={`guard-decision-${inquiry.id}`} required disabled={disabledReview}
            value={decision}
            onChange={(event)=>{setDecision(event.target.value as GuardReviewKind|"");setProposedAction("");}}
            className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
            <option value="">Choose review outcome</option>
            <option value="no_action">Close review: no action recommended</option>
            <option value="recommend_action">Recommend a separate authorized action</option>
          </select>
          {decision==="recommend_action" ? (
            <>
              <label htmlFor={`guard-proposal-${inquiry.id}`}
                className="mt-4 block text-sm font-semibold">Proposed measure (not executed)</label>
              <select id={`guard-proposal-${inquiry.id}`} required
                disabled={disabledReview}
                value={proposedAction}
                onChange={(event)=>setProposedAction(event.target.value as GuardRecommendation|"")}
                className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
                <option value="">Select a recommendation</option>
                <option value="warning">Warning</option>
                <option value="censure">Censure</option>
                <option value="voting_suspension">Temporary voting suspension</option>
                <option value="assistance_freeze">Assistance freeze</option>
              </select>
            </>
          ) : null}
          <label htmlFor={`guard-findings-${inquiry.id}`}
            className="mt-4 block text-sm font-semibold">Official findings and grounds</label>
          <textarea id={`guard-findings-${inquiry.id}`} required minLength={20} maxLength={8000}
            disabled={disabledReview} value={findings}
            onChange={(event)=>setFindings(event.target.value)}
            className="mt-2 min-h-36 w-full rounded-lg border border-border bg-background p-3 text-sm"/>
          <button type="submit"
            disabled={disabledReview||!validReviewChoice||findings.trim().length<20}
            className="mt-3 min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {reviewMutation.isPending?"Recording findings…" : "Record immutable review, not enforcement"}
          </button>
          {reviewMutation.isError ?
            <Failure error={reviewMutation.error} retry={()=>reviewMutation.mutate()}/> : null}
        </form>
      ) : null}
      <button type="button" onClick={()=>setShowHistory(v=>!v)} aria-expanded={showHistory}
        className="mt-5 min-h-11 text-sm font-semibold underline underline-offset-4">
        {showHistory ? "Hide" : "View"} private official history
      </button>
      {showHistory ? <InquiryHistory inquiryId={inquiry.id}/> : null}
    </article>
  );
}

export function WorldGuardInquiryWorkspace() {
  const [authGeneration,setAuthGeneration]=useState(0);
  useEffect(()=>{
    const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>
      setAuthGeneration(old=>old+1));
    return ()=>subscription.unsubscribe();
  },[]);
  const workspace=useQuery({
    queryKey:["world","guard","inquiry","workspace",authGeneration],
    queryFn:fetchGuardInquiryWorkspace,
    gcTime:0,staleTime:0,refetchOnMount:"always",retry:false,
  });
  const countryNames=useMemo(()=>new Map((workspace.data?.countries??[]).map(c=>[c.id,c.name])),
    [workspace.data?.countries]);
  const countryName=(id:string)=>countryNames.get(id)??"Country";
  const refresh=()=>void workspace.refetch();
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-5 sm:pt-8">
        <Link to="/world" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground">
          <ArrowLeft size={17} aria-hidden="true"/> Terra Solaris
        </Link>
        <p className="mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <ShieldAlert size={21} aria-hidden="true" className="text-primary"/>
          GUARD · Institutional compliance
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Formal inquiries and country responses
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
          GUARD Chairpersons can open a sourced inquiry with a response deadline.
          The current country's representative account may answer.
          Only a live Chairperson can review it, and findings are not automatic sanctions.
        </p>
        {workspace.isPending||workspace.isFetching ?
          <Message>Verifying your current GUARD authority and private inquiries…</Message> : null}
        {workspace.isError ? <Failure error={workspace.error} retry={refresh}/> : null}
        {workspace.isSuccess&&!workspace.isFetching ? (
          !workspace.data.signedIn ?
            <Message>Sign in through Solaris to access private GUARD inquiry records.</Message>
          : <>
            {workspace.data.canOpen&&workspace.data.organizationId ? (
              <OpenInquiryForm organizationId={workspace.data.organizationId}
                countries={workspace.data.countries} onChanged={refresh}/>
            ) : null}
            <section className="mt-10 border-t border-border pt-6" aria-labelledby="guard-inquiries-title">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="guard-inquiries-title" className="text-xl font-semibold">
                  Your authorized official inquiries
                </h2>
                <button type="button" onClick={refresh}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold">
                  <RefreshCw size={16} aria-hidden="true"/> Refresh
                </button>
              </div>
              <p className="mt-2 flex max-w-2xl items-center gap-2 text-sm leading-6 text-muted-foreground">
                <FileClock size={17} aria-hidden="true"/>
                Only current respondent controllers or a duly authorized Chairperson can read these records.
              </p>
              {workspace.data.inquiries.length===0 ?
                <Message>No private inquiry records are available to your account.</Message>
              : <div className="mt-3">
                {workspace.data.inquiries.map(row=><InquiryPanel key={row.id}
                  inquiry={row}
                  response={workspace.data.responses.find(r=>r.inquiryId===row.id)}
                  review={workspace.data.reviews.find(r=>r.inquiryId===row.id)}
                  countryId={workspace.data.countryId}
                  canReview={workspace.data.canReview}
                  countryName={countryName} onChanged={refresh}
                />)}
              </div>}
            </section>
          </>
        ) : null}
        <p className="mt-10 flex items-center gap-2 text-xs text-muted-foreground">
          <ClipboardCheck size={16} aria-hidden="true"/>
          Official sanctions and expulsion require independent constitutional approval.
        </p>
      </main>
    </AppShell>
  );
}
