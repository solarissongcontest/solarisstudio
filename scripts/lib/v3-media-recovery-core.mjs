import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SOURCE_PROJECT = 'oxtbskojiexkaspputvo';
export const DESTINATION_PROJECT = 'dkxmnvekiopyesuzggeu';
export const EXPECTED_BUCKET_PRIVACY = Object.freeze({
  'country-media': true,
  'edition-artwork': true,
  'country-fonts': true,
  'beta-feedback': false,
  'integrity-evidence': false,
  'solaris-upload-quarantine': false,
});
const PAGE_SIZE = 100;
const MAX_OBJECTS = 5000;
const MAX_BYTES = 25 * 1024 * 1024;

export function validateProjectPair(source, destination) {
  if (!source || !destination || source === destination) throw new Error('Source and destination must be different projects');
  if (source !== SOURCE_PROJECT || destination !== DESTINATION_PROJECT) {
    throw new Error('Recovery project direction or identity is not authorized');
  }
}
export function sha256(data) { return createHash('sha256').update(data).digest('hex'); }
export function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}
export function recoveryDigest(entries) {
  const normalized = entries.map(({ bucket, path, source_sha256, source_bytes, status, destination_sha256 }) =>
    ({ bucket, path, source_sha256, source_bytes, status, destination_sha256 }))
    .sort((a, b) => (a.bucket + '/' + a.path).localeCompare(b.bucket + '/' + b.path));
  return sha256(stableJson(normalized));
}
export function validatePath(path) {
  if (!path || typeof path !== 'string' || path.startsWith('/') || path.includes('\\') ||
      path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe storage path');
  return path;
}
export function detectMime(bytes) {
  const b = Buffer.from(bytes);
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (b.length >= 12 && b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP') return 'image/webp';
  if (b.length >= 5 && b.toString('ascii',0,5) === '%PDF-') return 'application/pdf';
  if (b.length >= 4 && b.toString('ascii',0,4) === 'wOF2') return 'font/woff2';
  if (b.length >= 4 && b.toString('ascii',0,4) === 'wOFF') return 'font/woff';
  if (b.length >= 4 && b.toString('ascii',0,4) === 'OTTO') return 'font/otf';
  if (b.length >= 4 && b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) return 'font/ttf';
  if (b.length && !b.includes(0)) return 'text/plain';
  return 'application/octet-stream';
}
export function verifyBytes(bytes, metadata = {}) {
  const b = Buffer.from(bytes);
  if (b.length === 0 || b.length > MAX_BYTES) throw new Error('Invalid source object byte size');
  if (metadata.size !== null && metadata.size !== undefined && Number(metadata.size) !== b.length) {
    throw new Error('Storage metadata byte size mismatch');
  }
  const declared = String(metadata.mimetype || metadata.contentType || metadata.mime || '').split(';')[0].trim().toLowerCase();
  const actual = detectMime(b);
  const accepted = actual === declared || (declared === 'image/jpg' && actual === 'image/jpeg') ||
    (actual === 'text/plain' && ['application/json','text/csv','text/plain'].includes(declared));
  if (declared && !accepted) throw new Error('Storage object MIME/signature mismatch');
  return { sha256: sha256(b), bytes: b.length, mime: declared || actual, signature_mime: actual };
}
async function retryRead(fn, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (error) { last = error; if (i < attempts - 1) await new Promise(r => setTimeout(r, (i + 1) * 250)); }
  }
  throw last;
}
export async function listBucketObjects(client, bucket) {
  const result = [];
  async function descend(prefix, depth) {
    if (depth > 20) throw new Error('Storage directory depth cap exceeded');
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data } = await retryRead(async () => {
        const response = await client.storage.from(bucket).list(prefix, {
          limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' },
        });
        if (response.error) throw response.error;
        return response;
      });
      if (!Array.isArray(data)) throw new Error('Invalid bucket listing response');
      for (const item of data) {
        const path = validatePath(prefix ? prefix + '/' + item.name : item.name);
        if (!item.id) await descend(path, depth + 1);
        else {
          result.push({ bucket, path, id: item.id, created_at: item.created_at || null, metadata: item.metadata || {} });
          if (result.length > MAX_OBJECTS) throw new Error('Storage inventory cap exceeded');
        }
      }
      if (data.length < PAGE_SIZE) break;
    }
  }
  await descend('', 0);
  const paths = new Set();
  for (const o of result) { if (paths.has(o.path)) throw new Error('Duplicate storage object key'); paths.add(o.path); }
  return result.sort((a,b) => a.path.localeCompare(b.path));
}
export async function getBuckets(client) {
  const { data, error } = await client.storage.listBuckets();
  if (error || !Array.isArray(data)) throw new Error('Cannot authenticate and inventory Storage buckets');
  const map = new Map(data.map(b => [b.id, b]));
  for (const [id, isPublic] of Object.entries(EXPECTED_BUCKET_PRIVACY)) {
    if (map.has(id) && map.get(id).public !== isPublic) throw new Error('Bucket privacy mismatch: ' + id);
  }
  return map;
}
export async function fetchVerifiedObject(client, entry) {
  if (Number(entry.metadata?.size) > MAX_BYTES) throw new Error('Source object exceeds bounded download ceiling');
  const { data } = await retryRead(async () => {
    const response = await client.storage.from(entry.bucket).download(entry.path);
    if (response.error) throw response.error;
    return response;
  });
  if (!data || typeof data.arrayBuffer !== 'function') throw new Error('Storage download returned no bytes');
  const content = Buffer.from(await data.arrayBuffer());
  return { content, ...verifyBytes(content, entry.metadata) };
}
export async function inventoryPair({ source, destination, sourceId = SOURCE_PROJECT, destinationId = DESTINATION_PROJECT }) {
  validateProjectPair(sourceId, destinationId);
  const sourceBuckets = await getBuckets(source);
  const destinationBuckets = await getBuckets(destination);
  const entries = [];
  const sourceNames = [...sourceBuckets.keys()].sort();
  for (const bucket of sourceNames) {
    const sourceObjects = await listBucketObjects(source, bucket);
    const destinationExists = destinationBuckets.has(bucket);
    const destinationObjects = destinationExists ? await listBucketObjects(destination, bucket) : [];
    const byPath = new Map(destinationObjects.map(o => [o.path, o]));
    for (const obj of sourceObjects) {
      const entry = { bucket, path: obj.path, source_id: obj.id, source_created_at: obj.created_at,
        private: sourceBuckets.get(bucket).public !== true, source_metadata: obj.metadata,
        source_sha256: null, source_bytes: null, source_mime: null, destination_sha256: null,
        destination_bytes: null, status: 'unavailable_source', destination_id: byPath.get(obj.path)?.id || null };
      try {
        const sourceBytes = await fetchVerifiedObject(source, obj);
        entry.source_sha256 = sourceBytes.sha256;
        entry.source_bytes = sourceBytes.bytes;
        entry.source_mime = sourceBytes.mime;
        if (!destinationExists) entry.status = 'missing_bucket';
        else if (!byPath.has(obj.path)) entry.status = 'missing_destination';
        else {
          try {
            const current = await fetchVerifiedObject(destination, byPath.get(obj.path));
            entry.destination_sha256 = current.sha256;
            entry.destination_bytes = current.bytes;
            entry.status = current.sha256 === sourceBytes.sha256 && current.bytes === sourceBytes.bytes ? 'identical' : 'collision';
          } catch { entry.status = 'unavailable_destination'; }
        }
      } catch { entry.status = 'unavailable_source'; }
      entries.push(entry);
    }
    for (const obj of destinationObjects) if (!sourceObjects.some(s => s.path === obj.path)) {
      entries.push({ bucket, path: obj.path, private: destinationBuckets.get(bucket).public !== true,
        destination_id: obj.id, status: 'destination_only', source_sha256: null, source_bytes: null, destination_sha256: null });
    }
  }
  for (const bucket of [...destinationBuckets.keys()].filter(id => !sourceBuckets.has(id)).sort()) {
    for (const obj of await listBucketObjects(destination, bucket)) {
      entries.push({ bucket, path: obj.path, private: destinationBuckets.get(bucket).public !== true,
        destination_id: obj.id, status: 'destination_only', source_sha256: null, source_bytes: null, destination_sha256: null });
    }
  }
  return { source_project: sourceId, destination_project: destinationId, source_buckets: sourceNames.map(id => ({
    id, public: sourceBuckets.get(id).public, destination_exists: destinationBuckets.has(id),
  })), destination_buckets: [...destinationBuckets.keys()].sort(), entries };
}
export function assertApprovedWrite({ approval, key, digest, now = new Date(), ci = process.env.CI,
  manualAck = process.env.SOLARIS_RECOVERY_PRODUCTION_WRITE_APPROVED }) {
  if (ci) throw new Error('Production recovery writes are forbidden in CI');
  if (manualAck !== 'APPROVE_REAL_PRODUCTION_STORAGE_WRITE') throw new Error('Missing explicit production write acknowledgment');
  if (!key || Buffer.byteLength(key) < 32) throw new Error('Missing protected approval signing key');
  if (!approval || !Array.isArray(approval.reviewed_assets) || approval.source_project !== SOURCE_PROJECT ||
      approval.destination_project !== DESTINATION_PROJECT || approval.manifest_sha256 !== digest ||
      approval.scope !== 'storage-only-non-overwrite' || !approval.operator || !approval.change_ticket ||
      !approval.local_rehearsal_sha || !approval.expires_at || new Date(approval.expires_at) <= now) {
    throw new Error('Invalid, expired or mismatched recovery authorization');
  }
  const { signature, ...unsigned } = approval;
  const expected = createHmac('sha256', key).update(stableJson(unsigned)).digest('hex');
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new Error('Recovery approval signature invalid');
  }
}
/** Legacy public bucket placement alone does not authorize publication in V3.
 * A protected signed change approval must contain existing canonical publication
 * and media-validation evidence for every public asset. Unknown buckets fail closed.
 */
