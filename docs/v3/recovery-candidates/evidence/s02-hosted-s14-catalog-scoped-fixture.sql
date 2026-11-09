-- S02: SANITIZED CATALOG-SCOPED HOSTED OBSERVATION, 2026-11-09

-- This models eight observed relations and necessary synthetic FK parent shells.

-- It is NOT a production schema dump and NOT an executable production migration.

-- No source-clean replay, production rows, credentials or production URLs.

-- Parent stubs and omitted external dependencies are explicit unknowns: NOT S02 complete.

BEGIN;

SET search_path = public, private, auth, pg_catalog;

SET check_function_bodies = off;

CREATE SCHEMA IF NOT EXISTS private;

CREATE SCHEMA IF NOT EXISTS auth;

DO $roles$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $roles$;

-- Synthetic referenced-parent shells only; NOT assertions of hosted parent-table equivalence.

CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE TABLE public.editions (id uuid PRIMARY KEY);

CREATE TABLE public.countries (id uuid PRIMARY KEY);

CREATE TABLE public.studio2_capabilities (key text PRIMARY KEY);

CREATE TABLE public.shows (id uuid PRIMARY KEY, edition_id uuid, UNIQUE (id,edition_id));

CREATE TABLE "private"."v3_domain_event_outbox" (
  "event_id" uuid NOT NULL,
  "consumer_key" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_owner" text,
  "lease_expires_at" timestamp with time zone,
  "last_error_code" text,
  "last_error_metadata" jsonb,
  "completed_at" timestamp with time zone,
  "dead_lettered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "private"."v3_domain_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_type" text NOT NULL,
  "aggregate_type" text NOT NULL,
  "aggregate_id" text NOT NULL,
  "aggregate_version" bigint NOT NULL,
  "operation_id" uuid NOT NULL,
  "correlation_id" uuid NOT NULL,
  "edition_id" uuid,
  "show_id" uuid,
  "actor_id" uuid,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "schema_version" integer DEFAULT 1 NOT NULL
);

CREATE TABLE "private"."v3_result_versions" (
  "show_id" uuid NOT NULL,
  "edition_id" uuid NOT NULL,
  "version" bigint NOT NULL,
  "result_rows" jsonb NOT NULL,
  "result_row_count" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid
);

CREATE TABLE "public"."admin_notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "recipient_id" uuid NOT NULL,
  "severity" text DEFAULT 'info'::text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "href" text,
  "source_key" text,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "requires_action" boolean DEFAULT true NOT NULL,
  "resolution_mode" text DEFAULT 'manual'::text NOT NULL,
  "activation_version" bigint DEFAULT 1 NOT NULL
);

CREATE TABLE "public"."notification_deliveries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "category" text NOT NULL,
  "event_type" text NOT NULL,
  "subject_id" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "route" text NOT NULL,
  "title" text NOT NULL,
  "body" text DEFAULT ''::text NOT NULL,
  "scheduled_for" timestamp with time zone NOT NULL,
  "sent_at" timestamp with time zone,
  "opened_at" timestamp with time zone,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processing_started_at" timestamp with time zone,
  "last_attempt_at" timestamp with time zone,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "provider_accepted_at" timestamp with time zone,
  "received_at" timestamp with time zone,
  "displayed_at" timestamp with time zone,
  "receipt_token_hash" text
);

CREATE TABLE "public"."studio2_edition_runtime" (
  "edition_id" uuid NOT NULL,
  "state" text NOT NULL,
  "subsystems" jsonb NOT NULL,
  "version" bigint DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid
);

CREATE TABLE "public"."studio2_operation_receipts" (
  "operation_id" uuid NOT NULL,
  "actor_id" uuid,
  "idempotency_key" text NOT NULL,
  "command" text NOT NULL,
  "risk_class" text NOT NULL,
  "scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'processing'::text NOT NULL,
  "result" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "actor_session_id" text,
  "auth_freshness_evidence" jsonb,
  "correlation_id" uuid NOT NULL,
  "request_fingerprint" text NOT NULL,
  "completed_at" timestamp with time zone,
  "error_code" text,
  "error_metadata" jsonb
);

CREATE TABLE "public"."studio2_organizer_tasks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid,
  "country_id" uuid,
  "assigned_to" uuid,
  "source_kind" text NOT NULL,
  "source_id" text NOT NULL,
  "source_key" text NOT NULL,
  "task_type" text NOT NULL,
  "required_capability" text NOT NULL,
  "priority" text NOT NULL,
  "state" text DEFAULT 'open'::text NOT NULL,
  "title" text NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "href" text NOT NULL,
  "due_at" timestamp with time zone,
  "resolution_predicate" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rule_reference" text[] DEFAULT '{}'::text[] NOT NULL,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "last_evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Recreate only the two hosted-observed policy dependency function identities and the 19 observed trigger functions.

CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

