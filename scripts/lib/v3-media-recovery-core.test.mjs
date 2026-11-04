import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { buildR2CandidatePlan } from './v3-public-media-r2-plan.mjs';
import {
  SOURCE_PROJECT, DESTINATION_PROJECT, validateProjectPair, verifyBytes, sha256,
  stableJson, assertApprovedWrite, inventoryPair, transferVerifiedMissing,
  recoveryDigest, proposeReferenceReconciliation, detectMime, assertAssetClearance,
  buildSourceReferenceIndex,
} from './v3-media-recovery-core.mjs';

const png = Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4,5]);
const jpeg = Buffer.from([255,216,255,1,2,3,4,5]);
class FakeStorage {
  constructor(buckets, objects = {}, options = {}) {
    this.buckets = Object.fromEntries(buckets.map(([id, pub]) => [id, { id, public: pub }]));
    this.objects = Object.fromEntries(Object.entries(objects).map(([b, files]) =>
      [b, Object.fromEntries(Object.entries(files).map(([p,v]) => [p, Buffer.from(v)]))]));
    this.ambiguousUploads = options.ambiguousUploads || false;
    this.failDownloads = options.failDownloads || false;
    this.writes = 0;
  }
  storage = {
    listBuckets: async () => ({ data: Object.values(this.buckets), error: null }),
    from: bucket => ({
      list: async (prefix = '', opts = {}) => {
        const files = new Map();
        for (const path of Object.keys(this.objects[bucket] || {})) {
          if (prefix && !path.startsWith(prefix + '/')) continue;
          const relative = prefix ? path.slice(prefix.length + 1) : path;
          const segment = relative.split('/')[0];
          if (relative.includes('/')) files.set(segment, { name: segment, id: null });
          else files.set(segment, {
            name: segment, id: 'id-' + segment, created_at: '2026-08-13',
            metadata: { mimetype: detectMime(this.objects[bucket][path]),
              size: this.objects[bucket][path].length },
          });
        }
        return { data: [...files.values()].sort((a,b) => a.name.localeCompare(b.name))
          .slice(opts.offset || 0, (opts.offset || 0) + (opts.limit || 100)), error: null };
      },
      download: async path => {
        if (this.failDownloads || !this.objects[bucket]?.[path]) {
          return { data: null, error: new Error('Not found') };
        }
        return { data: new Blob([this.objects[bucket][path]], {
          type: detectMime(this.objects[bucket][path]),
        }), error: null };
      },
      upload: async (path, blob, options) => {
        this.writes++;
        assert.equal(options.upsert, false);
        if (this.objects[bucket]?.[path]) return { error: new Error('Already exists') };
        (this.objects[bucket] ||= {})[path] = Buffer.from(await blob.arrayBuffer());
        return { error: this.ambiguousUploads ? new Error('Connection dropped') : null };
      },
    }),
  };
}
const buckets = [
  ['country-media', true], ['edition-artwork', true], ['country-fonts', true],
  ['beta-feedback', false], ['integrity-evidence', false],
];
function pair(src = { 'country-media': { 'a/b.png': png } }, dst = {}, options = {}) {
  return { source: new FakeStorage(buckets, src),
    destination: new FakeStorage(buckets, dst, options) };
}
function approval(digest, key, overrides = {}) {
  const unsigned = {
    source_project: SOURCE_PROJECT, destination_project: DESTINATION_PROJECT,
    manifest_sha256: digest, scope: 'storage-only-non-overwrite',
    operator: 'recovery-operator', change_ticket: 'MANUAL-0001',
    local_rehearsal_sha: 'f'.repeat(40), expires_at: '2030-01-01T00:00:00Z',
    reviewed_assets: [], ...overrides,
  };
  return { ...unsigned,
    signature: createHmac('sha256', key).update(stableJson(unsigned)).digest('hex') };
}
test('project direction and identical-project rejection', () => {
  assert.doesNotThrow(() => validateProjectPair(SOURCE_PROJECT, DESTINATION_PROJECT));
  assert.throws(() => validateProjectPair(SOURCE_PROJECT, SOURCE_PROJECT));
  assert.throws(() => validateProjectPair(DESTINATION_PROJECT, SOURCE_PROJECT));
  assert.throws(() => validateProjectPair('another', DESTINATION_PROJECT));
});
test('actual byte hash, size and MIME verified', () => {
  assert.equal(verifyBytes(png, { size: png.length, mimetype: 'image/png' }).sha256, sha256(png));
  assert.throws(() => verifyBytes(png, { size: 500, mimetype: 'image/png' }), /byte size mismatch/);
  assert.throws(() => verifyBytes(png, { size: png.length, mimetype: 'image/jpeg' }), /MIME/);
  assert.throws(() => verifyBytes(Buffer.alloc(0)), /byte size/);
});
test('dry-run inventory has zero writes even with private assets', async () => {
  const { source, destination } = pair({
    'country-media': { 'a/b.png': png }, 'beta-feedback': { 'private/evidence.jpeg': jpeg },
  });
  const inventory = await inventoryPair({ source, destination });
  assert.equal(inventory.entries.length, 2);
  assert.equal(inventory.entries.filter(e => e.status === 'missing_destination').length, 2);
  assert.equal(inventory.entries.find(e => e.bucket === 'beta-feedback').private, true);
  assert.equal(inventory.entries.find(e => e.bucket === 'country-media').source_sha256, sha256(png));
  assert.equal(destination.writes, 0);
});
test('identical existing object is verified and not overwritten', async () => {
  const { source, destination } = pair({ 'country-media': { 'a/b.png': png } },
    { 'country-media': { 'a/b.png': png } });
  const inventory = await inventoryPair({ source, destination });
  assert.equal(inventory.entries[0].status, 'identical');
  assert.equal(destination.writes, 0);
});
test('conflicting same-key bytes are blocked', async () => {
  const { source, destination } = pair({ 'country-media': { 'a/b.png': png } },
    { 'country-media': { 'a/b.png': jpeg } });
  const inventory = await inventoryPair({ source, destination });
  assert.equal(inventory.entries[0].status, 'collision');
  assert.deepEqual(await transferVerifiedMissing({
    source, destination, entry: inventory.entries[0],
  }), { status: 'skipped', reason: 'collision' });
  assert.equal(destination.writes, 0);
});
test('physically unavailable source is not considered recoverable', async () => {
  const { source, destination } = pair();
  source.failDownloads = true;
  const inventory = await inventoryPair({ source, destination });
  assert.equal(inventory.entries[0].status, 'unavailable_source');
  assert.equal(destination.writes, 0);
});
test('private bucket policy mismatch fails closed', async () => {
  const { source, destination } = pair();
  destination.buckets['beta-feedback'].public = true;
  await assert.rejects(() => inventoryPair({ source, destination }), /privacy mismatch/);
});
test('verified private asset does not make bucket public', async () => {
  const { source, destination } = pair({ 'beta-feedback': { 'feedback/a.jpeg': jpeg } });
  const inventory = await inventoryPair({ source, destination });
  const checkpoints = [];
  const result = await transferVerifiedMissing({ source, destination,
    entry: inventory.entries[0], onVerified: r => checkpoints.push(r) });
  assert.equal(result.status, 'transferred');
  assert.equal(destination.buckets['beta-feedback'].public, false);
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0].sha256, sha256(jpeg));
});
test('missing destination bucket is not automatically created', async () => {
  const { source, destination } = pair();
  delete destination.buckets['country-media'];
  const inventory = await inventoryPair({ source, destination });
  assert.equal(inventory.entries[0].status, 'missing_bucket');
  assert.equal(destination.writes, 0);
});
test('ambiguous upload response requires verified readback', async () => {
  const { source, destination } = pair(
    { 'country-media': { 'a/b.png': png } }, {}, { ambiguousUploads: true });
  const inventory = await inventoryPair({ source, destination });
  const outcome = await transferVerifiedMissing({ source, destination, entry: inventory.entries[0] });
  assert.equal(outcome.status, 'verified_after_ambiguous_upload');
  assert.equal(destination.writes, 1);
});
test('recovered object is safely identified on resume without second write', async () => {
  const { source, destination } = pair();
  const inventory = await inventoryPair({ source, destination });
  assert.equal((await transferVerifiedMissing({
    source, destination, entry: inventory.entries[0],
  })).status, 'transferred');
  assert.equal((await transferVerifiedMissing({
    source, destination, entry: inventory.entries[0],
  })).status, 'identical');
  assert.equal(destination.writes, 1);
});
test('partial failure cannot generate a verified checkpoint', async () => {
  const { source, destination } = pair();
  const inventory = await inventoryPair({ source, destination });
  destination.failDownloads = true;
  const checkpoints = [];
  const actual = await transferVerifiedMissing({ source, destination, entry: inventory.entries[0],
    onVerified: r => checkpoints.push(r) });
  assert.equal(actual.status, 'unverified_upload');
  assert.equal(checkpoints.length, 0);
});
test('production writes require signed scoped nonexpired approval', () => {
  const digest = 'a'.repeat(64), key = 'a-very-long-separate-operator-approval-key';
  const approved = approval(digest, key);
  const params = { approval: approved, key, digest, manualAck: 'APPROVE_REAL_PRODUCTION_STORAGE_WRITE',
    ci: false, now: new Date('2026-11-04') };
  assert.doesNotThrow(() => assertApprovedWrite(params));
  assert.throws(() => assertApprovedWrite({ ...params, ci: true }), /CI/);
  assert.throws(() => assertApprovedWrite({ ...params, manualAck: 'NO' }), /acknowledgment/);
  assert.throws(() => assertApprovedWrite({ ...params, digest: 'b'.repeat(64) }), /mismatched/);
  assert.throws(() => assertApprovedWrite({
    ...params, approval: { ...approved, operator: 'attacker' },
  }), /signature/);
  assert.throws(() => assertApprovedWrite({ ...params, now: new Date('2031-01-01') }), /expired/);
});
test('missing references produce proposals, never automatic database writes', () => {
  const entry = { bucket: 'country-media', path: 'abc/image.png',
    source_sha256: sha256(png), status: 'identical' };
  const oldRows = { country_themes: [{ country_id: 'country-1',
    background_image_storage_path: 'abc/image.png' }] };
  const missing = proposeReferenceReconciliation({ oldRows,
    currentRows: { country_themes: [{ country_id: 'country-1',
      background_image_storage_path: null }] }, verifiedEntries: [entry] });
  assert.equal(missing[0].status, 'missing_reference');
  assert.equal(missing[0].action, 'manual_canonical_admin_recovery_review');
  const conflicting = proposeReferenceReconciliation({ oldRows,
    currentRows: { country_themes: [{ country_id: 'country-1',
      background_image_storage_path: 'new/current.png' }] }, verifiedEntries: [entry] });
  assert.equal(conflicting[0].status, 'conflicting_reference');
  assert.equal(conflicting[0].action, 'none');
});
test('historical identities use country AND edition key', () => {
  const entry = { bucket: 'country-media', path: 'archive/old.png',
    source_sha256: sha256(png), status: 'identical' };
  const oldRows = { country_edition_identities: [{
    country_id: 'country-a', edition_id: 'edition-19', flag_image: 'archive/old.png',
  }] };
  const currentRows = { country_edition_identities: [{
    country_id: 'country-a', edition_id: 'edition-20', flag_image: 'archive/new.png',
  }] };
  const proposals = proposeReferenceReconciliation({ oldRows, currentRows, verifiedEntries: [entry] });
  assert.equal(proposals[0].status, 'missing_entity');
  assert.deepEqual(proposals[0].canonical_key, { country_id: 'country-a', edition_id: 'edition-19' });
});
test('manifest digest binds actual file identity and status', () => {
  const input = [{ bucket: 'country-media', path: 'a.png',
    source_sha256: 'x', source_bytes: 10, status: 'missing_destination' }];
  assert.notEqual(recoveryDigest(input), recoveryDigest([{ ...input[0], source_sha256: 'y' }]));
  assert.notEqual(recoveryDigest(input), recoveryDigest([{ ...input[0], status: 'collision' }]));
});


