import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, RefreshCw, ScrollText } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { courtError } from "@/lib/world-court-filing";
import {
  canRecordCourtHearing, decideCourtHearing, fetchCourtProceedings,
  issueCourtOrder, scheduleCourtHearing, type CourtHearing,
  type CourtProceedingOp,
} from "@/lib/world-court-proceedings";

type Field={
 key:string;label:string;kind:"text"|"long"|"date"|"select"|"check";
 required?:boolean;min?:number;max?:number;options?:readonly string[];
};
type Values=Record<string,string|boolean>;
type ActionProps={
 label:string;description:string;submitLabel:string;fields:readonly Field[];
 confirm?:string;execute:(values:Values,op:CourtProceedingOp)=>Promise<unknown>;
 onConfirmed:()=>void;
};

const iso=(value:string):string=>{
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))throw new Error("The hearing date is invalid.");
 return date.toISOString();
};

function ActionForm({label,description,submitLabel,fields,confirm,execute,onConfirmed}:ActionProps){
 const uid=useId();
 const [values,setValues]=useState<Values>(()=>Object.fromEntries(
  fields.map((field)=>[field.key,field.kind==="check"?false:""]),
 ));
 const [confirmation,setConfirmation]=useState("");
 const [phase,setPhase]=useState<"editing"|"pending"|"uncertain"|"confirmed">("editing");
 const envelope=useRef<{fingerprint:string;op:CourtProceedingOp}|null>(null);
 const mutation=useMutation({
  mutationFn:async()=>{
   const fingerprint=JSON.stringify(values);
   if(envelope.current&&envelope.current.fingerprint!==fingerprint){
    throw new Error("The pending Court operation has changed.");
   }
   if(!envelope.current){
    const operationId=crypto.randomUUID();
    envelope.current={fingerprint,op:{operationId,key:`world-court-${operationId}`}};
   }
   return execute(values,envelope.current.op);
  },
  retry:false,
  onSuccess:()=>{
   setPhase("confirmed");
   onConfirmed();
  },
  onError:()=>setPhase("uncertain"),
 });
 const locked=phase!=="editing";
 const canConfirm=!confirm||confirmation.trim()===confirm;
 return (
  <form className="mt-4 space-y-4 rounded-xl border border-border p-4 sm:p-5"
   onSubmit={(event)=>{event.preventDefault();if(!locked&&canConfirm){setPhase("pending");mutation.mutate();}}}>
   <h3 className="text-base font-semibold">{label}</h3>
   <p className="text-sm leading-6 text-muted-foreground">{description}</p>
   {fields.map((field)=>(
    <div key={field.key}>
     <label className="mb-2 block text-sm font-medium" htmlFor={`${uid}-${field.key}`}>{field.label}</label>
     {field.kind==="long"?(
      <textarea id={`${uid}-${field.key}`}
       className="min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm"
       value={String(values[field.key]??"")} disabled={locked} required={field.required}
       minLength={field.min} maxLength={field.max}
       onChange={(event)=>setValues((previous)=>({...previous,[field.key]:event.target.value}))}/>
     ):field.kind==="select"?(
      <select id={`${uid}-${field.key}`} disabled={locked} required={field.required}
       className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
       value={String(values[field.key]??"")}
       onChange={(event)=>setValues((previous)=>({...previous,[field.key]:event.target.value}))}>
       <option value="">Choose</option>
       {(field.options??[]).map((value)=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}
      </select>
     ):field.kind==="check"?(
      <input type="checkbox" id={`${uid}-${field.key}`} className="size-5 accent-primary"
       checked={values[field.key]===true} disabled={locked}
       onChange={(event)=>setValues((previous)=>({...previous,[field.key]:event.target.checked}))}/>
     ):(
      <input type={field.kind==="date"?"datetime-local":"text"}
       id={`${uid}-${field.key}`} disabled={locked} required={field.required}
       className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
       value={String(values[field.key]??"")} minLength={field.min} maxLength={field.max}
       onChange={(event)=>setValues((previous)=>({...previous,[field.key]:event.target.value}))}/>
     )}
    </div>
   ))}
   {confirm?(
    <div><label htmlFor={`${uid}-confirm`} className="mb-2 block text-sm font-semibold">
     Enter the exact case identifier to approve: {confirm}
    </label>
    <input id={`${uid}-confirm`} value={confirmation} disabled={locked}
     onChange={(event)=>setConfirmation(event.target.value)} required autoComplete="off"
     className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"/></div>
   ):null}
   {phase==="confirmed"?<p role="status" className="text-sm font-medium">Official action confirmed. Reloading current case revision.</p>:
    phase==="uncertain"?(
     <div role="alert" className="rounded-lg border border-destructive/50 p-4">
      <p className="text-sm">{courtError(mutation.error)}</p>
      <p className="mt-2 text-xs text-muted-foreground">
       Your inputs are frozen. Retry the identical operation with the same ID, or refresh the case before making changes.
      </p>
      <button type="button" onClick={()=>{setPhase("pending");mutation.mutate();}}
       className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">
       Retry original operation
      </button>
     </div>
    ):(
     <button type="submit" disabled={locked||!canConfirm}
      className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
      {phase==="pending"?"Recording…":submitLabel}
     </button>
    )}
  </form>
 );
}

function Section({heading,children}:{heading:string;children:ReactNode}){
 return <section className="mt-9 border-t border-border pt-6">
  <h2 className="text-xl font-semibold">{heading}</h2>{children}
 </section>;
}
function HearingRow({
 hearing,canManage,caseRevision,caseStatus,onChanged,
}:{hearing:CourtHearing;canManage:boolean;caseRevision:number;caseStatus:string;onChanged:()=>void}){
 const eligible=canManage&&hearing.status==="scheduled"&&!["decided","closed","archived"].includes(caseStatus);
 const started=canRecordCourtHearing(hearing,caseStatus as "proceedings",new Date());
 return (
  <article className="border-b border-border py-5 last:border-0">
   <div className="flex flex-wrap justify-between gap-2 text-sm">
    <strong>{new Date(hearing.startsAt).toLocaleString()} to {new Date(hearing.endsAt).toLocaleString()}</strong>
    <span className="rounded-full border border-border px-3 py-1 text-xs capitalize text-muted-foreground">{hearing.status}</span>
   </div>
   <p className="mt-2 text-sm text-muted-foreground">
    {hearing.format.replaceAll("_"," ")}{hearing.locationNote?` · ${hearing.locationNote}`:""} · Revision {hearing.revision}
   </p>
   {hearing.heldSummary?<p className="mt-2 whitespace-pre-wrap break-words text-sm">Proceedings record: {hearing.heldSummary}</p>:null}
   {hearing.cancellationReason?<p className="mt-2 whitespace-pre-wrap break-words text-sm">Cancellation: {hearing.cancellationReason}</p>:null}
   {eligible?(
    <ActionForm key={`hearing-${hearing.id}-${caseRevision}`}
     label="Record hearing outcome"
     description="An official hearing record is append-only. A session cannot be marked held before its actual start."
     submitLabel="Record hearing disposition"
     fields={[
      {key:"target",label:"Disposition",kind:"select",required:true,
       options:started?["held","cancelled"]:["cancelled"]},
      {key:"reason",label:"Official record or cancellation reason",kind:"long",required:true,min:10,max:5000},
     ]}
     execute={(values,op)=>decideCourtHearing({
      hearingId:hearing.id,target:String(values.target) as "held"|"cancelled",
      reason:String(values.reason),expectedCaseRevision:caseRevision,
      expectedHearingRevision:hearing.revision,op,
     })}
     onConfirmed={onChanged}/>
   ):null}
  </article>
 );
}

export function WorldCourtProceedings({caseId}:{caseId:string}){
 const [actorEpoch,setActorEpoch]=useState(0);
 useEffect(()=>{
  const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>{
   setActorEpoch((value)=>value+1);
  });
  return ()=>subscription.unsubscribe();
 },[]);
 const query=useQuery({
  queryKey:["world","court","proceedings",caseId,actorEpoch],
  queryFn:()=>fetchCourtProceedings(caseId),
  staleTime:0,gcTime:0,refetchOnMount:"always",retry:false,
 });
 const reload=()=>void query.refetch();
 const latest=useMemo(()=>query.data?.orders??[],[query.data?.orders]);
 const record=query.data?.authorizedCase;
 return (
  <AppShell>
   <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-5 sm:pt-8">
    <Link to="/world/court" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground">
     <ArrowLeft size={16} aria-hidden="true"/> Court cases
    </Link>
    <p className="mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
     <CalendarDays size={19} aria-hidden="true" className="text-primary"/> International Terra Solaris Court
    </p>
    <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Court hearings & orders</h1>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
     Court hearings remain private to their parties and authorized institutional officials.
     Only expressly published judicial orders enter the public register.
    </p>
    <button type="button" onClick={reload}
     className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold">
     <RefreshCw size={16} aria-hidden="true"/> Refresh authority and schedule
    </button>
    {query.isPending||query.isFetching?(
     <p role="status" className="mt-7 rounded-xl border border-border p-5 text-sm text-muted-foreground">
      Checking private Court records and current publication…
     </p>
    ):query.isError?(
     <div role="alert" className="mt-6 rounded-lg border border-destructive/50 p-4">
      <p className="text-sm">{courtError(query.error)}</p>
      <button type="button" onClick={reload} className="mt-3 min-h-11 rounded-lg border border-border px-4">
       Try again
      </button>
     </div>
    ):query.data?(
     <>
      {record?(
       <div className="mt-7">
        <p className="text-sm font-semibold">{record.identifier}</p>
        <p className="mt-1 text-sm text-muted-foreground">
         Case state {record.status.replaceAll("_"," ")} · Revision {record.revision}
        </p>
        <Link to="/world/court/$caseId/judgments" params={{caseId}}
         className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold">
         Read judgments and reconsideration
        </Link>
       </div>
      ):null}
      <Section heading="Official published Court orders">
       {latest.length?(
        <ol className="mt-3 divide-y divide-border">
         {latest.map((order)=>(
          <li key={order.id} className="py-5">
           <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-base font-semibold">Order {order.orderNumber}: {order.title}</h3>
            {!order.publiclyListed?<span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">Restricted</span>:null}
           </div>
           <p className="mt-1 text-xs text-muted-foreground">
            Published {new Date(order.publishedAt).toLocaleString()}
            {order.effectiveAt?` · Effective ${new Date(order.effectiveAt).toLocaleString()}`:""}
           </p>
           <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{order.body}</p>
          </li>
         ))}
        </ol>
       ):<p className="mt-3 text-sm text-muted-foreground">No official orders are currently available to your account.</p>}
      </Section>
      {record?(
       <>
        <Section heading="Private hearing schedule">
         {query.data.hearings.length?(
          <div className="mt-3">
           {query.data.hearings.map((hearing)=>(
            <HearingRow key={hearing.id} hearing={hearing} canManage={query.data.canManage}
             caseRevision={record.revision} caseStatus={record.status} onChanged={reload}/>
           ))}
          </div>
         ):<p className="mt-3 text-sm text-muted-foreground">No Court hearings have been scheduled for this case.</p>}
         {query.data.canManage&&["proceedings","hearing"].includes(record.status)?(
          <ActionForm key={`schedule-${record.revision}`}
           label="Schedule official hearing"
           description="Times are entered in your device's local time and recorded as UTC instants. Existing overlapping scheduled hearings are rejected by the server."
           submitLabel="Schedule and record hearing"
           fields={[
            {key:"starts",label:"Start (local time)",kind:"date",required:true},
            {key:"ends",label:"End (local time)",kind:"date",required:true},
            {key:"format",label:"Hearing format",kind:"select",required:true,
             options:["written","video","in_person","hybrid"]},
            {key:"location",label:"Location or joining instructions (private, optional)",kind:"text",max:500},
           ]}
           execute={(values,op)=>scheduleCourtHearing({
            caseId,startsAt:iso(String(values.starts)),endsAt:iso(String(values.ends)),
            format:String(values.format) as "written"|"video"|"in_person"|"hybrid",
            locationNote:String(values.location),expectedRevision:record.revision,op,
           })}
           onConfirmed={reload}/>
         ):null}
        </Section>
        {query.data.canJudge && !["filed","closed","archived"].includes(record.status)?(
         <Section heading="Publish formal Court order">
          <p className="mt-2 text-sm text-muted-foreground">
           Only the current UNITY Secretary-General may sign an official order.
           Published orders are immutable and cannot reveal hearing instructions.
          </p>
          <ActionForm key={`order-${record.revision}`}
           label="Judicial order"
           description="Review the text and confirm this case exactly. Public listing publishes only the order text and official metadata."
           submitLabel="Sign and publish official order"
           confirm={record.identifier}
           fields={[
            {key:"title",label:"Order title",kind:"text",required:true,min:6,max:200},
            {key:"body",label:"Formal order",kind:"long",required:true,min:20,max:12000},
            {key:"effective",label:"Effective at (local time, optional)",kind:"date"},
            {key:"public",label:"List order publicly",kind:"check"},
           ]}
           execute={(values,op)=>issueCourtOrder({
            caseId,title:String(values.title),body:String(values.body),
            effectiveAt:values.effective?iso(String(values.effective)):null,
            publiclyListed:values.public===true,expectedRevision:record.revision,op,
           })}
           onConfirmed={reload}/>
         </Section>
        ):null}
        {query.data.events.length?(
         <Section heading="Durable hearing history">
          <ol className="mt-3 divide-y divide-border">
           {query.data.events.map((item)=>(
            <li key={item.id} className="py-3 text-sm">
             <strong>Revision {item.caseRevision}: {item.toState}</strong>
             {item.reason?<p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{item.reason}</p>:null}
            </li>
           ))}
          </ol>
         </Section>
        ):null}
       </>
      ):(
       <p role="status" className="mt-8 text-sm text-muted-foreground">
        Private schedules and hearings require current party or Court management authorization.
       </p>
      )}
      <p className="mt-9 flex items-center gap-2 text-xs text-muted-foreground">
       <ScrollText size={17} aria-hidden="true"/> Court order publication does not expose private evidence.
      </p>
     </>
    ):null}
   </main>
  </AppShell>
 );
}
