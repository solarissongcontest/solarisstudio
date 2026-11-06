import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";
import {
  parseWorldDocumentDraftSnapshot,
  parseWorldDocumentIndex,
  parseWorldOperationReceipt,
} from "@/lib/world-document-draft-model";
import {
  TREATY_KINDS,
  validateTreatyRegistration,
} from "@/lib/world-treaties";
import { parseUtcEffectiveMinute } from "@/lib/world-document-publication";

const db = supabase as any;
const control = "min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2";
const button = "min-h-11 rounded-xl border border-border px-4 py-2 font-semibold disabled:opacity-50";
const primary = "min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50";

type Organization = { id: string; slug: string; official_name: string };
type Country = { id: string; name: string; short_code: string };
type PreparedOperation = {
  operationId: string;
  idempotencyKey: string;
  documentId: string;
  organizationSlug: string;
  documentSlug: string;
  expectedDocumentRevision: number;
  treatyType: string;
  countryIds: string[];
  openedAt: string | null;
  title: string;
};

function validOrganization(row: unknown): Organization {
  const r = row as Partial<Organization> | null;
  if (!r || typeof r.id !== "string" || !r.id || typeof r.slug !== "string" ||
      typeof r.official_name !== "string" || !r.official_name) {
    throw new Error("The institution index is malformed.");
  }
  return r as Organization;
}
function validCountry(row: unknown): Country {
  const r = row as Partial<Country> | null;
  if (!r || typeof r.id !== "string" || !r.id ||
      typeof r.name !== "string" || !r.name ||
      typeof r.short_code !== "string" || !r.short_code) {
    throw new Error("The country index is malformed.");
  }
  return r as Country;
}

