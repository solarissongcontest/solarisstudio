import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, FilePlus2, RefreshCw } from "lucide-react";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";
import {
  parseWorldDocumentDraftSnapshot,
  parseWorldDocumentIndex,
  parseWorldOperationReceipt,
  toWorldDocumentSlug,
  validateWorldDocumentDraft,
  WORLD_DOCUMENT_KINDS,
  WORLD_DOCUMENT_VISIBILITIES,
  type WorldDocumentKind,
  type WorldDocumentVisibility,
} from "@/lib/world-document-draft-model";

type Organization = { id: string; slug: string; short_name: string; official_name: string };
type Review = {
  operationId: string;
  idempotencyKey: string;
  rpcName: string;
  command: string;
  args: Record<string, unknown>;
  organizationSlug: string;
  documentSlug: string;
  summary: string;
  details: string[];
};
type OperationState = {
  review: Review;
  status: "review" | "checking" | "reconcile" | "failed" | "succeeded";
  message: string;
};
const db = supabase as any;

function requiredOrganization(value: unknown): Organization {
  const row = value as Partial<Organization> | null;
  if (!row || typeof row.id !== "string" || !row.id ||
      typeof row.slug !== "string" || !/^[a-z0-9-]+$/.test(row.slug) ||
      typeof row.short_name !== "string" || !row.short_name ||
      typeof row.official_name !== "string" || !row.official_name) {
    throw new Error("The institutional organization list is incomplete.");
  }
  return row as Organization;
}

