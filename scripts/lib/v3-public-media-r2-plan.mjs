import { assertAssetClearance, sha256 } from './v3-media-recovery-core.mjs';

const PUBLIC_BUCKETS = new Set(['country-media', 'edition-artwork']);
const MIME_SUFFIXES = Object.freeze({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
});

/**
 * Constructs a manual-review candidate for immutable R2 delivery.
 * Does not contact R2, create a public URL, or change publication state.
 * A live published-media projection, validation receipt and independent
 * Worker/privacy rollout remain mandatory before delivery.
 */
export function buildR2CandidatePlan({ entries, approval }) {
  if (!approval || !Array.isArray(approval.asset_clearances)) {
    throw new Error('Signed publication clearances are required for R2 candidates');
  }
  const rows = [];
  const keys = new Map();
  for (const entry of entries) {
    if (!PUBLIC_BUCKETS.has(entry.bucket)) continue;
    if (!['identical', 'transferred', 'verified_after_ambiguous_upload'].includes(entry.status)) {
      continue;
    }
    const bytes = entry.source_bytes;
    const digest = entry.source_sha256;
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || !/^[a-f0-9]{64}$/.test(digest || '')) {
      throw new Error('Cannot stage R2 candidate without real verified source bytes');
    }
    if (entry.destination_sha256 && entry.destination_sha256 !== digest) {
      throw new Error('R2 candidate destination bytes mismatch source hash');
    }
    const mime = entry.source_mime;
    if (!Object.hasOwn(MIME_SUFFIXES, mime)) {
      throw new Error('Unsupported R2 public image MIME');
    }
    assertAssetClearance(entry, approval);
    const key = 'public/media/v1/sha256/' + digest.slice(0, 2) + '/' + digest + MIME_SUFFIXES[mime];
    const previous = keys.get(key);
    if (previous && (previous.sha256 !== digest || previous.mime !== mime ||
        previous.bytes !== bytes)) {
      throw new Error('R2 content-address collision');
    }
    keys.set(key, { sha256: digest, mime, bytes });
    rows.push({
      source_bucket: entry.bucket,
      source_path: entry.path,
      content_sha256: digest,
      verified_bytes: bytes,
      content_type: mime,
      proposed_r2_key: key,
      immutable_cache_control: 'public, max-age=31536000, immutable',
      ready_for_public_delivery: false,
      requires_server_published_projection: true,
      requires_r2_readback: true,
      requires_worker_cache_privacy_verification: true,
    });
  }
  return {
    mode: 'candidate-only-no-r2-write',
    content_addressing: 'sha256',
    manifest_sha256: sha256(JSON.stringify(rows.map(x =>
      [x.proposed_r2_key, x.content_sha256, x.verified_bytes]).sort())),
    entries: rows,
  };
}
