import { supabase } from '@/integrations/supabase/client';
import type {
  Studio2MediaAssetReview,
  Studio2MediaReviewRequest,
} from '@/lib/studio2-media-assets';
import type { MediaAssetType } from '@/lib/media-asset-vault';

export type Studio2MediaReviewReceipt = {
  ok: true;
  operationId: string;
  receiptId: string;
  editionId: string;
  reviews: Studio2MediaAssetReview[];
  replayed: boolean;
  serverTime: string;
};

type RpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

type Obj = Record<string, unknown>;
const rpcClient = supabase as unknown as RpcClient;

function object(value: unknown, label: string): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value as Obj;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function mapReview(value: unknown, editionId: string): Studio2MediaAssetReview {
  const row = object(value, 'media review receipt row');
  const decision = row.decision;
  if (decision !== 'approved' && decision !== 'invalid') {
    throw new Error('Solaris returned an invalid media review decision.');
  }
  const returnedEditionId = text(row.editionId, 'media review edition id');
  if (returnedEditionId !== editionId) {
    throw new Error('Solaris returned Media Review evidence outside the requested edition.');
  }
  return {
    id: text(row.id, 'media review id'),
    editionId: returnedEditionId,
    assetKey: text(row.assetKey, 'media asset key'),
    assetType: text(row.assetType, 'media asset type') as MediaAssetType,
    countryId: nullableText(row.countryId),
    entryId: nullableText(row.entryId),
    sourceFingerprint: text(row.sourceFingerprint, 'media source fingerprint'),
    decision,
    reason: typeof row.reason === 'string' ? row.reason : '',
    reviewedBy: text(row.reviewedBy, 'media reviewer id'),
    reviewedByName: nullableText(row.reviewedByName),
    reviewedAt: text(row.reviewedAt, 'media review time'),
    supersededAt: nullableText(row.supersededAt),
  };
}

function reviews(value: unknown, editionId: string): Studio2MediaAssetReview[] {
  if (!Array.isArray(value) || value.length < 1) {
    throw new Error('Solaris returned no canonical Media Review evidence.');
  }
  return value.map((row) => mapReview(row, editionId));
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpcClient.rpc(name, args);
  if (error) {
    const failure = new Error(error.message || `Solaris RPC failed: ${name}`);
    if (error.code) Object.assign(failure, { code: error.code });
    throw failure;
  }
  return data;
}

function parseReceipt(
  value: unknown,
  expected: { operationId: string; editionId: string },
): Studio2MediaReviewReceipt {
  const row = object(value, 'Media Review receipt');
  const operationId = text(row.operationId, 'Media Review operation id');
  const receiptId = text(row.receiptId, 'Media Review receipt id');
  const editionId = text(row.editionId, 'Media Review receipt edition');
  if (
    operationId !== expected.operationId
    || receiptId !== expected.operationId
    || editionId !== expected.editionId
  ) {
    throw new Error('Solaris returned a receipt for a different Media Review operation.');
  }
  return {
    ok: true,
    operationId,
    receiptId,
    editionId,
    reviews: reviews(row.reviews, editionId),
    replayed: row.replayed === true,
    serverTime: text(row.serverTime, 'Media Review server time'),
  };
}

async function reconcileMediaReview(
  operationId: string,
  editionId: string,
): Promise<Studio2MediaReviewReceipt | null> {
  try {
    const reconciliation = object(
      await rpc('studio2_reconcile_operation', { p_operation_id: operationId }),
      'Media Review reconciliation',
    );
    if (
      reconciliation.operationId !== operationId
      || reconciliation.command !== 'media.review'
      || reconciliation.status !== 'succeeded'
    ) {
      return null;
    }
    return {
      ok: true,
      operationId,
      receiptId: operationId,
      editionId,
      reviews: reviews(reconciliation.result, editionId),
      replayed: true,
      serverTime: typeof reconciliation.completedAt === 'string'
        ? reconciliation.completedAt
        : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function createMediaReviewOperationIdentity(): {
  operationId: string;
  idempotencyKey: string;
} {
  const operationId = crypto.randomUUID();
  return {
    operationId,
    idempotencyKey: `media-review:${operationId}`,
  };
}

export async function reviewStudio2MediaAssetsV3(input: {
  editionId: string;
  reviews: readonly Studio2MediaReviewRequest[];
  reason: string;
  operationId: string;
  idempotencyKey: string;
}): Promise<Studio2MediaReviewReceipt> {
  const reason = input.reason.trim();
  if (!input.editionId) throw new Error('Edition is required.');
  if (!input.operationId || !input.idempotencyKey.trim()) {
    throw new Error('Media Review operation identity is required.');
  }
  if (!input.reviews.length) throw new Error('Select at least one media asset.');
  if (reason.length < 5) {
    throw new Error('A review reason of at least 5 characters is required.');
  }
  if (input.reviews.some((review) => !review.sourceFingerprint.trim())) {
    throw new Error('Only uploaded media can be reviewed.');
  }

  try {
    return parseReceipt(
      await rpc('studio2_review_media_assets_v3', {
        p_edition_id: input.editionId,
        p_reviews: input.reviews,
        p_reason: reason,
        p_operation_id: input.operationId,
        p_idempotency_key: input.idempotencyKey,
      }),
      input,
    );
  } catch (error) {
    const recovered = await reconcileMediaReview(input.operationId, input.editionId);
    if (recovered) return recovered;
    throw error;
  }
}