CREATE OR REPLACE FUNCTION public.studio2_access_allowed(p_capability text, p_edition_id uuid DEFAULT NULL::uuid, p_strict_before_cutover boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_has_capability boolean := false;
  v_access_level text;
  v_mode text := 'normal';
begin
  if private.studio2_request_is_service_role() then
    return true;
  end if;

  if v_actor is null then
    return false;
  end if;

  v_has_capability := private.studio2_user_has_capability(
    v_actor,
    p_capability,
    p_edition_id
  );

  if not v_has_capability then
    return false;
  end if;

  select capability.access_level
  into v_access_level
  from public.studio2_capabilities capability
  where capability.key = p_capability;

  if v_access_level is null then
    return false;
  end if;

  select state.mode
  into v_mode
  from public.studio2_platform_operational_state state
  where state.singleton = true;

  return private.studio2_capability_allowed_in_platform_mode(
    p_capability,
    v_access_level,
    coalesce(v_mode, 'normal')
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_bump_notification_activation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if old.resolution_mode = 'domain'
     and old.resolved_at is not null
     and new.resolved_at is null then
    new.activation_version := old.activation_version + 1;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_guard_direct_client_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_mode text;
begin
  if session_user in ('postgres', 'supabase_admin')
     or pg_has_role(session_user, 'postgres', 'member') then
    return null;
  end if;

  if coalesce(current_setting('studio2.platform_recovery_write', true), '') = 'on' then
    return null;
  end if;

  select state.mode
  into v_mode
  from public.studio2_platform_operational_state state
  where state.singleton = true;

  -- This marker is set only by the exact Confirmation RPC allowlist in the
  -- pre-request gate above. Never honor it in full maintenance mode.
  if v_mode = 'read_only'
     and coalesce(current_setting('studio2.confirmation_maintenance_write', true), '') = 'on' then
    return null;
  end if;

  if v_mode in ('read_only', 'maintenance') then
    raise exception 'Solaris is currently %, so this write is unavailable', v_mode
      using errcode = '25006';
  end if;

  if v_mode is null then
    raise exception 'Solaris platform operational state is unavailable'
      using errcode = '25006';
  end if;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION private.studio2_guard_domain_notification_resolution()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if current_user in ('authenticated', 'anon')
     and (
       (to_jsonb(new) - array['read_at', 'resolved_at']::text[])
       is distinct from
       (to_jsonb(old) - array['read_at', 'resolved_at']::text[])
     ) then
    raise exception
      'Notification delivery fields are server-authoritative.'
      using errcode = '42501';
  end if;

  if old.resolution_mode = 'domain'
     and current_user in ('authenticated', 'anon')
     and new.resolved_at is distinct from old.resolved_at then
    raise exception
      'Task-backed notifications may only be marked seen; task state follows authoritative domain state.'
      using errcode = '42501';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_guard_edition_runtime_strict_dual()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_capability text;
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_capability := 'edition.manage';
    v_action := 'edition.runtime.provision';
  elsif new.state is distinct from old.state then
    v_capability := case when new.state = 'archived' then 'edition.archive' else 'edition.transition' end;
    v_action := 'edition.runtime.transition';
  else
    v_capability := 'edition.manage';
    v_action := 'edition.runtime.update';
  end if;

  perform private.studio2_require_strict_dual(
    v_capability,
    new.edition_id,
    v_action
  );

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  new.updated_at := now();
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_version_organizer_delivery_dedupe()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_activation bigint;
begin
  if new.category <> 'organizer_tasks' then
    return new;
  end if;

  select notification.activation_version
  into v_activation
  from public.studio2_organizer_tasks task
  join public.admin_notifications notification
    on notification.source_key = task.source_key
   and notification.recipient_id = new.user_id
  where task.id::text = new.subject_id
  limit 1;

  new.dedupe_key := regexp_replace(new.dedupe_key, ':activation-[0-9]+$', '')
    || ':activation-' || coalesce(v_activation, 1)::text;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_emit_access_operation_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'auth'
AS $function$
declare
  v_change_kind text;
  v_key text;
  v_target_user_id uuid;
  v_edition_id uuid;
  v_previous_version bigint;
  v_version bigint;
  v_payload jsonb;
  v_expected_command text;
begin
  if new.status <> 'succeeded'
     or new.command not in (
       'permissions.assign_role',
       'permissions.revoke_role',
       'permissions.grant_capability',
       'permissions.revoke_capability'
     ) then
    return new;
  end if;

  -- studio2_apply_permission_change_r3 enriches auth-freshness evidence after
  -- the inner operation completes. Never re-emit facts for later receipt edits.
  if old.status = 'succeeded' then
    return new;
  end if;

  if not coalesce((new.result ->> 'changed')::boolean, false) then
    return new;
  end if;

  v_change_kind := nullif(btrim(new.result ->> 'changeKind'), '');
  v_key := nullif(btrim(new.result ->> 'key'), '');
  v_target_user_id := nullif(new.result ->> 'targetUserId', '')::uuid;
  v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
  v_previous_version := nullif(new.result ->> 'previousVersion', '')::bigint;
  v_version := nullif(new.result ->> 'version', '')::bigint;
  v_expected_command := 'permissions.' || coalesce(v_change_kind, '');

  if v_change_kind not in (
       'assign_role',
       'revoke_role',
       'grant_capability',
       'revoke_capability'
     )
     or v_key is null
     or v_target_user_id is null
     or v_previous_version is null
     or v_version is null
     or v_version <= v_previous_version
     or new.command is distinct from v_expected_command then
    raise exception 'Successful permission operation has incomplete or inconsistent event provenance'
      using errcode = '23514';
  end if;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'changeKind', v_change_kind,
    'key', v_key,
    'editionId', v_edition_id,
    'previousVersion', v_previous_version,
    'version', v_version,
    'globalScope', v_edition_id is null
  ));

  if v_change_kind in ('assign_role', 'revoke_role') then
    perform private.v3_emit_domain_event(
      'membership.changed',
      'membership',
      v_target_user_id::text,
      v_version,
      new.operation_id,
      v_edition_id,
      null,
      v_payload,
      1,
      array['access.tasks']::text[]
    );
  end if;

  perform private.v3_emit_domain_event(
    'permissions.changed',
    'permission_subject',
    v_target_user_id::text,
    v_version,
    new.operation_id,
    v_edition_id,
    null,
    v_payload,
    1,
    array['access.tasks']::text[]
  );

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_emit_confirmation_operation_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_round_id uuid;
  v_submission_id uuid;
  v_edition_id uuid;
  v_version bigint;
  v_event_type text;
  v_aggregate_type text;
  v_aggregate_id text;
  v_payload jsonb;
begin
  if old.status = 'succeeded' or new.status <> 'succeeded' then
    return new;
  end if;

  if new.command = 'confirmation.submit' then
    begin
      v_submission_id := nullif(new.result ->> 'submissionId', '')::uuid;
      v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
      v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
      v_version := nullif(new.result ->> 'editCount', '')::bigint;
    exception when invalid_text_representation then
      raise exception 'Completed confirmation submission operation has invalid event provenance'
        using errcode = '23514';
    end;

    if v_submission_id is null or v_round_id is null or v_version is null then
      raise exception 'Completed confirmation submission operation lacks event provenance'
        using errcode = '23514';
    end if;

    v_event_type := 'confirmation.submitted';
    v_aggregate_type := 'confirmation_submission';
    v_aggregate_id := v_submission_id::text;
    v_payload := jsonb_build_object(
      'submissionId', v_submission_id,
      'roundId', v_round_id,
      'editCount', v_version
    );

  elsif new.command like 'confirmation.round.%' then
    begin
      v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
      v_version := nullif(new.result ->> 'version', '')::bigint;
    exception when invalid_text_representation then
      raise exception 'Completed confirmation round operation has invalid event provenance'
        using errcode = '23514';
    end;

    if v_round_id is null or v_version is null then
      raise exception 'Completed confirmation round operation lacks event provenance'
        using errcode = '23514';
    end if;

    select round.edition_id
    into v_edition_id
    from public.submission_rounds round
    where round.id = v_round_id;

    if v_edition_id is null then
      begin
        v_edition_id := nullif(new.scope ->> 'editionId', '')::uuid;
      exception when invalid_text_representation then
        v_edition_id := null;
      end;
    end if;

    v_event_type := 'confirmation.window_changed';
    v_aggregate_type := 'confirmation_round';
    v_aggregate_id := v_round_id::text;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'roundId', v_round_id,
      'changeKind', new.result ->> 'changeKind',
      'status', new.result ->> 'status',
      'editingEnabled', new.result -> 'editingEnabled',
      'affectedResponses', new.result -> 'affectedResponses'
    ));
  else
    return new;
  end if;

  perform private.v3_emit_domain_event(
    v_event_type,
    v_aggregate_type,
    v_aggregate_id,
    v_version,
    new.operation_id,
    v_edition_id,
    null,
    v_payload,
    1,
    array['confirmation.tasks', 'confirmation.notifications']::text[]
  );

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_emit_entry_operation_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_submission_id uuid;
  v_entry_id uuid;
  v_edition_id uuid;
  v_entry_version_id uuid;
  v_version bigint;
  v_target_type text;
  v_event_type text;
  v_status text;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command not in (
       'entry.request_changes',
       'entry.accept',
       'entry.remove',
       'entry.reset_review'
     ) then
    return new;
  end if;

  begin
    v_submission_id := nullif(new.result ->> 'submissionId', '')::uuid;
    v_entry_id := nullif(new.result ->> 'entryId', '')::uuid;
    v_entry_version_id := nullif(new.result ->> 'entryVersionId', '')::uuid;
    v_version := nullif(new.result ->> 'version', '')::bigint;
    v_edition_id := nullif(new.scope ->> 'editionId', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Completed Entry operation has invalid event provenance'
      using errcode = '23514';
  end;

  v_target_type := nullif(btrim(new.result ->> 'targetType'), '');
  v_status := nullif(btrim(new.result ->> 'status'), '');

  if v_submission_id is null
     or v_entry_id is null
     or v_entry_version_id is null
     or v_version is null
     or v_edition_id is null
     or v_target_type not in ('internal', 'national_final')
     or v_status not in ('pending', 'accepted', 'declined', 'removed') then
    raise exception 'Completed Entry operation lacks event provenance'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.submissions submission
    where submission.id = v_submission_id
      and submission.edition_id = v_edition_id
  ) then
    raise exception 'Completed Entry operation is outside its canonical edition scope'
      using errcode = '23514';
  end if;

  if (
    v_target_type = 'internal'
    and not exists (
      select 1
      from public.internal_entries entry
      where entry.id = v_entry_id
        and entry.submission_id = v_submission_id
        and entry.current_version_id = v_entry_version_id
    )
  ) or (
    v_target_type = 'national_final'
    and not exists (
      select 1
      from public.national_final_entries entry
      join public.national_finals final on final.id = entry.national_final_id
      where entry.id = v_entry_id
        and final.submission_id = v_submission_id
        and entry.current_version_id = v_entry_version_id
    )
  ) then
    raise exception 'Completed Entry operation does not match its canonical Entry revision'
      using errcode = '23514';
  end if;

  v_event_type := case
    when new.command = 'entry.request_changes' then 'entry.changes_requested'
    else 'entry.reviewed'
  end;

  perform private.v3_emit_domain_event(
    v_event_type,
    'entry_review',
    v_entry_id::text,
    v_version,
    new.operation_id,
    v_edition_id,
    null,
    jsonb_build_object(
      'submissionId', v_submission_id,
      'entryId', v_entry_id,
      'entryVersionId', v_entry_version_id,
      'targetType', v_target_type,
      'status', v_status,
      'reviewState', new.result ->> 'reviewState'
    ),
    1,
    array['entry.tasks']::text[]
  );

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_emit_jury_operation_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_event_type text;
  v_aggregate_type text;
  v_aggregate_id text;
  v_aggregate_version bigint;
  v_edition_id uuid;
  v_show_id uuid;
  v_ballot_id uuid;
  v_voter_id uuid;
  v_voter_country_id uuid;
  v_voter_entity_id uuid;
  v_payload jsonb := '{}'::jsonb;
  v_consumers text[] := array['jury.tasks']::text[];