export function assertAssetClearance(entry, approval) {
  const permitted = new Set(['country-media', 'edition-artwork', 'beta-feedback']);
  if (!permitted.has(entry.bucket)) throw new Error('Bucket not approved for this recovery operation');
  const identity = entry.bucket + '/' + validatePath(entry.path) + '#' + entry.source_sha256;
  const matching = (approval.asset_clearances || []).filter(a => a && a.identity === identity);
  if (matching.length !== 1) throw new Error('Missing or duplicate per-asset clearance');
  const clearance = matching[0];
  if (entry.bucket === 'beta-feedback') {
    if (entry.private !== true || clearance.visibility !== 'retain_private') {
      throw new Error('Private asset clearance must retain private visibility');
    }
  } else if (entry.private !== false || clearance.visibility !== 'already_published' ||
      typeof clearance.canonical_subject_id !== 'string' || !clearance.canonical_subject_id.trim() ||
      typeof clearance.publication_evidence_id !== 'string' || !clearance.publication_evidence_id.trim() ||
      typeof clearance.validation_evidence_id !== 'string' || !clearance.validation_evidence_id.trim()) {
    throw new Error('Public restore requires existing canonical publication and media validation evidence');
  }
  return identity;
}

export async function transferVerifiedMissing({ source, destination, entry, onVerified }) {
  if (entry.status !== 'missing_destination') return { status: 'skipped', reason: entry.status };
  validatePath(entry.path);
  const obj = { bucket: entry.bucket, path: entry.path, metadata: entry.source_metadata };
  const original = await fetchVerifiedObject(source, obj);
  if (original.sha256 !== entry.source_sha256 || original.bytes !== entry.source_bytes) return { status: 'source_changed' };
  const parts = entry.path.split('/');
  const folder = parts.slice(0,-1).join('/');
  const listing = await destination.storage.from(entry.bucket).list(folder, { limit: 1000 });
  if (listing.error || !Array.isArray(listing.data)) throw new Error('Cannot safely check destination path');
  if (listing.data.some(o => o.name === parts.at(-1) && o.id)) {
    const actual = await fetchVerifiedObject(destination, { ...obj, metadata: {} });
    return actual.sha256 === original.sha256 && actual.bytes === original.bytes
      ? { status: 'identical' } : { status: 'collision' };
  }
  const body = new Blob([original.content], { type: original.mime });
  const { error } = await destination.storage.from(entry.bucket).upload(entry.path, body, {
    upsert: false, contentType: original.mime, cacheControl: '0',
  });
  let verified;
  try { verified = await fetchVerifiedObject(destination, { ...obj, metadata: {} }); }
  catch { return { status: 'unverified_upload', upload_error: Boolean(error) }; }
  if (verified.sha256 !== original.sha256 || verified.bytes !== original.bytes) return { status: 'collision' };
  await onVerified?.({ bucket: entry.bucket, path: entry.path, sha256: verified.sha256,
    bytes: verified.bytes, status: 'verified', recovered_at: new Date().toISOString() });
  return { status: error ? 'verified_after_ambiguous_upload' : 'transferred' };
}
export const REFERENCE_TABLES = Object.freeze({
  country_media: { key: ['id'], fields: ['storage_path','public_url'], bucket: 'country-media' },
  country_themes: { key: ['country_id'], fields: ['background_image_storage_path','background_image_url'], evidenceFields: ['design_v2'], bucket: 'country-media' },
  editions: { key: ['id'], fields: ['artwork_storage_path','artwork_url','logo'], evidenceFields: ['design_config'], bucket: 'edition-artwork' },
  countries: { key: ['id'], fields: ['flag_image'], bucket: 'country-media' },
  country_edition_identities: { key: ['country_id','edition_id'], fields: ['flag_image'], bucket: 'country-media' },
  country_profile_sections: { key: ['id'], fields: ['image_url'], evidenceFields: ['content_json','body'], bucket: 'country-media' },
  contest_entities: { key: ['id'], fields: ['flag_image'], bucket: 'country-media' },
  voters: { key: ['id'], fields: ['flag_image'], bucket: 'country-media' },
});
export function relatedObject(value, bucket, path) {
  if (typeof value !== 'string' || !value) return false;
  if (value === path || value === bucket + '/' + path) return true;
  try { return new URL(value).pathname.endsWith('/storage/v1/object/public/' + bucket + '/' + path); }
  catch { return false; }
}
/**
 * Per-object source reference inventory. Never treats a missing destination row
 * as permission to insert it. Scalar matches are deterministic; embedded
 * JSON/markdown matches are candidates for manual review only.
 */
