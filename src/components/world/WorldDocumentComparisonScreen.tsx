import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowLeftRight, BookOpenText } from "lucide-react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { getWorldDocumentDetail, type WorldDocumentDetail, type WorldDocumentProvision } from "@/lib/world-public-documents";
import {
  comparePublishedWorldVersions,
  isValidComparisonVersion,
  resolvePublishedVersionOptions,
  type WorldVersionComparisonRow,
} from "@/lib/world-document-version-comparison";

const CHANGE_LABELS = {
  added: "Added",
  removed: "Removed",
  modified: "Changed",
  unchanged: "Unchanged",
} as const;
const CHANGE_CLASS = {
  added: "text-emerald-700 dark:text-emerald-300",
  removed: "text-rose-700 dark:text-rose-300",
  modified: "text-amber-700 dark:text-amber-300",
  unchanged: "text-muted-foreground",
} as const;

function Loading({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="space-y-3">
    {[0,1,2].map((n)=><div key={n} aria-hidden="true"
      className="h-20 animate-pulse rounded-xl bg-muted/50 motion-reduce:animate-none" />)}
    <span className="sr-only">{label}</span>
  </div>;
}

function Failure({retry}: {retry:()=>void}) {
  return <section role="alert" className="rounded-xl border border-border p-5">
    <h2 className="font-semibold">The published versions could not be verified</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">
      Solaris cannot compare legal documents without the authoritative public source. No approximate or draft text is substituted.
    </p>
    <button type="button" onClick={retry}
      className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Retry</button>
  </section>;
}

function PublishedVersion({record, label}: {record: WorldDocumentDetail, label: string}) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">
    <span className="text-xs font-bold uppercase tracking-wider text-primary">{label}</span>
    <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold">Version {record.version.versionNumber}</span>
    <span className="text-xs text-muted-foreground">{record.version.publicationState.replace(/_/g," ")}</span>
  </div>;
}

function OfficialVersionLink({record}: {record:WorldDocumentDetail}) {
  return <Link
    to="/world/documents/$organization/$document"
    params={{organization:record.organization.slug,document:record.slug}}
    search={{version:record.version.versionNumber}}
    className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
      Read original Version {record.version.versionNumber}
    </Link>;
}

function ProvisionText({item}: {item:WorldDocumentProvision|null}) {
  if (!item) return <p className="text-sm italic leading-6 text-muted-foreground">Not present in this version.</p>;
  return <div className="min-w-0">
    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{item.displayLabel || "Provision"}</p>
    <h4 className="mt-2 font-semibold">{item.heading || "Untitled provision"}</h4>
    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-foreground/85">{item.bodyPlainText || "No text recorded."}</p>
  </div>;
}

function ProvisionChangeRow({item}: {item:WorldVersionComparisonRow}) {
  return <section className="border-t border-border py-6" aria-label={`Provision change: ${CHANGE_LABELS[item.change]}`}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h3 className="min-w-0 text-sm font-semibold">{item.after?.heading || item.before?.heading || "Provision"}</h3>
      <span className={`text-xs font-bold ${CHANGE_CLASS[item.change]}`}>{CHANGE_LABELS[item.change]}</span>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
      <div className="min-w-0 rounded-lg border border-border/70 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Earlier version</p>
        <ProvisionText item={item.before} />
      </div>
      <div className="min-w-0 rounded-lg border border-border/70 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Later version</p>
        <ProvisionText item={item.after} />
      </div>
    </div>
  </section>;
}