begin
  if old.status = 'succeeded' or new.status <> 'succeeded' then
    return new;
  end if;

  -- Jury window operations already complete through studio2_operation_receipts.
  -- Their edition/show scope is immutable command metadata and the resulting
  -- edition window version is the aggregate version.
  if new.command in ('jury.window.open', 'jury.window.closed') then
    begin
      v_edition_id := nullif(new.scope ->> 'editionId', '')::uuid;
      v_show_id := nullif(new.scope ->> 'showId', '')::uuid;
      v_aggregate_version := nullif(new.result ->> 'version', '')::bigint;
    exception when invalid_text_representation then
      raise exception 'Completed Jury window operation has invalid event provenance'
        using errcode = '23514';
    end;

    if v_edition_id is null or v_show_id is null or v_aggregate_version is null then
      raise exception 'Completed Jury window operation lacks event provenance'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.shows show_row
      where show_row.id = v_show_id
        and show_row.edition_id = v_edition_id
    ) then
      raise exception 'Completed Jury window operation is outside canonical show scope'
        using errcode = '23514';
    end if;

    v_event_type := case
      when new.command = 'jury.window.open' then 'jury.opened'
      else 'jury.closed'
    end;
    v_aggregate_type := 'jury_window';
    v_aggregate_id := v_show_id::text;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'showId', v_show_id,
      'status', new.scope ->> 'requestedStatus',
      'previousVersion', new.result -> 'previousVersion',
      'version', new.result -> 'version'
    ));

    if v_event_type = 'jury.opened' then
      v_consumers := array['jury.tasks', 'jury.notifications']::text[];
    end if;

  -- Organizer ballot review is an exact-version R2 command. The review row is
  -- canonical evidence; payloads intentionally contain only lifecycle metadata,
  -- never the ballot rankings themselves.
  elsif new.command like 'jury.ballot.review.%' then
    begin
      v_edition_id := nullif(new.scope ->> 'editionId', '')::uuid;
      v_show_id := nullif(new.scope ->> 'showId', '')::uuid;
      v_ballot_id := nullif(new.result ->> 'ballotId', '')::uuid;
      v_aggregate_version := nullif(new.result ->> 'version', '')::bigint;
    exception when invalid_text_representation then
      raise exception 'Completed Jury ballot review has invalid event provenance'
        using errcode = '23514';
    end;

    if v_edition_id is null
       or v_show_id is null
       or v_ballot_id is null
       or v_aggregate_version is null then
      raise exception 'Completed Jury ballot review lacks event provenance'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.jury_ballot_submissions ballot
      where ballot.id = v_ballot_id
        and ballot.edition_id = v_edition_id
        and ballot.show_id = v_show_id
        and ballot.review_version = v_aggregate_version
    ) then
      raise exception 'Completed Jury ballot review does not match canonical ballot state'
        using errcode = '23514';
    end if;

    v_event_type := 'jury.ballot_changed';
    v_aggregate_type := 'jury_ballot';
    v_aggregate_id := v_ballot_id::text;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'ballotId', v_ballot_id,
      'showId', v_show_id,
      'fromStatus', new.scope ->> 'fromStatus',
      'status', new.result ->> 'status',
      'version', new.result -> 'version'
    ));

  -- Did-not-vote is deliberately separate absence evidence, but it changes the
  -- same Jury responsibility/readiness projection. A semantic aggregate id
  -- avoids pretending there is a ballot row when there is not one.
  elsif new.command in ('jury.dnv.set', 'jury.dnv.clear') then
    begin
      v_edition_id := nullif(new.scope ->> 'editionId', '')::uuid;
      v_show_id := nullif(new.scope ->> 'showId', '')::uuid;
      v_voter_id := nullif(new.scope ->> 'voterId', '')::uuid;
      v_voter_country_id := nullif(new.scope ->> 'voterCountryId', '')::uuid;
      v_voter_entity_id := nullif(new.scope ->> 'voterEntityId', '')::uuid;
      v_aggregate_version := coalesce(nullif(new.scope ->> 'expectedVersion', '')::bigint, 0) + 1;
    exception when invalid_text_representation then
      raise exception 'Completed Jury DNV operation has invalid event provenance'
        using errcode = '23514';
    end;

    if v_edition_id is null
       or v_show_id is null
       or (v_voter_id is null and v_voter_country_id is null and v_voter_entity_id is null) then
      raise exception 'Completed Jury DNV operation lacks event provenance'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.shows show_row
      where show_row.id = v_show_id
        and show_row.edition_id = v_edition_id
    ) then
      raise exception 'Completed Jury DNV operation is outside canonical show scope'
        using errcode = '23514';
    end if;

    v_event_type := 'jury.ballot_changed';
    v_aggregate_type := 'jury_requirement';
    v_aggregate_id := v_show_id::text || ':' || case
      when v_voter_id is not null then 'voter:' || v_voter_id::text
      when v_voter_entity_id is not null then 'entity:' || v_voter_entity_id::text
      else 'country:' || v_voter_country_id::text
    end;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'showId', v_show_id,
      'voterId', v_voter_id,
      'voterCountryId', v_voter_country_id,
      'voterEntityId', v_voter_entity_id,
      'dnv', new.result -> 'dnv',
      'changeKind', case
        when new.command = 'jury.dnv.set' then 'dnv_set'
        else 'dnv_cleared'
      end
    ));
  else
    return new;
  end if;

  perform private.v3_emit_domain_event(
    v_event_type,
    v_aggregate_type,
    v_aggregate_id,
    v_aggregate_version,
    new.operation_id,
    v_edition_id,
    v_show_id,
    v_payload,
    1,
    v_consumers
  );

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_emit_media_review_operation_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_edition_id uuid;
  v_item jsonb;
  v_review_id uuid;
  v_asset_key text;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command <> 'media.review' then
    return new;
  end if;

  begin
    v_edition_id := nullif(new.scope ->> 'editionId', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Completed media review operation has invalid edition provenance'
      using errcode = '23514';
  end;

  if v_edition_id is null
     or jsonb_typeof(new.result) <> 'array'
     or jsonb_array_length(new.result) < 1 then
    raise exception 'Completed media review operation lacks event provenance'
      using errcode = '23514';
  end if;

  for v_item in select value from jsonb_array_elements(new.result)
  loop
    begin
      v_review_id := nullif(v_item ->> 'id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Completed media review contains invalid review provenance'
        using errcode = '23514';
    end;
    v_asset_key := nullif(btrim(coalesce(v_item ->> 'assetKey', '')), '');

    if v_review_id is null
       or v_asset_key is null
       or not exists (
         select 1
         from public.studio2_media_asset_reviews review_row
         where review_row.id = v_review_id
           and review_row.edition_id = v_edition_id
           and review_row.asset_key = v_asset_key
           and review_row.decision = v_item ->> 'decision'
       ) then
      raise exception 'Completed media review does not match canonical review evidence'
        using errcode = '23514';
    end if;

    perform private.v3_emit_domain_event(
      'media.reviewed',
      'media_review',
      v_review_id::text,
      0,
      new.operation_id,
      v_edition_id,
      null,
      jsonb_strip_nulls(jsonb_build_object(
        'reviewId', v_review_id,
        'assetKey', v_asset_key,
        'assetType', v_item ->> 'assetType',
        'countryId', v_item -> 'countryId',
        'entryId', v_item -> 'entryId',
        'decision', v_item ->> 'decision'
      )),
      1,
      array['media.tasks']::text[]
    );
  end loop;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_emit_notification_delivery_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_event_type text;
  v_command text;
  v_operation_id uuid;
  v_scope jsonb;
  v_request jsonb;
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      v_event_type := 'notification.queued';
      v_command := 'notification.queue';
    elsif new.status = 'sent' then
      v_event_type := 'notification.delivered';
      v_command := 'notification.deliver';
    elsif new.status = 'failed' then
      v_event_type := 'notification.failed';
      v_command := 'notification.fail';
    else
      return new;
    end if;
  else
    if old.status is not distinct from new.status then
      return new;
    end if;

    if old.status = 'failed' and new.status = 'pending' then
      v_event_type := 'notification.queued';
      v_command := 'notification.queue';
    elsif new.status = 'sent' then
      v_event_type := 'notification.delivered';
      v_command := 'notification.deliver';
    elsif new.status = 'failed' then
      v_event_type := 'notification.failed';
      v_command := 'notification.fail';
    else
      -- processing leases, quiet-hour deferrals, abandoned-lease recovery and
      -- suppression are operational states, not canonical notification facts.
      return new;
    end if;
  end if;

  v_operation_id := private.v3_notification_transition_operation_id(
    new.id,
    v_event_type,
    new.attempt_count
  );
  v_scope := jsonb_build_object('deliveryId', new.id);
  v_request := jsonb_build_object(
    'eventType', v_event_type,
    'attemptCount', new.attempt_count,
    'status', new.status
  );
  v_fingerprint := private.studio2_request_fingerprint(
    v_command,
    'R1',
    v_scope,
    v_request
  );

  insert into public.studio2_operation_receipts (
    operation_id,
    actor_id,
    idempotency_key,
    correlation_id,
    request_fingerprint,
    command,
    risk_class,
    scope,
    status,
    result,
    completed_at
  ) values (
    v_operation_id,
    auth.uid(),
    v_operation_id::text,
    v_operation_id,
    v_fingerprint,
    v_command,
    'R1',
    v_scope,
    'succeeded',
    jsonb_build_object(
      'ok', true,
      'deliveryId', new.id,
      'status', new.status,
      'attemptCount', new.attempt_count
    ),
    coalesce(new.sent_at, new.last_attempt_at, new.created_at, now())
  )
  on conflict (operation_id) do nothing;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = v_operation_id
  for update;

  if v_receipt.operation_id is null
     or v_receipt.actor_id is distinct from auth.uid()
     or v_receipt.command is distinct from v_command
     or v_receipt.idempotency_key is distinct from v_operation_id::text
     or v_receipt.request_fingerprint is distinct from v_fingerprint
     or v_receipt.scope is distinct from v_scope
     or v_receipt.status <> 'succeeded' then
    raise exception 'IDEMPOTENCY_CONFLICT: Notification transition identity has different semantics'
      using errcode = '23505';
  end if;

  perform private.v3_emit_domain_event(
    v_event_type,
    'notification_delivery',
    new.id::text,
    new.attempt_count::bigint,
    v_operation_id,
    null,
    null,
    jsonb_build_object(
      'deliveryId', new.id,
      'category', new.category,
      'sourceEventType', new.event_type,
      'subjectId', new.subject_id,
      'status', new.status,
      'attemptCount', new.attempt_count
    ),
    1,
    array['notification.tasks']::text[]
  );

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_emit_prediction_round_operation_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_round_id uuid;
  v_show_id uuid;
  v_edition_id uuid;
  v_round_version bigint;
  v_current_version bigint;
  v_action text;
  v_round public.prediction_rounds%rowtype;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command not in ('prediction.configure', 'prediction.lock', 'prediction.publish')
     or coalesce((new.result ->> 'changed')::boolean, false) is false then
    return new;
  end if;

  begin
    v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
    v_show_id := nullif(new.result ->> 'showId', '')::uuid;
    v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
    v_round_version := nullif(new.result ->> 'roundVersion', '')::bigint;
  exception when invalid_text_representation then
    raise exception 'Completed Prediction round operation has invalid event provenance'
      using errcode = '23514';
  end;
  v_action := new.result ->> 'action';

  if v_action = 'delete' then
    if exists (select 1 from public.prediction_rounds where id = v_round_id) then
      raise exception 'Deleted Prediction round still exists at event emission'
        using errcode = '23514';
    end if;
  else
    select * into v_round from public.prediction_rounds where id = v_round_id;
    select version into v_current_version
    from public.studio2_prediction_round_versions
    where round_id = v_round_id;
    if v_round.id is null
       or v_round.show_id is distinct from v_show_id
       or v_current_version is distinct from v_round_version then
      raise exception 'Completed Prediction round operation lacks canonical event provenance'
        using errcode = '23514';
    end if;
  end if;

  perform private.v3_emit_domain_event(
    'prediction.changed',
    'prediction_round',
    v_round_id::text,
    v_round_version,
    new.operation_id,
    v_edition_id,
    v_show_id,
    jsonb_strip_nulls(jsonb_build_object(
      'roundId', v_round_id,
      'action', v_action,
      'previousStatus', new.result ->> 'previousStatus',
      'status', new.result ->> 'status',
      'opensAt', new.result -> 'opensAt',
      'locksAt', new.result -> 'locksAt',
      'predictionTypes', new.result -> 'predictionTypes',
      'consensusMinimum', new.result -> 'consensusMinimum',
      'previousRoundVersion', new.result -> 'previousRoundVersion',
      'roundVersion', new.result -> 'roundVersion'
    )),
    1,
    array[]::text[]
  );

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_emit_prediction_score_operation_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_round_id uuid;
  v_show_id uuid;
  v_edition_id uuid;
  v_score_revision bigint;
  v_current_revision bigint;
  v_actual_show_id uuid;
  v_actual_edition_id uuid;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command <> 'prediction.score' then
    return new;
  end if;

  begin
    v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
    v_show_id := nullif(new.result ->> 'showId', '')::uuid;
    v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
    v_score_revision := nullif(new.result ->> 'scoreRevision', '')::bigint;
  exception when invalid_text_representation then
    raise exception 'Completed Prediction score operation has invalid event provenance'
      using errcode = '23514';
  end;

  select round_row.show_id, show_row.edition_id
  into v_actual_show_id, v_actual_edition_id
  from public.prediction_rounds round_row
  join public.shows show_row on show_row.id = round_row.show_id
  where round_row.id = v_round_id;

  select version_row.version
  into v_current_revision
  from public.studio2_prediction_score_versions version_row
  where version_row.round_id = v_round_id;

  if v_round_id is null
     or v_show_id is null
     or v_edition_id is null
     or v_score_revision is null
     or v_actual_show_id is distinct from v_show_id
     or v_actual_edition_id is distinct from v_edition_id
     or v_current_revision is distinct from v_score_revision then
    raise exception 'Completed Prediction score operation lacks canonical event provenance'
      using errcode = '23514';
  end if;

  perform private.v3_emit_domain_event(
    'prediction.scored',
    'prediction_score',
    v_round_id::text,
    v_score_revision,
    new.operation_id,
    v_edition_id,
    v_show_id,
    jsonb_build_object(
      'roundId', v_round_id,
      'scoredCount', (new.result ->> 'scoredCount')::integer,
      'scoringVersion', new.result ->> 'scoringVersion',
      'previousScoreRevision', (new.result ->> 'previousScoreRevision')::bigint,
      'scoreRevision', v_score_revision,
      'status', new.result ->> 'status'
    ),
    1,
    array[]::text[]
  );

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_emit_publication_operation_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_show_id uuid;
  v_edition_id uuid;
  v_state text;
  v_version bigint;
  v_results_public boolean := false;
  v_consumers text[] := array['publication.tasks']::text[];
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command <> 'publication.show.change' then
    return new;
  end if;

  begin
    v_show_id := nullif(new.scope ->> 'showId', '')::uuid;
    v_version := nullif(new.result ->> 'version', '')::bigint;
  exception when invalid_text_representation then
    raise exception 'Completed publication operation has invalid event provenance'
      using errcode = '23514';
  end;
  v_state := nullif(btrim(coalesce(new.result ->> 'state', '')), '');

  select control.edition_id,
         coalesce((control.frozen_config ->> 'results')::boolean, false)
  into v_edition_id, v_results_public
  from public.studio2_show_publication_controls control
  where control.show_id = v_show_id
    and control.version = v_version
    and control.state = v_state;

  if v_show_id is null
     or v_edition_id is null
     or v_state is null
     or v_version is null then
    raise exception 'Completed publication operation does not match canonical publication state'
      using errcode = '23514';
  end if;

  if v_state = 'public' and v_results_public then
    v_consumers := array['publication.tasks', 'publication.notifications']::text[];
  end if;

  perform private.v3_emit_domain_event(
    'publication.changed',
    'publication',
    v_show_id::text,
    v_version,
    new.operation_id,
    v_edition_id,
    v_show_id,
    jsonb_build_object(
      'showId', v_show_id,
      'state', v_state,
      'version', v_version
    ),
    1,
    v_consumers
  );

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_emit_televote_deadline_operation_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'televoting'
AS $function$
declare
  v_event_type text;
  v_round_id uuid;
  v_edition_id uuid;
  v_round_version bigint;
  v_payload jsonb;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command <> 'televote.deadline.change' then
    return new;
  end if;

  begin
    v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
    v_edition_id := nullif(new.scope ->> 'solarisEditionId', '')::uuid;
    v_round_version := nullif(new.result ->> 'roundVersion', '')::bigint;
  exception when invalid_text_representation then
    raise exception 'Completed Televote deadline operation has invalid event provenance'
      using errcode = '23514';
  end;

  if v_round_id is null or v_edition_id is null or v_round_version is null then
    raise exception 'Completed Televote deadline operation lacks event provenance'
      using errcode = '23514';
  end if;

  if private.v3_televote_solaris_edition_for_round(v_round_id)
     is distinct from v_edition_id then
    raise exception 'Completed Televote deadline operation is outside canonical edition scope'
      using errcode = '23514';
  end if;

  v_event_type := case
    when new.result ->> 'action' = 'extend' then 'televote.extended'
    else 'televote.deadline_set'
  end;
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'roundId', v_round_id,
    'status', new.result ->> 'status',
    'previousDeadline', new.result -> 'previousDeadline',
    'deadline', new.result -> 'deadline',
    'previousRoundVersion', new.result -> 'previousRoundVersion',
    'roundVersion', new.result -> 'roundVersion'
  ));

  perform private.v3_emit_domain_event(
    v_event_type,
    'televote_round',
    v_round_id::text,
    v_round_version,
    new.operation_id,
    v_edition_id,
    null,
    v_payload,
    1,
    array['televote.tasks']::text[]
  );

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_emit_televote_operation_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'televoting'
AS $function$
declare
  v_event_type text;
  v_aggregate_type text;
  v_aggregate_id text;
  v_aggregate_version bigint;
  v_edition_id uuid;
  v_round_id uuid;
  v_submission_id uuid;
  v_preflight_id uuid;
  v_payload jsonb := '{}'::jsonb;
  v_consumers text[] := array['televote.tasks']::text[];
