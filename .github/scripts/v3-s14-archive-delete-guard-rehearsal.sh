#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-archive-delete-guard] %s\n' "$*"; }
fail() { printf '\n[v3-s14-archive-delete-guard] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# Negative-path Archive proof is destructive fixture work and must stay local.
# This rehearsal owns every domain fixture it asserts against. All database
# fixture work runs in one transaction and is rolled back when the proof ends,
# because Archive itself is intentionally irreversible.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

export SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export E2E_SUPABASE_URL="$API_URL" VITE_SUPABASE_URL="$API_URL"
export CONFIRMATIONS_SUPABASE_URL="$API_URL" VITE_CONFIRMATIONS_SUPABASE_URL="$API_URL"
export DATABASE_URL="$DB_URL" SUPABASE_PROJECT_ID=local SUPABASE_PROJECT_REF=local
export E2E_SUPABASE_PROJECT_ID=local E2E_SUPABASE_PROJECT_REF=local
export VITE_SUPABASE_PROJECT_ID=local VITE_SUPABASE_PROJECT_REF=local
export V3_VERIFICATION_TARGET=local V3_SEED_TARGET=local V3_CLEANUP_TARGET=local
export V3_DESTRUCTIVE_VERIFICATION=1 V3_SERVICE_ROLE_SCOPE=local
bun run scripts/check-v3-production-isolation.ts

new_uuid() {
  python3 -c 'import uuid; print(uuid.uuid4())'
}

EDITION_A="$(new_uuid)"
EDITION_B="$(new_uuid)"
SHOW_A="$(new_uuid)"
ARCHIVE_A_OPERATION="$(new_uuid)"
EDITION_C="$(new_uuid)"
TELEVOTE_EDITION="$(new_uuid)"
TELEVOTE_ROUND="$(new_uuid)"
SUBMISSION_ROUND="$(new_uuid)"
SUBMISSION_ID="$(new_uuid)"
NEXT_RESPONSE="$(new_uuid)"
FAKE_COUNTRY="$(new_uuid)"
ARCHIVE_C_OPERATION="$(new_uuid)"
RUN_TOKEN="$(new_uuid)"

db_value() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"
}

json_value() {
  local path="$1"
  python3 -c '
import json,sys
value=json.load(sys.stdin)
for key in sys.argv[1].split(".") if sys.argv[1] else []:
    value=value[int(key)] if isinstance(value,list) else value[key]
if value is None: print("")
elif isinstance(value,bool): print("true" if value else "false")
elif isinstance(value,(dict,list)): print(json.dumps(value,separators=(",",":"),sort_keys=True))
else: print(value)
' "$path"
}

create_local_user() {
  local email="$1" display="$2" body response id
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"email_confirm":True,"user_metadata":{"display_name":sys.argv[2]}}))' "$email" "$display")"
  response="$(curl -sS -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' \
    --data "$body")"
  id="$(printf '%s' "$response" | json_value id 2>/dev/null || true)"
  [[ -n "$id" ]] || fail "could not create local user $email"
  printf '%s' "$id"
}

AUTHORIZED_ID="$(create_local_user "s14-archive-delete-guard-${RUN_TOKEN}@solaris.invalid" 'S14 Archive Delete Guard Authorized')"

log "Run self-contained Archive guard proof in one rollback-only database transaction"
psql "$DB_URL" \
  -v ON_ERROR_STOP=1 \
  -v VERBOSITY=verbose \
  -v AUTHORIZED_ID="$AUTHORIZED_ID" \
  -v EDITION_A="$EDITION_A" \
  -v EDITION_B="$EDITION_B" \
  -v SHOW_A="$SHOW_A" \
  -v ARCHIVE_A_OPERATION="$ARCHIVE_A_OPERATION" \
  -v EDITION_C="$EDITION_C" \
  -v TELEVOTE_EDITION="$TELEVOTE_EDITION" \
  -v TELEVOTE_ROUND="$TELEVOTE_ROUND" \
  -v SUBMISSION_ROUND="$SUBMISSION_ROUND" \
  -v SUBMISSION_ID="$SUBMISSION_ID" \
  -v NEXT_RESPONSE="$NEXT_RESPONSE" \
  -v FAKE_COUNTRY="$FAKE_COUNTRY" \
  -v ARCHIVE_C_OPERATION="$ARCHIVE_C_OPERATION" \
  <<'SQL'