function RegisterTreaty() {
  const queryClient = useQueryClient();
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [documentSlug, setDocumentSlug] = useState("");
  const [treatyType, setTreatyType] = useState<(typeof TREATY_KINDS)[number]>("multilateral");
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [openedAtInput, setOpenedAtInput] = useState("");
  const [review, setReview] = useState<PreparedOperation | null>(null);
  const [phase, setPhase] = useState<"review"|"checking"|"reconcile"|"failed"|"succeeded">("review");
  const [readAndConfirmed, setReadAndConfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const inFlight = useRef(new Set<string>());
  const blocked = Boolean(review && ["review","checking","reconcile"].includes(phase));

  const organizations = useQuery({
    queryKey: ["tg4-treaty-orgs"], staleTime: 60_000, retry: 1,
    queryFn: async () => {
      const { data, error } = await db.from("world_organizations")
        .select("id,slug,official_name").eq("public_visibility","public")
        .order("official_name",{ascending:true}).limit(100);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("Institution response is malformed.");
      return data.map(validOrganization);
    },
  });
  const organization = organizations.data?.find((row) => row.slug === organizationSlug);
  const countries = useQuery({
    queryKey: ["tg4-treaty-countries"], staleTime: 120_000, retry: 1,
    queryFn: async () => {
      const { data, error } = await db.from("countries")
        .select("id,name,short_code").order("name",{ascending:true}).limit(120);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("Country register cannot be verified.");
      return data.map(validCountry);
    },
  });
  const documents = useQuery({
    queryKey: ["tg4-treaty-documents",organizationSlug],
    enabled: Boolean(organization), staleTime: 0, retry: 1,
    queryFn: async () => {
      const { data, error } = await db.rpc("world_get_document_index_v1",{
        p_organization_slug:organizationSlug,p_query:null,p_limit:100,
      });
      if (error) throw error;
      const rows = parseWorldDocumentIndex(data);
      if (rows.some((row) => row.organizationId !== organization?.id)) {
        throw new Error("Document index returned a different institution.");
      }
      return rows.filter((row) => row.documentType === "treaty" && row.status === "active");
    },
  });
  const selected = documents.data?.find((row) => row.slug === documentSlug);
  const work = useQuery({
    queryKey: ["tg4-treaty-work",organizationSlug,documentSlug],
    enabled: Boolean(organization && selected), staleTime:0, gcTime:0, retry:1,
    queryFn: async () => {
      const { data, error } = await db.rpc("world_get_document_v1",{
        p_organization_slug:organizationSlug,p_document_slug:documentSlug,p_version_number:null,
      });
      if (error) throw error;
      const doc = parseWorldDocumentDraftSnapshot(data);
      if (doc.documentId !== selected?.documentId ||
          doc.organization.organizationId !== organization?.id ||
          doc.slug !== documentSlug) throw new Error("Document scope mismatch.");
      return doc;
    },
  });
  const existing = useQuery({
    queryKey: ["tg4-treaty-existing", selected?.documentId],
    enabled: Boolean(work.data?.allowedActions.manage && selected),
    staleTime:0, gcTime:0, retry:1,
    queryFn: async () => {
      const { data, error } = await db.rpc("world_get_treaty_manager_v1",{
        p_document_id:selected?.documentId,
      });
      if (error) throw error;
      if (!data || typeof data !== "object" || data.documentId !== selected?.documentId ||
          typeof data.registered !== "boolean") throw new Error("Private treaty status cannot be verified.");
      return data as {documentId:string;registered:boolean;treatyId?:string;status?:string};
    },
  });

  const chooseOrg = (slug: string) => {
    if (blocked) return;
    setOrganizationSlug(slug);setDocumentSlug("");setCountryIds([]);
    setReview(null);setNotice("");
  };
  const chooseDoc = (slug: string) => {
    if (blocked) return;
    setDocumentSlug(slug);setCountryIds([]);
    setReview(null);setNotice("");
  };
  const prepare = () => {
    const doc=work.data;
    if (blocked || existing.data?.registered !== false ||
        !doc?.allowedActions.manage || !doc.revision || !organization ||
        countries.isPending || countries.isError || !countries.data) return;
    const error=validateTreatyRegistration({treatyType,partyIds:countryIds});
    if (error) {setNotice(error);return;}
    if (countryIds.some((id) => !countries.data!.some((country) => country.id===id))) {
      setNotice("A selected country is not in the verified country register.");return;
    }
    const utc=openedAtInput ? parseUtcEffectiveMinute(openedAtInput) : null;
    if (openedAtInput && !utc) {
      setNotice("Enter a valid opening instant explicitly in UTC.");return;
    }
    const operation=createOrganisationCommand({
      command:"world.treaty.register",riskClass:"R2",
      scope:{entityId:organization.id},
      payload:{
        documentId:doc.documentId,treatyType,openedAt:utc,
        countryIds:[...countryIds].sort(),expectedDocumentRevision:doc.revision,
      },
    });
    setReview({
      documentId:doc.documentId,organizationSlug,documentSlug,
      expectedDocumentRevision:doc.revision,
      operationId:operation.operationId,idempotencyKey:operation.idempotencyKey,
      treatyType,countryIds:[...countryIds].sort(),openedAt:utc,title:doc.title,
    });
    setPhase("review");setNotice("");setReadAndConfirmed(false);
  };

  const process = async (send:boolean) => {
    if (!review || (send && (phase!=="review" || !readAndConfirmed)) ||
        phase==="checking" || phase==="succeeded" || inFlight.current.has(review.operationId)) return;
    const active=review;
    inFlight.current.add(active.operationId);
    setPhase("checking");setNotice("Checking canonical treaty operation…");
    let errorCode:string|null=null;
    try {
      if (send) {
        const response=await db.rpc("world_register_treaty_v1",{
          p_document_id:active.documentId,p_treaty_type:active.treatyType,
          p_opened_at:active.openedAt,p_country_ids:active.countryIds,
          p_expected_document_revision:active.expectedDocumentRevision,
          p_operation_id:active.operationId,p_idempotency_key:active.idempotencyKey,
        });
        if (response.error) {
          errorCode=typeof response.error.code==="string"?response.error.code:null;
          if (["22023","23503","23505","23514","42501","40001"].includes(errorCode??"")) {
            setPhase("failed");setNotice("The server rejected the treaty registration. Recheck authority and revisions.");
            return;
          }
        }
      }
      const {data,error}=await db.rpc("studio2_reconcile_operation",{
        p_operation_id:active.operationId,
      });
      if(error) throw error;
      const receipt=parseWorldOperationReceipt(data,active.operationId,"world.treaty.register");
      if(receipt.status==="succeeded") {
        if(receipt.result?.documentId!==active.documentId ||
           typeof receipt.result?.treatyId!=="string" ||
           receipt.result?.listedCountryCount!==active.countryIds.length) {
          throw new Error("Treaty receipt scope mismatch.");
        }
        setPhase("succeeded");
        setNotice(`Registered an unsigned treaty proposal. Receipt: ${active.operationId}`);
        await Promise.all([
          queryClient.invalidateQueries({queryKey:["tg4-treaty-existing",active.documentId]}),
          queryClient.invalidateQueries({queryKey:["tg4-treaty-work",active.organizationSlug,active.documentSlug]}),
        ]);
      } else {
        setPhase(receipt.status==="failed"?"failed":"reconcile");
        setNotice(receipt.status==="failed"?
          "The canonical operation failed. Refresh and prepare a new operation.":
          "Status is uncertain. Reconcile the exact operation; never submit a different ID blindly.");
      }
    } catch {
      setPhase("reconcile");
      setNotice("The receipt is unavailable. Registration may have committed; do not retry blindly.");
    } finally {
      inFlight.current.delete(active.operationId);
    }
  };

  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl space-y-6 pb-20">
        <AdminPageHeader
          eyebrow="Governance · Treaties"
          title="Treaty registration"
          description="Register treaty metadata and prospective listed countries. This does not sign, ratify, enact, or publish a legal treaty."
        />
        <a href="/admin/world-documents" className="inline-flex min-h-11 items-center underline">
          Open legal document drafting
        </a>
        {organizations.isPending?<p role="status">Loading institutions…</p>:
          organizations.isError?<div role="alert">Institutions cannot be verified.
            <button className={button} onClick={()=>void organizations.refetch()}>Retry</button></div>:
          <label className="block space-y-2">Institution
            <select className={control} value={organizationSlug} disabled={blocked}
              onChange={(e)=>chooseOrg(e.target.value)}>
              <option value="">Choose an institution</option>
              {organizations.data?.map((o)=><option key={o.id} value={o.slug}>{o.official_name}</option>)}
            </select>
          </label>}
        {organization&&<section className="space-y-3">
          <h2 className="text-lg font-bold">Canonical treaty Work</h2>
          {documents.isPending?<p role="status">Loading treaty documents…</p>:
            documents.isError?<div role="alert">Document index unavailable.
              <button className={button} onClick={()=>void documents.refetch()}>Retry</button></div>:
            <label className="block space-y-2">Select an existing treaty document
              <select className={control} value={documentSlug} disabled={blocked}
                onChange={(e)=>chooseDoc(e.target.value)}>
                <option value="">Choose a treaty document</option>
                {documents.data?.map((d)=><option key={d.documentId} value={d.slug}>{d.title}</option>)}
              </select>
            </label>}
          {!documents.isPending&&!documents.isError&&documents.data?.length===0&&
            <p role="status">No eligible treaty Work exists. Create one in Document drafts first.</p>}
        </section>}
        {selected&&(work.isPending?<p role="status">Verifying document ownership…</p>:
          work.isError||!work.data?<div role="alert">Treaty document is inaccessible.
            <button className={button} onClick={()=>void work.refetch()}>Retry document</button></div>:
          !work.data.allowedActions.manage?<p role="alert">Institution treaty-management authority is unavailable.</p>:
          existing.isPending?<p role="status">Checking existing registration…</p>:
          existing.isError?<div role="alert">Existing treaty status cannot be verified.
            <button className={button} onClick={()=>void existing.refetch()}>Retry treaty status</button></div>:
          existing.data?.registered?<p role="status">This Work already has an official treaty-register identity. Re-registration is forbidden; signing and ratification are separate governed workflows.</p>:
          <section className="space-y-5 border-t border-border pt-5">
            <p className="text-sm">Work: <strong>{work.data.title}</strong> · revision {work.data.revision}</p>
            <label className="block space-y-1">Treaty type
              <select className={control} value={treatyType} disabled={blocked}
                onChange={(e)=>setTreatyType(e.target.value as (typeof TREATY_KINDS)[number])}>
                {TREATY_KINDS.map((kind)=><option key={kind} value={kind}>{kind}</option>)}
              </select>
            </label>
            <label className="block max-w-sm space-y-1">Opened at (UTC, optional)
              <input className={control} type="datetime-local" step={60} value={openedAtInput}
                disabled={blocked} onChange={(e)=>setOpenedAtInput(e.target.value)} />
            </label>
            <fieldset disabled={blocked||countries.isError} className="space-y-3">
              <legend className="font-semibold">Prospective listed countries (not signatories)</legend>
              {countries.isPending?<p role="status">Reading country authority…</p>:
                countries.isError?<div role="alert">The official country register cannot be read.
                  <button type="button" className={button} onClick={()=>void countries.refetch()}>Retry</button></div>:
                <div className="grid max-h-72 gap-1 overflow-y-auto rounded-xl border border-border p-3 sm:grid-cols-2">
                  {countries.data?.map((country)=>(
                    <label key={country.id} className="flex min-h-11 items-center gap-3 text-sm">
                      <input type="checkbox" checked={countryIds.includes(country.id)}
                        onChange={(e)=>setCountryIds((old)=>e.target.checked?
                          [...old,country.id]:old.filter((id)=>id!==country.id))}/>
                      {country.name}
                    </label>
                  ))}
                </div>}
            </fieldset>
            <p className="text-xs text-muted-foreground">
              Registration lists countries as invited only. Their future sovereign
              consent or domestic ratification is NOT inferred or recorded.
            </p>
            <button type="button" className={primary} disabled={blocked||countries.isPending||countries.isError}
              onClick={prepare}>Review treaty registration (R2)</button>
          </section>
        )}
        {review&&<section className="space-y-4 rounded-xl border border-primary/40 p-5">
          <h2 className="text-lg font-bold">Canonical treaty operation review</h2>
          <p>{review.title} · {review.organizationSlug} · {review.treatyType}</p>
          <p className="text-sm">Work revision {review.expectedDocumentRevision}.
            {" "}Opening time {review.openedAt||"not specified"}.</p>
          <p className="font-semibold">Listed countries ({review.countryIds.length})</p>
          <ul className="list-inside list-disc text-sm">
            {review.countryIds.map((id)=><li key={id}>
              {countries.data?.find((c)=>c.id===id)?.name??"Unknown country"}
              {" "}· invited, not signed
            </li>)}
          </ul>
          <p className="break-all text-xs text-muted-foreground">Operation: {review.operationId}</p>
          {phase==="review"&&<label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={readAndConfirmed}
              onChange={(e)=>setReadAndConfirmed(e.target.checked)}/>
            I confirm these are prospective listed parties only, with no asserted signature or ratification.
          </label>}
          {notice&&<p role="status">{notice}</p>}
          <div className="flex flex-wrap gap-3">
            {phase==="review"&&<>
              <button className={primary} disabled={!readAndConfirmed}
                onClick={()=>void process(true)}>Execute reviewed registration</button>
              <button className={button} onClick={()=>setReview(null)}>Back to draft</button>
            </>}
            {phase==="reconcile"&&<button className={button}
              onClick={()=>void process(false)}>Check exact receipt</button>}
            {["succeeded","failed"].includes(phase)&&<button className={button}
              onClick={()=>setReview(null)}>Continue</button>}
          </div>
        </section>}
      </div>
    </AdminPage>
  );
}

export const Route = createFileRoute("/_authenticated/admin/world-treaties")({
  head:()=>({meta:[
    {title:"Treaty register — Solaris Organizer"},
    {name:"robots",content:"noindex, nofollow"},
  ]}),
  component:RegisterTreaty,
});
