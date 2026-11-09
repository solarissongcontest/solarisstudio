-- S02 local-only reconstruction of nine hosted-observed S14 external parent schemas.

-- Sourced from read-only hosted PG17.11 2026-11-09 catalog; zero application rows.

-- Applied ONLY to disposable 47-relation S14 fixture; NEVER hosted migration.

BEGIN;

SET search_path = public,private,auth,televoting,pg_catalog;

SET check_function_bodies=off;

DO $roles$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin NOLOGIN; END IF; END $roles$;

ALTER TABLE "auth"."users" ADD COLUMN "instance_id" uuid;

ALTER TABLE "auth"."users" ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "auth"."users" ADD COLUMN "aud" character varying(255);

ALTER TABLE "auth"."users" ADD COLUMN "role" character varying(255);

ALTER TABLE "auth"."users" ADD COLUMN "email" character varying(255);

ALTER TABLE "auth"."users" ADD COLUMN "encrypted_password" character varying(255);

ALTER TABLE "auth"."users" ADD COLUMN "email_confirmed_at" timestamp with time zone;

ALTER TABLE "auth"."users" ADD COLUMN "invited_at" timestamp with time zone;

ALTER TABLE "auth"."users" ADD COLUMN "confirmation_token" character varying(255);

ALTER TABLE "auth"."users" ADD COLUMN "confirmation_sent_at" timestamp with time zone;

ALTER TABLE "auth"."users" ADD COLUMN "recovery_token" character varying(255);

ALTER TABLE "auth"."users" ADD COLUMN "recovery_sent_at" timestamp with time zone;

ALTER TABLE "auth"."users" ADD COLUMN "email_change_token_new" character varying(255);

ALTER TABLE "auth"."users" ADD COLUMN "email_change" character varying(255);

ALTER TABLE "auth"."users" ADD COLUMN "email_change_sent_at" timestamp with time zone;

ALTER TABLE "auth"."users" ADD COLUMN "last_sign_in_at" timestamp with time zone;

ALTER TABLE "auth"."users" ADD COLUMN "raw_app_meta_data" jsonb;

ALTER TABLE "auth"."users" ADD COLUMN "raw_user_meta_data" jsonb;

ALTER TABLE "auth"."users" ADD COLUMN "is_super_admin" boolean;

ALTER TABLE "auth"."users" ADD COLUMN "created_at" timestamp with time zone;

ALTER TABLE "auth"."users" ADD COLUMN "updated_at" timestamp with time zone;

ALTER TABLE "auth"."users" ADD COLUMN "phone" text DEFAULT NULL::character varying;

ALTER TABLE "auth"."users" ADD COLUMN "phone_confirmed_at" timestamp with time zone;

ALTER TABLE "auth"."users" ADD COLUMN "phone_change" text DEFAULT ''::character varying;

ALTER TABLE "auth"."users" ADD COLUMN "phone_change_token" character varying(255) DEFAULT ''::character varying;

ALTER TABLE "auth"."users" ADD COLUMN "phone_change_sent_at" timestamp with time zone;

ALTER TABLE "auth"."users" ADD COLUMN "confirmed_at" timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED;

ALTER TABLE "auth"."users" ADD COLUMN "email_change_token_current" character varying(255) DEFAULT ''::character varying;

ALTER TABLE "auth"."users" ADD COLUMN "email_change_confirm_status" smallint DEFAULT 0;

ALTER TABLE "auth"."users" ADD COLUMN "banned_until" timestamp with time zone;

ALTER TABLE "auth"."users" ADD COLUMN "reauthentication_token" character varying(255) DEFAULT ''::character varying;

ALTER TABLE "auth"."users" ADD COLUMN "reauthentication_sent_at" timestamp with time zone;

ALTER TABLE "auth"."users" ADD COLUMN "is_sso_user" boolean DEFAULT false NOT NULL;

ALTER TABLE "auth"."users" ADD COLUMN "deleted_at" timestamp with time zone;

ALTER TABLE "auth"."users" ADD COLUMN "is_anonymous" boolean DEFAULT false NOT NULL;

ALTER TABLE "public"."contest_entities" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."contest_entities" ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "public"."contest_entities" ADD COLUMN "edition_id" uuid NOT NULL;

ALTER TABLE "public"."contest_entities" ADD COLUMN "entity_type" text NOT NULL;

ALTER TABLE "public"."contest_entities" ADD COLUMN "country_id" uuid;

ALTER TABLE "public"."contest_entities" ADD COLUMN "display_name" text NOT NULL;

ALTER TABLE "public"."contest_entities" ADD COLUMN "abbreviation" text NOT NULL;

ALTER TABLE "public"."contest_entities" ADD COLUMN "flag_image" text;