\set QUIET 1
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_label text,
  p_condition boolean,
  p_detail text
)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format('TEST FAILED: %s', p_label),
      DETAIL = p_detail;
  END IF;

  RAISE NOTICE 'PASS: %', p_label;
END
$function$;

CREATE OR REPLACE FUNCTION pg_temp.assert_archive_guard(
  p_label text,
  p_expected_sqlstate text,
  p_expected_message text,
  p_sql text,
  p_trigger_relation regclass DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_failed boolean := false;
  v_sqlstate text;
  v_message text;
  v_detail text;
  v_context text;
  v_trigger record;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION
    WHEN OTHERS THEN
      v_failed := true;
      GET STACKED DIAGNOSTICS
        v_sqlstate = RETURNED_SQLSTATE,
        v_message = MESSAGE_TEXT,
        v_detail = PG_EXCEPTION_DETAIL,
        v_context = PG_EXCEPTION_CONTEXT;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format('TEST FAILED: %s unexpectedly succeeded', p_label);
  END IF;

  IF v_sqlstate IS DISTINCT FROM p_expected_sqlstate
     OR v_message IS DISTINCT FROM p_expected_message THEN
    RAISE NOTICE 'ARCHIVE GUARD DIAGNOSTIC: %', p_label;
    RAISE NOTICE '  expected SQLSTATE=% message=%', p_expected_sqlstate, p_expected_message;
    RAISE NOTICE '  actual   SQLSTATE=% message=%', v_sqlstate, v_message;
    RAISE NOTICE '  detail=%', coalesce(v_detail, '<none>');
    RAISE NOTICE '  context=%', coalesce(v_context, '<none>');

    IF p_trigger_relation IS NOT NULL THEN
      RAISE NOTICE '  trigger inventory for %:', p_trigger_relation::text;
      FOR v_trigger IN
        SELECT tgname, pg_get_triggerdef(oid) AS definition
        FROM pg_trigger
        WHERE tgrelid = p_trigger_relation
          AND NOT tgisinternal
        ORDER BY tgname
      LOOP
        RAISE NOTICE '    % => %', v_trigger.tgname, v_trigger.definition;
      END LOOP;
    END IF;

    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format('TEST FAILED: %s returned the wrong Archive exception', p_label),
      DETAIL = format(
        'expected SQLSTATE=%s message=%L; actual SQLSTATE=%s message=%L; detail=%L; context=%L',
        p_expected_sqlstate,
        p_expected_message,
        coalesce(v_sqlstate, '<none>'),
        coalesce(v_message, '<none>'),
        coalesce(v_detail, '<none>'),
        coalesce(v_context, '<none>')
      );
  END IF;

  RAISE NOTICE 'PASS: % rejected by SQLSTATE %: %', p_label, v_sqlstate, v_message;
END
$function$;

UPDATE public.studio2_platform_operational_state
SET mode = 'normal', changed_at = now()
WHERE singleton = true;

\echo '[v3-s14-archive-delete-guard] Seed independent archived/results fixtures'
INSERT INTO public.editions(id,name,slug,edition_number,year,status,published)
VALUES
  (:'EDITION_A'::uuid,'S14 Archive Delete Guard A','s14-archive-delete-guard-a',1894,2026,'active',false),
  (:'EDITION_B'::uuid,'S14 Archive Delete Guard B','s14-archive-delete-guard-b',1895,2026,'active',false);

-- public.editions owns runtime creation through
-- studio2_seed_edition_runtime_after_insert. Reuse those canonical rows instead
-- of double-inserting the same edition_id and turn them into the exact
-- pre-Archive states required by this isolated negative-path fixture.
UPDATE public.studio2_edition_runtime runtime
SET state = fixture.state,
    subsystems = private.studio2_default_subsystems(fixture.state),
    version = 1,
    updated_by = null
FROM (
  VALUES
    (:'EDITION_A'::uuid, 'post_edition'::text),
    (:'EDITION_B'::uuid, 'results'::text)
) AS fixture(edition_id, state)
WHERE runtime.edition_id = fixture.edition_id;

INSERT INTO public.shows(id,edition_id,name,kind,sort_order,published)
VALUES (:'SHOW_A'::uuid,:'EDITION_A'::uuid,'Archive Delete Freeze Fixture','grand-final',1,false);

INSERT INTO public.studio2_result_operations(
  show_id,edition_id,calculation_version,reviewed_version,locked_version,reveal_ready_version
)
VALUES (:'SHOW_A'::uuid,:'EDITION_A'::uuid,1,1,1,1);

INSERT INTO public.studio2_capability_grants(user_id,capability,edition_id)
VALUES
  (:'AUTHORIZED_ID'::uuid,'edition.manage',:'EDITION_A'::uuid),
  (:'AUTHORIZED_ID'::uuid,'edition.archive',:'EDITION_A'::uuid);

SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', :'AUTHORIZED_ID', 'role', 'authenticated')::text,
  true
);
SELECT public.studio2_transition_edition_v3(
  :'EDITION_A'::uuid,
  'archived',
  null,
  null,
  1,
  :'ARCHIVE_A_OPERATION'::uuid,
  's14-delete-guard-canonical-archive'
);
RESET ROLE;