test('public object migration requires canonical publication plus media validation clearance', () => {
  const entry = { bucket: 'country-media', path: 'country/background.png',
    private: false, source_sha256: sha256(png), source_mime: 'image/png',
    source_bytes: png.length };
  const identity = entry.bucket + '/' + entry.path + '#' + entry.source_sha256;
  assert.throws(() => assertAssetClearance(entry, {}), /per-asset clearance/);
  assert.throws(() => assertAssetClearance(entry, { asset_clearances: [
    { identity, visibility: 'already_published' },
  ] }), /publication and media validation/);
  const valid = { identity, visibility: 'already_published',
    canonical_subject_id: 'country-uuid', publication_evidence_id: 'publication-receipt',
    validation_evidence_id: 'media-validation-receipt' };
  assert.equal(assertAssetClearance(entry, { asset_clearances: [valid] }), identity);
  assert.throws(() => assertAssetClearance(entry, { asset_clearances: [valid, valid] }),
    /duplicate per-asset/);
});
test('private recovery must retain private classification and cannot masquerade as public', () => {
  const entry = { bucket: 'beta-feedback', path: 'private/feedback.jpeg',
    private: true, source_sha256: sha256(jpeg) };
  const identity = entry.bucket + '/' + entry.path + '#' + entry.source_sha256;
  const clearance = { identity, visibility: 'retain_private' };
  assert.equal(assertAssetClearance(entry, { asset_clearances: [clearance] }), identity);
  assert.throws(() => assertAssetClearance({ ...entry, private: false },
    { asset_clearances: [clearance] }), /private visibility/);
  assert.throws(() => assertAssetClearance(entry, { asset_clearances: [
    { identity, visibility: 'already_published' },
  ] }), /private visibility/);
});
test('unapproved buckets fail closed even with signed asset-like evidence', () => {
  const entry = { bucket: 'integrity-evidence', path: 'sealed/case.pdf',
    private: true, source_sha256: sha256(jpeg) };
  assert.throws(() => assertAssetClearance(entry, { asset_clearances: [{
    identity: 'integrity-evidence/sealed/case.pdf#' + entry.source_sha256,
    visibility: 'retain_private',
  }] }), /Bucket not approved/);
});
test('additional historical media owners produce review-only reference evidence', () => {
  const entry = { bucket: 'country-media', path: 'flags/archive.png',
    source_sha256: sha256(png), status: 'identical' };
  const oldRows = {
    contest_entities: [{ id: 'historical-entity', flag_image: 'flags/archive.png' }],
    voters: [{ id: 'voter-entity', flag_image: 'flags/archive.png' }],
    country_profile_sections: [{ id: 'profile-section', image_url: 'flags/archive.png' }],
  };
  const rows = proposeReferenceReconciliation({ oldRows,
    currentRows: {
      contest_entities: [{ id: 'historical-entity', flag_image: null }],
      voters: [{ id: 'voter-entity', flag_image: 'flags/new.png' }],
      country_profile_sections: [{ id: 'profile-section', image_url: null }],
    },
    verifiedEntries: [entry],
  });
  assert.equal(rows.length, 3);
  assert.equal(rows.find(x => x.table === 'contest_entities').status, 'missing_reference');
  assert.equal(rows.find(x => x.table === 'voters').status, 'conflicting_reference');
  assert.equal(rows.find(x => x.table === 'country_profile_sections').status, 'missing_reference');
  assert.ok(rows.every(x => x.action !== 'write_database_row'));
});