ALTER TABLE "public"."contest_entities" ADD COLUMN "region" text;

ALTER TABLE "public"."contest_entities" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "public"."contest_entities" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "public"."contest_entities" ADD COLUMN "historical_identity_override" boolean DEFAULT false NOT NULL;

ALTER TABLE "public"."countries" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."countries" ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "public"."countries" ADD COLUMN "name" text NOT NULL;

ALTER TABLE "public"."countries" ADD COLUMN "short_code" text NOT NULL;

ALTER TABLE "public"."countries" ADD COLUMN "flag_image" text;

ALTER TABLE "public"."countries" ADD COLUMN "region" text DEFAULT 'Terra Solaris'::text NOT NULL;

ALTER TABLE "public"."countries" ADD COLUMN "accent_color" text DEFAULT '#7dd3fc'::text NOT NULL;

ALTER TABLE "public"."countries" ADD COLUMN "description" text;

ALTER TABLE "public"."countries" ADD COLUMN "first_participation" integer;

ALTER TABLE "public"."countries" ADD COLUMN "statistics" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "public"."countries" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "public"."countries" ADD COLUMN "native_name" text;

ALTER TABLE "public"."countries" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "public"."countries" ADD COLUMN "flag_crop_x" numeric DEFAULT 50 NOT NULL;

ALTER TABLE "public"."countries" ADD COLUMN "flag_crop_y" numeric DEFAULT 50 NOT NULL;

ALTER TABLE "public"."countries" ADD COLUMN "flag_crop_zoom" numeric DEFAULT 1 NOT NULL;

ALTER TABLE "public"."country_accounts" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "public"."country_accounts" ALTER COLUMN "country_id" SET NOT NULL;

ALTER TABLE "public"."country_accounts" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "public"."country_accounts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "public"."country_accounts" ALTER COLUMN "status" SET DEFAULT 'active'::text;

ALTER TABLE "public"."country_accounts" ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE "public"."country_accounts" ADD COLUMN "suspension_reason" text;

ALTER TABLE "public"."country_accounts" ADD COLUMN "suspended_at" timestamp with time zone;

ALTER TABLE "public"."country_accounts" ADD COLUMN "suspended_by" uuid;

ALTER TABLE "public"."country_accounts" ADD COLUMN "instagram_username" text;

ALTER TABLE "public"."country_accounts" ADD COLUMN "display_name" text;

ALTER TABLE "public"."country_accounts" ADD COLUMN "hod_auto_assign_future" boolean DEFAULT true NOT NULL;

ALTER TABLE "public"."studio2_capabilities" ALTER COLUMN "key" SET NOT NULL;

ALTER TABLE "public"."studio2_capabilities" ADD COLUMN "domain" text NOT NULL;

ALTER TABLE "public"."studio2_capabilities" ADD COLUMN "label" text NOT NULL;

ALTER TABLE "public"."studio2_capabilities" ADD COLUMN "description" text NOT NULL;

ALTER TABLE "public"."studio2_capabilities" ADD COLUMN "access_level" text NOT NULL;

ALTER TABLE "public"."studio2_capabilities" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "public"."themes" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."themes" ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "public"."themes" ADD COLUMN "name" text NOT NULL;

ALTER TABLE "public"."themes" ADD COLUMN "description" text;

ALTER TABLE "public"."themes" ADD COLUMN "config" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "public"."themes" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;

ALTER TABLE "public"."themes" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "public"."themes" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "televoting"."countries" ALTER COLUMN "code" SET NOT NULL;

ALTER TABLE "televoting"."countries" ADD COLUMN "name" text NOT NULL;

ALTER TABLE "televoting"."countries" ADD COLUMN "flag" text DEFAULT '✦'::text NOT NULL;

ALTER TABLE "televoting"."countries" ADD COLUMN "flag_url" text;

ALTER TABLE "televoting"."editions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "televoting"."editions" ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "televoting"."editions" ADD COLUMN "name" text NOT NULL;

ALTER TABLE "televoting"."editions" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;

ALTER TABLE "televoting"."editions" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;