begin
  if old.status = 'succeeded' or new.status <> 'succeeded' then
    return new;
  end if;

  if new.command in ('televote.round.open', 'televote.round.closed') then
    begin
      v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
      v_edition_id := nullif(new.scope ->> 'solarisEditionId', '')::uuid;
      v_aggregate_version := nullif(new.result ->> 'roundVersion', '')::bigint;
    exception when invalid_text_representation then
      raise exception 'Completed Televote round operation has invalid event provenance'
        using errcode = '23514';
    end;

    if v_round_id is null or v_edition_id is null or v_aggregate_version is null then
      raise exception 'Completed Televote round operation lacks event provenance'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from televoting.rounds round_row
      join public.integration_links link
        on link.service = 'televoting'
       and link.entity_type = 'edition'
       and link.remote_id = round_row.edition_id::text
       and link.solaris_id = v_edition_id
      where round_row.id = v_round_id
    ) then
      raise exception 'Completed Televote round operation is outside canonical edition scope'
        using errcode = '23514';
    end if;

    v_event_type := case
      when new.command = 'televote.round.open' then 'televote.opened'
      else 'televote.closed'
    end;
    v_aggregate_type := 'televote_round';
    v_aggregate_id := v_round_id::text;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'roundId', v_round_id,
      'status', new.result ->> 'status',
      'previousGlobalVersion', new.result -> 'previousGlobalVersion',
      'globalVersion', new.result -> 'globalVersion',
      'previousRoundVersion', new.result -> 'previousRoundVersion',
      'roundVersion', new.result -> 'roundVersion'
    ));

    if v_event_type = 'televote.opened' then
      v_consumers := array['televote.tasks', 'televote.notifications']::text[];
    end if;

  elsif new.command = 'televote.submit' then
    begin
      v_submission_id := nullif(new.result ->> 'submissionId', '')::uuid;
      v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
      v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
      v_preflight_id := nullif(new.result ->> 'preflightId', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Completed Televote submission operation has invalid event provenance'
        using errcode = '23514';
    end;

    if v_submission_id is null
       or v_round_id is null
       or v_edition_id is null
       or v_preflight_id is null then
      raise exception 'Completed Televote submission operation lacks event provenance'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from televoting.vote_submissions submission
      join televoting.vote_preflight_checks preflight
        on preflight.id = v_preflight_id
       and preflight.channel = 'televote'
       and preflight.submission_id = submission.id
       and preflight.round_id = submission.round_id
      join televoting.rounds round_row on round_row.id = submission.round_id
      join public.integration_links link
        on link.service = 'televoting'
       and link.entity_type = 'edition'
       and link.remote_id = round_row.edition_id::text
       and link.solaris_id = v_edition_id
      where submission.id = v_submission_id
        and submission.round_id = v_round_id
        and not submission.is_historical
    ) then
      raise exception 'Completed Televote submission does not match canonical ballot/preflight scope'
        using errcode = '23514';
    end if;

    v_event_type := 'televote.ballot_submitted';
    v_aggregate_type := 'televote_ballot';
    v_aggregate_id := v_submission_id::text;
    v_aggregate_version := 0;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'submissionId', v_submission_id,
      'roundId', v_round_id,
      'preflightId', v_preflight_id,
      'status', new.result ->> 'status'
    ));
  else
    return new;
  end if;

  perform private.v3_emit_domain_event(
    v_event_type,
    v_aggregate_type,
    v_aggregate_id,
    v_aggregate_version,
    new.operation_id,
    v_edition_id,
    null,
    v_payload,
    1,
    v_consumers
  );

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_reject_domain_event_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
begin
  raise exception 'Canonical domain events are immutable' using errcode = '55000';
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_reject_result_version_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
begin
  raise exception 'Result version evidence is immutable' using errcode = '55000';