export function buildSourceReferenceIndex({ entries, oldRows, currentRows }) {
  return entries.map(entry => {
    const references = [];
    for (const [table, cfg] of Object.entries(REFERENCE_TABLES)) {
      if (entry.bucket !== cfg.bucket || !entry.source_id) continue;
      const target = new Map((currentRows[table] || []).map(row =>
        [stableJson(cfg.key.map(k => row[k])), row]));
      for (const original of oldRows[table] || []) {
        const keyValues = cfg.key.map(k => original[k]);
        const existing = target.get(stableJson(keyValues));
        const canonical_key = Object.fromEntries(cfg.key.map((k, i) => [k, keyValues[i]]));
        for (const field of cfg.fields) {
          if (!relatedObject(original[field], entry.bucket, entry.path)) continue;
          const destinationStatus = !existing ? 'missing_entity'
            : !existing[field] ? 'missing_reference'
            : existing[field] === original[field] ? 'identical_reference'
            : 'conflicting_reference';
          references.push({ table, field, canonical_key,
            match: 'exact_scalar_or_public_storage_url', destination_status: destinationStatus,
            action: 'manual_canonical_recovery_review_only' });
        }
        for (const field of cfg.evidenceFields || []) {
          const val = original[field];
          const serialized = typeof val === 'string' ? val : val == null ? '' : JSON.stringify(val);
          if (!serialized || !serialized.includes(entry.path)) continue;
          references.push({ table, field, canonical_key, match: 'embedded_candidate',
            destination_status: 'requires_nested_content_review',
            action: 'manual_canonical_recovery_review_only' });
        }
      }
    }
    return { ...entry, related_database_entities: references,
      reference_classification: entry.private ? 'sensitive_private_asset'
        : references.length ? 'referenced_or_candidate'
        : 'unmatched_in_surveyed_media_fields_not_proven_orphan' };
  });
}