export function WorldDocumentComparisonScreen({
  organization, document, requestedFrom, requestedTo,
}: {organization:string;document:string;requestedFrom?:number;requestedTo?:number}) {
  const navigate = useNavigate();
  const main = useQuery({
    queryKey:["v3","tg4","compare","history",organization,document],
    queryFn:()=>getWorldDocumentDetail({organization,document}),
    staleTime:90_000,
    retry:false,
    refetchOnWindowFocus:false,
  });
  const history = main.data ? resolvePublishedVersionOptions(main.data.history) : [];
  const from = requestedFrom ?? history.at(-2)?.versionNumber;
  const to = requestedTo ?? history.at(-1)?.versionNumber;
  const valid = isValidComparisonVersion(from) && isValidComparisonVersion(to) &&
    from !== to && history.some((v)=>v.versionNumber === from) &&
    history.some((v)=>v.versionNumber === to);
  const old = useQuery({
    queryKey:["v3","tg4","compare","version",organization,document,from],
    queryFn:()=>getWorldDocumentDetail({organization,document,version:from}),
    enabled:valid && main.isSuccess,
    staleTime:90_000,
    retry:false,
    refetchOnWindowFocus:false,
  });
  const newer = useQuery({
    queryKey:["v3","tg4","compare","version",organization,document,to],
    queryFn:()=>getWorldDocumentDetail({organization,document,version:to}),
    enabled:valid && main.isSuccess,
    staleTime:90_000,
    retry:false,
    refetchOnWindowFocus:false,
  });
  function update(which:"from"|"to",value:number) {
    void navigate({
      to:"/world/documents/$organization/$document/compare",
      params:{organization,document},
      search:{from: which==="from" ? value : from, to: which==="to" ? value : to},
    });
  }
  let comparison: ReturnType<typeof comparePublishedWorldVersions>|null = null;
  let comparisonError = false;
  if (valid && old.data && newer.data) {
    try {
      comparison = comparePublishedWorldVersions(old.data,newer.data);
    } catch {
      comparisonError = true;
    }
  }
  const oldVersion = old.data;
  const newVersion = newer.data;
  const structural = !!oldVersion?.version.provisions.length && !!newVersion?.version.provisions.length;
  return <AppShell>
    <PageHeader eyebrow="Terra Solaris · Document archive" title="Compare published versions"
      description="See what changed in official institutional text. Provisions are matched by canonical identity, not article numbers." />
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 sm:px-6">
      <Link to="/world/documents/$organization/$document" params={{organization,document}}
        className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to document
      </Link>
      {main.isPending ? <Loading label="Loading published version history" />
       : main.isError ? <Failure retry={()=>{void main.refetch();}} />
       : !main.data ? <p role="status" className="py-8 text-sm text-muted-foreground">This document is not public.</p>
       : history.length < 2 ? <section className="border-t border-border py-8">
         <h2 className="font-semibold">A second published version is required</h2>
         <p className="mt-2 text-sm text-muted-foreground">
           This document does not yet have two public versions that can be compared. Drafts and unverified source materials are excluded.
         </p>
       </section>
       : <>
         <div className="mb-8 flex flex-wrap items-center gap-2 border-b border-border pb-5">
           <BookOpenText className="size-5 text-primary" aria-hidden="true" />
           <h2 className="text-lg font-semibold">{main.data.title}</h2>
           <span className="text-sm text-muted-foreground">· {main.data.organization.shortName}</span>
         </div>
         <div className="mb-9 grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
           <label className="block text-sm font-semibold">
             Earlier version
             <select aria-label="First published version" value={from ?? ""} onChange={(event)=>update("from",Number(event.target.value))}
               className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
               {history.map((item)=><option key={item.versionNumber} value={item.versionNumber}>Version {item.versionNumber} · {item.title}</option>)}
             </select>
           </label>
           <ArrowLeftRight aria-hidden="true" className="mx-auto hidden size-5 text-primary sm:block" />
           <label className="block text-sm font-semibold">
             Later version
             <select aria-label="Second published version" value={to ?? ""} onChange={(event)=>update("to",Number(event.target.value))}
               className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
               {history.map((item)=><option key={item.versionNumber} value={item.versionNumber}>Version {item.versionNumber} · {item.title}</option>)}
             </select>
           </label>
         </div>
         {!valid ? <p role="alert" className="rounded-xl border border-border p-5 text-sm">
           Choose two different published document versions. Unpublished or invalid version selections cannot be compared.
         </p>
         : old.isPending || newer.isPending ? <Loading label="Comparing published document revisions" />
         : old.isError || newer.isError ? <Failure retry={()=>{void old.refetch();void newer.refetch();}} />
         : !oldVersion || !newVersion || comparisonError || !comparison ? <p role="alert" className="rounded-xl border border-border p-5 text-sm">
           The official versions are unavailable or do not belong to the same document. No comparison has been generated.
         </p>
         : <>
           <div className="mb-7 flex flex-wrap gap-3 border-b border-border pb-6">
             <span className="text-sm font-semibold">{comparison.totals.modified} changed</span>
             <span className="text-sm text-muted-foreground">{comparison.totals.added} added</span>
             <span className="text-sm text-muted-foreground">{comparison.totals.removed} removed</span>
             <span className="text-sm text-muted-foreground">{comparison.totals.unchanged} unchanged</span>
           </div>
           <div className="mb-5 grid gap-3 sm:grid-cols-2">
             <div><PublishedVersion record={comparison.oldVersion===oldVersion.version.versionNumber?oldVersion:newVersion} label="Before" />
               <OfficialVersionLink record={comparison.oldVersion===oldVersion.version.versionNumber?oldVersion:newVersion} /></div>
             <div><PublishedVersion record={comparison.newVersion===newVersion.version.versionNumber?newVersion:oldVersion} label="After" />
               <OfficialVersionLink record={comparison.newVersion===newVersion.version.versionNumber?newVersion:oldVersion} /></div>
           </div>
           {structural ? comparison.rows.length ? (
             <div>
               {comparison.rows.map((item)=><ProvisionChangeRow key={item.key} item={item} />)}
             </div>
           ) : <p className="py-6 text-sm text-muted-foreground">No structured provisions are present.</p>
           : <section className="border-t border-border pt-6">
             <h3 className="text-lg font-semibold">Full published text</h3>
             <p className="mt-2 text-sm text-muted-foreground">
               These versions do not both have canonical provision structure. Compare their complete text rather than inventing article-level differences.
             </p>
             <div className="mt-5 grid gap-4 sm:grid-cols-2 sm:gap-6">
               <div className="min-w-0 rounded-lg border border-border/70 p-4">
                 <p className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Earlier text</p>
                 <p className="whitespace-pre-wrap break-words text-sm leading-7">{comparison.beforePlainText || "No plain text provided."}</p>
               </div>
               <div className="min-w-0 rounded-lg border border-border/70 p-4">
                 <p className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Later text</p>
                 <p className="whitespace-pre-wrap break-words text-sm leading-7">{comparison.afterPlainText || "No plain text provided."}</p>
               </div>
             </div>
           </section>}
           <p className="mt-7 border-t border-border pt-5 text-xs leading-6 text-muted-foreground">
             This comparison shows changes between two stored public Versions. It does not claim an amendment was adopted
             or interpret the legal effect of changed wording.
           </p>
         </>}
       </>}
    </div>
  </AppShell>;
}
