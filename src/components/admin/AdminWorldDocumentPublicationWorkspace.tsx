import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";
import {
  normalizeWorldDocumentSearch,
  parseWorldDocumentDraftSnapshot,
  parseWorldDocumentIndex,
  parseWorldOperationReceipt,
  type WorldDocumentDraftSnapshot,
} from "@/lib/world-document-draft-model";
import {
  EFFECTIVE_DATE_COMMAND,
  PUBLISH_DOCUMENT_COMMAND,
  assertPublicationResultIdentity,
  isPublicationReady,
  parseUtcEffectiveMinute,
} from "@/lib/world-document-publication";

const db = supabase as any;
const control = "min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary";
const primary = "min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50";
const secondary = "min-h-11 rounded-xl border border-border px-4 py-2 font-semibold disabled:opacity-50";

type Organization = { id: string; slug: string; official_name: string; short_name: string };
type ReviewAction = {
  operationId: string;
  command: string;
  rpc: string;
  args: Record<string, unknown>;
  documentId: string;
  documentSlug: string;
  organizationSlug: string;
  versionId: string;
  versionNumber: number;
  title: string;
  effectiveFrom: string;
};
type ReviewState = {
  action: ReviewAction;
  phase: "review" | "checking" | "reconcile" | "succeeded" | "failed";
  message: string;
};

function requireOrganization(value: unknown): Organization {
  const row = value as Partial<Organization> | null;
  if (!row || typeof row.id !== "string" || !row.id ||
      typeof row.slug !== "string" || !/^[a-z0-9-]+$/.test(row.slug) ||
      typeof row.official_name !== "string" || !row.official_name ||
      typeof row.short_name !== "string") {
    throw new Error("An institution returned invalid canonical identity.");
  }
  return row as Organization;
}

function definitiveFailure(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" &&
    ["22023", "23503", "23505", "23514", "42501", "40001", "PGRST202"].includes(code);
}