test('R2 preparation excludes private and unpublished files and never creates delivery permission', () => {
  const digest = sha256(png);
  const publicEntry = { bucket: 'country-media', path: 'country/photo.png',
    source_sha256: digest, destination_sha256: digest, source_bytes: png.length,
    source_mime: 'image/png', status: 'identical', private: false };
  const privateEntry = { ...publicEntry, bucket: 'beta-feedback', private: true,
    path: 'feedback/private.png' };
  const approval = { asset_clearances: [{ identity: publicEntry.bucket + '/' +
    publicEntry.path + '#' + digest, visibility: 'already_published',
    canonical_subject_id: 'country-a',
    publication_evidence_id: 'canonical-published-receipt',
    validation_evidence_id: 'verified-media-receipt' }] };
  const plan = buildR2CandidatePlan({ entries: [publicEntry, privateEntry,
    { ...publicEntry, path: 'country/unpublished.png', status: 'missing_destination' }], approval });
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.mode, 'candidate-only-no-r2-write');
  assert.equal(plan.entries[0].ready_for_public_delivery, false);
  assert.equal(plan.entries[0].requires_server_published_projection, true);
  assert.ok(plan.entries[0].proposed_r2_key.includes(digest));
  assert.ok(!plan.entries[0].proposed_r2_key.includes('country/photo'));
});
test('R2 candidates reject mismatched hashes, unsupported formats and missing release proof', () => {
  const digest = sha256(png);
  const entry = { bucket: 'edition-artwork', path: 'cover.png', source_sha256: digest,
    destination_sha256: digest, source_bytes: png.length, source_mime: 'image/png',
    status: 'transferred', private: false };
  const identity = entry.bucket + '/' + entry.path + '#' + digest;
  const valid = { asset_clearances: [{ identity, visibility: 'already_published',
    canonical_subject_id: 'edition-id', publication_evidence_id: 'published-receipt',
    validation_evidence_id: 'validation-receipt' }] };
  assert.throws(() => buildR2CandidatePlan({ entries: [entry], approval: {} }), /clearances/);
  assert.throws(() => buildR2CandidatePlan({ entries: [entry], approval: {
    asset_clearances: [] } }), /clearance/);
  assert.throws(() => buildR2CandidatePlan({ entries: [{
    ...entry, destination_sha256: 'b'.repeat(64) }], approval: valid }), /mismatch/);
  assert.throws(() => buildR2CandidatePlan({ entries: [{
    ...entry, source_mime: 'application/pdf' }], approval: valid }), /MIME/);
});
test('R2 candidate object key changes when source content changes', () => {
  const make = buffer => {
    const digest = sha256(buffer);
    const entry = { bucket: 'country-media', path: 'source.png',
      source_sha256: digest, destination_sha256: digest, source_bytes: buffer.length,
      source_mime: 'image/png', status: 'identical', private: false };
    const approval = { asset_clearances: [{ identity: 'country-media/source.png#' + digest,
      visibility: 'already_published', canonical_subject_id: 'c1',
      publication_evidence_id: 'p1', validation_evidence_id: 'v1' }] };
    return buildR2CandidatePlan({ entries: [entry], approval }).entries[0].proposed_r2_key;
  };
  assert.notEqual(make(png), make(Buffer.concat([png, Buffer.from([1])])));
});