function messageForError(error: unknown): string {
  const e = error as { message?: unknown; code?: unknown };
  if (e?.code === "40001" || String(e?.message).includes("VERSION_CONFLICT")) {
    return "Another organizer changed this document. Refresh its canonical revision before preparing a new action.";
  }
  if (e?.code === "42501") return "Your account is not authorized to manage this institution.";
  return "The action could not be confirmed. Reconcile its operation before considering another attempt.";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-border/70 pt-6">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

const fieldClass = "w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50";
const secondaryClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

export function AdminWorldDocumentDraftWorkspace() {
  const queryClient = useQueryClient();
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [documentSlug, setDocumentSlug] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [kind, setKind] = useState<WorldDocumentKind>("charter");
  const [visibility, setVisibility] = useState<WorldDocumentVisibility>("public");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const [operation, setOperation] = useState<OperationState | null>(null);
  const [notice, setNotice] = useState("");

  const organizations = useQuery({
    queryKey: ["tg4-organizer-organizations"],
    staleTime: 120_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db.from("world_organizations")
        .select("id,slug,short_name,official_name")
        .eq("public_visibility", "public")
        .order("official_name", { ascending: true })
        .limit(100);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("The organizations response is malformed.");
      return data.map(requiredOrganization);
    },
  });

  const organization = organizations.data?.find((row) => row.slug === organizationSlug);
  const documents = useQuery({
    queryKey: ["tg4-organizer-documents", organizationSlug],
    enabled: Boolean(organization),
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db.rpc("world_get_document_index_v1", {
        p_organization_slug: organizationSlug,
        p_query: null,
        p_limit: 100,
      });
      if (error) throw error;
      return parseWorldDocumentIndex(data).filter((row) =>
        row.organizationId === organization?.id && row.organizationSlug === organizationSlug);
    },
  });

  const selected = documents.data?.find((row) => row.slug === documentSlug);
  const snapshot = useQuery({
    queryKey: ["tg4-organizer-document", organizationSlug, documentSlug],
    enabled: Boolean(organization && selected),
    staleTime: 0,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db.rpc("world_get_document_v1", {
        p_organization_slug: organizationSlug,
        p_document_slug: documentSlug,
        p_version_number: null,
      });
      if (error) throw error;
      const value = parseWorldDocumentDraftSnapshot(data);
      if (value.organization.organizationId !== organization?.id ||
          value.documentId !== selected?.documentId || value.slug !== documentSlug) {
        throw new Error("Institution document identity changed while loading.");
      }
      return value;
    },
  });

  useEffect(() => {
    setDraftTitle(snapshot.data?.version?.publicationState === "draft"
      ? snapshot.data.version.title : "");
    setDraftText("");
  }, [snapshot.data?.version?.versionId, snapshot.data?.documentId]);

  const switchOrganization = (slug: string) => {
    if (operation && operation.status !== "succeeded" && operation.status !== "failed") return;
    setOrganizationSlug(slug);
    setDocumentSlug("");
    setOperation(null);
    setNotice("");
  };

  const selectDocument = (slug: string) => {
    if (operation && operation.status !== "succeeded" && operation.status !== "failed") return;
    setDocumentSlug(slug);
    setOperation(null);
    setNotice("");
  };

  const openReview = (command: string, rpcName: string, payload: Record<string, unknown>,
    args: Record<string, unknown>, summary: string, details: string[], nextDocumentSlug: string) => {
    if (!organization || operation?.status === "checking" || operation?.status === "reconcile") return;
    const identity = createOrganisationCommand({
      command, riskClass: "R2", scope: { entityId: organization.id }, payload,
    });
    setOperation({
      review: {
        operationId: identity.operationId,
        idempotencyKey: identity.idempotencyKey,
        rpcName, command,
        args: {
          ...args,
          p_operation_id: identity.operationId,
          p_idempotency_key: identity.idempotencyKey,
        },
        organizationSlug: organization.slug,
        documentSlug: nextDocumentSlug,
        summary, details,
      },
      status: "review",
      message: "",
    });
    setNotice("");
  };

  const reviewCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!organization) return;
    const slug = createSlug.trim();
    const validation = validateWorldDocumentDraft({ title: createTitle, slug, kind, visibility });
    if (validation) { setNotice(validation); return; }
    openReview("world.document.create", "world_create_document_v1",
      { organizationId: organization.id, slug, title: createTitle.trim(), kind, visibility },
      {
        p_organization_id: organization.id,
        p_slug: slug,
        p_document_type: kind,
        p_title: createTitle.trim(),
        p_visibility: visibility,
      },
      "Create institutional document",
      [organization.official_name, createTitle.trim(), `Type: ${kind}`, `Access: ${visibility}`],
      slug,
    );
  };

  const reviewVersion = (event: FormEvent) => {
    event.preventDefault();
    const doc = snapshot.data;
    if (!doc?.allowedActions.manage || !doc.revision || !organization ||
        doc.version?.publicationState === "draft") return;
    const validation = validateWorldDocumentDraft({ title: draftTitle, plainText: draftText });
    if (validation) { setNotice(validation); return; }
    openReview("world.document.version.create", "world_create_document_version_v1",
      { documentId: doc.documentId, title: draftTitle.trim(), expectedDocumentRevision: doc.revision },
      {
        p_document_id: doc.documentId,
        p_title: draftTitle.trim(),
        p_structured_content: {},
        p_plain_text: draftText,
        p_effective_from: null,
        p_effective_to: null,
        p_source_version_id: doc.version?.versionId ?? null,
        p_source_description: null,
        p_source_provenance: {},
        p_provisions: [],
        p_expected_document_revision: doc.revision,
      },
      "Create a new unpublished legal draft",
      [organization.official_name, doc.title, `Draft title: ${draftTitle.trim()}`,
        `Based on revision ${doc.revision}`, "No publication or member notification"],
      doc.slug,
    );
  };

  const checkReceipt = async (review: Review) => {
    const { data, error } = await db.rpc("studio2_reconcile_operation", {
      p_operation_id: review.operationId,
    });
    if (error) throw error;
    return parseWorldOperationReceipt(data, review.operationId, review.command);
  };

  const reconcile = async (send: boolean) => {
    const active = operation;
    if (!active || (send && active.status !== "review") || active.status === "checking") return;
    const { review } = active;
    setOperation({ review, status: "checking", message: "Checking the canonical operation receipt…" });
    let transportError: unknown = null;
    if (send) {
      try {
        const { error } = await db.rpc(review.rpcName, review.args);
        if (error) transportError = error;
      } catch (error) { transportError = error; }
    }
    try {
      const receipt = await checkReceipt(review);
      if (receipt.status === "succeeded") {
        setOperation({ review, status: "succeeded",
          message: `Saved by the canonical institution command. Receipt: ${review.operationId}` });
        setDocumentSlug(review.documentSlug);
        setNotice("");
        await queryClient.invalidateQueries({ queryKey: ["tg4-organizer-documents", review.organizationSlug] });
        await queryClient.invalidateQueries({
          queryKey: ["tg4-organizer-document", review.organizationSlug, review.documentSlug],
        });
        setCreateTitle(""); setCreateSlug(""); setDraftTitle(""); setDraftText("");
      } else {
        setOperation({ review, status: receipt.status === "failed" ? "failed" : "reconcile",
          message: receipt.status === "failed"
            ? "The server recorded a failed operation. Correct the input and prepare a new reviewed operation."
            : "The operation is not settled. It cannot be retried blindly. Check its receipt again." });
      }
    } catch (error) {
      // A missing receipt may mean a rejected validation transaction OR a lost
      // response. Neither authorizes a blind retry with a new operation ID.
      setOperation({ review, status: "reconcile",
        message: transportError ? messageForError(transportError)
          : "The canonical receipt is unavailable. Do not create a second operation." });
    }
  };

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-7 pb-16">
        <AdminPageHeader
          eyebrow="Governance · Institutional documents"
          title="Document drafts"
          description="Create institutional legal Works and versioned unpublished text. Canonical commands own every write. Publication and amendments remain separate, reviewed operations."
        />

        {organizations.isPending ? <p role="status">Loading institutions…</p> : organizations.isError ? (
          <div role="alert" className="space-y-3 rounded-xl border border-destructive/40 p-5">
            <p>Institution authority is unavailable. No draft operations are enabled.</p>
            <button type="button" className={secondaryClass} onClick={() => void organizations.refetch()}>Retry</button>
          </div>
        ) : (
          <label className="block max-w-lg space-y-2 text-sm font-semibold">
            <span>Institution scope</span>
            <select className={fieldClass} value={organizationSlug}
              disabled={operation?.status === "reconcile" || operation?.status === "checking" || operation?.status === "review"}
              onChange={(event) => switchOrganization(event.target.value)}>
              <option value="">Choose an institution</option>
              {organizations.data?.map((row) => (
                <option key={row.id} value={row.slug}>{row.official_name}</option>
              ))}
            </select>
          </label>
        )}

        {organization && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="space-y-7">
              <Section title="Institutional Works">
                {documents.isPending ? <p role="status">Reading authorized documents…</p> : documents.isError ? (
                  <div role="alert" className="space-y-2">
                    <p>The document index is unavailable. No writes are enabled.</p>
                    <button type="button" className={secondaryClass} onClick={() => void documents.refetch()}>Retry index</button>
                  </div>
                ) : documents.data?.length ? (
                  <div className="divide-y divide-border/60 border-y border-border/60">
                    {documents.data.map((row) => (
                      <button type="button" key={row.documentId}
                        disabled={operation?.status === "reconcile" || operation?.status === "checking" || operation?.status === "review"}
                        aria-current={row.slug === documentSlug ? "true" : undefined}
                        onClick={() => selectDocument(row.slug)}
                        className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-primary">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{row.title}</span>
                          <span className="block text-xs text-muted-foreground">{row.documentType} · {row.visibility}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{row.currentVersion
                          ? `v${row.currentVersion.versionNumber}` : "No published version"}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No documents visible to your current identity in this institution.</p>
                )}
                {documents.data?.length === 100 && (
                  <p className="text-xs text-muted-foreground">Only the first 100 authorized Works are shown. The source projection needs server pagination for larger institutions.</p>
                )}
              </Section>

              <Section title="Create a Work">
                <form className="space-y-3" onSubmit={reviewCreate}>
                  <label className="block space-y-1 text-sm">Official title
                    <input className={fieldClass} maxLength={180} required value={createTitle}
                      onChange={(e) => {
                        setCreateTitle(e.target.value);
                        if (!createSlug) setCreateSlug(toWorldDocumentSlug(e.target.value));
                      }} />
                  </label>
                  <label className="block space-y-1 text-sm">Stable document identifier
                    <input className={fieldClass} required maxLength={90} pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      value={createSlug} onChange={(e) => setCreateSlug(e.target.value)} />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1 text-sm">Type
                      <select className={fieldClass} value={kind}
                        onChange={(e) => setKind(e.target.value as WorldDocumentKind)}>
                        {WORLD_DOCUMENT_KINDS.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
                      </select>
                    </label>
                    <label className="block space-y-1 text-sm">Audience
                      <select className={fieldClass} value={visibility}
                        onChange={(e) => setVisibility(e.target.value as WorldDocumentVisibility)}>
                        {WORLD_DOCUMENT_VISIBILITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">Creates document identity only. It does not publish legal text or change any law.</p>
                  <button type="submit" className={buttonClass}
                    disabled={!organization || documents.isError || documents.isPending || Boolean(operation && ["review","checking","reconcile"].includes(operation.status))}>
                    <FilePlus2 className="size-4" aria-hidden="true" /> Review creation
                  </button>
                </form>
              </Section>
            </div>

            <div className="space-y-6">
              <Section title="Draft a version">
                {!documentSlug ? <p className="text-sm text-muted-foreground">Select a Work to prepare an unpublished version.</p>
                  : snapshot.isPending ? <p role="status">Loading canonical document and revision…</p>
                  : snapshot.isError || !snapshot.data ? (
                    <div role="alert" className="space-y-2">
                      <p>The document and its revision could not be verified. Editing is unavailable.</p>
                      <button type="button" className={secondaryClass} onClick={() => void snapshot.refetch()}>Retry document</button>
                    </div>
                  ) : !snapshot.data.allowedActions.manage ? (
                    <p role="alert">Your account lacks the institution document-management capability. The server remains authoritative.</p>
                  ) : snapshot.data.version?.publicationState === "draft" ? (
                    <div className="space-y-2 border-l-2 border-primary pl-4">
                      <p className="font-semibold">An unpublished draft already exists.</p>
                      <p className="text-sm text-muted-foreground">Version {snapshot.data.version.versionNumber} is held for editing. This creation-only workspace will not overwrite its structured provisions, provenance or content.</p>
                    </div>
                  ) : (
                    <form className="space-y-4" onSubmit={reviewVersion}>
                      <p className="text-sm text-muted-foreground">
                        {snapshot.data.title} · Work revision {snapshot.data.revision}
                      </p>
                      {snapshot.data.version && (
                        <p className="text-xs text-muted-foreground">
                          The next draft will reference published version {snapshot.data.version.versionNumber} without modifying that historical text.
                        </p>
                      )}
                      <label className="block space-y-1 text-sm">Draft version title
                        <input className={fieldClass} required maxLength={180} value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)} />
                      </label>
                      <label className="block space-y-1 text-sm">Plain legal text
                        <textarea className={fieldClass + " min-h-64 resize-y leading-6"} required maxLength={100000}
                          value={draftText} onChange={(e) => setDraftText(e.target.value)}
                          placeholder="Enter the draft legal text. Nothing is published at this stage." />
                      </label>
                      <p className="text-xs leading-5 text-muted-foreground">
                        This plain-text draft starts with no structured provisions. It must be reviewed and prepared through the governed legal publication workflow before it can become effective.
                      </p>
                      <button type="submit" className={buttonClass}
                        disabled={!snapshot.data.revision || Boolean(operation && ["review","checking","reconcile"].includes(operation.status))}>
                        Review new version
                      </button>
                    </form>
                  )}
              </Section>

              {notice && <p role="alert" className="flex gap-2 text-sm text-destructive"><AlertCircle className="size-4 shrink-0" aria-hidden="true" />{notice}</p>}

              {operation && (
                <section aria-labelledby="tg4-operation-review" className="space-y-4 rounded-2xl border border-primary/35 bg-muted/30 p-5">
                  <h2 id="tg4-operation-review" className="text-lg font-bold">
                    {operation.status === "review" ? "Confirm reviewed operation" : "Canonical operation status"}
                  </h2>
                  <p className="text-sm font-semibold">{operation.review.summary}</p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {operation.review.details.map((detail, index) => <li key={index}>{detail}</li>)}
                  </ul>
                  <p className="break-all text-xs text-muted-foreground">Operation ID: {operation.review.operationId}</p>
                  {operation.message && <p role="status" className="text-sm">{operation.message}</p>}
                  <div className="flex flex-wrap gap-2">
                    {operation.status === "review" && (
                      <>
                        <button type="button" className={buttonClass} onClick={() => void reconcile(true)}>Execute reviewed action</button>
                        <button type="button" className={secondaryClass} onClick={() => setOperation(null)}>Back to editor</button>
                      </>
                    )}
                    {operation.status === "reconcile" && (
                      <button type="button" className={secondaryClass} onClick={() => void reconcile(false)}>
                        <RefreshCw className="size-4" aria-hidden="true" /> Check exact receipt
                      </button>
                    )}
                    {operation.status === "succeeded" && (
                      <>
                        <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
                        <button type="button" className={secondaryClass} onClick={() => setOperation(null)}>Continue</button>
                      </>
                    )}
                    {operation.status === "failed" && (
                      <button type="button" className={secondaryClass} onClick={() => setOperation(null)}>Correct and prepare a new review</button>
                    )}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminPage>
  );
}