export function AdminWorldDocumentPublicationWorkspace() {
  const queryClient = useQueryClient();
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [documentSlug, setDocumentSlug] = useState("");
  const [search, setSearch] = useState("");
  const [effectiveInput, setEffectiveInput] = useState("");
  const [review, setReview] = useState<ReviewState | null>(null);
  const [legalTextRead, setLegalTextRead] = useState(false);
  const [typedTitle, setTypedTitle] = useState("");
  const [warning, setWarning] = useState("");
  const inFlight = useRef(new Set<string>());
  const blocked = review !== null && ["review", "checking", "reconcile"].includes(review.phase);

  const organizations = useQuery({
    queryKey: ["tg4-publication-organizations"],
    staleTime: 0,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db.from("world_organizations")
        .select("id,slug,official_name,short_name")
        .eq("public_visibility", "public")
        .order("official_name", { ascending: true })
        .limit(100);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("No verified organization index.");
      return data.map(requireOrganization);
    },
  });
  const organization = organizations.data?.find((row) => row.slug === organizationSlug);

  const documents = useQuery({
    queryKey: ["tg4-publication-index", organizationSlug, search],
    enabled: Boolean(organization),
    staleTime: 0,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db.rpc("world_get_document_index_v1", {
        p_organization_slug: organizationSlug,
        p_query: search || null,
        p_limit: 100,
      });
      if (error) throw error;
      const rows = parseWorldDocumentIndex(data);
      if (rows.some((row) => row.organizationId !== organization?.id ||
          row.organizationSlug !== organizationSlug)) {
        throw new Error("An institutional document had an unexpected authority scope.");
      }
      return rows;
    },
  });
  const listedDocument = documents.data?.find((row) => row.slug === documentSlug);

  const work = useQuery({
    queryKey: ["tg4-publication-work", organizationSlug, documentSlug],
    enabled: Boolean(organization && listedDocument),
    staleTime: 0,
    gcTime: 0,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db.rpc("world_get_document_v1", {
        p_organization_slug: organizationSlug,
        p_document_slug: documentSlug,
        p_version_number: null,
      });
      if (error) throw error;
      const parsed = parseWorldDocumentDraftSnapshot(data);
      if (parsed.organization.organizationId !== organization?.id ||
          parsed.documentId !== listedDocument?.documentId ||
          parsed.slug !== documentSlug) {
        throw new Error("The legal Work no longer matches the selected institution.");
      }
      return parsed;
    },
  });
  const pending = work.data?.pendingDraft;

  const pendingVersion = useQuery({
    queryKey: ["tg4-publication-version", organizationSlug, documentSlug, pending?.versionId],
    enabled: Boolean(work.data?.allowedActions.manage && pending && listedDocument),
    staleTime: 0,
    gcTime: 0,
    retry: 1,
    queryFn: async () => {
      if (!work.data || !pending) throw new Error("An exact draft is required.");
      const { data, error } = await db.rpc("world_get_document_v1", {
        p_organization_slug: organizationSlug,
        p_document_slug: documentSlug,
        p_version_number: pending.versionNumber,
      });
      if (error) throw error;
      const parsed = parseWorldDocumentDraftSnapshot(data);
      if (parsed.documentId !== work.data.documentId ||
          parsed.organization.organizationId !== work.data.organization.organizationId ||
          !parsed.version || parsed.version.publicationState !== "draft" ||
          parsed.version.versionId !== pending.versionId ||
          parsed.version.versionNumber !== pending.versionNumber) {
        throw new Error("The unpublished legal version changed while being read.");
      }
      return parsed;
    },
  });

  const draft = pendingVersion.data?.version;
  const canPublish = isPublicationReady({
    document: work.data,
    pending: pendingVersion.data,
    now: Date.now(),
  });
  const canPrepare = Boolean(work.data?.allowedActions.manage && work.data.revision &&
    draft?.publicationState === "draft" && draft.revision && pending);
  const identityKey = `${organizationSlug}/${documentSlug}/${pending?.versionId ?? "none"}`;
  useEffect(() => {
    setEffectiveInput("");
    setReview(null);
    setWarning("");
    setTypedTitle("");
    setLegalTextRead(false);
  }, [identityKey]);

  const changeOrganization = (next: string) => {
    if (blocked) return;
    setOrganizationSlug(next);
    setDocumentSlug("");
    setSearch("");
    setReview(null);
  };
  const changeDocument = (next: string) => {
    if (blocked) return;
    setDocumentSlug(next);
    setReview(null);
  };
  const refresh = async () => {
    if (!organization || !documentSlug) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tg4-publication-index", organizationSlug] }),
      queryClient.invalidateQueries({ queryKey: ["tg4-publication-work", organizationSlug, documentSlug] }),
      queryClient.invalidateQueries({ queryKey: ["tg4-publication-version", organizationSlug, documentSlug] }),
    ]);
  };

  const startReview = (
    command: string, rpc: string, args: Record<string, unknown>, effectiveFrom: string,
  ) => {
    if (blocked || !work.data || !draft || !organization) return;
    const payload = {
      documentId: work.data.documentId, versionId: draft.versionId,
      expectedDocumentRevision: work.data.revision,
      expectedVersionRevision: draft.revision, effectiveFrom,
    };
    const operation = createOrganisationCommand({
      command,
      riskClass: command === PUBLISH_DOCUMENT_COMMAND ? "R3" : "R2",
      scope: { entityId: organization.id }, payload,
    });
    setLegalTextRead(false);
    setTypedTitle("");
    setWarning("");
    setReview({
      phase: "review", message: "",
      action: {
        operationId: operation.operationId,
        command, rpc,
        args: {
          ...args, p_operation_id: operation.operationId,
          p_idempotency_key: operation.idempotencyKey,
        },
        organizationSlug, documentSlug,
        documentId: work.data.documentId, versionId: draft.versionId,
        versionNumber: draft.versionNumber, title: draft.title, effectiveFrom,
      },
    });
  };

  const prepareDate = () => {
    if (!canPrepare || !draft?.revision || blocked) return;
    const utc = parseUtcEffectiveMinute(effectiveInput);
    if (!utc) {
      setWarning("Enter an exact, valid UTC date and time. No legal text was changed.");
      return;
    }
    startReview(EFFECTIVE_DATE_COMMAND, "world_set_document_draft_effective_date_v1", {
      p_version_id: draft.versionId,
      p_effective_from: utc,
      p_expected_version_revision: draft.revision,
    }, utc);
  };

  const preparePublication = () => {
    if (!canPublish || !work.data?.revision || !draft?.revision || !draft.effectiveFrom || blocked) return;
    startReview(PUBLISH_DOCUMENT_COMMAND, "world_publish_document_version_v1", {
      p_document_id: work.data.documentId,
      p_version_id: draft.versionId,
      p_expected_document_revision: work.data.revision,
      p_expected_version_revision: draft.revision,
    }, draft.effectiveFrom);
  };

  const reconcile = async (send: boolean) => {
    if (!review || (send && review.phase !== "review") ||
        review.phase === "checking" || review.phase === "succeeded") return;
    const { action } = review;
    if (send && action.command === PUBLISH_DOCUMENT_COMMAND &&
        (!legalTextRead || typedTitle !== action.title)) return;
    if (inFlight.current.has(action.operationId)) return;
    inFlight.current.add(action.operationId);
    setReview({ action, phase: "checking", message: "Checking canonical operation…" });
    let transportError: unknown = null;
    if (send) {
      try {
        const { error } = await db.rpc(action.rpc, action.args);
        if (error) transportError = error;
      } catch (error) { transportError = error; }
    }
    if (transportError && definitiveFailure(transportError)) {
      setReview({ action, phase: "failed",
        message: "The server rejected this operation. Refresh the legal version and prepare a new review." });
      inFlight.current.delete(action.operationId);
      return;
    }
    try {
      const { data, error } = await db.rpc("studio2_reconcile_operation", {
        p_operation_id: action.operationId,
      });
      if (error) throw error;
      const receipt = parseWorldOperationReceipt(data, action.operationId, action.command);
      if (receipt.status === "succeeded") {
        if (receipt.result?.documentId !== action.documentId ||
            receipt.result?.versionId !== action.versionId) {
          throw new Error("The receipt belongs to a different legal document/version.");
        }
        if (action.command === PUBLISH_DOCUMENT_COMMAND) {
          assertPublicationResultIdentity(receipt.result, action.documentId, action.versionId);
        } else if (receipt.result?.effectiveFrom !== action.effectiveFrom) {
          throw new Error("The effective-date receipt does not match the reviewed instant.");
        }
        setReview({ action, phase: "succeeded",
          message: `The canonical operation succeeded. Receipt: ${action.operationId}` });
        await refresh();
      } else {
        setReview({ action, phase: receipt.status === "failed" ? "failed" : "reconcile",
          message: receipt.status === "failed"
            ? "The canonical operation failed. Refresh before preparing another action."
            : "The operation is unsettled. Recheck this exact receipt, never submit a new ID blindly." });
      }
    } catch {
      setReview({ action, phase: "reconcile",
        message: "Canonical receipt verification is unavailable. Do not repeat the operation." });
    } finally {
      inFlight.current.delete(action.operationId);
    }
  };

  const draftMismatch = Boolean(draft && review &&
    (review.action.versionId !== draft.versionId ||
      review.action.documentId !== work.data?.documentId));

  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl space-y-6 pb-20">
        <AdminPageHeader
          eyebrow="Governance · Legal records"
          title="Legal publication"
          description="Prepare an effective instant, inspect the complete canonical draft, then authorize a separate, receipted R3 publication. Publication changes official history."
        />
        <a className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          href="/admin/world-documents">Back to document drafting</a>

        {organizations.isPending ? <p role="status">Loading institutions…</p>
          : organizations.isError ? <div role="alert">Institution index unavailable.
              <button className={secondary} onClick={() => void organizations.refetch()}>Retry</button></div>
          : <label className="block space-y-2 text-sm font-semibold">Institution
              <select className={control} value={organizationSlug} disabled={blocked}
                onChange={(event) => changeOrganization(event.target.value)}>
                <option value="">Choose institution</option>
                {organizations.data?.map((row) => (
                  <option key={row.id} value={row.slug}>{row.official_name}</option>
                ))}
              </select>
            </label>}

        {organization && <section className="space-y-3">
          <h2 className="text-lg font-semibold">Select a legal Work</h2>
          <label className="block space-y-1 text-sm">Search published or authorized institution documents
            <input className={control} value={search} maxLength={120} disabled={blocked}
              onChange={(event) => { setSearch(normalizeWorldDocumentSearch(event.target.value)); changeDocument(""); }} />
          </label>
          {documents.isPending ? <p role="status">Loading legal Works…</p>
            : documents.isError ? <div role="alert">The document index failed authorization or loading.
                <button className={secondary} onClick={() => void documents.refetch()}>Retry</button></div>
            : <label className="block space-y-1 text-sm">Work
                <select className={control} value={documentSlug} disabled={blocked}
                  onChange={(event) => changeDocument(event.target.value)}>
                  <option value="">Choose document</option>
                  {documents.data?.map((row) => (
                    <option key={row.documentId} value={row.slug}>
                      {row.title} · {row.documentType}
                    </option>
                  ))}
                </select>
              </label>}
          {!documents.isPending && !documents.isError && documents.data?.length === 0 &&
            <p>No authorized documents match this search.</p>}
        </section>}

        {documentSlug && (!listedDocument ? <p role="status">Select a currently listed Work.</p>
          : work.isPending ? <p role="status">Verifying document authority and revision…</p>
          : work.isError || !work.data ? <div role="alert">Legal Work unavailable or forbidden.
              <button className={secondary} onClick={() => void work.refetch()}>Retry</button></div>
          : !work.data.allowedActions.manage ? <p role="alert">Unpublished text is restricted. Your institution document-management capability is not verified.</p>
          : !pending ? <p role="status">No unpublished legal version is awaiting preparation or publication.</p>
          : pendingVersion.isPending ? <p role="status">Verifying exact draft version and authority…</p>
          : pendingVersion.isError || !draft ? <div role="alert">The draft cannot be verified.
              <button className={secondary} onClick={() => void pendingVersion.refetch()}>Retry version</button></div>
          : <section className="space-y-6 border-t border-border pt-5">
              <header className="space-y-2">
                <h2 className="text-xl font-bold">{draft.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {organization?.official_name} · version {draft.versionNumber} ·
                  draft revision {draft.revision} · Work revision {work.data.revision}
                </p>
                <p className="text-sm">
                  Effective from: <strong>{draft.effectiveFrom || "Not set"}</strong>
                </p>
              </header>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold">1. Prepare the effective instant</h3>
                <p className="text-sm text-muted-foreground">
                  Enter an exact UTC time. This updates only the mutable draft date,
                  never the full legal text, source provenance, or provisions.
                </p>
                <label className="block max-w-sm space-y-2 text-sm">Effective date and time (UTC)
                  <input type="datetime-local" className={control} step={60}
                    value={effectiveInput} disabled={!canPrepare || blocked}
                    onChange={(event) => setEffectiveInput(event.target.value)} />
                </label>
                <button className={secondary} type="button" disabled={!canPrepare || blocked}
                  onClick={prepareDate}>Review effective-date operation (R2)</button>
              </div>

              <div className="space-y-3 border-t border-border pt-5">
                <h3 className="text-lg font-semibold">2. Publish official legal text</h3>
                <p className="text-sm text-muted-foreground">
                  Publication is permanent. The server checks both revisions, legal
                  permissions, effective chronology and creates the official version
                  with an immutable content hash. An existing published version is
                  superseded atomically.
                </p>
                {!work.data.allowedActions.publish && <p role="alert">
                  You are not authorized to publish this institution’s legal documents.</p>}
                {draft.effectiveFrom === null && <p role="status">
                  Prepare the effective date before publication.</p>}
                {draft.effectiveFrom && Date.parse(draft.effectiveFrom) > Date.now() &&
                  <p role="status">This legal text cannot publish before its effective instant.</p>}
                {(!draft.plainText.trim() && draft.provisions.length === 0) &&
                  <p role="alert">An empty legal version cannot be submitted from this workspace.</p>}
                <button className={primary} type="button" disabled={!canPublish || blocked}
                  onClick={preparePublication}>Review irreversible publication (R3)</button>
              </div>
            </section>)}

        {warning && <p role="alert" className="flex gap-2 text-destructive">
          <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />{warning}</p>}

        {review && <section className="space-y-4 rounded-xl border border-primary/40 p-5"
          aria-labelledby="tg4-publish-review-heading">
          <h2 id="tg4-publish-review-heading" className="text-lg font-bold">
            {review.phase === "review" ? "Review the consequential operation" : "Canonical operation receipt"}
          </h2>
          <p className="font-semibold">
            {review.action.command === PUBLISH_DOCUMENT_COMMAND
              ? "Publish official legal version" : "Set unpublished draft effective instant"}
          </p>
          <p className="text-sm">
            {review.action.organizationSlug} / {review.action.documentSlug} ·
            version {review.action.versionNumber} · {review.action.effectiveFrom}
          </p>
          {review.action.command === PUBLISH_DOCUMENT_COMMAND && (
            <div className="space-y-4">
              {draftMismatch || !draft ? <p role="alert">The legal version identity changed. Cancel this review.</p> : (
                <>
                  <details className="rounded-lg border border-border p-3" open>
                    <summary className="cursor-pointer font-semibold">Complete legal text and structured articles</summary>
                    <p className="mt-3 text-sm font-semibold">Document-level text</p>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 font-sans text-sm">
                      {draft.plainText || "(No document-level text)"}
                    </pre>
                    <p className="text-sm font-semibold">Structured root metadata</p>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all p-3 text-xs">
                      {JSON.stringify(draft.structuredContent, null, 2)}
                    </pre>
                    <p className="text-sm font-semibold">{draft.provisions.length} legal provisions</p>
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words p-3 text-xs">
                      {JSON.stringify(draft.provisions, null, 2)}
                    </pre>
                  </details>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" checked={legalTextRead}
                      onChange={(event) => setLegalTextRead(event.target.checked)} />
                    I have reviewed the full version and understand that publication is permanent.
                  </label>
                  <label className="block space-y-2 text-sm">
                    Type the exact document title to approve this R3 operation
                    <input className={control} value={typedTitle} autoComplete="off"
                      onChange={(event) => setTypedTitle(event.target.value)}
                      placeholder={review.action.title} />
                  </label>
                </>
              )}
            </div>
          )}
          <p className="break-all text-xs text-muted-foreground">
            Operation: {review.action.operationId}</p>
          {review.message && <p role="status" className="text-sm">{review.message}</p>}
          <div className="flex flex-wrap gap-2">
            {review.phase === "review" && <>
              <button type="button" className={primary}
                disabled={draftMismatch || (review.action.command === PUBLISH_DOCUMENT_COMMAND &&
                  (!legalTextRead || typedTitle !== review.action.title))}
                onClick={() => void reconcile(true)}>Execute reviewed operation</button>
              <button type="button" className={secondary}
                onClick={() => setReview(null)}>Cancel</button>
            </>}
            {review.phase === "reconcile" &&
              <button type="button" className={secondary} onClick={() => void reconcile(false)}>
                <RefreshCw className="mr-2 inline size-4" aria-hidden="true" />Check exact receipt
              </button>}
            {review.phase === "succeeded" && <>
              <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
              <button type="button" className={secondary}
                onClick={() => setReview(null)}>Continue</button>
            </>}
            {review.phase === "failed" &&
              <button type="button" className={secondary}
                onClick={() => { setReview(null); void refresh(); }}>Refresh and review again</button>}
          </div>
        </section>}
      </div>
    </AdminPage>
  );
}
