import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Pencil, Plus } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import {
  readWorldLegislature, writeWorldLegislature,
  type LegislatureKind, type WorldDomesticChamber, type WorldLegislature,
  type WorldLegislatureProjection,
} from "@/lib/terra-world-legislature";

const inputStyle = "min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const actionStyle = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50";
const secondary = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary";

function LegislatureEditor({ item, onSaved }: {
  item: WorldLegislatureProjection;
  onSaved: () => void;
}) {
  const [kind,setKind] = useState<LegislatureKind>("legislature");
  const [selected,setSelected] = useState<WorldLegislature | WorldDomesticChamber | null>(null);
  const [title,setTitle] = useState("");
  const [description,setDescription] = useState("");
  const [cycle,setCycle] = useState("");
  const [seatCount,setSeatCount] = useState("");
  const [presidingTitle,setPresidingTitle] = useState("");
  const [published,setPublished] = useState(false);
  const [receipt,setReceipt] = useState("");
  const idem = useRef<{fingerprint:string;id:string}|null>(null);
  const saving = useMutation({
    mutationFn: async () => {
      const payload = {
        title:title.trim(),description:description.trim(),
        electionCycleMonths:cycle ? Number(cycle) : null,
        seatCount:kind==="chamber" && seatCount ? Number(seatCount) : null,
        presidingTitle:kind==="chamber" ? presidingTitle.trim() : "",
        legislatureId:item.legislature?.id,
        published,
      };
      const fingerprint = JSON.stringify({countryId:item.countryId,kind,selected,payload});
      if (idem.current?.fingerprint !== fingerprint)
        idem.current={fingerprint,id:crypto.randomUUID()};
      return writeWorldLegislature({
        countryId:item.countryId,kind,subjectId:selected?.id ?? null,
        expectedRevision:selected?.revision ?? 0,payload,
        operationId:idem.current.id,idempotencyKey:idem.current.id,
      });
    },
    onSuccess: receipt => {
      idem.current=null;setReceipt("Saved with receipt "+receipt.operationId.slice(0,8)+"…");
      setSelected(null);setTitle("");setDescription("");setCycle("");setSeatCount("");
      setPresidingTitle("");setPublished(false);onSaved();
    },
  });
  function reset(next: LegislatureKind) {
    setKind(next);setSelected(null);setTitle("");setDescription("");setCycle("");
    setSeatCount("");setPresidingTitle("");setPublished(false);setReceipt("");saving.reset();
  }
  function selectRecord(record: WorldLegislature | WorldDomesticChamber, next: LegislatureKind) {
    setKind(next);setSelected(record);setTitle("name" in record ? record.name : record.title);
    setDescription(record.description??"");setCycle(record.electionCycleMonths?.toString()??"");
    setSeatCount("seatCount" in record ? record.seatCount?.toString()??"" : "");
    setPresidingTitle("presidingTitle" in record ? record.presidingTitle??"" : "");
    setPublished(record.published);setReceipt("");saving.reset();
    document.getElementById("world-legislature-editor")?.scrollIntoView({block:"start",behavior:"smooth"});
  }
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setReceipt("");saving.mutate();}
  const chamberEnabled = Boolean(item.legislature);
  return <section className="mt-6 border-t border-border pt-6" id="world-legislature-editor">
    <h3 className="text-base font-semibold">Manage legislature</h3>
    <p className="mt-1 text-sm text-muted-foreground">Country-controlled fictional records. Only published records appear to visitors.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" className={kind==="legislature"?actionStyle:secondary}
        onClick={()=>reset("legislature")} disabled={saving.isPending}>Legislature</button>
      <button type="button" className={kind==="chamber"?actionStyle:secondary}
        onClick={()=>reset("chamber")} disabled={!chamberEnabled||saving.isPending}>Chamber</button>
    </div>
    <form className="mt-4 grid max-w-xl gap-4" onSubmit={submit}>
      <label className="grid gap-2 text-sm font-medium"><span>{kind==="legislature"?"Name":"Chamber title"}</span>
        <input className={inputStyle} required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <label className="grid gap-2 text-sm font-medium"><span>Description (optional)</span>
        <textarea className={inputStyle} rows={3} maxLength={4000} value={description} onChange={e=>setDescription(e.target.value)}/></label>
      <label className="grid gap-2 text-sm font-medium"><span>Election cycle, months (optional)</span>
        <input className={inputStyle} type="number" min={1} max={240} step={1}
          value={cycle} onChange={e=>setCycle(e.target.value)}/></label>
      {kind==="chamber"?<>
        <label className="grid gap-2 text-sm font-medium"><span>Seats (optional)</span>
          <input className={inputStyle} type="number" min={0} max={100000} step={1}
            value={seatCount} onChange={e=>setSeatCount(e.target.value)}/></label>
        <label className="grid gap-2 text-sm font-medium"><span>Presiding office title (optional)</span>
          <input className={inputStyle} value={presidingTitle} maxLength={120}
            onChange={e=>setPresidingTitle(e.target.value)}/></label>
      </>:null}
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={published} onChange={e=>setPublished(e.target.checked)}/>
        Publish {kind} to World
      </label>
      <div className="flex flex-wrap gap-2">
        <button className={actionStyle} type="submit"
          disabled={saving.isPending||kind==="chamber"&&!chamberEnabled}>
          <Plus className="size-4" aria-hidden="true"/>{saving.isPending?"Saving…":selected?"Save revision":"Create "+kind}
        </button>
        {selected?<button type="button" className={secondary}
          onClick={()=>reset(kind)}>Cancel edit</button>:null}
      </div>
      {saving.isError?<p role="alert" className="text-sm text-destructive">{saving.error.message}</p>:null}
      {receipt?<p role="status" className="text-sm">{receipt}</p>:null}
    </form>
    <div className="mt-5 flex flex-wrap gap-2">
      {item.legislature?<button type="button" className={secondary} onClick={()=>selectRecord(item.legislature!,"legislature")}>
        <Pencil className="size-4" aria-hidden="true"/> Edit legislature
      </button>:null}
      {item.chambers.map(ch=><button type="button" key={ch.id} className={secondary}
        onClick={()=>selectRecord(ch,"chamber")}>
        <Pencil className="size-4" aria-hidden="true"/> {ch.title}
      </button>)}
    </div>
  </section>;
}

