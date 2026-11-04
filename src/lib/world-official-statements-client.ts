import { supabase } from "@/integrations/supabase/client";
import {
  WORLD_STATEMENT_PAGE_SIZE,
  normalizeWorldStatementId,
  normalizeWorldStatementSlug,
  normalizeWorldStatementVersion,
  parseWorldStatementDetail,
  parseWorldStatementFeed,
  parseWorldStatementHistory,
  parseWorldStatementManageContext,
  parseWorldStatementReceipt,
  type WorldStatementOperation,
} from "@/lib/world-official-statements";

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };
const rpcClient = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
};

/** The canonical read model is the TG9 security-definer RPC, never a table query. */
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await rpcClient.rpc(name, args);
  if (result.error) {
    // Errors can convey permission denial to the caller but never private
    // draft rows, request payloads, operation internals or person IDs.
    throw new Error(result.error.code === "42501"
      ? "Your account is not authorized for this institutional action."
      : "The official statement service is unavailable. Retry the same action.");
  }
  return result.data;
}

export async function listWorldOfficialStatements(organizationSlug: string, page: number) {
  const slug = normalizeWorldStatementSlug(organizationSlug);
  if (!Number.isSafeInteger(page) || page < 0 || page > 83) {
    throw new Error("Invalid statement page");
  }
  const offset = page * WORLD_STATEMENT_PAGE_SIZE;
  return parseWorldStatementFeed(await call("world_statement_feed_v1", {
    p_organization_slug: slug, p_offset: offset, p_limit: WORLD_STATEMENT_PAGE_SIZE,
  }), offset, slug);
}

export async function readWorldOfficialStatement(organizationSlug: string,
  statementId: string, version?: number | null) {
  const slug = normalizeWorldStatementSlug(organizationSlug);
  const id = normalizeWorldStatementId(statementId);
  const selectedVersion = normalizeWorldStatementVersion(version);
  return parseWorldStatementDetail(await call("world_statement_detail_v1", {
    p_statement_id: id, p_version_number: selectedVersion,
  }), id, slug, selectedVersion);
}

export async function listWorldStatementHistory(statementId: string, page: number) {
  const id = normalizeWorldStatementId(statementId);
  if (!Number.isSafeInteger(page) || page < 0 || page > 83) {
    throw new Error("Invalid statement history page");
  }
  const offset = page * WORLD_STATEMENT_PAGE_SIZE;
  return parseWorldStatementHistory(await call("world_statement_history_v1", {
    p_statement_id: id, p_offset: offset, p_limit: WORLD_STATEMENT_PAGE_SIZE,
  }), offset);
}

export async function readWorldStatementPublishingContext(organizationSlug: string) {
  const slug = normalizeWorldStatementSlug(organizationSlug);
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sign in with an authorized official account.");
  return parseWorldStatementManageContext(await call("world_statement_manage_context_v1", {
    p_organization_slug: slug,
  }), slug);
}

export async function publishWorldOfficialStatement(args: {
  organizationId: string;
  officeId: string | null;
  title: string;
  body: string;
  operation: WorldStatementOperation;
}) {
  if (!args.organizationId || !args.operation.operationId || !args.operation.idempotencyKey) {
    throw new Error("Missing publication identity");
  }
  return parseWorldStatementReceipt(await call("world_publish_statement_v1", {
    p_organization_id: args.organizationId,
    p_office_id: args.officeId,
    p_title: args.title,
    p_body: args.body,
    p_operation_id: args.operation.operationId,
    p_idempotency_key: args.operation.idempotencyKey,
  }));
}

export async function correctWorldOfficialStatement(args: {
  statementId: string;
  expectedRevision: number;
  title: string;
  body: string;
  correctionReason: string;
  operation: WorldStatementOperation;
}) {
  const id = normalizeWorldStatementId(args.statementId);
  if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 1) {
    throw new Error("Invalid correction version");
  }
  return parseWorldStatementReceipt(await call("world_correct_statement_v1", {
    p_statement_id: id,
    p_expected_revision: args.expectedRevision,
    p_title: args.title,
    p_body: args.body,
    p_reason: args.correctionReason,
    p_operation_id: args.operation.operationId,
    p_idempotency_key: args.operation.idempotencyKey,
  }));
}