SELECT pg_temp.assert_true(
  'canonical Archive fixture A exists before destructive assertions',
  EXISTS (
    SELECT 1
    FROM public.studio2_edition_runtime
    WHERE edition_id = :'EDITION_A'::uuid
      AND state = 'archived'
  ),
  'Edition A must exist in archived state so DELETE cannot pass by matching zero rows.'
);

SELECT pg_temp.assert_true(
  'results fixture B exists before forged Archive assertion',
  EXISTS (
    SELECT 1
    FROM public.studio2_edition_runtime
    WHERE edition_id = :'EDITION_B'::uuid
      AND state = 'results'
  ),
  'Edition B must exist in results state before the delete+insert bypass attempt.'
);

SELECT pg_temp.assert_true(
  'Archive compatibility projection is terminal before legacy mutation assertion',
  EXISTS (
    SELECT 1
    FROM public.editions
    WHERE id = :'EDITION_A'::uuid
      AND status IN ('completed','finished')
  ),
  'Canonical Archive must first project a terminal legacy editions.status.'
);

\echo '[v3-s14-archive-delete-guard] Assert Archive runtime DELETE guard'
SET ROLE service_role;
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
SELECT pg_temp.assert_archive_guard(
  'Archive runtime DELETE service privilege boundary',
  '42501',
  'permission denied for table studio2_edition_runtime',
  format(
    'delete from public.studio2_edition_runtime where edition_id=%L::uuid',
    :'EDITION_A'
  ),
  'public.studio2_edition_runtime'::regclass
);
RESET ROLE;
SELECT pg_temp.assert_archive_guard(
  'Archive runtime DELETE', '42501', 'Archived edition runtime is irreversible.',
  format('delete from public.studio2_edition_runtime where edition_id=%L::uuid', :'EDITION_A'),
  'public.studio2_edition_runtime'::regclass
);

SELECT pg_temp.assert_true(
  'Archive runtime DELETE preserves the archived fact',
  EXISTS (
    SELECT 1
    FROM public.studio2_edition_runtime
    WHERE edition_id = :'EDITION_A'::uuid
      AND state = 'archived'
  ),
  'Archived runtime fact disappeared or changed after rejected DELETE.'
);

\echo '[v3-s14-archive-delete-guard] Assert forged Archive INSERT guard'
SET ROLE service_role;
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
SELECT pg_temp.assert_archive_guard(
  'Forged Archive INSERT service privilege boundary',
  '42501',
  'permission denied for table studio2_edition_runtime',
  format(
    'with deleted as (delete from public.studio2_edition_runtime where edition_id=%L::uuid returning edition_id,subsystems) insert into public.studio2_edition_runtime(edition_id,state,subsystems,version,updated_by) select edition_id,''archived'',subsystems,6,null from deleted',
    :'EDITION_B'
  ),
  'public.studio2_edition_runtime'::regclass
);
RESET ROLE;
SELECT pg_temp.assert_archive_guard(
  'Forged Archive INSERT after runtime DELETE', '42501', 'Archive transition must use the canonical V3 lifecycle command.',
  format('with deleted as (delete from public.studio2_edition_runtime where edition_id=%L::uuid returning edition_id,subsystems) insert into public.studio2_edition_runtime(edition_id,state,subsystems,version,updated_by) select edition_id,''archived'',subsystems,6,null from deleted', :'EDITION_B'),
  'public.studio2_edition_runtime'::regclass
);

SELECT pg_temp.assert_true(
  'Rejected forged Archive INSERT rolls back its preceding DELETE atomically',
  EXISTS (
    SELECT 1
    FROM public.studio2_edition_runtime
    WHERE edition_id = :'EDITION_B'::uuid
      AND state = 'results'
  ),
  'Edition B must remain in results after the rejected delete+insert statement.'
);