ALTER TABLE "televoting"."editions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "televoting"."editions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "televoting"."vote_preflight_checks" ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "round_id" uuid;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "username_normalized" text NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "country_code" text NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "ballot_map" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "ip_hash" text;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "fingerprint_hash" text;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "device_token_hash" text;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "ip_country" text;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "is_vpn" boolean DEFAULT false NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "hod_person_id" uuid;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "relationship_risk" integer DEFAULT 0 NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "risk_score" integer DEFAULT 0 NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "severity" text DEFAULT 'none'::text NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "requires_attestation" boolean DEFAULT false NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "findings" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "technical_signals" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "history_summary" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "statement_version" integer DEFAULT 1 NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "attested_at" timestamp with time zone;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "signed_name" text;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "attestation_text" text;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "attestation_ip_hash" text;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "submission_id" uuid;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "submitted_at" timestamp with time zone;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "expires_at" timestamp with time zone DEFAULT (now() + '00:20:00'::interval) NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "channel" text DEFAULT 'televote'::text NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "canonical_edition_id" uuid;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "show_id" uuid;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "account_user_id" uuid;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "jury_ballot_submission_id" uuid;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "model_version" text DEFAULT 'friend-voting-model-v3'::text NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "confidence" integer DEFAULT 0 NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "intervention_level" text DEFAULT 'none'::text NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "voter_reason_categories" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "admin_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "declaration_version" bigint DEFAULT 1 NOT NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "declaration_invalidated_at" timestamp with time zone;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "declaration_invalidated_by" uuid;

ALTER TABLE "televoting"."vote_preflight_checks" ADD COLUMN "declaration_invalidation_reason" text;