export function proposeReferenceReconciliation({ oldRows, currentRows, verifiedEntries }) {
  const evidence = [];
  const verified = verifiedEntries.filter(e => ['identical','transferred','verified_after_ambiguous_upload'].includes(e.status));
  for (const [table, cfg] of Object.entries(REFERENCE_TABLES)) {
    const byKey = new Map((currentRows[table] || []).map(row => [stableJson(cfg.key.map(k => row[k])), row]));
    for (const original of oldRows[table] || []) for (const field of cfg.fields) {
      const value = original[field];
      if (!value) continue;
      const asset = verified.find(e => e.bucket === cfg.bucket && relatedObject(value, e.bucket, e.path));
      if (!asset) continue;
      const canonical_key = Object.fromEntries(cfg.key.map(k => [k, original[k]]));
      const current = byKey.get(stableJson(cfg.key.map(k => original[k])));
      let status = 'missing_entity';
      if (current) status = !current[field] ? 'missing_reference'
        : current[field] === value ? 'identical_reference' : 'conflicting_reference';
      evidence.push({ table, field, canonical_key,
        asset: { bucket: asset.bucket, path: asset.path, sha256: asset.source_sha256 }, status,
        action: ['missing_reference','missing_entity'].includes(status) ? 'manual_canonical_admin_recovery_review' : 'none' });
    }
  }
  return evidence;
}