end
$function$;

ALTER TABLE "private"."v3_domain_event_outbox" ADD CONSTRAINT "v3_domain_event_outbox_attempt_check" CHECK (attempt_count >= 0);

ALTER TABLE "private"."v3_domain_event_outbox" ADD CONSTRAINT "v3_domain_event_outbox_consumer_check" CHECK (consumer_key ~ '^[a-z][a-z0-9_.:-]{0,159}$'::text);

ALTER TABLE "private"."v3_domain_event_outbox" ADD CONSTRAINT "v3_domain_event_outbox_error_code_check" CHECK (last_error_code IS NULL OR length(last_error_code) >= 1 AND length(last_error_code) <= 160);

ALTER TABLE "private"."v3_domain_event_outbox" ADD CONSTRAINT "v3_domain_event_outbox_error_metadata_check" CHECK (last_error_metadata IS NULL OR jsonb_typeof(last_error_metadata) = 'object'::text AND pg_column_size(last_error_metadata) <= 8192);

ALTER TABLE "private"."v3_domain_event_outbox" ADD CONSTRAINT "v3_domain_event_outbox_lifecycle_check" CHECK (status = 'pending'::text AND lease_owner IS NULL AND lease_expires_at IS NULL AND completed_at IS NULL AND dead_lettered_at IS NULL OR status = 'processing'::text AND NULLIF(btrim(lease_owner), ''::text) IS NOT NULL AND lease_expires_at IS NOT NULL AND completed_at IS NULL AND dead_lettered_at IS NULL OR status = 'completed'::text AND lease_owner IS NULL AND lease_expires_at IS NULL AND completed_at IS NOT NULL AND dead_lettered_at IS NULL OR status = 'dead_letter'::text AND lease_owner IS NULL AND lease_expires_at IS NULL AND completed_at IS NULL AND dead_lettered_at IS NOT NULL);