CREATE OR REPLACE FUNCTION public.bump_country_edition_revisions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  update public.editions e
  set data_revision = e.data_revision + 1
  where exists (
    select 1
    from public.participants p
    where p.edition_id = e.id
      and p.country_id = new.id
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.ensure_country_account_hod_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  insert into public.studio2_role_assignments (
    user_id,
    role_key,
    edition_id,
    expires_at,
    assigned_by
  )
  values (
    new.user_id,
    'hod'::text,
    null::uuid,
    null::timestamptz,
    null::uuid
  )
  on conflict on constraint studio2_role_assignments_scope_unique do nothing;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.reset_country_flag_crop_on_replace()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$ begin if new.flag_image is distinct from old.flag_image then new.flag_crop_x := 50; new.flag_crop_y := 50; new.flag_crop_zoom := 1; end if; return new; end; $function$;

CREATE OR REPLACE FUNCTION private.studio2_touch_voting_declaration_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private', 'televoting'
AS $function$
begin
  if row(
    new.attested_at,
    new.signed_name,
    new.attestation_text,
    new.statement_version,
    new.submission_id,
    new.submitted_at,
    new.declaration_invalidated_at,
    new.declaration_invalidated_by,
    new.declaration_invalidation_reason
  ) is distinct from row(
    old.attested_at,
    old.signed_name,
    old.attestation_text,
    old.statement_version,
    old.submission_id,
    old.submitted_at,
    old.declaration_invalidated_at,
    old.declaration_invalidated_by,
    old.declaration_invalidation_reason
  ) then
    new.declaration_version := old.declaration_version + 1;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_bridge_televote_submission_operation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'televoting', 'extensions'
AS $function$
declare
  v_submission televoting.vote_submissions%rowtype;
  v_operation_id uuid;
  v_edition_id uuid;
  v_scope jsonb;
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts%rowtype;
begin
  if new.channel <> 'televote'
     or new.submission_id is null
     or new.submitted_at is null
     or old.submission_id is not distinct from new.submission_id then
    return new;
  end if;

  select submission.*
  into v_submission
  from televoting.vote_submissions submission
  where submission.id = new.submission_id
    and submission.round_id is not distinct from new.round_id
    and submission.username_normalized is not distinct from new.username_normalized
    and upper(submission.country_code) is not distinct from upper(new.country_code)
    and not submission.is_historical;

  if v_submission.id is null then
    raise exception 'Completed Televote preflight does not match canonical ballot state'
      using errcode = '23514';
  end if;

  select link.solaris_id
  into v_edition_id
  from public.integration_links link
  join televoting.rounds round_row
    on round_row.id = new.round_id
   and link.remote_id = round_row.edition_id::text
  where link.service = 'televoting'
    and link.entity_type = 'edition'
  limit 1;

  if v_edition_id is null then
    raise exception 'Completed Televote ballot is not linked to a canonical Solaris edition'
      using errcode = '23514';
  end if;

  -- Recovery is deliberately additive. When a recovery handle exists its stable
  -- operation identity becomes the cross-system operation identity. If recovery
  -- creation failed before submission, the one-shot preflight UUID is already a
  -- deterministic idempotency identity and safely fills that role.
  select handle.operation_id
  into v_operation_id
  from private.v3_televote_recovery_handles handle
  where handle.preflight_id = new.id;

  v_operation_id := coalesce(v_operation_id, new.id);
  v_scope := jsonb_build_object(
    'roundId', new.round_id,
    'editionId', v_edition_id
  );
  v_fingerprint := private.studio2_request_fingerprint(
    'televote.submit',
    'R1',
    v_scope,
    jsonb_build_object(
      'preflightId', new.id,
      'submissionId', v_submission.id
    )
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
    status
  ) values (
    v_operation_id,
    auth.uid(),
    v_operation_id::text,
    v_operation_id,
    v_fingerprint,
    'televote.submit',
    'R1',
    v_scope,
    'processing'
  )
  on conflict (operation_id) do nothing;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = v_operation_id
  for update;

  if v_receipt.operation_id is null then
    raise exception 'Televote S2 operation receipt could not be persisted'
      using errcode = 'P0001';
  end if;

  if v_receipt.actor_id is distinct from auth.uid()
     or v_receipt.command is distinct from 'televote.submit'
     or v_receipt.idempotency_key is distinct from v_operation_id::text
     or v_receipt.correlation_id is distinct from v_operation_id
     or v_receipt.request_fingerprint is distinct from v_fingerprint
     or v_receipt.scope is distinct from v_scope then
    raise exception 'IDEMPOTENCY_CONFLICT: Televote operation identity is already used by different semantics'
      using errcode = 'P0001';
  end if;

  if v_receipt.status = 'processing' then
    update public.studio2_operation_receipts
    set status = 'succeeded',
        result = jsonb_build_object(
          'ok', true,
          'submissionId', v_submission.id,
          'roundId', v_submission.round_id,
          'editionId', v_edition_id,
          'preflightId', new.id,
          'status', v_submission.status
        ),
        error_code = null,
        error_metadata = null,
        completed_at = now(),
        updated_at = now()
    where operation_id = v_operation_id;
  elsif v_receipt.status <> 'succeeded' then
    raise exception 'Televote operation is not in a completable state'
      using errcode = '55000';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_guard_jury_entity_reference_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if exists (
    select 1
    from public.jury_votes vote
    where vote.voter_entity_id = old.id
      and (
        vote.edition_id is distinct from new.edition_id
        or (vote.voter_country_id is not null and new.country_id is distinct from vote.voter_country_id)
      )
  ) or exists (
    select 1
    from public.jury_votes vote
    where vote.receiving_entity_id = old.id
      and (
        vote.edition_id is distinct from new.edition_id
        or (vote.receiving_country_id is not null and new.country_id is distinct from vote.receiving_country_id)
      )
  ) then
    raise exception 'Referenced jury vote prevents contest entity scope drift' using errcode = '42501';
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_validate_jury_preflight_ballot_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'televoting'
AS $function$
declare
  v_ballot public.jury_ballot_submissions;
begin
  if new.jury_ballot_submission_id is null then
    return new;
  end if;

  select ballot.*
  into v_ballot
  from public.jury_ballot_submissions ballot
  where ballot.id = new.jury_ballot_submission_id;

  if v_ballot.id is null
     or new.channel is distinct from 'jury'
     or new.id is distinct from v_ballot.preflight_id
     or new.show_id is distinct from v_ballot.show_id
     or new.canonical_edition_id is distinct from v_ballot.edition_id
     or new.account_user_id is distinct from v_ballot.user_id
     or new.submitted_at is null then
    raise exception 'Jury integrity preflight ballot link is outside its exact submission scope'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_validate_televote_preflight_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'televoting'
AS $function$
declare
  v_submission televoting.vote_submissions;
begin
  if new.channel <> 'televote' then
    return new;
  end if;

  if new.submission_id is null then
    if new.submitted_at is not null then
      raise exception 'Unused Televote integrity preflight cannot claim submission completion'
        using errcode = '23514';
    end if;
    return new;
  end if;

  select submission.*
    into v_submission
  from televoting.vote_submissions submission
  where submission.id = new.submission_id;

  if v_submission.id is null
     or v_submission.is_historical
     or new.submitted_at is null
     or new.round_id is distinct from v_submission.round_id
     or new.username_normalized is distinct from v_submission.username_normalized
     or upper(new.country_code) is distinct from upper(v_submission.country_code) then
    raise exception 'Completed Televote integrity preflight must bind its exact modern ballot identity'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION televoting.block_sanctioned_preflight()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'televoting', 'pg_temp'
AS $function$
declare v_sanction televoting.voter_sanctions%rowtype;
begin
  select * into v_sanction from televoting.voter_sanctions sanction
  where sanction.revoked_at is null and sanction.active_from<=now() and (sanction.expires_at is null or sanction.expires_at>now())
    and televoting.integrity_sanction_matches(sanction.scope_type,sanction.hod_person_id,sanction.country_code,sanction.username_normalized,new.hod_person_id,new.country_code,new.username_normalized)
  order by case sanction.sanction_type when 'permanent' then 0 else 1 end, sanction.created_at desc limit 1;
  if found then
    if v_sanction.sanction_type='permanent' then
      raise exception 'Your SSC televoting access is suspended by an organizer decision. Contact the SSC organizers if you believe this is incorrect.' using errcode='42501';
    else
      raise exception 'Your SSC televoting access is suspended until %. Contact the SSC organizers if you believe this is incorrect.', v_sanction.expires_at using errcode='42501';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION televoting.keep_single_active_edition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.is_active is true
     and (tg_op = 'INSERT' or old.is_active is distinct from true) then
    update televoting.editions
    set is_active = false,
        updated_at = now()
    where id <> new.id
      and is_active = true;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_country_content_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at = now(); return new; end;
$function$;

ALTER TABLE "auth"."users" ADD CONSTRAINT "users_email_change_confirm_status_check" CHECK (email_change_confirm_status >= 0 AND email_change_confirm_status <= 2);

ALTER TABLE "auth"."users" ADD CONSTRAINT "users_phone_key" UNIQUE (phone);

ALTER TABLE "public"."contest_entities" ADD CONSTRAINT "contest_entities_abbr_chk" CHECK (length(btrim(abbreviation)) > 0);

ALTER TABLE "public"."contest_entities" ADD CONSTRAINT "contest_entities_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE RESTRICT;

ALTER TABLE "public"."contest_entities" ADD CONSTRAINT "contest_entities_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."contest_entities" ADD CONSTRAINT "contest_entities_entity_type_check" CHECK (entity_type = ANY (ARRAY['global'::text, 'custom'::text]));

ALTER TABLE "public"."contest_entities" ADD CONSTRAINT "contest_entities_identity_chk" CHECK (entity_type = 'global'::text AND country_id IS NOT NULL OR entity_type = 'custom'::text AND country_id IS NULL);

ALTER TABLE "public"."contest_entities" ADD CONSTRAINT "contest_entities_name_chk" CHECK (length(btrim(display_name)) > 0);

ALTER TABLE "public"."countries" ADD CONSTRAINT "countries_flag_crop_x_range" CHECK (flag_crop_x >= 0::numeric AND flag_crop_x <= 100::numeric);

ALTER TABLE "public"."countries" ADD CONSTRAINT "countries_flag_crop_y_range" CHECK (flag_crop_y >= 0::numeric AND flag_crop_y <= 100::numeric);

ALTER TABLE "public"."countries" ADD CONSTRAINT "countries_flag_crop_zoom_range" CHECK (flag_crop_zoom >= 1::numeric AND flag_crop_zoom <= 2::numeric);

ALTER TABLE "public"."countries" ADD CONSTRAINT "countries_name_key" UNIQUE (name);

ALTER TABLE "public"."country_accounts" ADD CONSTRAINT "country_accounts_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;

ALTER TABLE "public"."country_accounts" ADD CONSTRAINT "country_accounts_country_id_key" UNIQUE (country_id);

ALTER TABLE "public"."country_accounts" ADD CONSTRAINT "country_accounts_pkey" PRIMARY KEY (user_id);

ALTER TABLE "public"."country_accounts" ADD CONSTRAINT "country_accounts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_capabilities" ADD CONSTRAINT "studio2_capabilities_access_level_check" CHECK (access_level = ANY (ARRAY['read'::text, 'operate'::text, 'approve'::text, 'administer'::text]));

ALTER TABLE "public"."studio2_capabilities" ADD CONSTRAINT "studio2_capabilities_description_check" CHECK (length(btrim(description)) > 0);

ALTER TABLE "public"."studio2_capabilities" ADD CONSTRAINT "studio2_capabilities_label_check" CHECK (length(btrim(label)) > 0);

ALTER TABLE "televoting"."vote_preflight_checks" ADD CONSTRAINT "v3_s3_validate_jury_preflight_ballot_link" TRIGGER DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "televoting"."vote_preflight_checks" ADD CONSTRAINT "v3_s3_validate_televote_preflight_link" TRIGGER DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "televoting"."vote_preflight_checks" ADD CONSTRAINT "vote_preflight_checks_canonical_edition_id_fkey" FOREIGN KEY (canonical_edition_id) REFERENCES editions(id) ON DELETE SET NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD CONSTRAINT "vote_preflight_checks_channel_check" CHECK (channel = ANY (ARRAY['televote'::text, 'jury'::text]));

ALTER TABLE "televoting"."vote_preflight_checks" ADD CONSTRAINT "vote_preflight_checks_context_check" CHECK (channel = 'televote'::text AND round_id IS NOT NULL OR channel = 'jury'::text AND show_id IS NOT NULL AND canonical_edition_id IS NOT NULL AND account_user_id IS NOT NULL);

ALTER TABLE "televoting"."vote_preflight_checks" ADD CONSTRAINT "vote_preflight_checks_declaration_invalidated_by_fkey" FOREIGN KEY (declaration_invalidated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD CONSTRAINT "vote_preflight_checks_intervention_check" CHECK (intervention_level = ANY (ARRAY['none'::text, 'notice'::text, 'review'::text, 'declaration'::text, 'enhanced_declaration'::text, 'provisional_review'::text]));

ALTER TABLE "televoting"."vote_preflight_checks" ADD CONSTRAINT "vote_preflight_checks_jury_ballot_submission_id_fkey" FOREIGN KEY (jury_ballot_submission_id) REFERENCES jury_ballot_submissions(id) ON DELETE SET NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD CONSTRAINT "vote_preflight_checks_relationship_risk_check" CHECK (relationship_risk >= 0 AND relationship_risk <= 100);

ALTER TABLE "televoting"."vote_preflight_checks" ADD CONSTRAINT "vote_preflight_checks_risk_score_check" CHECK (risk_score >= 0 AND risk_score <= 100);

ALTER TABLE "televoting"."vote_preflight_checks" ADD CONSTRAINT "vote_preflight_checks_round_id_fkey" FOREIGN KEY (round_id) REFERENCES televoting.rounds(id) ON DELETE CASCADE;

ALTER TABLE "televoting"."vote_preflight_checks" ADD CONSTRAINT "vote_preflight_checks_severity_check" CHECK (severity = ANY (ARRAY['none'::text, 'notable'::text, 'review'::text, 'strong'::text, 'high'::text, 'critical'::text]));

ALTER TABLE "televoting"."vote_preflight_checks" ADD CONSTRAINT "vote_preflight_checks_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE SET NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD CONSTRAINT "vote_preflight_checks_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES televoting.vote_submissions(id) ON DELETE SET NULL;

ALTER TABLE "televoting"."vote_preflight_checks" ADD CONSTRAINT "vote_preflight_checks_televote_binding_state_v3_check" CHECK (channel <> 'televote'::text OR submission_id IS NULL AND submitted_at IS NULL OR submission_id IS NOT NULL AND submitted_at IS NOT NULL);

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);

CREATE INDEX idx_users_created_at_desc ON auth.users USING btree (created_at DESC);

CREATE INDEX idx_users_email ON auth.users USING btree (email);

CREATE INDEX idx_users_last_sign_in_at_desc ON auth.users USING btree (last_sign_in_at DESC);

CREATE INDEX idx_users_name ON auth.users USING btree (((raw_user_meta_data ->> 'name'::text))) WHERE ((raw_user_meta_data ->> 'name'::text) IS NOT NULL);

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);

