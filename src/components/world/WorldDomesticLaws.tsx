import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, FileText, Plus, Scale } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import {
  DOMESTIC_TRANSITIONS, readDomesticLaws, readDomesticMeasureDetail, writeDomesticMeasure,
  type DomesticMeasure, type DomesticProcess,
  type DomesticMeasureAction, type DomesticLawOverview,
} from "@/lib/terra-world-domestic-laws";

const field="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const primary="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50";
const secondary="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
type Operation={action:DomesticMeasureAction;measureId:string|null;revision:number;payload:Record<string,string|number|boolean|null>};

function DomesticLegislationEditor({country,choose}:{country:DomesticLawOverview;choose:(id:string)=>void}){
  const client=useQueryClient();
  const [title,setTitle]=useState("");
  const [body,setBody]=useState("");
  const [processKind,setProcessKind]=useState<DomesticProcess>("democratic");
  const [draft,setDraft]=useState<DomesticMeasure|null>(null);
  const [reason,setReason]=useState("");
  const [receipt,setReceipt]=useState("");
  const idempotency=useRef<{fingerprint:string;id:string}|null>(null);
  const detail=useQuery({
    queryKey:["world","domestic","law-detail",draft?.id],
    queryFn:({signal})=>readDomesticMeasureDetail(draft!.id,signal),
    enabled:Boolean(draft),
    retry:false,staleTime:0,gcTime:0,refetchOnMount:"always",
  });
  const mutation=useMutation({
    mutationFn:async (r:Operation)=>{
      const fingerprint=JSON.stringify({countryId:country.countryId,...r});
      if(idempotency.current?.fingerprint!==fingerprint)
        idempotency.current={fingerprint,id:crypto.randomUUID()};
      return writeDomesticMeasure({
        countryId:country.countryId,action:r.action,measureId:r.measureId,
        payload:r.payload,expectedRevision:r.revision,
        operationId:idempotency.current.id,idempotencyKey:idempotency.current.id,
      });
    },
    onSuccess:async (result)=>{
      idempotency.current=null;
      setReceipt("Saved with official operation receipt "+result.operationId.slice(0,8)+"…");
      setDraft(null);setTitle("");setBody("");setReason("");
      await Promise.all([
        client.invalidateQueries({queryKey:["world","domestic","laws",country.countryCode]}),
        client.invalidateQueries({queryKey:["world","domestic","law-detail"]}),
        client.invalidateQueries({queryKey:["world","history"]}),
      ]);
      choose(result.id);
    },
  });
  const currentDetail=detail.isSuccess&&!detail.isFetching&&detail.isFetchedAfterMount?
    detail.data:null;
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setReceipt("");
    const valid=title.trim().length>0&&body.trim().length>0;
    if(draft&&!currentDetail||!valid)return;
    mutation.mutate({
      action:draft?"revise":"create",
      measureId:draft?.id??null,
      revision:draft?.revision??0,
      payload:{title:title.trim(),body:body.trim(),processKind,reason:reason.trim()},
    });
  }
  function selectDraft(m:DomesticMeasure){
    setDraft(m);setTitle(m.title);setBody("");setProcessKind(m.processKind);
    setReceipt("");mutation.reset();
    document.getElementById("world-law-author")?.scrollIntoView({block:"start",behavior:"smooth"});
  }
  function adoptCurrentDetail(){
    if(!currentDetail)return;
    setTitle(currentDetail.title);setBody(currentDetail.body);
    setProcessKind(currentDetail.processKind);
  }
  function proceed(m:DomesticMeasure,nextStatus:string){
    if(mutation.isPending)return;
    mutation.mutate({action:"advance",measureId:m.id,revision:m.revision,
      payload:{nextStatus,reason:reason.trim()}});
    setReceipt("");
  }
  function repeal(m:DomesticMeasure){
    if(mutation.isPending)return;
    mutation.mutate({action:"repeal",measureId:m.id,revision:m.revision,
      payload:{reason:reason.trim()}});
    setReceipt("");
  }
  return <section className="mt-8 border-t border-border pt-7" id="world-law-author" aria-labelledby="world-law-author-title">
    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Country controller</p>
    <h2 id="world-law-author-title" className="mt-2 text-xl font-semibold">Create and advance domestic legislation</h2>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
      These are country-authored fictional legislative outcomes, not real GUARD or UNITY ballots.
      A measure becomes public when it enters its first formal stage. Every revision and transition is retained.
    </p>
    <form className="mt-5 grid max-w-2xl gap-4" onSubmit={submit}>
      {draft?<p className="text-sm text-muted-foreground">Editing {draft.title} · version {draft.currentVersion} · revision {draft.revision}</p>:null}
      <label className="grid gap-2 text-sm font-medium"><span>Procedure</span>
        <select className={field} disabled={Boolean(draft)} value={processKind}
          onChange={e=>setProcessKind(e.target.value as DomesticProcess)}>
          <option value="democratic">Democratic assembly</option>
          <option value="monarchical">Royal/council assent</option>
          <option value="decree">Executive decree</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium"><span>Measure title</span>
        <input className={field} required maxLength={160} value={title}
          onChange={e=>setTitle(e.target.value)}/></label>
      <label className="grid gap-2 text-sm font-medium"><span>Legislative text</span>
        <textarea className={field} rows={10} required maxLength={15000}
          value={body} onChange={e=>setBody(e.target.value)}
          placeholder="Record the proposed fictional law or decree text…"/></label>
      {draft&&detail.isPending?<p role="status" className="text-sm text-muted-foreground">Verifying current draft text…</p>:null}
      {draft&&detail.isError?<div role="alert" className="text-sm text-destructive">
        Cannot verify this draft. Reload before editing.
        <button type="button" className={secondary+" ml-2"} onClick={()=>void detail.refetch()}>Retry</button>
      </div>:null}
      {draft&&currentDetail&&!body?<button type="button" className={secondary}
        onClick={adoptCurrentDetail}>Load latest saved text</button>:null}
      <div className="flex flex-wrap gap-2">
        <button className={primary} disabled={mutation.isPending||Boolean(draft&&!currentDetail)} type="submit">
          <Plus className="size-4" aria-hidden="true"/>
          {mutation.isPending?"Saving…":draft?"Save new text version":"Create private draft"}
        </button>
        {draft?<button type="button" className={secondary} onClick={()=>{setDraft(null);setTitle("");setBody("");}}>
          Cancel edit</button>:null}
      </div>
      {mutation.isError?<p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>:null}
      {receipt?<p role="status" className="text-sm">{receipt}</p>:null}
    </form>
    {country.measures.length?<div className="mt-7">
      <label className="grid max-w-xl gap-2 text-sm font-medium">
        <span>Transition reason (optional, max 500 characters)</span>
        <textarea className={field} rows={2} maxLength={500} value={reason}
          onChange={e=>setReason(e.target.value)}/>
      </label>
      <h3 className="mt-5 font-semibold">Manage published and draft measures</h3>
      <div className="mt-2 divide-y divide-border">{country.measures.map(m=>{
        const steps=DOMESTIC_TRANSITIONS[m.processKind][m.status]??[];
        const canRevise=["draft","introduced","proposed"].includes(m.status);
        const liveLaw=country.laws.find(l=>l.measureId===m.id&&l.status==="in_force");
        return <div key={m.id} className="py-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{m.title}</p>
            <span className="text-xs text-muted-foreground">{m.status.replaceAll("_"," ")} · rev {m.revision}</span>
            {!m.published?<span className="text-xs text-muted-foreground">Private draft</span>:null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={secondary} onClick={()=>choose(m.id)}>Read text & versions</button>
            {canRevise?<button type="button" className={secondary} onClick={()=>selectDraft(m)}>
              Edit text</button>:null}
            {steps.map(step=><button type="button" className={secondary} key={step}
              disabled={mutation.isPending} onClick={()=>proceed(m,step)}>
              Advance to {step}</button>)}
            {liveLaw?<button type="button" disabled={mutation.isPending} className={secondary}
              onClick={()=>repeal(m)}>Record repeal</button>:null}
          </div>
        </div>;
      })}</div>
    </div>:null}
  </section>;
}

