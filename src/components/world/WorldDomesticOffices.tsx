import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Pencil, Plus, Users } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import {
  readWorldDomesticOfficials,writeWorldDomesticOfficial,
  type WorldDomesticOfficials,type WorldDomesticOffice,type WorldLorePerson,type OfficialMutationKind,
} from "@/lib/terra-world-lore-offices";

const field="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary";
const button="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50";
const secondary="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium";
type EditorRecord=WorldLorePerson|WorldDomesticOffice|null;

function OfficialEditor({item,onSaved}:{item:WorldDomesticOfficials;onSaved:()=>void}){
  const [kind,setKind]=useState<OfficialMutationKind>("lore_person");
  const [editing,setEditing]=useState<EditorRecord>(null);
  const [title,setTitle]=useState("");
  const [description,setDescription]=useState("");
  const [officeType,setOfficeType]=useState("other");
  const [officeId,setOfficeId]=useState("");
  const [personId,setPersonId]=useState("");
  const [startedAt,setStartedAt]=useState(new Date().toLocaleDateString("sv-SE"));
  const [endedAt,setEndedAt]=useState("");
  const [reason,setReason]=useState("");
  const [termId,setTermId]=useState("");
  const [termRevision,setTermRevision]=useState(0);
  const [endStatus,setEndStatus]=useState("ended");
  const [published,setPublished]=useState(false);
  const [receipt,setReceipt]=useState("");
  const idem=useRef<{fingerprint:string;id:string}|null>(null);
  const saving=useMutation({
    mutationFn:async()=>{
      let subjectId=editing?.id??null,expectedRevision=editing?.revision??0;
      let payload:Record<string,string|boolean|number|null>;
      if(kind==="lore_person")payload={name:title.trim(),description:description.trim(),published};
      else if(kind==="office")payload={title:title.trim(),description:description.trim(),officeType,published};
      else if(kind==="term_start")payload={
        officeId,holderPersonId:personId,
        startedAt:new Date(startedAt+"T12:00:00Z").toISOString(),
        endedAt:endedAt?new Date(endedAt+"T12:00:00Z").toISOString():"",
        appointmentMethod:"",reasonStarted:reason.trim(),published,
      };
      else if(kind==="term_publish"){
        subjectId=termId;expectedRevision=termRevision;
        payload={published:true};
      }else {
        subjectId=termId;expectedRevision=termRevision;
        payload={status:endStatus,reasonEnded:reason.trim(),published};
      }
      const fingerprint=JSON.stringify({countryId:item.countryId,kind,subjectId,expectedRevision,payload});
      if(idem.current?.fingerprint!==fingerprint)idem.current={fingerprint,id:crypto.randomUUID()};
      return writeWorldDomesticOfficial({countryId:item.countryId,kind,subjectId,payload,
        expectedRevision,operationId:idem.current.id,idempotencyKey:idem.current.id});
    },
    onSuccess:result=>{
      idem.current=null;setReceipt("Saved with receipt "+result.operationId.slice(0,8)+"…");
      clear(kind);onSaved();
    },
  });
  function clear(next:OfficialMutationKind){
    setKind(next);setEditing(null);setTitle("");setDescription("");setOfficeType("other");
    setOfficeId("");setPersonId("");setEndedAt("");setReason("");setTermId("");
    setTermRevision(0);setEndStatus("ended");setPublished(false);saving.reset();
  }
  function chooseRecord(record:WorldLorePerson|WorldDomesticOffice,next:OfficialMutationKind){
    clear(next);setEditing(record);
    if("displayName" in record){setTitle(record.displayName);setDescription(record.biography??"");}
    else{setTitle(record.title);setDescription(record.description??"");setOfficeType(record.officeType);}
    setPublished(record.published);
    document.getElementById("world-official-editor")?.scrollIntoView({block:"start",behavior:"smooth"});
  }
  const activeTerms=item.terms.filter(t=>t.status==="active");
  const draftTerms=item.terms.filter(t=>!t.published);
  function onSubmit(e:FormEvent<HTMLFormElement>){e.preventDefault();setReceipt("");saving.mutate();}
  return <section className="mt-8 border-t border-border pt-6" id="world-official-editor">
    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Country controller</p>
    <h3 className="mt-2 text-lg font-semibold">Manage fictional officials</h3>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">
      Characters have no Solaris login. Office terms retain the names and titles recorded when appointed.
      Ending a term produces historical evidence rather than deleting it.
    </p>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Official record type">
      {(["lore_person","office","term_start","term_publish","term_end"] as const).map(k=>
        <button type="button" key={k} className={kind===k?button:secondary}
          disabled={saving.isPending} aria-pressed={kind===k}
          onClick={()=>{clear(k);setReceipt("");}}>
          {k==="lore_person"?"Person":k==="office"?"Office":k==="term_start"?"Appoint":k==="term_publish"?"Publish term":"End term"}
        </button>)}
    </div>
    <form onSubmit={onSubmit} className="mt-5 grid max-w-xl gap-4">
      {(kind==="lore_person"||kind==="office")?<>
        <label className="grid gap-2 text-sm font-medium">
          <span>{kind==="office"?"Office title":"Fictional person name"}</span>
          <input required maxLength={160} className={field} value={title} onChange={e=>setTitle(e.target.value)}/>
        </label>
        {kind==="office"?<label className="grid gap-2 text-sm font-medium"><span>Office type</span>
          <select className={field} value={officeType} onChange={e=>setOfficeType(e.target.value)}>
            {["head_of_state","head_of_government","monarch","minister","legislative","judicial","other"].map(s=>
              <option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}
          </select></label>:null}
        <label className="grid gap-2 text-sm font-medium"><span>{kind==="office"?"Office description":"Biography"} (optional)</span>
          <textarea className={field} maxLength={4000} rows={3} value={description}
            onChange={e=>setDescription(e.target.value)}/></label>
      </>:null}
      {kind==="term_start"?<>
        <label className="grid gap-2 text-sm font-medium"><span>Office</span>
          <select className={field} required value={officeId} onChange={e=>setOfficeId(e.target.value)}>
            <option value="">Choose a domestic office</option>
            {item.offices.map(o=><option key={o.id} value={o.id}>{o.title}{o.published?"":" (draft)"}</option>)}
          </select></label>
        <label className="grid gap-2 text-sm font-medium"><span>Fictional officeholder</span>
          <select className={field} required value={personId} onChange={e=>setPersonId(e.target.value)}>
            <option value="">Choose a fictional person</option>
            {item.people.map(p=><option key={p.id} value={p.id}>{p.displayName}{p.published?"":" (draft)"}</option>)}
          </select></label>
        <label className="grid gap-2 text-sm font-medium"><span>Term start</span>
          <input className={field} type="date" required max={new Date().toLocaleDateString("sv-SE")}
            value={startedAt} onChange={e=>setStartedAt(e.target.value)}/></label>
        <label className="grid gap-2 text-sm font-medium"><span>Historical term end (optional)</span>
          <input className={field} type="date" min={startedAt} max={new Date().toISOString().slice(0,10)}
            value={endedAt} onChange={e=>setEndedAt(e.target.value)}/></label>
      </>:null}
      {kind==="term_end"||kind==="term_publish"?<>
        <label className="grid gap-2 text-sm font-medium"><span>{kind==="term_publish"?"Draft term":"Active term"}</span>
          <select className={field} required value={termId}
            onChange={e=>{setTermId(e.target.value);setTermRevision((kind==="term_publish"?draftTerms:activeTerms).find(t=>t.id===e.target.value)?.revision??0);}}>
            <option value="">Choose {kind==="term_publish"?"a draft term":"an active term"}</option>
            {(kind==="term_publish"?draftTerms:activeTerms).map(t=><option key={t.id} value={t.id}>{t.officeTitle} · {t.holderDisplayName}</option>)}
          </select></label>
        {kind==="term_end"?<label className="grid gap-2 text-sm font-medium"><span>Reason for ending</span>
          <select className={field} value={endStatus} onChange={e=>setEndStatus(e.target.value)}>
            <option value="ended">Term concluded</option><option value="resigned">Resignation</option>
            <option value="removed">Removal</option>
          </select></label>:null}
      </>:null}
      {kind==="term_start"||kind==="term_end"?
        <label className="grid gap-2 text-sm font-medium"><span>{kind==="term_start"?"Appointment context":"Reason (optional)"}</span>
          <input className={field} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>:null}
      {kind!=="term_end"&&kind!=="term_publish"?<label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={published} onChange={e=>setPublished(e.target.checked)}/>
        Publish record
      </label>:null}
      {editing?<p className="text-sm text-muted-foreground">Editing revision {editing.revision}</p>:null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={button} disabled={saving.isPending||((kind==="term_end"||kind==="term_publish")&&!termId)}>
          <Plus className="size-4" aria-hidden="true"/>
          {saving.isPending?"Saving…":kind==="term_end"?"End term":kind==="term_publish"?"Publish term":editing?"Save revision":"Record "+kind.replace("_"," ")}
        </button>
        {editing?<button type="button" className={secondary} onClick={()=>clear(kind)}>Cancel edit</button>:null}
      </div>
      {saving.isError?<p role="alert" className="text-sm text-destructive">{saving.error.message}</p>:null}
      {receipt?<p role="status" className="text-sm">{receipt}</p>:null}
    </form>
    <div className="mt-5 flex flex-wrap gap-2">
      {item.people.map(p=><button key={p.id} type="button" className={secondary}
        onClick={()=>chooseRecord(p,"lore_person")}>
        <Pencil className="size-3" aria-hidden="true"/> {p.displayName}
      </button>)}
      {item.offices.map(o=><button key={o.id} type="button" className={secondary}
        onClick={()=>chooseRecord(o,"office")}>
        <Pencil className="size-3" aria-hidden="true"/> {o.title}
      </button>)}
    </div>
  </section>;
}
export function WorldDomesticOffices({code}:{code:string}){
  const qc=useQueryClient();
  const query=useQuery({
    queryKey:["world","domestic","officials",code],
    queryFn:({signal})=>readWorldDomesticOfficials(code,signal),
    staleTime:0,gcTime:0,refetchOnMount:"always",retry:false,
  });
  const item=query.isFetching||!query.isFetchedAfterMount||query.isError?null:query.data;
  const active=item?.terms.filter(t=>t.status==="active")??[];
  const previous=item?.terms.filter(t=>t.status!=="active")??[];
  return <section className="mt-10 border-t border-border pt-7" aria-labelledby="world-officials-title">
    <div className="flex items-center gap-2"><Users className="size-5" aria-hidden="true"/>
      <h2 id="world-officials-title" className="text-xl font-semibold">Government officeholders</h2></div>
    {(query.isPending||query.isFetching)?<p role="status" className="mt-3 text-sm text-muted-foreground">Verifying officials…</p>:null}
    {query.isError?<div className="mt-4" role="alert"><p>Office records could not be loaded.</p>
      <button className={secondary+" mt-3"} onClick={()=>void query.refetch()}>Retry</button></div>:null}
    {item?<>
      {active.length?<div className="mt-5 grid gap-4 sm:grid-cols-2">{active.map(t=>
        <article key={t.id} className="border-b border-border pb-4">
          <p className="text-xs text-muted-foreground">{t.officeTitle}</p>
          <h3 className="mt-1 font-semibold">{t.holderDisplayName}</h3>
          <p className="mt-1 text-sm text-muted-foreground">In office since {new Date(t.startedAt).toLocaleDateString()}</p>
          {!t.published?<span className="text-xs text-muted-foreground">Private draft</span>:null}
        </article>)}</div>:null}
      {previous.length?<details className="mt-6 border-t border-border pt-4">
        <summary className="min-h-11 cursor-pointer font-semibold">Historical office terms ({previous.length})</summary>
        <ul className="divide-y divide-border">{previous.map(t=><li key={t.id} className="py-3">
          <p className="font-medium">{t.officeTitle} · {t.holderDisplayName}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(t.startedAt).toLocaleDateString()} – {t.endedAt?new Date(t.endedAt).toLocaleDateString():"Ongoing"}
            {" · "+t.status}
          </p>
        </li>)}</ul>
      </details>:null}
      {!active.length&&!previous.length&&!item.isController?
        <p className="mt-4 text-sm text-muted-foreground">No published officeholder records are available.</p>:null}
      {item.isController?<OfficialEditor item={item} onSaved={()=>void qc.invalidateQueries({
        queryKey:["world","domestic","officials",code]
      })}/>:null}
    </>:null}
  </section>;
}