CREATE INDEX contest_entities_country_id_idx ON public.contest_entities USING btree (country_id);

CREATE UNIQUE INDEX contest_entities_edition_abbr_key ON public.contest_entities USING btree (edition_id, lower(btrim(abbreviation)));

CREATE UNIQUE INDEX contest_entities_edition_country_key ON public.contest_entities USING btree (edition_id, country_id) WHERE (country_id IS NOT NULL);

CREATE INDEX contest_entities_edition_idx ON public.contest_entities USING btree (edition_id);

CREATE UNIQUE INDEX countries_short_code_key ON public.countries USING btree (short_code);

CREATE UNIQUE INDEX country_accounts_instagram_username_lower_uidx ON public.country_accounts USING btree (lower(instagram_username)) WHERE (instagram_username IS NOT NULL);

CREATE UNIQUE INDEX televoting_editions_single_active_idx ON televoting.editions USING btree (is_active) WHERE (is_active = true);

CREATE INDEX televoting_vote_preflight_attestation_idx ON televoting.vote_preflight_checks USING btree (requires_attestation, attested_at, created_at DESC);

CREATE INDEX televoting_vote_preflight_country_idx ON televoting.vote_preflight_checks USING btree (country_code, created_at DESC);

CREATE INDEX televoting_vote_preflight_round_idx ON televoting.vote_preflight_checks USING btree (round_id, created_at DESC);

