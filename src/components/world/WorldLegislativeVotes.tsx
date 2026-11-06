import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Landmark, Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  castWorldBallot, certifyWorldVote, getManagedWorldVote, getMyWorldVote,
  getOpenableMeasures, getOpenableRules, getPublishedWorldVote,
  listPublishedWorldVotes, listWorldVoteOrganizations, openWorldVote, voteUuid,
  type WorldVoteReceipt, type WorldVoteListRow,
} from "@/lib/world-legislative-votes";

type Choice = "aye"|"nay"|"abstain";
type CastAttempt = {
  voteId:string;countryId:string;expectedVoteRevision:number;
  choice:Choice;operationId:string;
};
type CertificationAttempt = {voteId:string;expectedVoteRevision:number;operationId:string};
type OpenAttempt = {
  measureId:string;expectedMeasureRevision:number;ruleId:string;
  closesAt:string;operationId:string;
};
function useActor() {
  const cache=useQueryClient();
  const [id,setId]=useState<string|null>(null);
  const [ready,setReady]=useState(false);
  const [generation,setGeneration]=useState(0);
  const idRef=useRef<string|null>(null);
  useEffect(()=>{
    let live=true;
    let latest=0;
    const apply=(next:string|null)=>{
      if(!live)return;
      if(idRef.current!==next){
        idRef.current=next;
        cache.removeQueries({queryKey:["world","votes","private"]});
        setGeneration((n)=>n+1);
      }
      setId(next);setReady(true);
    };
    void supabase.auth.getUser().then(({data,error})=>{
      if(latest===0)apply(error?null:data.user?.id??null);
    }).catch(()=>{if(latest===0)apply(null);});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
      ++latest;apply(session?.user.id??null);
    });
    return ()=>{live=false;subscription.unsubscribe();};
  },[cache]);
  return {id,ready,generation};
}
function errorText(err:unknown):string{
  if(err&&typeof err==="object"&&"code" in err){
    if(String(err.code)==="42501")return "Your institutional voting permission could not be verified.";
    if(String(err.code)==="40001")return "This vote or measure has changed. Refresh the authoritative state.";
    if(String(err.code)==="23505")return "This country has already submitted a ballot.";
    if(String(err.code)==="23514")return "The electoral roll, proxy, or vote state no longer meets the institutional rules.";
    if(String(err.code)==="25006")return "Voting is unavailable under the current rollout or platform mode.";
    if(String(err.code)==="22023")return "The voting rule or submitted parameters were rejected.";
  }
  return "Server acknowledgement is uncertain. Retain and retry the same operation ID before taking a new action.";
}
function finalError(err:unknown){
  return Boolean(err&&typeof err==="object"&&"code" in err&&
    ["42501","40001","23505","23514","25006","22023"].includes(String(err.code)));
}
function RetryError({retry}:{retry:()=>void}){
  return <section role="alert" className="rounded-xl border border-destructive/40 p-5">
    <h2 className="font-semibold">The official voting state could not be verified</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      No inferred tally or voting right will be displayed.
    </p>
    <button type="button" className="mt-4 min-h-11 rounded-lg border px-5 text-sm"
      onClick={retry}>Retry verification</button>
  </section>;
}
function Receipt({receipt}:{receipt:WorldVoteReceipt}){
  return <section role="status" className="mt-6 rounded-xl border border-primary/40 p-5">
    <h3 className="flex items-center gap-2 font-semibold"><ClipboardCheck className="size-5"/>
      Official operation confirmed
    </h3>
    <p className="mt-2 text-sm capitalize">{receipt.status} · Revision {receipt.revision}
      {receipt.replayed?" · Original receipt reconciled":""}
    </p>
    <p className="mt-2 break-all font-mono text-xs">Operation ID: {receipt.operationId}</p>
    {receipt.resultHash&&<p className="mt-2 break-all font-mono text-xs">
      Certified hash: {receipt.resultHash}
    </p>}
  </section>;
}
function VoteRow({vote}:{vote:WorldVoteListRow}){
  return <Link to="/world/votes/$voteId" params={{voteId:vote.id}}
    className="block border-b border-border py-5 last:border-0 focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2">
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {vote.organizationSlug} · {vote.certifiedAt.slice(0,10)}
    </p>
    <h2 className="mt-2 text-lg font-semibold">{vote.measureTitle}</h2>
    <p className="mt-2 text-sm capitalize">Certified: {vote.outcome.replaceAll("_"," ")}
      <span className="ml-3 text-muted-foreground">
        {vote.ayeCount} Aye · {vote.nayCount} Nay · {vote.abstainCount} Abstain
      </span>
    </p>
  </Link>;
}
export function WorldVoteDirectory(){
  const [slug,setSlug]=useState("");
  const orgs=useQuery({queryKey:["world","votes","organizations"],
    queryFn:listWorldVoteOrganizations,staleTime:120_000,retry:false});
  const votes=useQuery({queryKey:["world","votes","published-list",slug],
    queryFn:()=>listPublishedWorldVotes(slug||null),staleTime:30_000,retry:false});
  return <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 sm:pt-9">
    <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
      Terra Solaris · Institutional voting
    </p>
    <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Certified votes</h1>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
      Only formally certified, published legislative outcomes appear here.
      Restricted ballots and withheld votes remain confidential.
    </p>
    <div className="mt-5 flex flex-wrap gap-3">
      <Link to="/world/votes/new" className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold">
        Open an authorized vote
      </Link>
      <Link to="/world/measures" className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm">
        Proposals and bills
      </Link>
    </div>
    <label className="mt-8 block max-w-sm text-sm font-medium">Institution
      <select value={slug} onChange={e=>setSlug(e.target.value)}
        className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">
        <option value="">All published organizations</option>
        {(orgs.data??[]).map(o=><option key={o.id} value={o.slug}>{o.shortName}</option>)}
      </select>
    </label>
    <section className="mt-6" aria-live="polite">
      {votes.isPending?<p role="status">Loading certified votes…</p>:
       votes.isError?<RetryError retry={()=>void votes.refetch()}/>:
       votes.data?.length?<>
        <p className="border-b border-border pb-3 text-xs text-muted-foreground">
          Latest {votes.data.length} published votes
        </p>
        {votes.data.map(v=><VoteRow key={v.id} vote={v}/>)}
       </>:<p role="status" className="border-t py-8 text-sm text-muted-foreground">
          No certified published votes were found.
       </p>}
    </section>
  </main>;
}
export function WorldVoteDetail({voteId}:{voteId:string}){
  const actor=useActor();
  const cache=useQueryClient();
  const publicVote=useQuery({
    queryKey:["world","votes","public-detail",voteId],
    queryFn:()=>getPublishedWorldVote(voteId),
    enabled:voteUuid(voteId),staleTime:30_000,retry:false,
  });
  const own=useQuery({
    queryKey:["world","votes","private","mine",actor.id,voteId],
    queryFn:()=>getMyWorldVote(voteId),
    enabled:voteUuid(voteId)&&actor.ready&&Boolean(actor.id),
    staleTime:0,gcTime:0,retry:false,
  });
  const [selected,setSelected]=useState<Record<string,Choice>>({});
  const [review,setReview]=useState<CastAttempt|null>(null);
  const uncertain=useRef<CastAttempt|null>(null);
  const [busy,setBusy]=useState(false);
  const [receipt,setReceipt]=useState<WorldVoteReceipt|null>(null);
  const [problem,setProblem]=useState<string|null>(null);
  const [confirmedActor,setConfirmedActor]=useState<string|null>(null);
  useEffect(()=>{
    setSelected({});setReview(null);uncertain.current=null;
    setBusy(false);setReceipt(null);setProblem(null);setConfirmedActor(null);
  },[actor.generation,voteId]);
  function prepare(countryId:string){
    const choice=selected[countryId];
    if(!choice||!own.data?.countries.some(seat=>seat.countryId===countryId&&seat.canCast)
      ||!actor.id||busy||uncertain.current)return;
    setReview({voteId,countryId,choice,expectedVoteRevision:own.data.revision,
      operationId:crypto.randomUUID()});
  }
  async function submit(action:CastAttempt){
    if(busy||!actor.id)return;
    const submittingActor=actor.id;
    uncertain.current=action;setBusy(true);setProblem(null);setReview(null);
    try{
      const answer=await castWorldBallot(action);
      if(submittingActor!==confirmedActor&&confirmedActor!==null)return;
      setReceipt(answer);uncertain.current=null;
      await cache.invalidateQueries({queryKey:["world","votes","private","mine",submittingActor,voteId]});
    }catch(error){
      if(submittingActor!==confirmedActor&&confirmedActor!==null)return;
      setProblem(errorText(error));
      if(finalError(error)) {
        uncertain.current=null;
        await cache.invalidateQueries({queryKey:["world","votes","private","mine",submittingActor,voteId]});
      }
    }finally{setBusy(false)}
  }
  return <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 sm:pt-9">
    <Link to="/world/votes" className="inline-flex min-h-11 items-center gap-2 text-sm">
      <ArrowLeft className="size-4"/> Certified votes
    </Link>
    {publicVote.isPending?<p role="status" className="mt-8">Checking publication status…</p>:
      publicVote.isError?<div className="mt-8"><RetryError retry={()=>void publicVote.refetch()}/></div>:
      publicVote.data?<section className="mt-7">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {publicVote.data.organizationSlug} · {publicVote.data.organName}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{publicVote.data.measureTitle}</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {publicVote.data.measureIdentifier}
        </p>
        <p className="mt-5 inline-flex items-center gap-2 text-sm capitalize">
          <CheckCircle2 className="size-5"/> Certified: {publicVote.data.outcome.replaceAll("_"," ")}
        </p>
        <dl className="mt-7 grid grid-cols-2 gap-5 border-y border-border py-6 sm:grid-cols-4">
          {([["Aye",publicVote.data.ayeCount],["Nay",publicVote.data.nayCount],
            ["Abstain",publicVote.data.abstainCount],
            ["Electorate",publicVote.data.eligibleElectorate]] as const).map(([label,value])=>
            <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd></div>)}
        </dl>
        <div className="mt-5 space-y-2 text-sm">
          <p>Quorum {publicVote.data.quorumMet?"met":"not met"} · Approval threshold {
            publicVote.data.thresholdMet?"met":"not met"}</p>
          <p className="text-muted-foreground">
            Approval denominator includes abstentions. Rule {publicVote.data.ruleKey},
            version {publicVote.data.ruleRevision}.
          </p>
          <p className="break-all font-mono text-xs text-muted-foreground">
            Certified result hash: {publicVote.data.resultHash}
          </p>
        </div>
        {publicVote.data.rollCall.length>0&&<section className="mt-8 max-w-2xl">
          <h2 className="text-lg font-semibold">Published roll call</h2>
          <ol className="mt-3 divide-y divide-border">
            {publicVote.data.rollCall.map(seat=><li key={seat.countryCode}
              className="flex justify-between gap-4 py-3 text-sm">
              <span>{seat.countryCode}</span>
              <span className="font-semibold capitalize">{seat.choice}</span>
            </li>)}
          </ol>
        </section>}
      </section>:<section className="mt-8">
        <h1 className="text-2xl font-semibold">No public result yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A vote may be open, unpublished, withheld or unavailable. There is no live
          public tally. An eligible delegate can view their own ballot below.
        </p>
      </section>}
    {actor.ready&&actor.id&&<section className="mt-9 border-t border-border pt-7">
      {own.isPending?<p role="status">Checking your current voting authority…</p>:
        own.isError?<RetryError retry={()=>void own.refetch()}/>:
        own.data?<div>
          <h2 className="text-xl font-semibold">Your institutional ballot</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {own.data.status==="open"?"Open":"Closed"} ·
            Closes {new Date(own.data.closesAt).toLocaleString()} ·
            Rule {own.data.ruleKey}. Only your eligible country seat is visible.
          </p>
          {own.data.countries.map(seat=><section key={seat.countryId}
            className="mt-6 max-w-xl rounded-xl border border-border p-5">
            <h3 className="font-semibold">{seat.countryCode}</h3>
            {seat.hasCast?<p role="status" className="mt-2 text-sm">
              Ballot officially recorded: <strong className="capitalize">{seat.myChoice}</strong>.
              No changes are permitted after cast.
            </p>:seat.canCast?<fieldset className="mt-4" disabled={busy||!!uncertain.current||!!review}>
              <legend className="mb-3 text-sm font-medium">Choose one official position</legend>
              <div className="space-y-2">
                {(["aye","nay","abstain"] as const).map(choice=><label key={choice}
                  className="flex min-h-11 items-center gap-3 rounded-lg border px-4 text-sm capitalize">
                  <input type="radio" name={"choice-"+seat.countryId} value={choice}
                    checked={selected[seat.countryId]===choice}
                    onChange={()=>setSelected(v=>({...v,[seat.countryId]:choice}))}/>
                  {choice}
                </label>)}
              </div>
              <button type="button" disabled={!selected[seat.countryId]}
                onClick={()=>{setConfirmedActor(actor.id);prepare(seat.countryId)}}
                className="mt-4 min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
                Review ballot
              </button>
            </fieldset>:<p className="mt-2 text-sm text-muted-foreground">
              This ballot is closed or your voting eligibility has changed.
            </p>}
          </section>)}
          <Link to="/world/votes/$voteId/manage" params={{voteId}}
            className="mt-5 inline-flex min-h-11 items-center rounded-lg border px-4 text-sm">
            Officer certification controls
          </Link>
        </div>:null}
    </section>}
    {receipt&&<Receipt receipt={receipt}/>}
    {problem&&<p role="alert" className="mt-6 rounded-lg border border-destructive/40 p-4 text-sm">{problem}</p>}
    {review&&<section className="mt-6 rounded-xl border border-primary/40 p-5">
      <h3 className="text-lg font-semibold">Confirm irrevocable ballot</h3>
      <p className="mt-3 text-sm">Country seat: {own.data?.countries.find(s=>s.countryId===review.countryId)?.countryCode}
        <span className="ml-2 font-semibold uppercase">{review.choice}</span>
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        One ballot per country. Your choice cannot be changed after server acknowledgement.
      </p>
      <p className="mt-2 break-all font-mono text-xs">Operation ID: {review.operationId}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={()=>void submit(review)}
          className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
          Cast official ballot
        </button>
        <button type="button" disabled={busy} onClick={()=>setReview(null)}
          className="min-h-11 rounded-lg border px-4 text-sm">Cancel</button>
      </div>
    </section>}
    {uncertain.current&&<section role="alert" className="mt-6 rounded-xl border p-5">
      <h3 className="font-semibold">Ballot acknowledgement unresolved</h3>
      <p className="mt-2 text-sm">Do not submit a second ballot. Retry the exact operation
        ID to reconcile the server receipt.</p>
      <code className="mt-2 block break-all text-xs">{uncertain.current.operationId}</code>
      <button type="button" disabled={busy} onClick={()=>void submit(uncertain.current!)}
        className="mt-4 min-h-11 rounded-lg border px-4 text-sm">Reconcile this ballot</button>
    </section>}
  </main>;
}
