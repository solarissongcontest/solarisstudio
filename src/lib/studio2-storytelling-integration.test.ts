import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const migration = source('supabase/migrations/20260912194100_studio2_storytelling_anniversary.sql');
const hardening = source('supabase/migrations/20260912194200_studio2_storytelling_hardening.sql');
const route = source('src/routes/_authenticated/admin/storytelling.tsx');
const publicArchive = source('src/routes/stories/index.tsx');
const publicStory = source('src/routes/stories/$editionSlug.tsx');
const service = source('src/lib/studio2-storytelling.ts');
const nav = source('src/components/admin/AdminNav.tsx');
const permissions = source('src/lib/permissions-v2.ts');
const presets = source('src/lib/role-presets.ts');

const finalSql = `${migration}\n${hardening}`;

describe('Studio 2 Phase 12 Storytelling & Anniversary architecture', () => {
  it('repairs persisted Host capabilities and adds Storytelling capabilities everywhere', () => {
    expect(migration).toContain("'host.read', 'host.manage'");
    expect(migration).toContain("'story.read', 'story.manage'");
    expect(migration).toContain('drop constraint if exists studio2_capability_grants_capability_check');
    expect(permissions).toContain("'story.read'");
    expect(permissions).toContain("'story.manage'");
    expect(presets).toContain("'story.manage'");
  });

  it('uses the canonical Studio 2 event stream instead of inventing a second event engine', () => {
    expect(migration).toContain('from public.studio2_contest_events e');
    expect(migration).toContain('private.studio2_story_importance(e.type) >= 55');
    expect(migration).toContain('source_event_id uuid references public.studio2_contest_events(id)');
    expect(migration).not.toContain('create table if not exists public.studio2_story_events');
  });

  it('never overwrites an already-generated source event during refresh', () => {
    expect(migration).toContain('not exists (');
    expect(migration).toContain('existing.storyline_id = v_story.id and existing.source_event_id = e.id');
    expect(migration).toContain('manual_override boolean not null default false');
    expect(route).toContain('Organizer copy is preserved on future event-stream refreshes.');
  });

  it('keeps publishing explicit and returns edited public stories to draft', () => {
    expect(migration).toContain("p_action = 'publish_storyline'");
    expect(migration).toContain("p_action = 'unpublish_storyline'");
    expect(migration).toContain("status = 'draft', published_at = null, published_by = null");
    expect(migration).toContain('Include at least three story moments before publication');
    expect(migration).toContain('Publish the edition before publishing its storyline');
    expect(route).toContain('Generated copy is never published by generation alone.');
    expect(route).toContain('confirmationText="PUBLISH"');
  });

  it('uses server-side authorization, advisory locking, stale revisions and execution-id idempotency', () => {
    expect(migration).toContain('private.studio2_can_read_storytelling');
    expect(migration).toContain('private.studio2_can_manage_storytelling');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('execution_id uuid not null unique');
    expect(migration).toContain('Storyline changed since this action was loaded. Refresh before continuing.');
    expect(migration).toContain("jsonb_build_object('idempotentReplay', true)");
    expect(route).toContain('crypto.randomUUID()');
  });

  it('keeps editorial lifecycle tables RPC-only and public projections deliberately narrow', () => {
    expect(migration).toContain('revoke all on table public.studio2_storylines from public, anon, authenticated');
    expect(migration).toContain('revoke all on table public.studio2_storyline_items from public, anon, authenticated');
    expect(migration).toContain('revoke all on table public.studio2_story_operation_executions from public, anon, authenticated');
    expect(route).not.toContain('supabase.from(');
    expect(service).toContain("rpc('studio2_storytelling_snapshot'");
    expect(service).toContain("rpc('studio2_execute_story_operation'");
    expect(service).toContain("rpc('studio2_public_storyline'");
    expect(migration).toContain('select s.* into v_story');
    expect(hardening).toContain('select s.* into v_story');
    expect(finalSql).toContain('select * into v_edition');
    expect(finalSql).not.toContain('select s.*, e.* into v_story, v_edition');
    expect(finalSql).not.toContain('select s, e into v_story, v_edition');
    expect(finalSql).not.toContain("'canonicalFacts', i.canonical_facts\n    ) order by i.sort_order, i.occurred_at, i.id), '[]'::jsonb)\n  into v_items\n  from public.studio2_storyline_items i\n  where i.storyline_id = v_story.id\n    and i.included;");
    expect(publicStory).not.toContain('canonicalFacts');
  });

  it('separates Storytelling audit events from the canonical source-event count', () => {
    expect(hardening).toContain("and e.type not like 'storyline.%'");
    expect(hardening).toContain('studio2_story_source_count_sync');
    expect(hardening).toContain("new.type in ('storyline.generated', 'storyline.updated', 'storyline.published', 'storyline.unpublished')");
  });

  it('provides date-aware anniversary buckets from published stories and participation history', () => {
    expect(migration).toContain('create or replace function public.studio2_anniversary_engine');
    expect(migration).toContain("to_char(i.occurred_at at time zone 'Europe/Paris', 'MM-DD')");
    expect(migration).toContain("v_reference - interval '1 year'");
    expect(migration).toContain("v_reference - interval '5 years'");
    expect(migration).toContain("'2022-09-17'");
    expect(migration).toContain('first_participations as');
    expect(route).toContain('Anniversary Engine preview');
    expect(publicArchive).toContain('On this day in Solaris');
  });

  it('is route-native and does not reintroduce the old anniversary portal injection pattern', () => {
    expect(route).not.toContain('createPortal');
    expect(publicArchive).not.toContain('createPortal');
    expect(publicStory).not.toContain('createPortal');
    expect(nav).toContain('label: "Storytelling"');
    expect(nav).toContain('to: "/admin/storytelling"');
  });

  it('writes immutable receipts and storyline lifecycle events for editorial operations', () => {
    expect(migration).toContain('insert into public.studio2_story_operation_executions');
    expect(migration).toContain('insert into public.studio2_contest_events');
    expect(migration).toContain("v_event_type := 'storyline.generated'");
    expect(migration).toContain("v_event_type := 'storyline.published'");
    expect(migration).toContain("v_event_type := 'storyline.unpublished'");
  });
});