CREATE UNIQUE INDEX vote_preflight_checks_televote_submission_v3_idx ON televoting.vote_preflight_checks USING btree (submission_id) WHERE ((channel = 'televote'::text) AND (submission_id IS NOT NULL));

CREATE TRIGGER contest_entities_updated_at BEFORE UPDATE ON contest_entities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON contest_entities FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER v3_guard_jury_entity_reference_scope BEFORE UPDATE OF edition_id, country_id ON contest_entities FOR EACH ROW EXECUTE FUNCTION private.v3_guard_jury_entity_reference_scope();

CREATE TRIGGER countries_bump_edition_revision AFTER UPDATE ON countries FOR EACH ROW EXECUTE FUNCTION bump_country_edition_revisions();

CREATE TRIGGER reset_country_flag_crop_on_replace BEFORE UPDATE OF flag_image ON countries FOR EACH ROW EXECUTE FUNCTION private.reset_country_flag_crop_on_replace();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON countries FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER update_countries_updated_at BEFORE UPDATE ON countries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER v3_s3_supersede_country_flag_reviews AFTER UPDATE OF flag_image ON countries FOR EACH ROW EXECUTE FUNCTION private.v3_supersede_stale_media_reviews();

CREATE TRIGGER ensure_country_account_hod_role AFTER INSERT OR UPDATE OF user_id ON country_accounts FOR EACH ROW EXECUTE FUNCTION private.ensure_country_account_hod_role();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON country_accounts FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER touch_country_accounts_updated_at BEFORE UPDATE ON country_accounts FOR EACH ROW EXECUTE FUNCTION touch_country_content_updated_at();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON themes FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER themes_updated_at BEFORE UPDATE ON themes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER keep_single_active_edition BEFORE INSERT OR UPDATE OF is_active ON televoting.editions FOR EACH ROW EXECUTE FUNCTION televoting.keep_single_active_edition();