ALTER TABLE "private"."v3_domain_event_outbox" ADD CONSTRAINT "v3_domain_event_outbox_pkey" PRIMARY KEY (event_id, consumer_key);

ALTER TABLE "private"."v3_domain_event_outbox" ADD CONSTRAINT "v3_domain_event_outbox_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'dead_letter'::text]));

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_aggregate_id_check" CHECK (length(aggregate_id) >= 1 AND length(aggregate_id) <= 240);

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_aggregate_type_check" CHECK (aggregate_type ~ '^[a-z][a-z0-9_-]*$'::text);

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_aggregate_version_check" CHECK (aggregate_version >= 0);

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_event_type_check" CHECK (event_type ~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$'::text);

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_operation_fact_unique" UNIQUE (operation_id, event_type, aggregate_type, aggregate_id, aggregate_version);

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_payload_check" CHECK (jsonb_typeof(payload) = 'object'::text AND pg_column_size(payload) <= 65536);

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_pkey" PRIMARY KEY (id);

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_schema_version_check" CHECK (schema_version >= 1);

ALTER TABLE "private"."v3_result_versions" ADD CONSTRAINT "v3_result_versions_pkey" PRIMARY KEY (show_id, version);

ALTER TABLE "private"."v3_result_versions" ADD CONSTRAINT "v3_result_versions_result_row_count_check" CHECK (result_row_count >= 0);

ALTER TABLE "private"."v3_result_versions" ADD CONSTRAINT "v3_result_versions_result_rows_check" CHECK (jsonb_typeof(result_rows) = 'array'::text);

ALTER TABLE "private"."v3_result_versions" ADD CONSTRAINT "v3_result_versions_version_check" CHECK (version > 0);

ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "admin_notifications_activation_version_check" CHECK (activation_version > 0);

ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "admin_notifications_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "admin_notifications_resolution_mode_check" CHECK (resolution_mode = ANY (ARRAY['manual'::text, 'domain'::text]));

ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "admin_notifications_severity_check" CHECK (severity = ANY (ARRAY['info'::text, 'warning'::text, 'action'::text, 'critical'::text, 'success'::text]));

ALTER TABLE "public"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_route_check" CHECK (route ~~ '/%'::text);

ALTER TABLE "public"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'suppressed'::text]));

ALTER TABLE "public"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_dedupe_key_key" UNIQUE (user_id, dedupe_key);

ALTER TABLE "public"."studio2_edition_runtime" ADD CONSTRAINT "studio2_edition_runtime_pkey" PRIMARY KEY (edition_id);

ALTER TABLE "public"."studio2_edition_runtime" ADD CONSTRAINT "studio2_edition_runtime_state_check" CHECK (state = ANY (ARRAY['draft'::text, 'planning'::text, 'host_selection'::text, 'confirmations'::text, 'submissions'::text, 'pre_show'::text, 'rehearsals'::text, 'jury_voting'::text, 'live_show'::text, 'televoting'::text, 'vote_verification'::text, 'results'::text, 'post_edition'::text, 'archived'::text]));

ALTER TABLE "public"."studio2_edition_runtime" ADD CONSTRAINT "studio2_edition_runtime_subsystems_object_check" CHECK (jsonb_typeof(subsystems) = 'object'::text);