export function WorldDomesticLaws({code}:{code:string}){
  const [selected,setSelected]=useState<string|null>(null);
  const overview=useQuery({
    queryKey:["world","domestic","laws",code],
    queryFn:({signal})=>readDomesticLaws(code,signal),
    staleTime:0,gcTime:0,refetchOnMount:"always",retry:false,
  });
  const detail=useQuery({
    queryKey:["world","domestic","law-detail",selected],
    queryFn:({signal})=>readDomesticMeasureDetail(selected!,signal),
    enabled:Boolean(selected),staleTime:0,gcTime:0,
    refetchOnMount:"always",retry:false,
  });
  // Never show a cached controller-private draft before fresh authority checks.
  const data=overview.isFetching||!overview.isFetchedAfterMount||overview.isError?null:overview.data;
  const current=selected&&!detail.isFetching&&detail.isFetchedAfterMount&&!detail.isError?detail.data:null;
  return <div className="mx-auto w-full max-w-5xl px-3 pb-28 pt-5 sm:px-6 sm:pt-8">
    <Link to="/world/domestic/$code" params={{code}} className={secondary}>
      <ArrowLeft className="size-4" aria-hidden="true"/> Country government
    </Link>
    <header className="mt-7 max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Terra Solaris · Domestic politics</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">Laws & legislation</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Browse published fictional laws and their legislative pathways. Text, versions and outcomes
        are authored by the country controller; they are not international institutional votes.
      </p>
    </header>
    {(overview.isPending||overview.isFetching)?<p role="status" className="mt-7 text-sm text-muted-foreground">
      Checking published legislation…</p>:null}
    {overview.isError?<div role="alert" className="mt-7">
      <p>Domestic laws could not be verified.</p>
      <button type="button" className={secondary+" mt-3"} onClick={()=>void overview.refetch()}>Retry</button>
    </div>:null}
    {overview.isSuccess&&!overview.isFetching&&overview.isFetchedAfterMount&&!data?
      <div className="mt-8"><h2 className="text-xl font-semibold">Country not found</h2>
        <Link to="/world" className={secondary+" mt-3"}>Back to World</Link></div>:null}
    {data?<>
      <section className="mt-8" aria-labelledby="world-laws-heading">
        <div className="flex items-center gap-2"><Scale className="size-5" aria-hidden="true"/>
          <h2 id="world-laws-heading" className="text-xl font-semibold">Enacted laws</h2></div>
        {data.laws.length?<ul className="mt-4 divide-y divide-border">{data.laws.map(l=>
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="font-semibold">{l.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{l.enactmentMethod}
                {" · Enacted "+new Date(l.enactedAt).toLocaleDateString()}
                {l.status==="repealed"?" · Repealed":""}
              </p>
            </div>
            <button className={secondary} type="button" onClick={()=>setSelected(l.measureId)}>
              <BookOpen className="size-4" aria-hidden="true"/> Read
            </button>
          </li>)}</ul>:
          <p className="mt-4 text-sm text-muted-foreground">No enacted public laws have been recorded.</p>}
      </section>
      {selected?<section className="mt-8 rounded-xl border border-border p-5" aria-labelledby="world-law-detail">
        <h2 id="world-law-detail" className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="size-5" aria-hidden="true"/> Measure text and version history</h2>
        {(detail.isPending||detail.isFetching)?<p className="mt-3 text-sm text-muted-foreground" role="status">
          Checking current publication and permissions…</p>:null}
        {detail.isError?<div role="alert" className="mt-3"><p>Document text could not be loaded.</p>
          <button type="button" className={secondary+" mt-3"} onClick={()=>void detail.refetch()}>Retry</button></div>:null}
        {current?<div className="mt-4">
          <h3 className="font-semibold">{current.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{current.processKind} · {current.status}
            {" · Version "+current.currentVersion}</p>
          <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">{current.body}</div>
          <details className="mt-5 border-t border-border pt-3">
            <summary className="min-h-11 cursor-pointer font-semibold">Version history ({current.versionHistory.length})</summary>
            <ol className="mt-2 space-y-2">{current.versionHistory.map(v=>
              <li key={v.number} className="text-sm text-muted-foreground">
                Version {v.number}: {v.title} · {new Date(v.createdAt).toLocaleDateString()}
              </li>)}</ol>
          </details>
        </div>:null}
      </section>:null}
      {data.isController?<DomesticLegislationEditor country={data} choose={setSelected}/>:null}
    </>:null}
  </div>;
}