CREATE TRIGGER televoting_editions_updated_at BEFORE UPDATE ON televoting.editions FOR EACH ROW EXECUTE FUNCTION televoting.update_updated_at_column();

CREATE TRIGGER studio2_touch_voting_declaration_version BEFORE UPDATE OF attested_at, signed_name, attestation_text, statement_version, submission_id, submitted_at, declaration_invalidated_at, declaration_invalidated_by, declaration_invalidation_reason ON televoting.vote_preflight_checks FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_voting_declaration_version();

CREATE TRIGGER trg_block_sanctioned_preflight BEFORE INSERT ON televoting.vote_preflight_checks FOR EACH ROW EXECUTE FUNCTION televoting.block_sanctioned_preflight();

CREATE TRIGGER v3_bridge_televote_submission_operation AFTER UPDATE OF submission_id, submitted_at ON televoting.vote_preflight_checks FOR EACH ROW WHEN (old.submission_id IS DISTINCT FROM new.submission_id AND new.submission_id IS NOT NULL AND new.submitted_at IS NOT NULL) EXECUTE FUNCTION private.v3_bridge_televote_submission_operation();

CREATE CONSTRAINT TRIGGER v3_s3_validate_jury_preflight_ballot_link AFTER INSERT OR UPDATE ON televoting.vote_preflight_checks DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.v3_validate_jury_preflight_ballot_link();

CREATE CONSTRAINT TRIGGER v3_s3_validate_televote_preflight_link AFTER INSERT OR UPDATE ON televoting.vote_preflight_checks DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.v3_validate_televote_preflight_link();

ALTER TABLE "auth"."users" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "auth"."users" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."contest_entities" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."contest_entities" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "contest entities capability write delete" ON "public"."contest_entities" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('edition.manage'::text, edition_id, true));

CREATE POLICY "contest entities capability write insert" ON "public"."contest_entities" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('edition.manage'::text, edition_id, true));

CREATE POLICY "contest entities capability write update" ON "public"."contest_entities" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('edition.manage'::text, edition_id, true)) WITH CHECK (studio2_access_allowed('edition.manage'::text, edition_id, true));

CREATE POLICY "solaris consolidated anon read" ON "public"."contest_entities" AS PERMISSIVE FOR SELECT TO "anon" USING (((EXISTS ( SELECT 1
   FROM participants p
  WHERE ((p.edition_id = contest_entities.edition_id) AND ((p.contest_entity_id = contest_entities.id) OR ((contest_entities.country_id IS NOT NULL) AND (p.country_id = contest_entities.country_id))) AND (((p.show_id IS NOT NULL) AND show_publication_enabled(p.show_id, 'participants'::text)) OR ((p.show_id IS NULL) AND (EXISTS ( SELECT 1
           FROM editions e
          WHERE ((e.id = p.edition_id) AND (e.published = true))))))))) OR studio2_access_allowed('edition.read'::text, edition_id, false)));

CREATE POLICY "solaris consolidated authenticated read" ON "public"."contest_entities" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('edition.manage'::text, edition_id, true) OR ((EXISTS ( SELECT 1
   FROM participants p
  WHERE ((p.edition_id = contest_entities.edition_id) AND ((p.contest_entity_id = contest_entities.id) OR ((contest_entities.country_id IS NOT NULL) AND (p.country_id = contest_entities.country_id))) AND (((p.show_id IS NOT NULL) AND show_publication_enabled(p.show_id, 'participants'::text)) OR ((p.show_id IS NULL) AND (EXISTS ( SELECT 1
           FROM editions e
          WHERE ((e.id = p.edition_id) AND (e.published = true))))))))) OR studio2_access_allowed('edition.read'::text, edition_id, false))));