ALTER TABLE "public"."studio2_edition_runtime" ADD CONSTRAINT "studio2_edition_runtime_subsystems_shape_check" CHECK (subsystems ?& ARRAY['confirmations'::text, 'submissions'::text, 'juryVoting'::text, 'televoting'::text, 'results'::text, 'predictions'::text] AND ((subsystems ->> 'confirmations'::text) = ANY (ARRAY['not_started'::text, 'open'::text, 'paused'::text, 'closed'::text, 'locked'::text, 'verified'::text, 'published'::text])) AND ((subsystems ->> 'submissions'::text) = ANY (ARRAY['not_started'::text, 'open'::text, 'paused'::text, 'closed'::text, 'locked'::text, 'verified'::text, 'published'::text])) AND ((subsystems ->> 'juryVoting'::text) = ANY (ARRAY['not_started'::text, 'open'::text, 'paused'::text, 'closed'::text, 'locked'::text, 'verified'::text, 'published'::text])) AND ((subsystems ->> 'televoting'::text) = ANY (ARRAY['not_started'::text, 'open'::text, 'paused'::text, 'closed'::text, 'locked'::text, 'verified'::text, 'published'::text])) AND ((subsystems ->> 'results'::text) = ANY (ARRAY['not_started'::text, 'open'::text, 'paused'::text, 'closed'::text, 'locked'::text, 'verified'::text, 'published'::text])) AND ((subsystems ->> 'predictions'::text) = ANY (ARRAY['not_started'::text, 'open'::text, 'paused'::text, 'closed'::text, 'locked'::text, 'verified'::text, 'published'::text])));

ALTER TABLE "public"."studio2_edition_runtime" ADD CONSTRAINT "studio2_edition_runtime_version_check" CHECK (version > 0);

ALTER TABLE "public"."studio2_operation_receipts" ADD CONSTRAINT "studio2_operation_receipts_actor_id_command_idempotency_key_key" UNIQUE (actor_id, command, idempotency_key);

ALTER TABLE "public"."studio2_operation_receipts" ADD CONSTRAINT "studio2_operation_receipts_command_check" CHECK (length(btrim(command)) >= 1 AND length(btrim(command)) <= 160);

ALTER TABLE "public"."studio2_operation_receipts" ADD CONSTRAINT "studio2_operation_receipts_completion_check" CHECK (status = 'processing'::text AND completed_at IS NULL AND error_code IS NULL OR status = 'succeeded'::text AND completed_at IS NOT NULL AND error_code IS NULL OR (status = ANY (ARRAY['failed'::text, 'uncertain'::text])) AND completed_at IS NOT NULL AND error_code IS NOT NULL);

ALTER TABLE "public"."studio2_operation_receipts" ADD CONSTRAINT "studio2_operation_receipts_error_code_check" CHECK (error_code IS NULL OR (error_code = ANY (ARRAY['AUTHENTICATION'::text, 'AUTHORIZATION'::text, 'VALIDATION'::text, 'STATE_CHANGED'::text, 'VERSION_CONFLICT'::text, 'IDEMPOTENCY_CONFLICT'::text, 'RATE_LIMIT'::text, 'DEPENDENCY_FAILURE'::text, 'DATABASE'::text, 'STORAGE'::text, 'TIMEOUT'::text, 'UNKNOWN'::text])));

ALTER TABLE "public"."studio2_operation_receipts" ADD CONSTRAINT "studio2_operation_receipts_error_metadata_check" CHECK (error_metadata IS NULL OR jsonb_typeof(error_metadata) = 'object'::text AND pg_column_size(error_metadata) <= 8192);

ALTER TABLE "public"."studio2_operation_receipts" ADD CONSTRAINT "studio2_operation_receipts_fingerprint_check" CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE "public"."studio2_operation_receipts" ADD CONSTRAINT "studio2_operation_receipts_pkey" PRIMARY KEY (operation_id);

ALTER TABLE "public"."studio2_operation_receipts" ADD CONSTRAINT "studio2_operation_receipts_risk_class_check" CHECK (risk_class = ANY (ARRAY['R0'::text, 'R1'::text, 'R2'::text, 'R3'::text]));

ALTER TABLE "public"."studio2_operation_receipts" ADD CONSTRAINT "studio2_operation_receipts_v3_status_check" CHECK (status = ANY (ARRAY['processing'::text, 'succeeded'::text, 'failed'::text, 'uncertain'::text]));

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_href_check" CHECK (href ~~ '/%'::text);

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_priority_check" CHECK (priority = ANY (ARRAY['critical'::text, 'high'::text, 'normal'::text]));

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_resolution_consistency" CHECK (state = 'resolved'::text AND resolved_at IS NOT NULL OR state <> 'resolved'::text AND resolved_at IS NULL);

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_resolution_predicate_check" CHECK (jsonb_typeof(resolution_predicate) = 'object'::text);

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_source_id_check" CHECK (length(btrim(source_id)) >= 1 AND length(btrim(source_id)) <= 200);

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_source_key_check" CHECK (length(btrim(source_key)) >= 1 AND length(btrim(source_key)) <= 280);

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_source_key_key" UNIQUE (source_key);

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_source_kind_check" CHECK (length(btrim(source_kind)) >= 1 AND length(btrim(source_kind)) <= 80);

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_state_check" CHECK (state = ANY (ARRAY['open'::text, 'waiting'::text, 'resolved'::text]));

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_task_type_check" CHECK (length(btrim(task_type)) >= 1 AND length(btrim(task_type)) <= 100);

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_title_check" CHECK (length(btrim(title)) >= 1 AND length(btrim(title)) <= 220);

-- Foreign keys run AFTER all primary/unique constraints exist.

ALTER TABLE "private"."v3_domain_event_outbox" ADD CONSTRAINT "v3_domain_event_outbox_event_id_fkey" FOREIGN KEY (event_id) REFERENCES private.v3_domain_events(id) ON DELETE RESTRICT;

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE RESTRICT;

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_operation_id_fkey" FOREIGN KEY (operation_id) REFERENCES studio2_operation_receipts(operation_id) ON DELETE RESTRICT;

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE RESTRICT;

ALTER TABLE "private"."v3_result_versions" ADD CONSTRAINT "v3_result_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "private"."v3_result_versions" ADD CONSTRAINT "v3_result_versions_show_edition_fk" FOREIGN KEY (show_id, edition_id) REFERENCES shows(id, edition_id);

ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "admin_notifications_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_edition_runtime" ADD CONSTRAINT "studio2_edition_runtime_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_edition_runtime" ADD CONSTRAINT "studio2_edition_runtime_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_operation_receipts" ADD CONSTRAINT "studio2_operation_receipts_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_required_capability_fkey" FOREIGN KEY (required_capability) REFERENCES studio2_capabilities(key) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX v3_domain_event_outbox_claim_idx ON private.v3_domain_event_outbox USING btree (consumer_key, status, available_at, lease_expires_at, created_at);

CREATE INDEX v3_domain_event_outbox_dead_letter_idx ON private.v3_domain_event_outbox USING btree (consumer_key, dead_lettered_at DESC) WHERE (status = 'dead_letter'::text);

CREATE INDEX v3_domain_events_aggregate_idx ON private.v3_domain_events USING btree (aggregate_type, aggregate_id, aggregate_version DESC);

CREATE INDEX v3_domain_events_correlation_time_idx ON private.v3_domain_events USING btree (correlation_id, occurred_at, id);

CREATE INDEX v3_domain_events_scope_time_idx ON private.v3_domain_events USING btree (edition_id, show_id, occurred_at DESC);

CREATE INDEX admin_notifications_recipient_idx ON public.admin_notifications USING btree (recipient_id, read_at, created_at DESC);

CREATE INDEX admin_notifications_recipient_resolved_idx ON public.admin_notifications USING btree (recipient_id, resolved_at, created_at DESC);

CREATE UNIQUE INDEX admin_notifications_source_unique_idx ON public.admin_notifications USING btree (recipient_id, source_key) WHERE (source_key IS NOT NULL);

