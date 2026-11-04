import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, FilePlus2, RefreshCw } from "lucide-react";

import { AdminPage } from "@/components/admin/AdminShell";
import { WorldDocumentProvisionEditor } from "@/components/admin/WorldDocumentProvisionEditor";
import { AdminPageHeader } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";
import {
  parseWorldDocumentDraftSnapshot,
  parseWorldDocumentIndex,
  normalizeWorldDocumentSearch,
  worldDocumentDraftSignature,
  parseWorldOperationReceipt,
  toWorldDocumentSlug,
  validateWorldDocumentDraft,
  WORLD_DOCUMENT_KINDS,
  WORLD_DOCUMENT_VISIBILITIES,
  type WorldDocumentKind,
  type WorldDocumentVisibility,
} from "@/lib/world-document-draft-model";
import {
  MAX_WORLD_PROVISIONS_IN_EDITOR,
  compareWorldDocumentProvisions,
  toWorldProvisionCommandRows,
  validateWorldDocumentProvisions,
  type WorldDocumentProvision,
  type WorldProvisionCommandRow,
} from "@/lib/world-document-provisions";

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

function definitiveFailure(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && [
    "22023", "23503", "23505", "23514", "42501", "40001", "PGRST202", "P0001",
  ].includes(code);
}

function messageForError(error: unknown): string {
  const e = error as { message?: unknown; code?: unknown };
  if (e?.code === "40001" || String(e?.message).includes("VERSION_CONFLICT")) {
    return "Another organizer changed this document. Refresh its canonical revision before preparing a new action.";
  }
  if (e?.code === "42501") return "Your account is not authorized to manage this institution.";
  return "The action could not be confirmed. Reconcile its operation before considering another attempt.";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
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
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [kind, setKind] = useState<WorldDocumentKind>("charter");
  const [visibility, setVisibility] = useState<WorldDocumentVisibility>("public");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftProvisions, setDraftProvisions] = useState<WorldDocumentProvision[]>([]);
  const [operation, setOperation] = useState<OperationState | null>(null);
  const [reviewedFullText, setReviewedFullText] = useState(false);
  const authoringLocked = Boolean(
    operation && ["review", "checking", "reconcile"].includes(operation.status),
  );
  const executing = useRef<Set<string>>(new Set());
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
  const createAccess = useQuery({
    queryKey: ["tg4-organizer-can-create", organization?.id],
    enabled: Boolean(organization),
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      if (!organization) throw new Error("An exact institution scope is required.");
      const { data, error } = await db.rpc("world_access_allowed", {
        p_capability: "world.document.manage",
        p_organization_id: organization.id,
      });
      if (error) throw error;
      if (typeof data !== "boolean") throw new Error("Institution write access could not be verified.");
      return data;
    },
  });
  const documents = useQuery({
    queryKey: ["tg4-organizer-documents", organizationSlug, appliedSearch],
    enabled: Boolean(organization),
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db.rpc("world_get_document_index_v1", {
        p_organization_slug: organizationSlug,
        p_query: appliedSearch || null,
        p_limit: 100,
      });
      if (error) throw error;
      const rows = parseWorldDocumentIndex(data);
      if (rows.some((row) => row.organizationId !== organization?.id ||
        row.organizationSlug !== organizationSlug)) {
        throw new Error("The document index returned a different institution scope.");
      }
      return rows;
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

  const pendingDraft = snapshot.data?.pendingDraft;
  const pendingDraftDetails = useQuery({
    queryKey: ["tg4-organizer-unpublished-version", organizationSlug, documentSlug, pendingDraft?.versionNumber],
    enabled: Boolean(snapshot.data?.allowedActions.manage && organization && pendingDraft),
    staleTime: 0,
    retry: 1,
    queryFn: async () => {
      if (!pendingDraft || !snapshot.data) throw new Error("An exact unpublished version is required.");
      const { data, error } = await db.rpc("world_get_document_v1", {
        p_organization_slug: organizationSlug,
        p_document_slug: documentSlug,
        p_version_number: pendingDraft.versionNumber,
      });
      if (error) throw error;
      const value = parseWorldDocumentDraftSnapshot(data);
      if (value.documentId !== snapshot.data.documentId ||
          value.organization.organizationId !== snapshot.data.organization.organizationId ||
          !value.version || value.version.versionId !== pendingDraft.versionId ||
          value.version.publicationState !== "draft") {
        throw new Error("The selected unpublished version no longer matches canonical history.");
      }
      return value;
    },
  });

  const hydratedVersionIdentity = useRef<string | null>(null);
  const originalDraft = useRef<string | null>(null);
  useEffect(() => {
    const current = snapshot.data;
    const source = current?.version;
    const identity = current ? `${current.documentId}:${source?.versionId ?? "no-version"}` : null;
    // A background refresh at the SAME version must not destroy in-progress
    // legal authoring. A document/version switch must hydrate independently.
    if (identity === hydratedVersionIdentity.current) return;
    hydratedVersionIdentity.current = identity;
    const title = source?.publicationState === "published" ? source.title : current?.title ?? "";
    const text = source?.publicationState === "published" ? source.plainText : "";
    const provisions = source?.publicationState === "published" ? source.provisions : [];
    originalDraft.current = current ? worldDocumentDraftSignature({
      title, plainText: text, provisions,
    }) : null;
    setDraftTitle(title);
    setDraftText(text);
    setDraftProvisions(provisions);
  }, [snapshot.data]);

  const hasUnsavedDraftEdits = Boolean(
    snapshot.data?.allowedActions.manage &&
    !snapshot.data.hasUnpublishedDraft &&
    originalDraft.current !== null &&
    worldDocumentDraftSignature({
      title: draftTitle, plainText: draftText, provisions: draftProvisions,
    }) !== originalDraft.current,
  );
  useEffect(() => {
    if (!hasUnsavedDraftEdits) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedDraftEdits]);

  const confirmDiscard = () => !hasUnsavedDraftEdits ||
    window.confirm("Your unpublished legal edits have not been saved. Discard them?");
  const applySearch = (term: string) => {
    if (operation && ["review", "checking", "reconcile"].includes(operation.status)) return;
    const normalized = normalizeWorldDocumentSearch(term);
    if (normalized === appliedSearch) return;
    if (!confirmDiscard()) return;
    setAppliedSearch(normalized);
    setDocumentSlug("");
    setNotice("");
  };

  const switchOrganization = (slug: string) => {
    if (operation && operation.status !== "succeeded" && operation.status !== "failed") return;
    if (slug === organizationSlug || !confirmDiscard()) return;
    setOrganizationSlug(slug);
    setDocumentSlug("");
    setSearchInput("");
    setAppliedSearch("");
    setOperation(null);
    setNotice("");
  };

  const selectDocument = (slug: string) => {
    if (operation && operation.status !== "succeeded" && operation.status !== "failed") return;
    if (slug === documentSlug || !confirmDiscard()) return;
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
    setReviewedFullText(false);
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
    if (!organization || createAccess.data !== true) return;
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
        doc.hasUnpublishedDraft) return;
    const validation = validateWorldDocumentDraft({
      title: draftTitle, plainText: draftText,
      hasProvisions: draftProvisions.length > 0,
    })
      ?? validateWorldDocumentProvisions(draftProvisions);
    if (validation) { setNotice(validation); return; }
    const provisions = toWorldProvisionCommandRows(draftProvisions);
    const changes = compareWorldDocumentProvisions(doc.version?.provisions ?? [], draftProvisions);
    // The complete version snapshot is used for a new draft; a source version
    // is never overwritten. Its structured root and retained provision keys
    // must not disappear merely because this form edits plain text.
    const structuredContent = doc.version?.structuredContent ?? {};
    const sourceVersionId = doc.version?.publicationState === "published"
      ? doc.version.versionId : null;
    openReview("world.document.version.create", "world_create_document_version_v1",
      {
        documentId: doc.documentId, title: draftTitle.trim(),
        plainText: draftText, structuredContent, provisions,
        sourceVersionId, expectedDocumentRevision: doc.revision,
      },
      {
        p_document_id: doc.documentId,
        p_title: draftTitle.trim(),
        p_structured_content: structuredContent,
        p_plain_text: draftText,
        p_effective_from: null,
        p_effective_to: null,
        p_source_version_id: sourceVersionId,
        p_source_description: null,
        p_source_provenance: {},
        p_provisions: provisions,
        p_expected_document_revision: doc.revision,
      },
      "Create a new unpublished structured legal draft",
      [organization.official_name, doc.title, `Draft title: ${draftTitle.trim()}`,
        `Source version: ${doc.version?.versionNumber ?? "first"}`,
        `Structured provisions: ${provisions.length}`,
        `New identities: ${changes.added.join(", ") || "none"}`,
        `Omitted from new version: ${changes.omitted.join(", ") || "none"}`,
        `Modified existing identities: ${changes.modified.join(", ") || "none"}`,
        `Based on document revision ${doc.revision}`,
        "No publication, history replacement or member notification"],
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
    if (send && active.review.command === "world.document.version.create" && !reviewedFullText) return;
    const { review } = active;
    if (executing.current.has(review.operationId)) return;
    executing.current.add(review.operationId);
    setOperation({ review, status: "checking", message: "Checking the canonical operation receipt…" });
    let transportError: unknown = null;
    if (send) {
      try {
        const { error } = await db.rpc(review.rpcName, review.args);
        if (error) transportError = error;
      } catch (error) { transportError = error; }
    }
    if (transportError && definitiveFailure(transportError)) {
      setOperation({ review, status: "failed", message: messageForError(transportError) });
      executing.current.delete(review.operationId);
      return;
    }
    try {
      const receipt = await checkReceipt(review);
      if (receipt.status === "succeeded") {
        setOperation({ review, status: "succeeded",
          message: `Saved by the canonical institution command. Receipt: ${review.operationId}` });
        setDocumentSlug(review.documentSlug);
        setNotice("");
        if (review.command === "world.document.create") {
          // A Work outside the first 100 alphabetically sorted records must be
          // discoverable after creation rather than becoming a blank detail.
          const title = String(review.args.p_title ?? "");
          setSearchInput(title);
          setAppliedSearch(title);
        }
        await queryClient.invalidateQueries({ queryKey: ["tg4-organizer-documents", review.organizationSlug] });
        await queryClient.invalidateQueries({
          queryKey: ["tg4-organizer-document", review.organizationSlug, review.documentSlug],
        });
        setCreateTitle(""); setCreateSlug(""); setDraftTitle(""); setDraftText("");
        setDraftProvisions([]);
        originalDraft.current = worldDocumentDraftSignature({
          title: "", plainText: "", provisions: [],
        });
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
    } finally {
      executing.current.delete(review.operationId);
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
                <form className="flex flex-col gap-2 sm:flex-row sm:items-end"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (operation && ["review", "checking", "reconcile"].includes(operation.status)) return;
                    applySearch(searchInput);
                  }}>
                  <label className="block min-w-0 flex-1 space-y-1 text-sm">
                    Search title or legal text
                    <input type="search" className={fieldClass} maxLength={120}
                      value={searchInput} onChange={(event) => setSearchInput(event.target.value)}
                      placeholder="Find an institutional Work"
                      disabled={Boolean(operation && ["review", "checking", "reconcile"].includes(operation.status))} />
                  </label>
                  <button type="submit" className={secondaryClass}
                    disabled={Boolean(operation && ["review", "checking", "reconcile"].includes(operation.status))}>
                    Search
                  </button>
                  {(appliedSearch || searchInput) && (
                    <button type="button" className={secondaryClass}
                      onClick={() => {
                        if (appliedSearch && hasUnsavedDraftEdits && !confirmDiscard()) return;
                        applySearch("");
                        if (!appliedSearch) setDocumentSlug("");
                        setSearchInput("");
                      }}
                      disabled={Boolean(operation && ["review", "checking", "reconcile"].includes(operation.status))}>
                      Clear
                    </button>
                  )}
                </form>
                {appliedSearch && <p className="text-xs text-muted-foreground">
                  Showing authorized results for “{appliedSearch}”. This is a server-filtered search.
                </p>}
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
                  <p className="text-sm text-muted-foreground">
                    {appliedSearch ? "No authorized documents match this search." :
                      "No documents visible to your current identity in this institution."}
                  </p>
                )}
                {documents.data?.length === 100 && (
                  <p className="text-xs text-muted-foreground">Only the first 100 authorized matching Works are shown. Search for a more specific title or phrase to find others.</p>
                )}
              </Section>

              <Section title="Create a Work">
                {createAccess.isPending ? <p role="status" className="text-sm">Checking institutional editing authority…</p> :
                  createAccess.isError ? (
                    <div role="alert" className="space-y-2">
                      <p className="text-sm">Write permission could not be verified. Work creation is unavailable.</p>
                      <button className={secondaryClass} type="button" onClick={() => void createAccess.refetch()}>
                        Retry permission check
                      </button>
                    </div>
                  ) : !createAccess.data ? (
                    <p className="text-sm text-muted-foreground">
                      Your current account cannot create legal Works for this institution.
                      The server determines editing authority.
                    </p>
                  ) : <form className="space-y-3" onSubmit={reviewCreate}>
                  <label className="block space-y-1 text-sm">Official title
                    <input className={fieldClass} maxLength={180} required value={createTitle}
                      disabled={authoringLocked}
                      onChange={(e) => {
                        setCreateTitle(e.target.value);
                        if (!createSlug || createSlug === toWorldDocumentSlug(createTitle)) setCreateSlug(toWorldDocumentSlug(e.target.value));
                      }} />
                  </label>
                  <label className="block space-y-1 text-sm">Stable document identifier
                    <input className={fieldClass} required maxLength={90} pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      disabled={authoringLocked} value={createSlug} onChange={(e) => setCreateSlug(e.target.value)} />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1 text-sm">Type
                      <select className={fieldClass} value={kind} disabled={authoringLocked}
                        onChange={(e) => setKind(e.target.value as WorldDocumentKind)}>
                        {WORLD_DOCUMENT_KINDS.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
                      </select>
                    </label>
                    <label className="block space-y-1 text-sm">Audience
                      <select className={fieldClass} value={visibility} disabled={authoringLocked}
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
                </form>}
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
                  ) : snapshot.data.hasUnpublishedDraft ? (
                    <div className="space-y-4 border-l-2 border-primary pl-4">
                      <p className="font-semibold">An unpublished version already exists.</p>
                      <p className="text-sm text-muted-foreground">
                        Version {pendingDraft?.versionNumber} · {pendingDraft?.title}.
                        A second draft cannot be created from this workspace until the
                        current version is resolved through the governed lifecycle.
                      </p>
                      {pendingDraftDetails.isPending ? (
                        <p role="status" className="text-sm">Reading the exact pending version…</p>
                      ) : pendingDraftDetails.isError || !pendingDraftDetails.data?.version ? (
                        <div role="alert" className="space-y-2">
                          <p>Unpublished text is not available. Do not assume it is empty.</p>
                          <button type="button" className={secondaryClass}
                            onClick={() => void pendingDraftDetails.refetch()}>Retry version read</button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">
                            Read-only unpublished text · revision {pendingDraftDetails.data.version.revision}
                          </p>
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border/60 p-3 font-sans text-sm leading-6">
                            {pendingDraftDetails.data.version.plainText || "No plain-text body"}
                          </pre>
                          <p className="text-sm font-semibold">
                            {pendingDraftDetails.data.version.provisions.length} preserved structured provisions
                          </p>
                          <ul className="max-h-64 space-y-2 overflow-auto text-sm">
                            {pendingDraftDetails.data.version.provisions.slice(0, 20).map((row) => (
                              <li key={row.semanticKey}>
                                <span className="font-medium">{row.displayLabel || row.semanticKey}</span>
                                {row.heading ? ` · ${row.heading}` : ""}
                              </li>
                            ))}
                          </ul>
                          {pendingDraftDetails.data.version.provisions.length > 20 && (
                            <p className="text-xs text-muted-foreground">
                              Showing the first 20 provisions. No data has been modified.
                            </p>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Draft replacement is intentionally disabled until a canonical
                        read model includes the provenance fields required to preserve all legal content.
                      </p>
                    </div>
                  ) : snapshot.data.version &&
                      validateWorldDocumentProvisions(snapshot.data.version.provisions) ? (
                    <div role="alert" className="space-y-2">
                      <p>The source version cannot be safely edited within this workspace's
                        {MAX_WORLD_PROVISIONS_IN_EDITOR}-provision and per-article content limits.</p>
                      <p className="text-sm text-muted-foreground">
                        {validateWorldDocumentProvisions(snapshot.data.version.provisions)}
                        A new draft is blocked instead of accidentally discarding or truncating legal text.
                      </p>
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
                          disabled={authoringLocked} onChange={(e) => setDraftTitle(e.target.value)} />
                      </label>
                      <label className="block space-y-1 text-sm">Document plain-text body
                        <textarea className={fieldClass + " min-h-48 resize-y leading-6"} required={!draftProvisions.length} maxLength={100000}
                          value={draftText} disabled={authoringLocked} onChange={(e) => setDraftText(e.target.value)}
                          placeholder="Enter the document-level text. Article text lives in the structured provisions below." />
                      </label>
                      <WorldDocumentProvisionEditor
                        rows={draftProvisions}
                        onChange={setDraftProvisions}
                        disabled={authoringLocked}
                      />
                      <p className="text-xs leading-5 text-muted-foreground">
                        The new version inherits the source's structured content and persistent provision keys.
                        Removing an article excludes it from the new unpublished version but does not erase history.
                        Only the canonical server can publish legal text or change its effective date.
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
                  {operation.review.command === "world.document.version.create" && (
                    <details className="space-y-3 rounded-xl border border-border p-3">
                      <summary className="cursor-pointer text-sm font-semibold">
                        Inspect the complete outgoing legal draft
                      </summary>
                      <div className="space-y-3 pt-3">
                        <p className="text-xs font-semibold">Document-level text</p>
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 font-sans text-sm leading-6">
                          {String(operation.review.args.p_plain_text ?? "") || "No document-level text"}
                        </pre>
                        <p className="text-xs font-semibold">
                          Outgoing provisions (complete, including any omissions described above)
                        </p>
                        <ol className="max-h-80 space-y-3 overflow-auto rounded-lg bg-background p-3 text-sm">
                          {((operation.review.args.p_provisions as WorldProvisionCommandRow[] | undefined) ?? [])
                            .map((row) => (
                              <li key={row.semanticKey} className="space-y-1 border-b border-border/50 pb-2">
                                <p className="font-semibold">{row.displayLabel || row.semanticKey}</p>
                                <p className="break-all text-xs text-muted-foreground">
                                  {row.semanticKey} · {row.anchor} · {row.status}
                                  {row.parentSemanticKey ? ` · parent ${row.parentSemanticKey}` : ""}
                                </p>
                                {row.heading && <p>{row.heading}</p>}
                                <pre className="whitespace-pre-wrap break-words font-sans leading-6">
                                  {row.bodyPlainText || "No plain-text article body"}
                                </pre>
                                {Object.keys(row.bodyStructured).length > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Source structured metadata is preserved but not edited here.
                                  </p>
                                )}
                              </li>
                            ))}
                        </ol>
                      </div>
                    </details>
                  )}
                  {operation.status === "review" &&
                    operation.review.command === "world.document.version.create" && (
                    <label className="flex cursor-pointer items-start gap-3 text-sm">
                      <input type="checkbox" className="mt-1 size-4 shrink-0"
                        checked={reviewedFullText}
                        onChange={(event) => setReviewedFullText(event.target.checked)} />
                      <span>I have inspected the complete outgoing legal text,
                        article identities, omissions and draft-only consequences.</span>
                    </label>
                  )}
                  <p className="break-all text-xs text-muted-foreground">Operation ID: {operation.review.operationId}</p>
                  {operation.message && <p role="status" className="text-sm">{operation.message}</p>}
                  <div className="flex flex-wrap gap-2">
                    {operation.status === "review" && (
                      <>
                        <button type="button" className={buttonClass}
                          disabled={operation.review.command === "world.document.version.create" && !reviewedFullText}
                          onClick={() => void reconcile(true)}>Execute reviewed action</button>
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