ALTER TABLE "public"."countries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."countries" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "countries capability write delete" ON "public"."countries" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('delegation.manage'::text, NULL::uuid, true));

CREATE POLICY "countries capability write insert" ON "public"."countries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('delegation.manage'::text, NULL::uuid, true));

CREATE POLICY "countries capability write update" ON "public"."countries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)) WITH CHECK (studio2_access_allowed('delegation.manage'::text, NULL::uuid, true));

CREATE POLICY "solaris consolidated anon read" ON "public"."countries" AS PERMISSIVE FOR SELECT TO "anon" USING (true);

CREATE POLICY "solaris consolidated authenticated read" ON "public"."countries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('delegation.manage'::text, NULL::uuid, true) OR true));

ALTER TABLE "public"."country_accounts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."country_accounts" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "country accounts capability manage delete" ON "public"."country_accounts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('delegation.manage'::text, NULL::uuid, true));

CREATE POLICY "country accounts capability manage insert" ON "public"."country_accounts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('delegation.manage'::text, NULL::uuid, true));

CREATE POLICY "country accounts capability manage update" ON "public"."country_accounts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)) WITH CHECK (studio2_access_allowed('delegation.manage'::text, NULL::uuid, true));

CREATE POLICY "solaris consolidated authenticated read" ON "public"."country_accounts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('delegation.manage'::text, NULL::uuid, true) OR (user_id = ( SELECT auth.uid() AS uid))));

ALTER TABLE "public"."studio2_capabilities" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_capabilities" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "studio2_capabilities_authenticated_read" ON "public"."studio2_capabilities" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

ALTER TABLE "public"."themes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."themes" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "solaris consolidated anon read" ON "public"."themes" AS PERMISSIVE FOR SELECT TO "anon" USING ((is_public OR (EXISTS ( SELECT 1
   FROM shows s
  WHERE ((s.theme_id = themes.id) AND (s.published = true)))) OR (EXISTS ( SELECT 1
   FROM editions e
  WHERE ((e.theme_id = themes.id) AND (e.published = true)))) OR ((( SELECT auth.uid() AS uid) IS NOT NULL) AND studio2_access_allowed('edition.manage'::text, NULL::uuid, false))));

CREATE POLICY "solaris consolidated authenticated read" ON "public"."themes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('edition.manage'::text, NULL::uuid, false) OR (is_public OR (EXISTS ( SELECT 1
   FROM shows s
  WHERE ((s.theme_id = themes.id) AND (s.published = true)))) OR (EXISTS ( SELECT 1
   FROM editions e
  WHERE ((e.theme_id = themes.id) AND (e.published = true)))) OR ((( SELECT auth.uid() AS uid) IS NOT NULL) AND studio2_access_allowed('edition.manage'::text, NULL::uuid, false)))));

CREATE POLICY "themes organizer write delete" ON "public"."themes" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('edition.manage'::text, NULL::uuid, false));

CREATE POLICY "themes organizer write insert" ON "public"."themes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('edition.manage'::text, NULL::uuid, false));

CREATE POLICY "themes organizer write update" ON "public"."themes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('edition.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('edition.manage'::text, NULL::uuid, false));

ALTER TABLE "televoting"."countries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "televoting"."countries" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "solaris consolidated anon read" ON "televoting"."countries" AS PERMISSIVE FOR SELECT TO "anon" USING (true);

CREATE POLICY "solaris consolidated authenticated read" ON "televoting"."countries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('voting.manage'::text, NULL::uuid, false) OR true));

CREATE POLICY "televoting organizer full access delete" ON "televoting"."countries" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access insert" ON "televoting"."countries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access update" ON "televoting"."countries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

ALTER TABLE "televoting"."editions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "televoting"."editions" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "solaris consolidated anon read" ON "televoting"."editions" AS PERMISSIVE FOR SELECT TO "anon" USING (true);

CREATE POLICY "solaris consolidated authenticated read" ON "televoting"."editions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('voting.manage'::text, NULL::uuid, false) OR true));

CREATE POLICY "televoting organizer full access delete" ON "televoting"."editions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access insert" ON "televoting"."editions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access update" ON "televoting"."editions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

ALTER TABLE "televoting"."vote_preflight_checks" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "televoting"."vote_preflight_checks" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE auth.users OWNER TO supabase_auth_admin;

SET check_function_bodies=on;

COMMIT;