CREATE INDEX notification_deliveries_pending_idx ON public.notification_deliveries USING btree (status, scheduled_for) WHERE (status = 'pending'::text);

CREATE INDEX notification_deliveries_processing_lease_idx ON public.notification_deliveries USING btree (processing_started_at) WHERE (status = 'processing'::text);

CREATE INDEX notification_deliveries_user_idx ON public.notification_deliveries USING btree (user_id, created_at DESC);

CREATE INDEX studio2_edition_runtime_updated_by_idx ON public.studio2_edition_runtime USING btree (updated_by);

CREATE INDEX studio2_operation_receipts_actor_time_idx ON public.studio2_operation_receipts USING btree (actor_id, created_at DESC);

CREATE INDEX studio2_operation_receipts_command_time_idx ON public.studio2_operation_receipts USING btree (command, created_at DESC);

CREATE INDEX studio2_operation_receipts_correlation_time_idx ON public.studio2_operation_receipts USING btree (correlation_id, created_at DESC);

CREATE INDEX studio2_organizer_tasks_assignee_idx ON public.studio2_organizer_tasks USING btree (assigned_to, state, opened_at DESC) WHERE (assigned_to IS NOT NULL);

CREATE INDEX studio2_organizer_tasks_open_idx ON public.studio2_organizer_tasks USING btree (edition_id, priority, due_at, opened_at DESC) WHERE (state <> 'resolved'::text);

CREATE INDEX studio2_organizer_tasks_source_idx ON public.studio2_organizer_tasks USING btree (source_kind, source_id);

CREATE TRIGGER v3_domain_events_immutable BEFORE DELETE OR UPDATE ON private.v3_domain_events FOR EACH ROW EXECUTE FUNCTION private.v3_reject_domain_event_mutation();

CREATE TRIGGER v3_reject_result_version_mutation BEFORE DELETE OR UPDATE ON private.v3_result_versions FOR EACH ROW EXECUTE FUNCTION private.v3_reject_result_version_mutation();

CREATE TRIGGER studio2_bump_notification_activation BEFORE UPDATE OF resolved_at ON admin_notifications FOR EACH ROW EXECUTE FUNCTION private.studio2_bump_notification_activation();

CREATE TRIGGER studio2_guard_domain_notification_resolution BEFORE UPDATE ON admin_notifications FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_domain_notification_resolution();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON admin_notifications FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON notification_deliveries FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER studio2_version_organizer_delivery_dedupe BEFORE INSERT ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION private.studio2_version_organizer_delivery_dedupe();

CREATE TRIGGER v3_emit_notification_delivery_event AFTER INSERT OR UPDATE OF status ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION private.v3_emit_notification_delivery_event();

CREATE TRIGGER studio2_edition_runtime_strict_dual_guard BEFORE INSERT OR UPDATE ON studio2_edition_runtime FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_edition_runtime_strict_dual();

CREATE TRIGGER studio2_edition_runtime_touch_updated_at BEFORE UPDATE ON studio2_edition_runtime FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_updated_at();

CREATE TRIGGER v3_emit_access_operation_events AFTER UPDATE OF status, result ON studio2_operation_receipts FOR EACH ROW EXECUTE FUNCTION private.v3_emit_access_operation_events();

CREATE TRIGGER v3_emit_confirmation_operation_event AFTER UPDATE OF status ON studio2_operation_receipts FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status AND new.status = 'succeeded'::text) EXECUTE FUNCTION private.v3_emit_confirmation_operation_event();

CREATE TRIGGER v3_emit_entry_operation_event AFTER UPDATE OF status ON studio2_operation_receipts FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status AND new.status = 'succeeded'::text) EXECUTE FUNCTION private.v3_emit_entry_operation_event();

CREATE TRIGGER v3_emit_jury_operation_event AFTER UPDATE OF status ON studio2_operation_receipts FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status AND new.status = 'succeeded'::text) EXECUTE FUNCTION private.v3_emit_jury_operation_event();

CREATE TRIGGER v3_emit_media_review_operation_event AFTER UPDATE OF status ON studio2_operation_receipts FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status AND new.status = 'succeeded'::text) EXECUTE FUNCTION private.v3_emit_media_review_operation_event();

CREATE TRIGGER v3_emit_prediction_round_operation_event AFTER UPDATE OF status, result ON studio2_operation_receipts FOR EACH ROW EXECUTE FUNCTION private.v3_emit_prediction_round_operation_event();

CREATE TRIGGER v3_emit_prediction_score_operation_event AFTER UPDATE OF status, result ON studio2_operation_receipts FOR EACH ROW EXECUTE FUNCTION private.v3_emit_prediction_score_operation_event();

CREATE TRIGGER v3_emit_publication_operation_event AFTER UPDATE OF status ON studio2_operation_receipts FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status AND new.status = 'succeeded'::text) EXECUTE FUNCTION private.v3_emit_publication_operation_event();

CREATE TRIGGER v3_emit_televote_deadline_operation_event AFTER UPDATE OF status ON studio2_operation_receipts FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status AND new.status = 'succeeded'::text) EXECUTE FUNCTION private.v3_emit_televote_deadline_operation_event();

CREATE TRIGGER v3_emit_televote_operation_event AFTER UPDATE OF status ON studio2_operation_receipts FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status AND new.status = 'succeeded'::text) EXECUTE FUNCTION private.v3_emit_televote_operation_event();

ALTER TABLE "private"."v3_domain_event_outbox" DISABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."v3_domain_event_outbox" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "private"."v3_domain_events" DISABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."v3_domain_events" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "private"."v3_result_versions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."v3_result_versions" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."admin_notifications" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."admin_notifications" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "Organizers read own notifications" ON "public"."admin_notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((recipient_id = ( SELECT auth.uid() AS uid)) AND studio2_access_allowed('edition.manage'::text, NULL::uuid, false)));

CREATE POLICY "Organizers update own notifications" ON "public"."admin_notifications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((recipient_id = ( SELECT auth.uid() AS uid)) AND studio2_access_allowed('edition.manage'::text, NULL::uuid, false))) WITH CHECK (((recipient_id = ( SELECT auth.uid() AS uid)) AND studio2_access_allowed('edition.manage'::text, NULL::uuid, false)));

ALTER TABLE "public"."notification_deliveries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."notification_deliveries" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "users read own notification deliveries" ON "public"."notification_deliveries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));

ALTER TABLE "public"."studio2_edition_runtime" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_edition_runtime" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "studio2_edition_runtime_capability_read" ON "public"."studio2_edition_runtime" AS PERMISSIVE FOR SELECT TO "authenticated" USING (studio2_access_allowed('edition.read'::text, edition_id, false));

ALTER TABLE "public"."studio2_operation_receipts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_operation_receipts" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_organizer_tasks" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_organizer_tasks" NO FORCE ROW LEVEL SECURITY;

GRANT INSERT, SELECT ON private.v3_result_versions TO "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON public.admin_notifications TO "service_role";

GRANT SELECT ON public.admin_notifications TO "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON public.notification_deliveries TO "anon";

GRANT DELETE, INSERT, SELECT, UPDATE ON public.notification_deliveries TO "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON public.notification_deliveries TO "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON public.studio2_edition_runtime TO "service_role";

GRANT SELECT ON public.studio2_edition_runtime TO "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON public.studio2_operation_receipts TO "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON public.studio2_organizer_tasks TO "service_role";

SET check_function_bodies = on;

COMMIT;
