import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const nav = source('src/components/admin/admin-navigation.ts');
const route = source('src/routes/_authenticated/admin/media-assets.tsx');
const service = source('src/lib/studio2-media-assets.ts');
const vault = source('src/lib/media-asset-vault.ts');
const migration = source('supabase/migrations/20260912143500_studio2_media_asset_operations.sql');

describe('Studio 2 Phase 9 media and asset operations', () => {
  it('adds one organizer media operations surface and reuses the canonical cockpit', () => {
    expect(nav).toContain('"Media assets",');
    expect(nav).toContain('"/admin/media-assets"');
    expect(route).toContain("createFileRoute('/_authenticated/admin/media-assets')");
    expect(route).toContain('loadStudio2CountryCockpit');
    expect(route).toContain('buildStudio2MediaAssetInventory');
    expect(route).toContain('Bulk review');
    expect(route).toContain('All asset classes');
    expect(route).toContain('All countries');
  });

  it('keeps validation and lifecycle derivation out of React', () => {
    expect(service).toContain('validateStudio2MediaAssetSource');
    expect(service).toContain('resolveStudio2MediaAssetState');
    expect(service).toContain("'required'");
    expect(service).toContain("'missing'");
    expect(service).toContain("'uploaded'");
    expect(service).toContain("'processing'");
    expect(service).toContain("'valid'");
    expect(service).toContain("'invalid'");
    expect(service).toContain("'superseded'");
    expect(service).toContain("'approved'");
    expect(route).not.toContain('new URL(');
    expect(route).not.toContain('extensionFromUrl');
  });

  it('reuses the existing media asset vocabulary and does not create a second upload store', () => {
    expect(service).toContain("from './media-asset-vault'");
    expect(vault).toContain("'artist_photo'");
    expect(vault).toContain("'cover_artwork'");
    expect(vault).toContain("'audio_master'");
    expect(vault).toContain("'performance_video'");
    expect(vault).toContain("'postcard'");
    expect(vault).toContain("'press_image'");
    expect(vault).toContain("'broadcast_graphic'");
    expect(migration).toContain('create table if not exists public.studio2_media_asset_reviews');
    expect(migration).not.toContain('create table if not exists public.studio2_media_assets');
    expect(migration).not.toContain('create table if not exists public.studio2_media_asset_versions');
  });

  it('allows browser access only through narrow review RPCs', () => {
    expect(service).toContain("'studio2_media_asset_reviews'");
    expect(service).toContain("'studio2_review_media_assets'");
    expect(route).not.toContain("from('studio2_media_asset_reviews')");
    expect(route).not.toContain('.insert(');
    expect(route).not.toContain('.update(');
    expect(service).not.toContain("from('studio2_media_asset_reviews')");
    expect(migration).toContain('alter table public.studio2_media_asset_reviews enable row level security');
    expect(migration).toContain('revoke all on table public.studio2_media_asset_reviews from public, anon, authenticated');
  });

  it('authorizes review server-side and verifies the canonical source has not changed', () => {
    expect(migration).toContain("public.has_role(p_user_id, 'organizer'::public.app_role)");
    expect(migration).toContain("private.studio2_user_has_capability(p_user_id, 'entry.approve', p_edition_id)");
    expect(migration).toContain('private.studio2_resolve_media_asset_source');
    expect(migration).toContain("from public.entries e");
    expect(migration).toContain("from public.countries c");
    expect(migration).toContain("from public.editions e");
    expect(migration).toContain("using errcode = '40001'");
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("v_decision = 'approved' and btrim(v_current_source) !~* '^https?://'");
  });

  it('records source-bound review history without rewriting canonical content', () => {
    expect(migration).toContain('source_fingerprint text not null');
    expect(migration).toContain('superseded_at timestamptz');
    expect(migration).toContain('set superseded_at = now()');
    expect(migration).not.toContain('update public.entries');
    expect(migration).not.toContain('update public.countries');
    expect(migration).not.toContain('update public.editions');
    expect(service).toContain("return 'superseded'");
  });

  it('audits organizer decisions through the canonical contest event vocabulary', () => {
    expect(migration).toContain('insert into public.studio2_contest_events');
    expect(migration).toContain("'rule.changed'");
    expect(migration).toContain("'media.asset_reviewed'");
    expect(migration).not.toContain('studio2_contest_events_type_check');
  });
});