\echo '[v3-s14-archive-delete-guard] Assert archived show/result/legacy lifecycle guards'
-- Exercise the workflow-freeze trigger boundary as the database owner. The
-- runtime authority assertions above separately prove service grants and owner invariants;
-- workflow tables do not all grant direct DML to service_role, and a table
-- permission denial would prevent PostgreSQL from ever reaching these triggers.
SELECT pg_temp.assert_archive_guard(
  'Archived show mutation',
  '42501',
  'Archived edition workflow is read-only.',
  format('update public.shows set published=false where id=%L::uuid', :'SHOW_A'),
  'public.shows'::regclass
);
SELECT pg_temp.assert_archive_guard(
  'Archived result operation mutation',
  '42501',
  'Archived edition workflow is read-only.',
  format('update public.studio2_result_operations set locked_version=null where show_id=%L::uuid', :'SHOW_A'),
  'public.studio2_result_operations'::regclass
);
SELECT pg_temp.assert_archive_guard(
  'Archived legacy lifecycle revival',
  '42501',
  'Archived edition lifecycle is read-only.',
  format('update public.editions set status=''active'' where id=%L::uuid', :'EDITION_A'),
  'public.editions'::regclass
);

SELECT pg_temp.assert_true(
  'Rejected legacy lifecycle revival preserves terminal compatibility status',
  EXISTS (
    SELECT 1
    FROM public.editions
    WHERE id = :'EDITION_A'::uuid
      AND status IN ('completed','finished')
  ),
  'Archived edition compatibility status ceased to be terminal.'
);

\echo '[v3-s14-archive-delete-guard] Seed independent terminal-boundary fixture C'
INSERT INTO public.editions(id,name,slug,edition_number,year,status,published)
VALUES (:'EDITION_C'::uuid,'S14 Archive Guard C','s14-archive-guard-c',1893,2026,'active',false);

-- The editions trigger has already created Edition C's runtime row.
UPDATE public.studio2_edition_runtime
SET state = 'post_edition',
    subsystems = private.studio2_default_subsystems('post_edition'),
    version = 1,
    updated_by = null
WHERE edition_id = :'EDITION_C'::uuid;

INSERT INTO public.studio2_capability_grants(user_id,capability,edition_id)
VALUES
  (:'AUTHORIZED_ID'::uuid,'edition.manage',:'EDITION_C'::uuid),
  (:'AUTHORIZED_ID'::uuid,'edition.archive',:'EDITION_C'::uuid)
ON CONFLICT DO NOTHING;

INSERT INTO public.submission_rounds(id,edition_id,name,status)
VALUES (:'SUBMISSION_ROUND'::uuid,:'EDITION_C'::uuid,'Archive terminal fixture','closed');

INSERT INTO public.submissions(
  id,edition_id,round_id,instagram_username,country,participating,selection_method
)
VALUES (
  :'SUBMISSION_ID'::uuid,
  :'EDITION_C'::uuid,
  :'SUBMISSION_ROUND'::uuid,
  'archive_fixture',
  'Archive Fixture',
  true,
  'internal'
);

INSERT INTO public.next_in_line_responses(
  id,source_submission_id,edition_id,country,participating,selection_type
)
VALUES (
  :'NEXT_RESPONSE'::uuid,
  :'SUBMISSION_ID'::uuid,
  :'EDITION_C'::uuid,
  'Archive Fixture',
  true,
  'internal'
);

INSERT INTO public.studio2_next_in_line_windows(
  edition_id,enabled,status,version,reason
)
VALUES (:'EDITION_C'::uuid,false,'closed',1,'Archive terminal fixture');

INSERT INTO televoting.editions(id,name,is_active,is_archived)
VALUES (:'TELEVOTE_EDITION'::uuid,'S14 Archive Televote',false,false);

INSERT INTO televoting.rounds(id,edition_id,name,status)
VALUES (:'TELEVOTE_ROUND'::uuid,:'TELEVOTE_EDITION'::uuid,'Archive terminal round','closed');

INSERT INTO public.televoting_round_bindings(
  remote_round_id,remote_edition_id,edition_id,source_mode
)
VALUES (:'TELEVOTE_ROUND',:'TELEVOTE_EDITION',:'EDITION_C'::uuid,'edition');