export function WorldDomesticLegislature({code}:{code:string}) {
  const queryClient=useQueryClient();
  const query=useQuery({
    queryKey:["world","domestic","legislature",code],
    queryFn:({signal})=>readWorldLegislature(code,signal),
    staleTime:0,gcTime:0,refetchOnMount:"always",retry:false,
  });
  // Fresh verification is required before showing draft or management content.
  const item=query.isFetching||!query.isFetchedAfterMount||query.isError ? null:query.data;
  return <section className="mt-10 border-t border-border pt-7" aria-labelledby="world-legislature-title">
    <div className="flex items-center gap-2">
      <Landmark className="size-5" aria-hidden="true"/>
      <h2 id="world-legislature-title" className="text-xl font-semibold">Legislature</h2>
    </div>
    {(query.isPending||query.isFetching)?<p className="mt-4 text-sm text-muted-foreground" role="status">Checking legislature records…</p>:null}
    {query.isError?<div role="alert" className="mt-4">
      <p className="text-sm text-destructive">Legislature records could not be verified.</p>
      <button type="button" className={secondary+" mt-3"} onClick={()=>void query.refetch()}>Retry</button>
    </div>:null}
    {query.isSuccess&&item&&!item.legislature&&!item.isController?
      <p className="mt-4 text-sm text-muted-foreground">No published legislature information is available.</p>:null}
    {item?.legislature?<div className="mt-4 max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold">{item.legislature.name}</h3>
        {!item.legislature.published?<span className="text-xs text-muted-foreground">Private draft</span>:null}
      </div>
      {item.legislature.description?<p className="mt-2 text-sm leading-6 text-muted-foreground">{item.legislature.description}</p>:null}
      {item.legislature.electionCycleMonths?<p className="mt-2 text-sm text-muted-foreground">
        General election cycle: {item.legislature.electionCycleMonths} months</p>:null}
      {item.chambers.length?<ul className="mt-5 divide-y divide-border">{item.chambers.map(ch=>
        <li key={ch.id} className="py-4"><div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold">{ch.title}</h4>
          {!ch.published?<span className="text-xs text-muted-foreground">Private draft</span>:null}
        </div>
          {ch.seatCount!==null?<p className="mt-1 text-sm text-muted-foreground">{ch.seatCount} seats</p>:null}
          {ch.presidingTitle?<p className="mt-1 text-sm text-muted-foreground">Presiding office: {ch.presidingTitle}</p>:null}
          {ch.description?<p className="mt-2 text-sm leading-6">{ch.description}</p>:null}
        </li>)}</ul>:
        <p className="mt-4 text-sm text-muted-foreground">No chambers recorded.</p>}
    </div>:null}
    {item?.isController?<LegislatureEditor item={item}
      onSaved={()=>void queryClient.invalidateQueries({queryKey:["world","domestic","legislature",code]})}/>:null}
  </section>;
}