test('pretransfer inventory records scalar and nested ownership without authorizing DB restoration', () => {
  const entry = { bucket: 'country-media', path: 'a/background.png', source_id: 'storage-id',
    source_sha256: sha256(png), status: 'missing_destination', private: false };
  const indexed = buildSourceReferenceIndex({ entries: [entry], oldRows: {
    country_themes: [{ country_id: 'country-id',
      background_image_storage_path: 'a/background.png',
      design_v2: { hero: 'country-media/a/background.png' } }],
  }, currentRows: { country_themes: [{ country_id: 'country-id',
    background_image_storage_path: null }] } });
  assert.equal(indexed[0].related_database_entities.length, 2);
  assert.equal(indexed[0].related_database_entities[0].destination_status, 'missing_reference');
  assert.equal(indexed[0].related_database_entities[0].action, 'manual_canonical_recovery_review_only');
  assert.equal(indexed[0].related_database_entities[1].match, 'embedded_candidate');
  assert.equal(indexed[0].reference_classification, 'referenced_or_candidate');
});
test('unmatched files are not automatically called orphaned or deleted', () => {
  const indexed = buildSourceReferenceIndex({ entries: [{
    bucket: 'country-media', path: 'archive/unreferenced.png', source_id: 'stored',
    private: false, status: 'missing_destination',
  }], oldRows: {}, currentRows: {} });
  assert.equal(indexed[0].related_database_entities.length, 0);
  assert.equal(indexed[0].reference_classification,
    'unmatched_in_surveyed_media_fields_not_proven_orphan');
});

test('public legacy media cannot bypass existing image type or five-MiB cap', () => {
  const entry = { bucket: 'country-media', path: 'country/image.png',
    private: false, source_sha256: sha256(png), source_mime: 'image/png',
    source_bytes: png.length };
  const identity = 'country-media/country/image.png#' + entry.source_sha256;
  const approval = { asset_clearances: [{ identity, visibility: 'already_published',
    canonical_subject_id: 'country', publication_evidence_id: 'published',
    validation_evidence_id: 'validated' }] };
  assert.equal(assertAssetClearance(entry, approval), identity);
  assert.throws(() => assertAssetClearance({ ...entry, source_mime: 'image/svg+xml' },
    approval), /MIME policy/);
  assert.throws(() => assertAssetClearance({ ...entry, source_bytes: 5 * 1024 * 1024 + 1 },
    approval), /validation ceiling/);
});