SELECT pg_temp.assert_true(
  'terminal-boundary fixture C exists before canonical Archive',
  EXISTS (
    SELECT 1
    FROM public.studio2_edition_runtime
    WHERE edition_id = :'EDITION_C'::uuid
      AND state = 'post_edition'
      AND version = 1
  ),
  'Edition C must exist in post_edition with version 1 before Archive.'
);

SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', :'AUTHORIZED_ID', 'role', 'authenticated')::text,
  true
);
SELECT public.studio2_transition_edition_v3(
  :'EDITION_C'::uuid,
  'archived',
  null,
  null,
  1,
  :'ARCHIVE_C_OPERATION'::uuid,
  's14-terminal-boundary-archive'
);
RESET ROLE;

SELECT pg_temp.assert_true(
  'terminal-boundary fixture C archives through canonical lifecycle command',
  EXISTS (
    SELECT 1
    FROM public.studio2_edition_runtime
    WHERE edition_id = :'EDITION_C'::uuid
      AND state = 'archived'
  ),
  'Edition C did not reach archived state through the canonical command.'
);

\echo '[v3-s14-archive-delete-guard] Assert Next in Line and eligibility terminal guards'
SELECT pg_temp.assert_archive_guard(
  'Archived Next in Line window mutation',
  '42501',
  'Archived edition workflow is read-only.',
  format('update public.studio2_next_in_line_windows set enabled=true,status=''open'' where edition_id=%L::uuid', :'EDITION_C'),
  'public.studio2_next_in_line_windows'::regclass
);
SELECT pg_temp.assert_archive_guard(
  'Archived Next in Line response mutation',
  '42501',
  'Archived edition workflow is read-only.',
  format('update public.next_in_line_responses set participating=false where id=%L::uuid', :'NEXT_RESPONSE'),
  'public.next_in_line_responses'::regclass
);
SELECT pg_temp.assert_archive_guard(
  'Archived eligibility override insertion',
  '42501',
  'Archived edition workflow is read-only.',
  format(
    'insert into public.studio2_eligibility_overrides(edition_id,country_id,affected_rule,reason) values (%L::uuid,%L::uuid,''archive.fixture'',''Archive fixture must fail closed'')',
    :'EDITION_C',
    :'FAKE_COUNTRY'
  ),
  'public.studio2_eligibility_overrides'::regclass
);

\echo '[v3-s14-archive-delete-guard] Assert Televote terminal guards'
SELECT pg_temp.assert_archive_guard(
  'Archived Televote binding mutation',
  '42501',
  'Archived edition workflow is read-only.',
  format('update public.televoting_round_bindings set source_mode=''show'' where remote_round_id=%L', :'TELEVOTE_ROUND'),
  'public.televoting_round_bindings'::regclass
);
SELECT pg_temp.assert_archive_guard(
  'Archived canonical Televote round mutation',
  '42501',
  'Archived edition workflow is read-only.',
  format('update televoting.rounds set closes_at=now() + interval ''1 hour'' where id=%L::uuid', :'TELEVOTE_ROUND'),
  'televoting.rounds'::regclass
);

SELECT pg_temp.assert_true(
  'Rejected Televote mutation preserves canonical round state',
  EXISTS (
    SELECT 1
    FROM televoting.rounds
    WHERE id = :'TELEVOTE_ROUND'::uuid
      AND status::text = 'closed'
  ),
  'Archived Televote mutation changed canonical round state.'
);

SELECT pg_temp.assert_true(
  'Rejected Next in Line window mutation preserves closed state',
  EXISTS (
    SELECT 1
    FROM public.studio2_next_in_line_windows
    WHERE edition_id = :'EDITION_C'::uuid
      AND status = 'closed'
  ),
  'Archived Next in Line mutation changed canonical window state.'
);

SELECT pg_temp.assert_true(
  'Rejected Next in Line response mutation preserves retained response',
  EXISTS (
    SELECT 1
    FROM public.next_in_line_responses
    WHERE id = :'NEXT_RESPONSE'::uuid
      AND participating = true
  ),
  'Archived Next in Line response mutation changed retained response.'
);

\echo '[v3-s14-archive-delete-guard] Roll back all database fixtures'
ROLLBACK;
SQL

leftovers="$(db_value "select count(*) from public.editions where id in ('$EDITION_A'::uuid,'$EDITION_B'::uuid,'$EDITION_C'::uuid);")"
[[ "$leftovers" == '0' ]] || fail "rollback-only rehearsal leaked edition fixtures into the local database"

log "S14 Archive irreversibility + workflow-freeze guards passed with exact SQLSTATE/message diagnostics"
