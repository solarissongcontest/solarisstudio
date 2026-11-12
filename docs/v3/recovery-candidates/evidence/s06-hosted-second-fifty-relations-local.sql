-- S06: 50 further hosted-observed zero-row table identities, 150 -> 200 / 215.
-- Source: bounded read-only PostgreSQL 17.11 pg_catalog observations; no user data or SQL writes to hosted.
-- ONLY for a disposable --network none PG17.11 en-US ICU recovery fixture. NEVER a production migration.
-- Full 17-field table parity must pass in exact-commit CI; function bodies remain UNVERIFIED.
BEGIN;
SET LOCAL search_path=public,private,auth,televoting,pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL check_function_bodies=off;
DO $s06_enum$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='app_role') THEN CREATE TYPE public.app_role AS ENUM ('organizer', 'viewer'); END IF; END $s06_enum$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('private.reconcile_organizer_notification_state()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."reconcile_organizer_notification_state"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('private.route_organizer_inbox_event()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."route_organizer_inbox_event"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_can_manage_permissions(uuid)') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_can_manage_permissions"(p_user_id uuid) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_confirmation_sync_task_trigger()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_confirmation_sync_task_trigger"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_guard_direct_client_write()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_guard_direct_client_write"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_guard_fan_profile_moderation_fields()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_guard_fan_profile_moderation_fields"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_guard_feature_flag_strict_dual()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_guard_feature_flag_strict_dual"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_show_access_allowed(text,uuid,boolean)') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_show_access_allowed"(p_capability text, p_show_id uuid, p_strict_before_cutover boolean) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_submission_access_allowed(text,uuid,boolean)') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_submission_access_allowed"(p_capability text, p_submission_id uuid, p_strict_before_cutover boolean) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_touch_permission_subject_version()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_touch_permission_subject_version"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_touch_updated_at()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_touch_updated_at"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('private.v3_bump_confirmation_draft_revision()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."v3_bump_confirmation_draft_revision"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('private.v3_bump_fan_follow_revision()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."v3_bump_fan_follow_revision"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('private.v3_emit_fan_follow_preference_event()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."v3_emit_fan_follow_preference_event"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('public.admin_public_ia_rollout_readiness()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."admin_public_ia_rollout_readiness"() RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('public.emit_prediction_round_pulse_events()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."emit_prediction_round_pulse_events"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('public.owns_country(uuid)') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."owns_country"(_country_id uuid) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('public.owns_country(uuid,uuid)') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."owns_country"(_user_id uuid, _country_id uuid) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('public.route_beta2_submission()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."route_beta2_submission"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('public.show_publication_enabled(uuid,text)') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."show_publication_enabled"(_show_id uuid, _key text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('public.studio2_access_allowed(text,uuid,boolean)') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."studio2_access_allowed"(p_capability text, p_edition_id uuid, p_strict_before_cutover boolean) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('public.sync_historical_identity_voter_labels()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."sync_historical_identity_voter_labels"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('public.sync_public_ia_rollout_stage()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."sync_public_ia_rollout_stage"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('public.touch_country_content_updated_at()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."touch_country_content_updated_at"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."update_updated_at_column"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('public.validate_fan_taste_ballot()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."validate_fan_taste_ballot"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('televoting.flag_aggregation_outdated()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "televoting"."flag_aggregation_outdated"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('televoting.protect_audit_log()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "televoting"."protect_audit_log"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('televoting.protect_moderation_events()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "televoting"."protect_moderation_events"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Conditional local-only fail-closed placeholder for observed dependency; never replace an existing function.
DO $s06_guard$ BEGIN IF to_regprocedure('televoting.update_updated_at_column()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "televoting"."update_updated_at_column"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
CREATE TABLE "public"."user_roles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role" app_role NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "televoting"."admin_audit_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "actor_admin_id" uuid,
  "actor_username" text,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "old_values" jsonb,
  "new_values" jsonb,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."beta2_test_submissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tester_name" text NOT NULL,
  "device" text NOT NULL,
  "browser" text,
  "familiarity" text,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "bug_reports" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "screenshot_paths" text[] DEFAULT '{}'::text[] NOT NULL,
  "user_agent" text,
  "form_version" integer DEFAULT 4 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "country" text,
  "current_use" text,
  "beta1_participant" text,
  "beta1_memory" text,
  "viewport_width" integer,
  "viewport_height" integer,
  "activity_points_auto" integer DEFAULT 20 NOT NULL
);
CREATE TABLE "public"."submission_browser_sessions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "browser_session_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."submission_ip_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "ip_address" text NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."edit_tokens" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "token_type" text DEFAULT 'reusable'::text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "use_count" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "televoting"."vote_moderation_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "vote_submission_id" uuid,
  "voting_country_code" text,
  "target_country_code" text,
  "action" text NOT NULL,
  "previous_status" text,
  "new_status" text,
  "reason_category" text,
  "moderator_note" text,
  "performed_by" uuid,
  "performed_by_username" text,
  "performed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."public_televote_country_contributions" (
  "show_id" uuid NOT NULL,
  "round_id" text NOT NULL,
  "round_name" text NOT NULL,
  "country_code" text NOT NULL,
  "final_points" integer DEFAULT 0 NOT NULL,
  "activity_points" numeric,
  "country_contributions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source_type" text DEFAULT 'round'::text NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "weight_percent" numeric,
  "raw_score" numeric
);
CREATE TABLE "public"."integration_links" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "service" text NOT NULL,
  "entity_type" text NOT NULL,
  "solaris_id" uuid NOT NULL,
  "remote_id" text NOT NULL,
  "edition_id" uuid,
  "sync_status" text DEFAULT 'linked'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."public_ia_rollout_state" (
  "key" text NOT NULL,
  "stage" text NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."delegation_people" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "display_name" text NOT NULL,
  "identity_key" text NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "televoting"."external_score_entries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "source_id" uuid NOT NULL,
  "country_code" text NOT NULL,
  "value" numeric DEFAULT 0 NOT NULL,
  "entry_type" text DEFAULT 'other'::text NOT NULL,
  "reason" text,
  "entered_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."admin_preferences" (
  "user_id" uuid NOT NULL,
  "last_edition_id" uuid,
  "last_show_id" uuid,
  "sidebar_collapsed" boolean DEFAULT false NOT NULL,
  "favorites" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."integration_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "service" text NOT NULL,
  "event_type" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "remote_id" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "payload_hash" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "next_attempt_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
CREATE TABLE "public"."studio2_feature_flags" (
  "key" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "admins_only" boolean DEFAULT false NOT NULL,
  "user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "edition_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."app_push_subscriptions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth_secret" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "disabled_at" timestamp with time zone
);
CREATE TABLE "public"."admin_beta_test_submissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tester_name" text NOT NULL,
  "device" text NOT NULL,
  "browser" text,
  "familiarity" text,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "bug_reports" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "screenshot_paths" text[] DEFAULT '{}'::text[] NOT NULL,
  "user_agent" text,
  "form_version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."admin_deadlines" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid,
  "show_id" uuid,
  "kind" text DEFAULT 'other'::text NOT NULL,
  "label" text NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "notes" text,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."beta_test_submissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tester_name" text NOT NULL,
  "device" text NOT NULL,
  "browser" text,
  "familiarity" text,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "bug_reports" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "screenshot_paths" text[] DEFAULT '{}'::text[] NOT NULL,
  "user_agent" text,
  "form_version" integer DEFAULT 4 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."content_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_type" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "title" text NOT NULL,
  "summary" text DEFAULT ''::text NOT NULL,
  "route" text NOT NULL,
  "importance" text DEFAULT 'normal'::text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "published_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "dedupe_key" text
);
CREATE TABLE "public"."studio2_delegation_settings" (
  "edition_id" uuid NOT NULL,
  "country_id" uuid NOT NULL,
  "jury_members_required" smallint DEFAULT 1 NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."public_web_vitals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "session_id" text NOT NULL,
  "pathname" text NOT NULL,
  "metric_name" text NOT NULL,
  "value" double precision NOT NULL,
  "rating" text NOT NULL,
  "device" text NOT NULL,
  "viewport_width" integer NOT NULL,
  "viewport_height" integer NOT NULL,
  "navigation_type" text DEFAULT 'unknown'::text NOT NULL
);
CREATE TABLE "public"."country_media" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "country_id" uuid NOT NULL,
  "storage_path" text NOT NULL,
  "public_url" text NOT NULL,
  "caption" text,
  "alt_text" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."studio2_capability_grants" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "capability" text NOT NULL,
  "edition_id" uuid,
  "expires_at" timestamp with time zone,
  "granted_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."country_font_assets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid DEFAULT auth.uid() NOT NULL,
  "country_id" uuid NOT NULL,
  "name" text NOT NULL,
  "family_key" text NOT NULL,
  "storage_path" text NOT NULL,
  "public_url" text NOT NULL,
  "mime_type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."friend_voting_settings" (
  "id" text DEFAULT 'default'::text NOT NULL,
  "min_independent_editions" integer DEFAULT 3 NOT NULL,
  "full_confidence_editions" integer DEFAULT 4 NOT NULL,
  "support_edition_threshold" numeric DEFAULT 0.75 NOT NULL,
  "maximum_edition_threshold" numeric DEFAULT 0.45 NOT NULL,
  "reciprocal_edition_threshold" numeric DEFAULT 0.60 NOT NULL,
  "intensity_threshold" numeric DEFAULT 0.50 NOT NULL,
  "cross_channel_min_editions" integer DEFAULT 2 NOT NULL,
  "base_confidence_weight" numeric DEFAULT 20 NOT NULL,
  "support_weight" numeric DEFAULT 22 NOT NULL,
  "maximum_weight" numeric DEFAULT 16 NOT NULL,
  "reciprocity_weight" numeric DEFAULT 16 NOT NULL,
  "intensity_weight" numeric DEFAULT 10 NOT NULL,
  "cross_channel_weight" numeric DEFAULT 10 NOT NULL,
  "cross_channel_per_edition_weight" numeric DEFAULT 3 NOT NULL,
  "one_edition_cap" integer DEFAULT 29 NOT NULL,
  "two_edition_cap" integer DEFAULT 49 NOT NULL,
  "clique_min_edge_risk" integer DEFAULT 65 NOT NULL,
  "clique_internal_share_threshold" numeric DEFAULT 0.50 NOT NULL,
  "clique_min_members" integer DEFAULT 3 NOT NULL,
  "clique_min_density" numeric DEFAULT 0.50 NOT NULL,
  "risk_notable" integer DEFAULT 30 NOT NULL,
  "risk_review" integer DEFAULT 50 NOT NULL,
  "risk_strong" integer DEFAULT 65 NOT NULL,
  "risk_high" integer DEFAULT 80 NOT NULL,
  "risk_critical" integer DEFAULT 90 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."submission_drafts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "round_id" uuid NOT NULL,
  "browser_session_id" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "instagram_username" text,
  "country" text,
  "initial_ip" text,
  "latest_ip" text,
  "submitted_submission_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "v3_revision" bigint DEFAULT 0 NOT NULL
);
CREATE TABLE "public"."studio2_role_assignments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role_key" text NOT NULL,
  "edition_id" uuid,
  "expires_at" timestamp with time zone,
  "assigned_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."country_design_presets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid DEFAULT auth.uid() NOT NULL,
  "source_country_id" uuid,
  "name" text NOT NULL,
  "is_public" boolean DEFAULT false NOT NULL,
  "design_json" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."beta3_test_submissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tester_name" text NOT NULL,
  "device" text NOT NULL,
  "browser" text,
  "familiarity" text,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "bug_reports" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "screenshot_paths" text[] DEFAULT '{}'::text[] NOT NULL,
  "user_agent" text,
  "form_version" integer DEFAULT 5 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."integrity_identity_disclosure_requests" (
  "id" uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "requested_by" uuid NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_by" uuid,
  "decision_reason" text,
  "decided_at" timestamp with time zone,
  "approval_expires_at" timestamp with time zone,
  "disclosed_at" timestamp with time zone
);
CREATE TABLE "public"."country_hod_edition_claims" (
  "user_id" uuid NOT NULL,
  "country_id" uuid NOT NULL,
  "edition_id" uuid NOT NULL,
  "status" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."delegation_hod_assignments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "country_id" uuid NOT NULL,
  "person_id" uuid NOT NULL,
  "channel" text DEFAULT 'delegation'::text NOT NULL,
  "source" text DEFAULT 'manual'::text NOT NULL,
  "confidence" integer DEFAULT 100 NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."country_profiles" (
  "country_id" uuid NOT NULL,
  "capital" text,
  "government_type" text,
  "leader_name" text,
  "leader_title" text,
  "demonym" text,
  "official_languages" text,
  "currency" text,
  "motto" text,
  "population" text,
  "established" text,
  "summary" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."country_edition_identities" (
  "country_id" uuid NOT NULL,
  "edition_id" uuid NOT NULL,
  "display_name" text NOT NULL,
  "flag_image" text,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."fantasy_games" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "show_id" uuid NOT NULL,
  "name" text NOT NULL,
  "opens_at" timestamp with time zone NOT NULL,
  "locks_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "roster_size" integer DEFAULT 5 NOT NULL,
  "budget" numeric(8,2) DEFAULT 50 NOT NULL,
  "captain_multiplier" numeric(5,2) DEFAULT 2 NOT NULL,
  "scoring_version" text DEFAULT 'v1'::text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."fantasy_game_entries" (
  "game_id" uuid NOT NULL,
  "country_id" uuid NOT NULL,
  "cost" numeric(8,2) NOT NULL,
  "eligible" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."fan_profiles" (
  "id" uuid NOT NULL,
  "display_name" text DEFAULT 'Solaris fan'::text NOT NULL,
  "visibility" text DEFAULT 'private'::text NOT NULL,
  "leaderboard_opt_in" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "moderation_hidden_at" timestamp with time zone,
  "moderation_reason" text,
  "moderated_by" uuid
);
CREATE TABLE "public"."fan_event_reads" (
  "profile_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "read_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."fantasy_teams" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "state" text DEFAULT 'submitted'::text NOT NULL,
  "captain_country_id" uuid,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "score" numeric(10,2),
  "scored_at" timestamp with time zone,
  "scoring_version" text DEFAULT 'v1'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."fantasy_team_entries" (
  "team_id" uuid NOT NULL,
  "country_id" uuid NOT NULL,
  "cost_locked" numeric(8,2) NOT NULL,
  "points" numeric(10,2),
  "breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE "public"."notification_preferences" (
  "profile_id" uuid NOT NULL,
  "in_app_enabled" boolean DEFAULT true NOT NULL,
  "categories" text[] DEFAULT ARRAY['entries'::text, 'running_orders'::text, 'predictions'::text, 'results'::text, 'records'::text] NOT NULL,
  "external_enabled" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "quiet_hours_start" time without time zone,
  "quiet_hours_end" time without time zone,
  "urgent_deadline_reminders" boolean DEFAULT true NOT NULL,
  "spoiler_free" boolean DEFAULT false NOT NULL,
  "timezone" text DEFAULT 'UTC'::text NOT NULL
);
CREATE TABLE "public"."fan_follows" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "notification_level" text DEFAULT 'important'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revision" bigint DEFAULT 1 NOT NULL
);
CREATE TABLE "public"."fan_taste_ballots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL,
  "show_id" uuid NOT NULL,
  "ranking" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."prediction_rounds" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "show_id" uuid NOT NULL,
  "opens_at" timestamp with time zone NOT NULL,
  "locks_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "prediction_types" text[] DEFAULT ARRAY['winner'::text, 'top_three'::text, 'jury_winner'::text, 'televote_winner'::text] NOT NULL,
  "scoring_version" text DEFAULT 'v1'::text NOT NULL,
  "consensus_minimum" integer DEFAULT 5 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."studio2_prediction_round_versions" (
  "round_id" uuid NOT NULL,
  "version" bigint DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."studio2_prediction_score_versions" (
  "round_id" uuid NOT NULL,
  "version" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."prediction_consensus_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "round_id" uuid NOT NULL,
  "sample_size" integer NOT NULL,
  "items" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "snapshot_hash" text NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."prediction_entries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "round_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "state" text DEFAULT 'draft'::text NOT NULL,
  "submitted_at" timestamp with time zone,
  "locked_at" timestamp with time zone,
  "share_token" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."prediction_scores" (
  "entry_id" uuid NOT NULL,
  "score" numeric(6,3) NOT NULL,
  "percentile" numeric(6,3),
  "breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "scoring_version" text NOT NULL,
  "scored_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE (user_id, role);
ALTER TABLE "televoting"."admin_audit_log" ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."beta2_test_submissions" ADD CONSTRAINT "beta2_test_submissions_form_version_check" CHECK (form_version = 4);
ALTER TABLE "public"."beta2_test_submissions" ADD CONSTRAINT "beta2_test_submissions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."submission_browser_sessions" ADD CONSTRAINT "submission_browser_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."submission_browser_sessions" ADD CONSTRAINT "submission_browser_sessions_submission_id_browser_session_i_key" UNIQUE (submission_id, browser_session_id);
ALTER TABLE "public"."submission_ip_history" ADD CONSTRAINT "submission_ip_history_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."submission_ip_history" ADD CONSTRAINT "submission_ip_history_submission_id_ip_address_key" UNIQUE (submission_id, ip_address);
ALTER TABLE "public"."edit_tokens" ADD CONSTRAINT "edit_tokens_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."edit_tokens" ADD CONSTRAINT "edit_tokens_token_hash_key" UNIQUE (token_hash);
ALTER TABLE "televoting"."vote_moderation_events" ADD CONSTRAINT "vote_moderation_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."public_televote_country_contributions" ADD CONSTRAINT "public_televote_country_contributions_object_check" CHECK (jsonb_typeof(country_contributions) = 'object'::text);
ALTER TABLE "public"."public_televote_country_contributions" ADD CONSTRAINT "public_televote_country_contributions_pkey" PRIMARY KEY (show_id, round_id, country_code);
ALTER TABLE "public"."integration_links" ADD CONSTRAINT "integration_links_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integration_links" ADD CONSTRAINT "integration_links_service_check" CHECK (service = ANY (ARRAY['confirmations'::text, 'televoting'::text]));
ALTER TABLE "public"."integration_links" ADD CONSTRAINT "integration_links_service_entity_type_remote_id_key" UNIQUE (service, entity_type, remote_id);
ALTER TABLE "public"."integration_links" ADD CONSTRAINT "integration_links_service_entity_type_solaris_id_key" UNIQUE (service, entity_type, solaris_id);
ALTER TABLE "public"."integration_links" ADD CONSTRAINT "integration_links_sync_status_check" CHECK (sync_status = ANY (ARRAY['linked'::text, 'pending'::text, 'error'::text]));
ALTER TABLE "public"."public_ia_rollout_state" ADD CONSTRAINT "public_ia_rollout_state_key_check" CHECK (key = 'public_ia_v3'::text);
ALTER TABLE "public"."public_ia_rollout_state" ADD CONSTRAINT "public_ia_rollout_state_pkey" PRIMARY KEY (key);
ALTER TABLE "public"."public_ia_rollout_state" ADD CONSTRAINT "public_ia_rollout_state_stage_check" CHECK (stage = ANY (ARRAY['disabled'::text, 'organizers'::text, 'beta'::text, 'signed_in'::text, 'everyone'::text]));
ALTER TABLE "public"."delegation_people" ADD CONSTRAINT "delegation_people_display_name_not_blank" CHECK (length(btrim(display_name)) > 0);
ALTER TABLE "public"."delegation_people" ADD CONSTRAINT "delegation_people_identity_key_key" UNIQUE (identity_key);
ALTER TABLE "public"."delegation_people" ADD CONSTRAINT "delegation_people_identity_key_not_blank" CHECK (length(btrim(identity_key)) > 0);
ALTER TABLE "public"."delegation_people" ADD CONSTRAINT "delegation_people_pkey" PRIMARY KEY (id);
ALTER TABLE "televoting"."external_score_entries" ADD CONSTRAINT "external_score_entries_pkey" PRIMARY KEY (id);
ALTER TABLE "televoting"."external_score_entries" ADD CONSTRAINT "external_score_entries_source_id_country_code_key" UNIQUE (source_id, country_code);
ALTER TABLE "public"."admin_preferences" ADD CONSTRAINT "admin_preferences_pkey" PRIMARY KEY (user_id);
ALTER TABLE "public"."integration_events" ADD CONSTRAINT "integration_events_attempts_check" CHECK (attempts >= 0);
ALTER TABLE "public"."integration_events" ADD CONSTRAINT "integration_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integration_events" ADD CONSTRAINT "integration_events_service_check" CHECK (service = ANY (ARRAY['confirmations'::text, 'televoting'::text]));
ALTER TABLE "public"."integration_events" ADD CONSTRAINT "integration_events_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'retrying'::text, 'completed'::text, 'failed'::text, 'skipped'::text]));
ALTER TABLE "public"."studio2_feature_flags" ADD CONSTRAINT "studio2_feature_flags_key_check" CHECK (key = ANY (ARRAY['edition_state_engine'::text, 'contest_event_engine'::text, 'permission_engine_v2'::text, 'workflow_engine'::text, 'official_communications'::text, 'hod_workspace_v2'::text, 'live_control_room'::text, 'incident_command'::text, 'broadcast_rundown'::text, 'results_replay'::text, 'voting_lab'::text, 'edition_simulator'::text, 'rules_engine'::text, 'public_encyclopedia'::text, 'public_ia_v3'::text, 'country_voting_dna'::text, 'prediction_league'::text, 'fantasy_ssc'::text, 'time_machine'::text, 'solaris_command_assistant'::text, 'solaris_app_v3'::text, 'solaris_app_v3_confirmation'::text, 'solaris_app_v3_scoreboard'::text, 'solaris_app_v3_account_settings'::text, 'solaris_app_v3_explore'::text, 'solaris_app_v3_notifications'::text, 'solaris_app_v3_edition_hub'::text, 'solaris_app_v3_delegation'::text, 'solaris_app_v3_search'::text, 'solaris_app_v3_rules_guidance'::text, 'solaris_app_v3_results'::text, 'solaris_app_v3_me'::text, 'solaris_app_v3_entry'::text, 'solaris_app_v3_jury'::text, 'solaris_app_v3_organizer'::text]));
ALTER TABLE "public"."studio2_feature_flags" ADD CONSTRAINT "studio2_feature_flags_pkey" PRIMARY KEY (key);
ALTER TABLE "public"."app_push_subscriptions" ADD CONSTRAINT "app_push_subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."app_push_subscriptions" ADD CONSTRAINT "app_push_subscriptions_user_id_endpoint_key" UNIQUE (user_id, endpoint);
ALTER TABLE "public"."admin_beta_test_submissions" ADD CONSTRAINT "admin_beta_test_submissions_device_check" CHECK (device = ANY (ARRAY['Phone'::text, 'Tablet'::text, 'Laptop'::text, 'Desktop'::text]));
ALTER TABLE "public"."admin_beta_test_submissions" ADD CONSTRAINT "admin_beta_test_submissions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."admin_beta_test_submissions" ADD CONSTRAINT "admin_beta_test_submissions_tester_name_check" CHECK (length(btrim(tester_name)) >= 1 AND length(btrim(tester_name)) <= 120);
ALTER TABLE "public"."admin_deadlines" ADD CONSTRAINT "admin_deadlines_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."beta_test_submissions" ADD CONSTRAINT "beta_test_submissions_device_check" CHECK (device = ANY (ARRAY['Phone'::text, 'Tablet'::text, 'Laptop'::text, 'Desktop'::text]));
ALTER TABLE "public"."beta_test_submissions" ADD CONSTRAINT "beta_test_submissions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."beta_test_submissions" ADD CONSTRAINT "beta_test_submissions_tester_name_check" CHECK (length(btrim(tester_name)) >= 1 AND length(btrim(tester_name)) <= 120);
ALTER TABLE "public"."content_events" ADD CONSTRAINT "content_events_event_type_check" CHECK (event_type = ANY (ARRAY['entry_published'::text, 'running_order_published'::text, 'prediction_opened'::text, 'prediction_locked'::text, 'prediction_movement'::text, 'results_published'::text, 'record_broken'::text, 'record_threat'::text, 'story_published'::text, 'edition_update'::text, 'national_final_announced'::text, 'national_final_lineup'::text, 'national_final_result'::text]));
ALTER TABLE "public"."content_events" ADD CONSTRAINT "content_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_delegation_settings" ADD CONSTRAINT "studio2_delegation_settings_jury_required_check" CHECK (jury_members_required = 1);
ALTER TABLE "public"."studio2_delegation_settings" ADD CONSTRAINT "studio2_delegation_settings_pkey" PRIMARY KEY (edition_id, country_id);
ALTER TABLE "public"."public_web_vitals" ADD CONSTRAINT "public_web_vitals_device_check" CHECK (device = ANY (ARRAY['mobile'::text, 'tablet'::text, 'desktop'::text]));
ALTER TABLE "public"."public_web_vitals" ADD CONSTRAINT "public_web_vitals_metric_check" CHECK (metric_name = ANY (ARRAY['LCP'::text, 'INP'::text, 'CLS'::text]));
ALTER TABLE "public"."public_web_vitals" ADD CONSTRAINT "public_web_vitals_navigation_check" CHECK (navigation_type = ANY (ARRAY['navigate'::text, 'reload'::text, 'back_forward'::text, 'prerender'::text, 'unknown'::text]));
ALTER TABLE "public"."public_web_vitals" ADD CONSTRAINT "public_web_vitals_pathname_check" CHECK (length(pathname) >= 1 AND length(pathname) <= 512 AND pathname ~~ '/%'::text);
ALTER TABLE "public"."public_web_vitals" ADD CONSTRAINT "public_web_vitals_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."public_web_vitals" ADD CONSTRAINT "public_web_vitals_rating_check" CHECK (rating = ANY (ARRAY['good'::text, 'needs-improvement'::text, 'poor'::text]));
ALTER TABLE "public"."public_web_vitals" ADD CONSTRAINT "public_web_vitals_session_id_check" CHECK (length(session_id) >= 8 AND length(session_id) <= 128);
ALTER TABLE "public"."public_web_vitals" ADD CONSTRAINT "public_web_vitals_value_check" CHECK (value >= 0::double precision AND value <= 600000::double precision);
ALTER TABLE "public"."public_web_vitals" ADD CONSTRAINT "public_web_vitals_viewport_check" CHECK (viewport_width >= 1 AND viewport_width <= 10000 AND viewport_height >= 1 AND viewport_height <= 10000);
ALTER TABLE "public"."country_media" ADD CONSTRAINT "country_media_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."country_media" ADD CONSTRAINT "country_media_storage_path_key" UNIQUE (storage_path);
ALTER TABLE "public"."studio2_capability_grants" ADD CONSTRAINT "studio2_capability_grants_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_capability_grants" ADD CONSTRAINT "studio2_capability_grants_scope_unique" UNIQUE NULLS NOT DISTINCT (user_id, capability, edition_id);
ALTER TABLE "public"."country_font_assets" ADD CONSTRAINT "country_font_assets_family_check" CHECK (family_key ~ '^Solaris Custom [0-9a-f-]{8,36}$'::text);
ALTER TABLE "public"."country_font_assets" ADD CONSTRAINT "country_font_assets_name_check" CHECK (char_length(TRIM(BOTH FROM name)) >= 1 AND char_length(TRIM(BOTH FROM name)) <= 80);
ALTER TABLE "public"."country_font_assets" ADD CONSTRAINT "country_font_assets_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."country_font_assets" ADD CONSTRAINT "country_font_assets_storage_path_key" UNIQUE (storage_path);
ALTER TABLE "public"."friend_voting_settings" ADD CONSTRAINT "friend_voting_settings_band_order" CHECK (risk_notable <= risk_review AND risk_review <= risk_strong AND risk_strong <= risk_high AND risk_high <= risk_critical);
ALTER TABLE "public"."friend_voting_settings" ADD CONSTRAINT "friend_voting_settings_clique_members" CHECK (clique_min_members >= 2);
ALTER TABLE "public"."friend_voting_settings" ADD CONSTRAINT "friend_voting_settings_fraction_checks" CHECK (support_edition_threshold >= 0::numeric AND support_edition_threshold <= 1::numeric AND maximum_edition_threshold >= 0::numeric AND maximum_edition_threshold <= 1::numeric AND reciprocal_edition_threshold >= 0::numeric AND reciprocal_edition_threshold <= 1::numeric AND intensity_threshold >= 0::numeric AND intensity_threshold <= 1::numeric AND clique_internal_share_threshold >= 0::numeric AND clique_internal_share_threshold <= 1::numeric AND clique_min_density >= 0::numeric AND clique_min_density <= 1::numeric);
ALTER TABLE "public"."friend_voting_settings" ADD CONSTRAINT "friend_voting_settings_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."friend_voting_settings" ADD CONSTRAINT "friend_voting_settings_positive_editions" CHECK (min_independent_editions >= 1 AND full_confidence_editions >= 1 AND cross_channel_min_editions >= 1);
ALTER TABLE "public"."friend_voting_settings" ADD CONSTRAINT "friend_voting_settings_risk_checks" CHECK (one_edition_cap >= 0 AND one_edition_cap <= 100 AND two_edition_cap >= 0 AND two_edition_cap <= 100 AND clique_min_edge_risk >= 0 AND clique_min_edge_risk <= 100 AND risk_notable >= 0 AND risk_notable <= 100 AND risk_review >= 0 AND risk_review <= 100 AND risk_strong >= 0 AND risk_strong <= 100 AND risk_high >= 0 AND risk_high <= 100 AND risk_critical >= 0 AND risk_critical <= 100);
ALTER TABLE "public"."friend_voting_settings" ADD CONSTRAINT "friend_voting_settings_singleton" CHECK (id = 'default'::text);
ALTER TABLE "public"."friend_voting_settings" ADD CONSTRAINT "friend_voting_settings_weights" CHECK (base_confidence_weight >= 0::numeric AND support_weight >= 0::numeric AND maximum_weight >= 0::numeric AND reciprocity_weight >= 0::numeric AND intensity_weight >= 0::numeric AND cross_channel_weight >= 0::numeric AND cross_channel_per_edition_weight >= 0::numeric);
ALTER TABLE "public"."submission_drafts" ADD CONSTRAINT "submission_drafts_payload_resource_budget" CHECK (octet_length(payload::text) <= 32768);
ALTER TABLE "public"."submission_drafts" ADD CONSTRAINT "submission_drafts_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."submission_drafts" ADD CONSTRAINT "submission_drafts_round_id_browser_session_id_key" UNIQUE (round_id, browser_session_id);
ALTER TABLE "public"."studio2_role_assignments" ADD CONSTRAINT "studio2_role_assignments_future_expiry" CHECK (expires_at IS NULL OR expires_at > created_at);
ALTER TABLE "public"."studio2_role_assignments" ADD CONSTRAINT "studio2_role_assignments_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_role_assignments" ADD CONSTRAINT "studio2_role_assignments_scope_unique" UNIQUE NULLS NOT DISTINCT (user_id, role_key, edition_id);
ALTER TABLE "public"."country_design_presets" ADD CONSTRAINT "country_design_presets_design_check" CHECK (jsonb_typeof(design_json) = 'object'::text AND COALESCE((design_json ->> 'version'::text)::integer, 0) = 2);
ALTER TABLE "public"."country_design_presets" ADD CONSTRAINT "country_design_presets_name_check" CHECK (char_length(TRIM(BOTH FROM name)) >= 1 AND char_length(TRIM(BOTH FROM name)) <= 80);
ALTER TABLE "public"."country_design_presets" ADD CONSTRAINT "country_design_presets_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."beta3_test_submissions" ADD CONSTRAINT "beta3_test_submissions_answers_object_check" CHECK (jsonb_typeof(answers) = 'object'::text);
ALTER TABLE "public"."beta3_test_submissions" ADD CONSTRAINT "beta3_test_submissions_answers_size_check" CHECK (octet_length(answers::text) <= 131072);
ALTER TABLE "public"."beta3_test_submissions" ADD CONSTRAINT "beta3_test_submissions_bug_reports_array_check" CHECK (jsonb_typeof(bug_reports) = 'array'::text);
ALTER TABLE "public"."beta3_test_submissions" ADD CONSTRAINT "beta3_test_submissions_bug_reports_size_check" CHECK (octet_length(bug_reports::text) <= 131072);
ALTER TABLE "public"."beta3_test_submissions" ADD CONSTRAINT "beta3_test_submissions_device_check" CHECK (device = ANY (ARRAY['Phone'::text, 'Tablet'::text, 'Laptop'::text, 'Desktop'::text]));
ALTER TABLE "public"."beta3_test_submissions" ADD CONSTRAINT "beta3_test_submissions_form_version_check" CHECK (form_version = 5);
ALTER TABLE "public"."beta3_test_submissions" ADD CONSTRAINT "beta3_test_submissions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."beta3_test_submissions" ADD CONSTRAINT "beta3_test_submissions_tester_name_check" CHECK (length(btrim(tester_name)) >= 1 AND length(btrim(tester_name)) <= 120);
ALTER TABLE "public"."integrity_identity_disclosure_requests" ADD CONSTRAINT "integrity_identity_disclosure_decision_consistency" CHECK (status = 'pending'::text AND decided_by IS NULL AND decision_reason IS NULL AND decided_at IS NULL AND approval_expires_at IS NULL AND disclosed_at IS NULL OR status = 'approved'::text AND decision_reason IS NOT NULL AND decided_at IS NOT NULL AND approval_expires_at IS NOT NULL AND disclosed_at IS NULL OR status = 'rejected'::text AND decision_reason IS NOT NULL AND decided_at IS NOT NULL AND approval_expires_at IS NULL AND disclosed_at IS NULL OR status = 'used'::text AND decision_reason IS NOT NULL AND decided_at IS NOT NULL AND approval_expires_at IS NOT NULL AND disclosed_at IS NOT NULL OR status = 'expired'::text AND decision_reason IS NOT NULL AND decided_at IS NOT NULL AND approval_expires_at IS NOT NULL AND disclosed_at IS NULL);
ALTER TABLE "public"."integrity_identity_disclosure_requests" ADD CONSTRAINT "integrity_identity_disclosure_requests_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrity_identity_disclosure_requests" ADD CONSTRAINT "integrity_identity_disclosure_requests_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'used'::text, 'expired'::text]));
ALTER TABLE "public"."country_hod_edition_claims" ADD CONSTRAINT "country_hod_edition_claims_pkey" PRIMARY KEY (user_id, country_id, edition_id);
ALTER TABLE "public"."country_hod_edition_claims" ADD CONSTRAINT "country_hod_edition_claims_status_check" CHECK (status = ANY (ARRAY['mine'::text, 'other'::text, 'unknown'::text]));
ALTER TABLE "public"."delegation_hod_assignments" ADD CONSTRAINT "delegation_hod_assignments_channel_check" CHECK (channel = ANY (ARRAY['delegation'::text, 'jury'::text, 'televote'::text]));
ALTER TABLE "public"."delegation_hod_assignments" ADD CONSTRAINT "delegation_hod_assignments_confidence_check" CHECK (confidence >= 0 AND confidence <= 100);
ALTER TABLE "public"."delegation_hod_assignments" ADD CONSTRAINT "delegation_hod_assignments_edition_id_country_id_channel_key" UNIQUE (edition_id, country_id, channel);
ALTER TABLE "public"."delegation_hod_assignments" ADD CONSTRAINT "delegation_hod_assignments_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."country_profiles" ADD CONSTRAINT "country_profiles_pkey" PRIMARY KEY (country_id);
ALTER TABLE "public"."country_edition_identities" ADD CONSTRAINT "country_edition_identities_name_check" CHECK (length(btrim(display_name)) >= 1 AND length(btrim(display_name)) <= 80);
ALTER TABLE "public"."country_edition_identities" ADD CONSTRAINT "country_edition_identities_pkey" PRIMARY KEY (country_id, edition_id);
ALTER TABLE "public"."fantasy_games" ADD CONSTRAINT "fantasy_games_budget_check" CHECK (budget > 0::numeric);
ALTER TABLE "public"."fantasy_games" ADD CONSTRAINT "fantasy_games_captain_multiplier_check" CHECK (captain_multiplier >= 1::numeric AND captain_multiplier <= 5::numeric);
ALTER TABLE "public"."fantasy_games" ADD CONSTRAINT "fantasy_games_check" CHECK (opens_at < locks_at);
ALTER TABLE "public"."fantasy_games" ADD CONSTRAINT "fantasy_games_edition_id_show_id_key" UNIQUE (edition_id, show_id);
ALTER TABLE "public"."fantasy_games" ADD CONSTRAINT "fantasy_games_name_check" CHECK (char_length(name) >= 1 AND char_length(name) <= 100);
ALTER TABLE "public"."fantasy_games" ADD CONSTRAINT "fantasy_games_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."fantasy_games" ADD CONSTRAINT "fantasy_games_roster_size_check" CHECK (roster_size >= 2 AND roster_size <= 15);
ALTER TABLE "public"."fantasy_games" ADD CONSTRAINT "fantasy_games_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'open'::text, 'locked'::text, 'scoring'::text, 'scored'::text, 'cancelled'::text]));
ALTER TABLE "public"."fantasy_game_entries" ADD CONSTRAINT "fantasy_game_entries_cost_check" CHECK (cost > 0::numeric);
ALTER TABLE "public"."fantasy_game_entries" ADD CONSTRAINT "fantasy_game_entries_pkey" PRIMARY KEY (game_id, country_id);
ALTER TABLE "public"."fan_profiles" ADD CONSTRAINT "fan_profiles_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."fan_profiles" ADD CONSTRAINT "fan_profiles_visibility_check" CHECK (visibility = ANY (ARRAY['private'::text, 'public'::text]));
ALTER TABLE "public"."fan_event_reads" ADD CONSTRAINT "fan_event_reads_pkey" PRIMARY KEY (profile_id, event_id);
ALTER TABLE "public"."fantasy_teams" ADD CONSTRAINT "fantasy_teams_game_id_profile_id_key" UNIQUE (game_id, profile_id);
ALTER TABLE "public"."fantasy_teams" ADD CONSTRAINT "fantasy_teams_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."fantasy_teams" ADD CONSTRAINT "fantasy_teams_state_check" CHECK (state = ANY (ARRAY['submitted'::text, 'locked'::text, 'scored'::text]));
ALTER TABLE "public"."fantasy_team_entries" ADD CONSTRAINT "fantasy_team_entries_breakdown_check" CHECK (jsonb_typeof(breakdown) = 'object'::text);
ALTER TABLE "public"."fantasy_team_entries" ADD CONSTRAINT "fantasy_team_entries_cost_locked_check" CHECK (cost_locked > 0::numeric);
ALTER TABLE "public"."fantasy_team_entries" ADD CONSTRAINT "fantasy_team_entries_pkey" PRIMARY KEY (team_id, country_id);
ALTER TABLE "public"."notification_preferences" ADD CONSTRAINT "notification_preferences_categories_check" CHECK (categories <@ ARRAY['entries'::text, 'running_orders'::text, 'predictions'::text, 'results'::text, 'records'::text, 'confirmations'::text, 'jury'::text, 'televoting'::text, 'deadlines'::text, 'official'::text, 'following'::text]);
ALTER TABLE "public"."notification_preferences" ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY (profile_id);
ALTER TABLE "public"."fan_follows" ADD CONSTRAINT "fan_follows_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."fan_follows" ADD CONSTRAINT "fan_follows_profile_id_entity_type_entity_id_key" UNIQUE (profile_id, entity_type, entity_id);
ALTER TABLE "public"."fan_follows" ADD CONSTRAINT "fan_follows_revision_check" CHECK (revision >= 1);
ALTER TABLE "public"."fan_taste_ballots" ADD CONSTRAINT "fan_taste_ballots_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."fan_taste_ballots" ADD CONSTRAINT "fan_taste_ballots_profile_id_show_id_key" UNIQUE (profile_id, show_id);
ALTER TABLE "public"."prediction_rounds" ADD CONSTRAINT "prediction_rounds_check" CHECK (locks_at > opens_at);
ALTER TABLE "public"."prediction_rounds" ADD CONSTRAINT "prediction_rounds_consensus_minimum_check" CHECK (consensus_minimum > 0);
ALTER TABLE "public"."prediction_rounds" ADD CONSTRAINT "prediction_rounds_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."prediction_rounds" ADD CONSTRAINT "prediction_rounds_show_id_key" UNIQUE (show_id);
ALTER TABLE "public"."studio2_prediction_round_versions" ADD CONSTRAINT "studio2_prediction_round_versions_pkey" PRIMARY KEY (round_id);
ALTER TABLE "public"."studio2_prediction_round_versions" ADD CONSTRAINT "studio2_prediction_round_versions_version_check" CHECK (version >= 1);
ALTER TABLE "public"."studio2_prediction_score_versions" ADD CONSTRAINT "studio2_prediction_score_versions_pkey" PRIMARY KEY (round_id);
ALTER TABLE "public"."studio2_prediction_score_versions" ADD CONSTRAINT "studio2_prediction_score_versions_version_check" CHECK (version >= 0);
ALTER TABLE "public"."prediction_consensus_snapshots" ADD CONSTRAINT "prediction_consensus_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."prediction_consensus_snapshots" ADD CONSTRAINT "prediction_consensus_snapshots_round_id_snapshot_hash_key" UNIQUE (round_id, snapshot_hash);
ALTER TABLE "public"."prediction_consensus_snapshots" ADD CONSTRAINT "prediction_consensus_snapshots_sample_size_check" CHECK (sample_size >= 0);
ALTER TABLE "public"."prediction_entries" ADD CONSTRAINT "prediction_entries_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."prediction_entries" ADD CONSTRAINT "prediction_entries_round_id_profile_id_key" UNIQUE (round_id, profile_id);
ALTER TABLE "public"."prediction_entries" ADD CONSTRAINT "prediction_entries_version_check" CHECK (version > 0);
ALTER TABLE "public"."prediction_scores" ADD CONSTRAINT "prediction_scores_percentile_check" CHECK (percentile IS NULL OR percentile >= 0::numeric AND percentile <= 100::numeric);
ALTER TABLE "public"."prediction_scores" ADD CONSTRAINT "prediction_scores_pkey" PRIMARY KEY (entry_id);
ALTER TABLE "public"."prediction_scores" ADD CONSTRAINT "prediction_scores_score_check" CHECK (score >= 0::numeric);
ALTER TABLE "public"."submission_browser_sessions" ADD CONSTRAINT "submission_browser_sessions_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE;
ALTER TABLE "public"."submission_ip_history" ADD CONSTRAINT "submission_ip_history_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE;
ALTER TABLE "public"."edit_tokens" ADD CONSTRAINT "edit_tokens_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE;
ALTER TABLE "televoting"."vote_moderation_events" ADD CONSTRAINT "vote_moderation_events_vote_submission_id_fkey" FOREIGN KEY (vote_submission_id) REFERENCES televoting.vote_submissions(id) ON DELETE SET NULL;
ALTER TABLE "public"."public_televote_country_contributions" ADD CONSTRAINT "public_televote_country_contributions_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;
ALTER TABLE "public"."integration_links" ADD CONSTRAINT "integration_links_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."public_ia_rollout_state" ADD CONSTRAINT "public_ia_rollout_state_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "televoting"."external_score_entries" ADD CONSTRAINT "external_score_entries_source_id_fkey" FOREIGN KEY (source_id) REFERENCES televoting.televote_aggregation_sources(id) ON DELETE CASCADE;
ALTER TABLE "public"."admin_preferences" ADD CONSTRAINT "admin_preferences_last_edition_id_fkey" FOREIGN KEY (last_edition_id) REFERENCES editions(id) ON DELETE SET NULL;
ALTER TABLE "public"."admin_preferences" ADD CONSTRAINT "admin_preferences_last_show_id_fkey" FOREIGN KEY (last_show_id) REFERENCES shows(id) ON DELETE SET NULL;
ALTER TABLE "public"."admin_preferences" ADD CONSTRAINT "admin_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_feature_flags" ADD CONSTRAINT "studio2_feature_flags_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."app_push_subscriptions" ADD CONSTRAINT "app_push_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."admin_deadlines" ADD CONSTRAINT "admin_deadlines_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."admin_deadlines" ADD CONSTRAINT "admin_deadlines_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."admin_deadlines" ADD CONSTRAINT "admin_deadlines_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_delegation_settings" ADD CONSTRAINT "studio2_delegation_settings_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_delegation_settings" ADD CONSTRAINT "studio2_delegation_settings_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_delegation_settings" ADD CONSTRAINT "studio2_delegation_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."country_media" ADD CONSTRAINT "country_media_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_capability_grants" ADD CONSTRAINT "studio2_capability_grants_capability_fk" FOREIGN KEY (capability) REFERENCES studio2_capabilities(key) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "public"."studio2_capability_grants" ADD CONSTRAINT "studio2_capability_grants_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_capability_grants" ADD CONSTRAINT "studio2_capability_grants_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_capability_grants" ADD CONSTRAINT "studio2_capability_grants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."country_font_assets" ADD CONSTRAINT "country_font_assets_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;
ALTER TABLE "public"."country_font_assets" ADD CONSTRAINT "country_font_assets_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."submission_drafts" ADD CONSTRAINT "submission_drafts_round_id_fkey" FOREIGN KEY (round_id) REFERENCES submission_rounds(id) ON DELETE CASCADE;
ALTER TABLE "public"."submission_drafts" ADD CONSTRAINT "submission_drafts_submitted_submission_id_fkey" FOREIGN KEY (submitted_submission_id) REFERENCES submissions(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_role_assignments" ADD CONSTRAINT "studio2_role_assignments_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_role_assignments" ADD CONSTRAINT "studio2_role_assignments_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_role_assignments" ADD CONSTRAINT "studio2_role_assignments_role_key_fkey" FOREIGN KEY (role_key) REFERENCES studio2_access_roles(key) ON DELETE RESTRICT;
ALTER TABLE "public"."studio2_role_assignments" ADD CONSTRAINT "studio2_role_assignments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."country_design_presets" ADD CONSTRAINT "country_design_presets_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."country_design_presets" ADD CONSTRAINT "country_design_presets_source_country_id_fkey" FOREIGN KEY (source_country_id) REFERENCES countries(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_identity_disclosure_requests" ADD CONSTRAINT "integrity_identity_disclosure_requests_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_identity_disclosure_requests" ADD CONSTRAINT "integrity_identity_disclosure_requests_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_identity_disclosure_requests" ADD CONSTRAINT "integrity_identity_disclosure_requests_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."country_hod_edition_claims" ADD CONSTRAINT "country_hod_edition_claims_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;
ALTER TABLE "public"."country_hod_edition_claims" ADD CONSTRAINT "country_hod_edition_claims_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."country_hod_edition_claims" ADD CONSTRAINT "country_hod_edition_claims_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."delegation_hod_assignments" ADD CONSTRAINT "delegation_hod_assignments_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;
ALTER TABLE "public"."delegation_hod_assignments" ADD CONSTRAINT "delegation_hod_assignments_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."delegation_hod_assignments" ADD CONSTRAINT "delegation_hod_assignments_person_id_fkey" FOREIGN KEY (person_id) REFERENCES delegation_people(id) ON DELETE RESTRICT;
ALTER TABLE "public"."country_profiles" ADD CONSTRAINT "country_profiles_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;
ALTER TABLE "public"."country_edition_identities" ADD CONSTRAINT "country_edition_identities_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;
ALTER TABLE "public"."country_edition_identities" ADD CONSTRAINT "country_edition_identities_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."country_edition_identities" ADD CONSTRAINT "country_edition_identities_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."fantasy_games" ADD CONSTRAINT "fantasy_games_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."fantasy_games" ADD CONSTRAINT "fantasy_games_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."fantasy_games" ADD CONSTRAINT "fantasy_games_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;
ALTER TABLE "public"."fantasy_game_entries" ADD CONSTRAINT "fantasy_game_entries_game_id_fkey" FOREIGN KEY (game_id) REFERENCES fantasy_games(id) ON DELETE CASCADE;
ALTER TABLE "public"."fan_profiles" ADD CONSTRAINT "fan_profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."fan_profiles" ADD CONSTRAINT "fan_profiles_moderated_by_fkey" FOREIGN KEY (moderated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."fan_event_reads" ADD CONSTRAINT "fan_event_reads_event_id_fkey" FOREIGN KEY (event_id) REFERENCES content_events(id) ON DELETE CASCADE;
ALTER TABLE "public"."fan_event_reads" ADD CONSTRAINT "fan_event_reads_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES fan_profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."fantasy_teams" ADD CONSTRAINT "fantasy_teams_game_id_fkey" FOREIGN KEY (game_id) REFERENCES fantasy_games(id) ON DELETE RESTRICT;
ALTER TABLE "public"."fantasy_teams" ADD CONSTRAINT "fantasy_teams_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES fan_profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."fantasy_team_entries" ADD CONSTRAINT "fantasy_team_entries_team_id_fkey" FOREIGN KEY (team_id) REFERENCES fantasy_teams(id) ON DELETE CASCADE;
ALTER TABLE "public"."notification_preferences" ADD CONSTRAINT "notification_preferences_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES fan_profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."fan_follows" ADD CONSTRAINT "fan_follows_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES fan_profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."fan_taste_ballots" ADD CONSTRAINT "fan_taste_ballots_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES fan_profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."fan_taste_ballots" ADD CONSTRAINT "fan_taste_ballots_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;
ALTER TABLE "public"."prediction_rounds" ADD CONSTRAINT "prediction_rounds_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_prediction_round_versions" ADD CONSTRAINT "studio2_prediction_round_versions_round_id_fkey" FOREIGN KEY (round_id) REFERENCES prediction_rounds(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_prediction_score_versions" ADD CONSTRAINT "studio2_prediction_score_versions_round_id_fkey" FOREIGN KEY (round_id) REFERENCES prediction_rounds(id) ON DELETE CASCADE;
ALTER TABLE "public"."prediction_consensus_snapshots" ADD CONSTRAINT "prediction_consensus_snapshots_round_id_fkey" FOREIGN KEY (round_id) REFERENCES prediction_rounds(id) ON DELETE CASCADE;
ALTER TABLE "public"."prediction_entries" ADD CONSTRAINT "prediction_entries_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES fan_profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."prediction_entries" ADD CONSTRAINT "prediction_entries_round_id_fkey" FOREIGN KEY (round_id) REFERENCES prediction_rounds(id) ON DELETE CASCADE;
ALTER TABLE "public"."prediction_scores" ADD CONSTRAINT "prediction_scores_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES prediction_entries(id) ON DELETE CASCADE;
CREATE INDEX televoting_admin_audit_actor_idx ON televoting.admin_audit_log USING btree (actor_admin_id);
CREATE INDEX televoting_admin_audit_created_idx ON televoting.admin_audit_log USING btree (created_at DESC);
CREATE INDEX beta2_test_submissions_created_at_idx ON public.beta2_test_submissions USING btree (created_at DESC);
CREATE INDEX televoting_vme_pair ON televoting.vote_moderation_events USING btree (voting_country_code, target_country_code);
CREATE INDEX televoting_vme_submission ON televoting.vote_moderation_events USING btree (vote_submission_id);
CREATE INDEX televoting_vme_time ON televoting.vote_moderation_events USING btree (performed_at DESC);
CREATE INDEX integration_links_edition_idx ON public.integration_links USING btree (edition_id);
CREATE INDEX integration_links_status_idx ON public.integration_links USING btree (sync_status);
CREATE UNIQUE INDEX integration_events_dedupe_idx ON public.integration_events USING btree (service, event_type, payload_hash);
CREATE INDEX integration_events_entity_idx ON public.integration_events USING btree (entity_type, entity_id);
CREATE INDEX integration_events_status_idx ON public.integration_events USING btree (status, next_attempt_at);
CREATE INDEX studio2_feature_flags_updated_by_idx ON public.studio2_feature_flags USING btree (updated_by);
CREATE INDEX app_push_subscriptions_user_active_idx ON public.app_push_subscriptions USING btree (user_id, disabled_at, updated_at DESC);
CREATE INDEX admin_beta_test_submissions_created_at_idx ON public.admin_beta_test_submissions USING btree (created_at DESC);
CREATE INDEX admin_deadlines_due_idx ON public.admin_deadlines USING btree (completed_at, due_at);
CREATE INDEX admin_deadlines_edition_idx ON public.admin_deadlines USING btree (edition_id, due_at);
CREATE INDEX beta_test_submissions_created_at_idx ON public.beta_test_submissions USING btree (created_at DESC);
CREATE UNIQUE INDEX content_events_dedupe_key_idx ON public.content_events USING btree (dedupe_key);
CREATE INDEX studio2_delegation_settings_country_id_idx ON public.studio2_delegation_settings USING btree (country_id);
CREATE INDEX studio2_delegation_settings_updated_by_idx ON public.studio2_delegation_settings USING btree (updated_by);
CREATE INDEX public_web_vitals_created_at_idx ON public.public_web_vitals USING btree (created_at DESC);
CREATE INDEX public_web_vitals_metric_created_idx ON public.public_web_vitals USING btree (metric_name, created_at DESC);
CREATE INDEX public_web_vitals_path_metric_created_idx ON public.public_web_vitals USING btree (pathname, metric_name, created_at DESC);
CREATE INDEX country_media_country_sort_idx ON public.country_media USING btree (country_id, sort_order, created_at);
CREATE INDEX studio2_capability_grants_active_idx ON public.studio2_capability_grants USING btree (user_id, capability, edition_id, expires_at);
CREATE INDEX studio2_capability_grants_edition_id_idx ON public.studio2_capability_grants USING btree (edition_id);
CREATE INDEX studio2_capability_grants_granted_by_idx ON public.studio2_capability_grants USING btree (granted_by);
CREATE INDEX studio2_capability_grants_user_idx ON public.studio2_capability_grants USING btree (user_id, edition_id);
CREATE INDEX studio2_role_assignments_assigned_by_idx ON public.studio2_role_assignments USING btree (assigned_by);
CREATE INDEX studio2_role_assignments_edition_id_idx ON public.studio2_role_assignments USING btree (edition_id);
CREATE INDEX studio2_role_assignments_role_idx ON public.studio2_role_assignments USING btree (role_key, edition_id);
CREATE INDEX studio2_role_assignments_user_scope_idx ON public.studio2_role_assignments USING btree (user_id, edition_id, expires_at);
CREATE INDEX beta3_test_submissions_created_at_idx ON public.beta3_test_submissions USING btree (created_at DESC);
CREATE INDEX integrity_identity_disclosure_status_created_idx ON public.integrity_identity_disclosure_requests USING btree (status, requested_at DESC);
CREATE UNIQUE INDEX integrity_identity_one_active_request_per_case_idx ON public.integrity_identity_disclosure_requests USING btree (case_id) WHERE (status = ANY (ARRAY['pending'::text, 'approved'::text]));
CREATE INDEX country_hod_edition_claims_country_id_idx ON public.country_hod_edition_claims USING btree (country_id);
CREATE INDEX country_hod_edition_claims_edition_id_idx ON public.country_hod_edition_claims USING btree (edition_id);
CREATE INDEX delegation_hod_assignments_country_idx ON public.delegation_hod_assignments USING btree (country_id, edition_id);
CREATE INDEX delegation_hod_assignments_edition_idx ON public.delegation_hod_assignments USING btree (edition_id, channel);
CREATE INDEX delegation_hod_assignments_person_idx ON public.delegation_hod_assignments USING btree (person_id, edition_id);
CREATE INDEX country_edition_identities_country_idx ON public.country_edition_identities USING btree (country_id, edition_id);
CREATE INDEX fantasy_games_created_by_idx ON public.fantasy_games USING btree (created_by);
CREATE INDEX fantasy_games_show_id_idx ON public.fantasy_games USING btree (show_id);
CREATE INDEX fantasy_games_status_lock_idx ON public.fantasy_games USING btree (status, locks_at);
CREATE INDEX fantasy_teams_game_state_idx ON public.fantasy_teams USING btree (game_id, state);
CREATE INDEX fantasy_teams_profile_idx ON public.fantasy_teams USING btree (profile_id, game_id);
CREATE INDEX fan_taste_ballots_profile_updated_idx ON public.fan_taste_ballots USING btree (profile_id, updated_at DESC);
CREATE INDEX fan_taste_ballots_show_idx ON public.fan_taste_ballots USING btree (show_id);
CREATE UNIQUE INDEX prediction_entries_share_token_idx ON public.prediction_entries USING btree (share_token) WHERE (share_token IS NOT NULL);
ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "televoting"."admin_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."beta2_test_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."submission_browser_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."submission_ip_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."edit_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "televoting"."vote_moderation_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."public_televote_country_contributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integration_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."public_ia_rollout_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."delegation_people" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "televoting"."external_score_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."admin_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integration_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."studio2_feature_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."app_push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."admin_beta_test_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."admin_deadlines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."beta_test_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."content_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."studio2_delegation_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."public_web_vitals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."country_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."studio2_capability_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."country_font_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."friend_voting_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."submission_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."studio2_role_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."country_design_presets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."beta3_test_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_identity_disclosure_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."country_hod_edition_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."delegation_hod_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."country_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."country_edition_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fantasy_games" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fantasy_game_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fan_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fan_event_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fantasy_teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fantasy_team_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fan_follows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fan_taste_ballots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."prediction_rounds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."studio2_prediction_round_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."studio2_prediction_score_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."prediction_consensus_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."prediction_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."prediction_scores" ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON user_roles FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER televoting_admin_audit_no_update BEFORE DELETE OR UPDATE ON televoting.admin_audit_log FOR EACH ROW EXECUTE FUNCTION televoting.protect_audit_log();
CREATE TRIGGER organizer_inbox_beta2_insert AFTER INSERT ON beta2_test_submissions FOR EACH ROW EXECUTE FUNCTION private.route_organizer_inbox_event();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON submission_browser_sessions FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON submission_ip_history FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON edit_tokens FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER televoting_vme_no_update BEFORE DELETE OR UPDATE ON televoting.vote_moderation_events FOR EACH ROW EXECUTE FUNCTION televoting.protect_moderation_events();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public_televote_country_contributions FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON integration_links FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER public_ia_rollout_stage_sync BEFORE UPDATE OF stage ON public_ia_rollout_state FOR EACH ROW WHEN (old.stage IS DISTINCT FROM new.stage) EXECUTE FUNCTION sync_public_ia_rollout_stage();
CREATE TRIGGER set_delegation_people_updated_at BEFORE UPDATE ON delegation_people FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON delegation_people FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER televoting_entries_outdated AFTER INSERT OR DELETE OR UPDATE ON televoting.external_score_entries FOR EACH ROW EXECUTE FUNCTION televoting.flag_aggregation_outdated();
CREATE TRIGGER televoting_external_entries_updated_at BEFORE UPDATE ON televoting.external_score_entries FOR EACH ROW EXECUTE FUNCTION televoting.update_updated_at_column();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON admin_preferences FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_confirmation_sync_task_reconcile AFTER INSERT OR UPDATE OF status, last_error, updated_at ON integration_events FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_confirmation_sync_task_trigger();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON integration_events FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_feature_flags_strict_dual_guard BEFORE INSERT OR UPDATE ON studio2_feature_flags FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_feature_flag_strict_dual();
CREATE TRIGGER studio2_feature_flags_touch_updated_at BEFORE UPDATE ON studio2_feature_flags FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_updated_at();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON app_push_subscriptions FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER organizer_inbox_admin_beta_insert AFTER INSERT ON admin_beta_test_submissions FOR EACH ROW EXECUTE FUNCTION private.route_organizer_inbox_event();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON admin_beta_test_submissions FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON admin_deadlines FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER beta2_submission_router BEFORE INSERT ON beta_test_submissions FOR EACH ROW EXECUTE FUNCTION route_beta2_submission();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON beta_test_submissions FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON content_events FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_delegation_settings_touch_updated_at BEFORE UPDATE ON studio2_delegation_settings FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_updated_at();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public_web_vitals FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON country_media FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_capability_grants_touch_subject_version AFTER INSERT OR DELETE OR UPDATE ON studio2_capability_grants FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_permission_subject_version();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON country_font_assets FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER set_friend_voting_settings_updated_at BEFORE UPDATE ON friend_voting_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON friend_voting_settings FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON submission_drafts FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER v3_confirmation_draft_revision BEFORE UPDATE OF payload ON submission_drafts FOR EACH ROW EXECUTE FUNCTION private.v3_bump_confirmation_draft_revision();
CREATE TRIGGER studio2_role_assignments_touch_subject_version AFTER INSERT OR DELETE OR UPDATE ON studio2_role_assignments FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_permission_subject_version();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON country_design_presets FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER organizer_inbox_beta3_insert AFTER INSERT ON beta3_test_submissions FOR EACH ROW EXECUTE FUNCTION private.route_organizer_inbox_event();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON beta3_test_submissions FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER organizer_inbox_disclosure_insert AFTER INSERT ON integrity_identity_disclosure_requests FOR EACH ROW EXECUTE FUNCTION private.route_organizer_inbox_event();
CREATE TRIGGER organizer_inbox_disclosure_state AFTER UPDATE OF status ON integrity_identity_disclosure_requests FOR EACH ROW EXECUTE FUNCTION private.reconcile_organizer_notification_state();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON country_hod_edition_claims FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER set_delegation_hod_assignments_updated_at BEFORE UPDATE ON delegation_hod_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON delegation_hod_assignments FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON country_profiles FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER touch_country_profiles_updated_at BEFORE UPDATE ON country_profiles FOR EACH ROW EXECUTE FUNCTION touch_country_content_updated_at();
CREATE TRIGGER country_edition_identities_sync_voters AFTER INSERT OR DELETE OR UPDATE ON country_edition_identities FOR EACH ROW EXECUTE FUNCTION sync_historical_identity_voter_labels();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON country_edition_identities FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON fantasy_games FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON fantasy_game_entries FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_fan_profile_moderation_guard BEFORE UPDATE ON fan_profiles FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_fan_profile_moderation_fields();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON fan_profiles FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON fan_event_reads FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON fantasy_teams FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON fantasy_team_entries FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON notification_preferences FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON fan_follows FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER v3_bump_fan_follow_revision BEFORE UPDATE ON fan_follows FOR EACH ROW EXECUTE FUNCTION private.v3_bump_fan_follow_revision();
CREATE TRIGGER v3_emit_fan_follow_preference_event AFTER INSERT OR DELETE OR UPDATE ON fan_follows FOR EACH ROW EXECUTE FUNCTION private.v3_emit_fan_follow_preference_event();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON fan_taste_ballots FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER trg_validate_fan_taste_ballot BEFORE INSERT OR UPDATE ON fan_taste_ballots FOR EACH ROW EXECUTE FUNCTION validate_fan_taste_ballot();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON prediction_rounds FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER trg_emit_prediction_round_pulse_events AFTER INSERT OR UPDATE ON prediction_rounds FOR EACH ROW EXECUTE FUNCTION emit_prediction_round_pulse_events();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON prediction_consensus_snapshots FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON prediction_entries FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON prediction_scores FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE POLICY "solaris consolidated authenticated read" ON "public"."user_roles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('permissions.read'::text, NULL::uuid, false) OR (user_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "televoting organizer full access" ON "televoting"."admin_audit_log" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));
CREATE POLICY "Organizers can read Beta 2 feedback" ON "public"."beta2_test_submissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (studio2_access_allowed('rollout.manage'::text, NULL::uuid, false));
CREATE POLICY "submission browser sessions capability manage" ON "public"."submission_browser_sessions" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM submissions s
  WHERE ((s.id = submission_browser_sessions.submission_id) AND studio2_access_allowed('confirmation.manage'::text, s.edition_id, true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM submissions s
  WHERE ((s.id = submission_browser_sessions.submission_id) AND studio2_access_allowed('confirmation.manage'::text, s.edition_id, true)))));
CREATE POLICY "submission ip history capability manage" ON "public"."submission_ip_history" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM submissions s
  WHERE ((s.id = submission_ip_history.submission_id) AND studio2_access_allowed('confirmation.manage'::text, s.edition_id, true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM submissions s
  WHERE ((s.id = submission_ip_history.submission_id) AND studio2_access_allowed('confirmation.manage'::text, s.edition_id, true)))));
CREATE POLICY "edit_tokens_organizer_all" ON "public"."edit_tokens" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.studio2_submission_access_allowed('entry.approve'::text, submission_id, false)) WITH CHECK (private.studio2_submission_access_allowed('entry.approve'::text, submission_id, false));
CREATE POLICY "televoting organizer full access" ON "televoting"."vote_moderation_events" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('televote.ballots.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('televote.ballots.manage'::text, NULL::uuid, false));
CREATE POLICY "published detailed televote read" ON "public"."public_televote_country_contributions" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((EXISTS ( SELECT 1
   FROM shows s
  WHERE ((s.id = public_televote_country_contributions.show_id) AND (s.published IS TRUE) AND COALESCE(((s.publication_config ->> 'detailed_voting'::text))::boolean, false) AND COALESCE(((s.publication_config ->> 'televote_results'::text))::boolean, false)))));
CREATE POLICY "integration links organizer only" ON "public"."integration_links" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('edition.manage'::text, edition_id, false)) WITH CHECK (studio2_access_allowed('edition.manage'::text, edition_id, false));
CREATE POLICY "Organizers can advance public IA rollout" ON "public"."public_ia_rollout_state" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('rollout.manage'::text, NULL::uuid, false)) WITH CHECK ((studio2_access_allowed('rollout.manage'::text, NULL::uuid, false) AND ((stage = ANY (ARRAY['disabled'::text, 'organizers'::text, 'beta'::text])) OR COALESCE(((admin_public_ia_rollout_readiness() ->> 'ready'::text))::boolean, false))));
CREATE POLICY "Public can read public IA rollout stage" ON "public"."public_ia_rollout_state" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);
CREATE POLICY "capability can manage hod people" ON "public"."delegation_people" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)) WITH CHECK (studio2_access_allowed('delegation.manage'::text, NULL::uuid, true));
CREATE POLICY "televoting organizer full access" ON "televoting"."external_score_entries" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));
CREATE POLICY "Organizers manage own admin preferences" ON "public"."admin_preferences" AS PERMISSIVE FOR ALL TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) AND studio2_access_allowed('edition.manage'::text, NULL::uuid, false))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND studio2_access_allowed('edition.manage'::text, NULL::uuid, false)));
CREATE POLICY "integration events organizer only" ON "public"."integration_events" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('edition.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('edition.manage'::text, NULL::uuid, false));
CREATE POLICY "studio2_feature_flags_capability_read" ON "public"."studio2_feature_flags" AS PERMISSIVE FOR SELECT TO "authenticated" USING (studio2_access_allowed('rollout.read'::text, NULL::uuid, false));
CREATE POLICY "users create own app push subscriptions" ON "public"."app_push_subscriptions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "users delete own app push subscriptions" ON "public"."app_push_subscriptions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "users read own app push subscriptions" ON "public"."app_push_subscriptions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "users update own app push subscriptions" ON "public"."app_push_subscriptions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Organizers can read admin beta feedback" ON "public"."admin_beta_test_submissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (studio2_access_allowed('rollout.manage'::text, NULL::uuid, false));
CREATE POLICY "Organizers can submit admin beta feedback" ON "public"."admin_beta_test_submissions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((studio2_access_allowed('rollout.manage'::text, NULL::uuid, false) AND (length(btrim(tester_name)) >= 1) AND (length(btrim(tester_name)) <= 120) AND (device = ANY (ARRAY['Phone'::text, 'Tablet'::text, 'Laptop'::text, 'Desktop'::text])) AND (jsonb_typeof(answers) = 'object'::text) AND (jsonb_typeof(bug_reports) = 'array'::text)));
CREATE POLICY "Organizers manage deadlines" ON "public"."admin_deadlines" AS PERMISSIVE FOR ALL TO "authenticated" USING (
CASE
    WHEN (edition_id IS NOT NULL) THEN studio2_access_allowed('edition.manage'::text, edition_id, true)
    WHEN (show_id IS NOT NULL) THEN private.studio2_show_access_allowed('edition.manage'::text, show_id, true)
    ELSE studio2_access_allowed('edition.manage'::text, NULL::uuid, true)
END) WITH CHECK (
CASE
    WHEN (edition_id IS NOT NULL) THEN studio2_access_allowed('edition.manage'::text, edition_id, true)
    WHEN (show_id IS NOT NULL) THEN private.studio2_show_access_allowed('edition.manage'::text, show_id, true)
    ELSE studio2_access_allowed('edition.manage'::text, NULL::uuid, true)
END);
CREATE POLICY "Organizers can read beta feedback" ON "public"."beta_test_submissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (studio2_access_allowed('rollout.manage'::text, NULL::uuid, false));
CREATE POLICY "Public beta testers can submit feedback" ON "public"."beta_test_submissions" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (((form_version = 4) AND ((length(btrim(tester_name)) >= 1) AND (length(btrim(tester_name)) <= 120)) AND (device = ANY (ARRAY['Phone'::text, 'Tablet'::text, 'Laptop'::text, 'Desktop'::text])) AND (jsonb_typeof(answers) = 'object'::text) AND (jsonb_typeof(bug_reports) = 'array'::text)));
CREATE POLICY "organizers manage content events delete" ON "public"."content_events" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('publishing.manage'::text, NULL::uuid, false));
CREATE POLICY "organizers manage content events insert" ON "public"."content_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('publishing.manage'::text, NULL::uuid, false));
CREATE POLICY "organizers manage content events update" ON "public"."content_events" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('publishing.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('publishing.manage'::text, NULL::uuid, false));
CREATE POLICY "solaris consolidated anon read" ON "public"."content_events" AS PERMISSIVE FOR SELECT TO "anon" USING ((published_at <= now()));
CREATE POLICY "solaris consolidated authenticated read" ON "public"."content_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('publishing.manage'::text, NULL::uuid, false) OR (published_at <= now())));
CREATE POLICY "studio2_delegation_settings_capability_read" ON "public"."studio2_delegation_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((owns_country(( SELECT auth.uid() AS uid), country_id) OR studio2_access_allowed('delegation.read'::text, edition_id, false)));
CREATE POLICY "Organizers can read public web vitals" ON "public"."public_web_vitals" AS PERMISSIVE FOR SELECT TO "authenticated" USING (studio2_access_allowed('rollout.manage'::text, NULL::uuid, false));
CREATE POLICY "Public web vitals can be recorded" ON "public"."public_web_vitals" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (((length(session_id) >= 8) AND (length(session_id) <= 128) AND (pathname ~~ '/%'::text) AND (metric_name = ANY (ARRAY['LCP'::text, 'INP'::text, 'CLS'::text]))));
CREATE POLICY "country media owner or capability write delete" ON "public"."country_media" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)));
CREATE POLICY "country media owner or capability write insert" ON "public"."country_media" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)));
CREATE POLICY "country media owner or capability write update" ON "public"."country_media" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true))) WITH CHECK ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)));
CREATE POLICY "solaris consolidated anon read" ON "public"."country_media" AS PERMISSIVE FOR SELECT TO "anon" USING (true);
CREATE POLICY "solaris consolidated authenticated read" ON "public"."country_media" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true) OR true));
CREATE POLICY "studio2_capability_grants_read" ON "public"."studio2_capability_grants" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.studio2_can_manage_permissions(( SELECT auth.uid() AS uid))));
CREATE POLICY "country font assets owner delete" ON "public"."country_font_assets" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((owner_user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "country font assets owner or capability insert" ON "public"."country_font_assets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((owner_user_id = ( SELECT auth.uid() AS uid)) AND (owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true))));
CREATE POLICY "country font assets owner or capability read" ON "public"."country_font_assets" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((owner_user_id = ( SELECT auth.uid() AS uid)) OR owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)));
CREATE POLICY "submission drafts capability manage" ON "public"."submission_drafts" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM submission_rounds r
  WHERE ((r.id = submission_drafts.round_id) AND studio2_access_allowed('confirmation.manage'::text, r.edition_id, true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM submission_rounds r
  WHERE ((r.id = submission_drafts.round_id) AND studio2_access_allowed('confirmation.manage'::text, r.edition_id, true)))));
CREATE POLICY "studio2_role_assignments_access_read" ON "public"."studio2_role_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.studio2_can_manage_permissions(( SELECT auth.uid() AS uid))));
CREATE POLICY "country design presets owner delete" ON "public"."country_design_presets" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((owner_user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "country design presets owner insert" ON "public"."country_design_presets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((owner_user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "country design presets owner update" ON "public"."country_design_presets" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((owner_user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "country design presets readable" ON "public"."country_design_presets" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((is_public OR (owner_user_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "Organizers can read Beta 3 feedback" ON "public"."beta3_test_submissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (studio2_access_allowed('rollout.manage'::text, NULL::uuid, false));
CREATE POLICY "Public Beta 3 testers can submit feedback" ON "public"."beta3_test_submissions" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (((form_version = 5) AND ((length(btrim(tester_name)) >= 1) AND (length(btrim(tester_name)) <= 120)) AND (device = ANY (ARRAY['Phone'::text, 'Tablet'::text, 'Laptop'::text, 'Desktop'::text])) AND (jsonb_typeof(answers) = 'object'::text) AND (jsonb_typeof(bug_reports) = 'array'::text) AND (octet_length((answers)::text) <= 131072) AND (octet_length((bug_reports)::text) <= 131072)));
CREATE POLICY "country hod claims self or capability write delete" ON "public"."country_hod_edition_claims" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) OR studio2_access_allowed('delegation.manage'::text, edition_id, true)));
CREATE POLICY "country hod claims self or capability write insert" ON "public"."country_hod_edition_claims" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR studio2_access_allowed('delegation.manage'::text, edition_id, true)));
CREATE POLICY "country hod claims self or capability write update" ON "public"."country_hod_edition_claims" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) OR studio2_access_allowed('delegation.manage'::text, edition_id, true))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR studio2_access_allowed('delegation.manage'::text, edition_id, true)));
CREATE POLICY "solaris consolidated authenticated read" ON "public"."country_hod_edition_claims" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) OR studio2_access_allowed('delegation.read'::text, edition_id, false) OR ((user_id = ( SELECT auth.uid() AS uid)) OR studio2_access_allowed('delegation.manage'::text, edition_id, true))));
CREATE POLICY "capability can manage hod assignments" ON "public"."delegation_hod_assignments" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('delegation.manage'::text, edition_id, true)) WITH CHECK (studio2_access_allowed('delegation.manage'::text, edition_id, true));
CREATE POLICY "country profiles owner or capability write delete" ON "public"."country_profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)));
CREATE POLICY "country profiles owner or capability write insert" ON "public"."country_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)));
CREATE POLICY "country profiles owner or capability write update" ON "public"."country_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true))) WITH CHECK ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)));
CREATE POLICY "solaris consolidated anon read" ON "public"."country_profiles" AS PERMISSIVE FOR SELECT TO "anon" USING (true);
CREATE POLICY "solaris consolidated authenticated read" ON "public"."country_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true) OR true));
CREATE POLICY "solaris consolidated anon read" ON "public"."country_edition_identities" AS PERMISSIVE FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM editions e
  WHERE ((e.id = country_edition_identities.edition_id) AND (e.published = true)))));
CREATE POLICY "solaris consolidated authenticated read" ON "public"."country_edition_identities" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((owns_country(country_id) OR studio2_access_allowed('delegation.read'::text, edition_id, false) OR (EXISTS ( SELECT 1
   FROM editions e
  WHERE ((e.id = country_edition_identities.edition_id) AND (e.published = true))))));
CREATE POLICY "anon reads published fantasy games" ON "public"."fantasy_games" AS PERMISSIVE FOR SELECT TO "anon" USING (((status <> 'cancelled'::text) AND (now() >= opens_at) AND (EXISTS ( SELECT 1
   FROM editions edition
  WHERE ((edition.id = fantasy_games.edition_id) AND (edition.published = true)))) AND show_publication_enabled(show_id, 'participants'::text)));
CREATE POLICY "authenticated reads fantasy games" ON "public"."fantasy_games" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((((status <> 'cancelled'::text) AND (now() >= opens_at) AND (EXISTS ( SELECT 1
   FROM editions edition
  WHERE ((edition.id = fantasy_games.edition_id) AND (edition.published = true)))) AND show_publication_enabled(show_id, 'participants'::text)) OR studio2_access_allowed('edition.manage'::text, edition_id, false)));
CREATE POLICY "anon reads published fantasy choices" ON "public"."fantasy_game_entries" AS PERMISSIVE FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM fantasy_games game
  WHERE ((game.id = fantasy_game_entries.game_id) AND (game.status <> 'cancelled'::text) AND (now() >= game.opens_at) AND show_publication_enabled(game.show_id, 'participants'::text) AND (EXISTS ( SELECT 1
           FROM editions edition
          WHERE ((edition.id = game.edition_id) AND (edition.published = true))))))));
CREATE POLICY "authenticated reads fantasy choices" ON "public"."fantasy_game_entries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM fantasy_games game
  WHERE ((game.id = fantasy_game_entries.game_id) AND (((game.status <> 'cancelled'::text) AND (now() >= game.opens_at) AND show_publication_enabled(game.show_id, 'participants'::text) AND (EXISTS ( SELECT 1
           FROM editions edition
          WHERE ((edition.id = game.edition_id) AND (edition.published = true))))) OR studio2_access_allowed('edition.manage'::text, game.edition_id, false))))));
CREATE POLICY "fans create own profile" ON "public"."fan_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY "fans delete own profile" ON "public"."fan_profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY "fans read own profile" ON "public"."fan_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY "fans update own profile" ON "public"."fan_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY "fans read own event state" ON "public"."fan_event_reads" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = profile_id));
CREATE POLICY "fans read own fantasy team" ON "public"."fantasy_teams" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = profile_id));
CREATE POLICY "fans read own fantasy team entries" ON "public"."fantasy_team_entries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM fantasy_teams team
  WHERE ((team.id = fantasy_team_entries.team_id) AND (team.profile_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "fans create own notification preferences" ON "public"."notification_preferences" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = profile_id));
CREATE POLICY "fans delete own notification preferences" ON "public"."notification_preferences" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = profile_id));
CREATE POLICY "fans read own notification preferences" ON "public"."notification_preferences" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = profile_id));
CREATE POLICY "fans update own notification preferences" ON "public"."notification_preferences" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = profile_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = profile_id));
CREATE POLICY "fans read own follows" ON "public"."fan_follows" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = profile_id));
CREATE POLICY "Fans can delete own taste ballots" ON "public"."fan_taste_ballots" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((profile_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Fans can insert own taste ballots" ON "public"."fan_taste_ballots" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((profile_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Fans can read own taste ballots" ON "public"."fan_taste_ballots" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((profile_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Fans can update own taste ballots" ON "public"."fan_taste_ballots" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((profile_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((profile_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "organizers manage prediction rounds delete" ON "public"."prediction_rounds" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.studio2_show_access_allowed('voting.manage'::text, show_id, false));
CREATE POLICY "organizers manage prediction rounds insert" ON "public"."prediction_rounds" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.studio2_show_access_allowed('voting.manage'::text, show_id, false));
CREATE POLICY "organizers manage prediction rounds update" ON "public"."prediction_rounds" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.studio2_show_access_allowed('voting.manage'::text, show_id, false)) WITH CHECK (private.studio2_show_access_allowed('voting.manage'::text, show_id, false));
CREATE POLICY "solaris consolidated anon read" ON "public"."prediction_rounds" AS PERMISSIVE FOR SELECT TO "anon" USING (((status = ANY (ARRAY['open'::text, 'locked'::text, 'scoring'::text, 'scored'::text])) AND show_publication_enabled(show_id, 'participants'::text)));
CREATE POLICY "solaris consolidated authenticated read" ON "public"."prediction_rounds" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((((status = ANY (ARRAY['open'::text, 'locked'::text, 'scoring'::text, 'scored'::text])) AND show_publication_enabled(show_id, 'participants'::text)) OR private.studio2_show_access_allowed('voting.manage'::text, show_id, false) OR private.studio2_show_access_allowed('voting.manage'::text, show_id, false)));
CREATE POLICY "fans read own prediction entries" ON "public"."prediction_entries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = profile_id));
CREATE POLICY "fans read own prediction scores" ON "public"."prediction_scores" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM prediction_entries entry
  WHERE ((entry.id = prediction_scores.entry_id) AND (entry.profile_id = ( SELECT auth.uid() AS uid))))));
REVOKE ALL ON TABLE "public"."user_roles" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."user_roles" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."user_roles" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."user_roles" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."user_roles" TO "service_role";
REVOKE ALL ON TABLE "televoting"."admin_audit_log" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "televoting"."admin_audit_log" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE "televoting"."admin_audit_log" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "televoting"."admin_audit_log" TO "service_role";
REVOKE ALL ON TABLE "public"."beta2_test_submissions" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."beta2_test_submissions" TO "postgres";
GRANT SELECT ON TABLE "public"."beta2_test_submissions" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."beta2_test_submissions" TO "service_role";
REVOKE ALL ON TABLE "public"."submission_browser_sessions" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."submission_browser_sessions" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."submission_browser_sessions" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."submission_browser_sessions" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."submission_browser_sessions" TO "service_role";
REVOKE ALL ON TABLE "public"."submission_ip_history" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."submission_ip_history" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."submission_ip_history" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."submission_ip_history" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."submission_ip_history" TO "service_role";
REVOKE ALL ON TABLE "public"."edit_tokens" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."edit_tokens" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."edit_tokens" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."edit_tokens" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."edit_tokens" TO "service_role";
REVOKE ALL ON TABLE "televoting"."vote_moderation_events" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "televoting"."vote_moderation_events" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE "televoting"."vote_moderation_events" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "televoting"."vote_moderation_events" TO "service_role";
REVOKE ALL ON TABLE "public"."public_televote_country_contributions" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."public_televote_country_contributions" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."public_televote_country_contributions" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."public_televote_country_contributions" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."public_televote_country_contributions" TO "service_role";
REVOKE ALL ON TABLE "public"."integration_links" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integration_links" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integration_links" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integration_links" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integration_links" TO "service_role";
REVOKE ALL ON TABLE "public"."public_ia_rollout_state" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."public_ia_rollout_state" TO "postgres";
GRANT SELECT ON TABLE "public"."public_ia_rollout_state" TO "anon";
GRANT SELECT ON TABLE "public"."public_ia_rollout_state" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."public_ia_rollout_state" TO "service_role";
REVOKE ALL ON TABLE "public"."delegation_people" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."delegation_people" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."delegation_people" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."delegation_people" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."delegation_people" TO "service_role";
REVOKE ALL ON TABLE "televoting"."external_score_entries" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "televoting"."external_score_entries" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE "televoting"."external_score_entries" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "televoting"."external_score_entries" TO "service_role";
REVOKE ALL ON TABLE "public"."admin_preferences" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."admin_preferences" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."admin_preferences" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."admin_preferences" TO "service_role";
REVOKE ALL ON TABLE "public"."integration_events" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integration_events" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integration_events" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integration_events" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integration_events" TO "service_role";
REVOKE ALL ON TABLE "public"."studio2_feature_flags" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_feature_flags" TO "postgres";
GRANT SELECT ON TABLE "public"."studio2_feature_flags" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_feature_flags" TO "service_role";
REVOKE ALL ON TABLE "public"."app_push_subscriptions" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."app_push_subscriptions" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."app_push_subscriptions" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."app_push_subscriptions" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."app_push_subscriptions" TO "service_role";
REVOKE ALL ON TABLE "public"."admin_beta_test_submissions" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."admin_beta_test_submissions" TO "postgres";
GRANT INSERT, SELECT ON TABLE "public"."admin_beta_test_submissions" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."admin_beta_test_submissions" TO "service_role";
REVOKE ALL ON TABLE "public"."admin_deadlines" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."admin_deadlines" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."admin_deadlines" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."admin_deadlines" TO "service_role";
REVOKE ALL ON TABLE "public"."beta_test_submissions" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."beta_test_submissions" TO "postgres";
GRANT INSERT ON TABLE "public"."beta_test_submissions" TO "anon";
GRANT INSERT, SELECT ON TABLE "public"."beta_test_submissions" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."beta_test_submissions" TO "service_role";
REVOKE ALL ON TABLE "public"."content_events" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."content_events" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."content_events" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."content_events" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."content_events" TO "service_role";
REVOKE ALL ON TABLE "public"."studio2_delegation_settings" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_delegation_settings" TO "postgres";
GRANT SELECT ON TABLE "public"."studio2_delegation_settings" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_delegation_settings" TO "service_role";
REVOKE ALL ON TABLE "public"."public_web_vitals" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."public_web_vitals" TO "postgres";
GRANT INSERT ON TABLE "public"."public_web_vitals" TO "anon";
GRANT INSERT, SELECT ON TABLE "public"."public_web_vitals" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."public_web_vitals" TO "service_role";
REVOKE ALL ON TABLE "public"."country_media" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."country_media" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_media" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_media" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_media" TO "service_role";
REVOKE ALL ON TABLE "public"."studio2_capability_grants" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_capability_grants" TO "postgres";
GRANT SELECT ON TABLE "public"."studio2_capability_grants" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_capability_grants" TO "service_role";
REVOKE ALL ON TABLE "public"."country_font_assets" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."country_font_assets" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_font_assets" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_font_assets" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_font_assets" TO "service_role";
REVOKE ALL ON TABLE "public"."friend_voting_settings" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."friend_voting_settings" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."friend_voting_settings" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."friend_voting_settings" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."friend_voting_settings" TO "service_role";
REVOKE ALL ON TABLE "public"."submission_drafts" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."submission_drafts" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."submission_drafts" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."submission_drafts" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."submission_drafts" TO "service_role";
REVOKE ALL ON TABLE "public"."studio2_role_assignments" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_role_assignments" TO "postgres";
GRANT SELECT ON TABLE "public"."studio2_role_assignments" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_role_assignments" TO "service_role";
REVOKE ALL ON TABLE "public"."country_design_presets" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."country_design_presets" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_design_presets" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_design_presets" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_design_presets" TO "service_role";
REVOKE ALL ON TABLE "public"."beta3_test_submissions" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."beta3_test_submissions" TO "postgres";
GRANT INSERT ON TABLE "public"."beta3_test_submissions" TO "anon";
GRANT INSERT, SELECT ON TABLE "public"."beta3_test_submissions" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."beta3_test_submissions" TO "service_role";
REVOKE ALL ON TABLE "public"."integrity_identity_disclosure_requests" FROM PUBLIC, "postgres", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_identity_disclosure_requests" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_identity_disclosure_requests" TO "service_role";
REVOKE ALL ON TABLE "public"."country_hod_edition_claims" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."country_hod_edition_claims" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_hod_edition_claims" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_hod_edition_claims" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_hod_edition_claims" TO "service_role";
REVOKE ALL ON TABLE "public"."delegation_hod_assignments" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."delegation_hod_assignments" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."delegation_hod_assignments" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."delegation_hod_assignments" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."delegation_hod_assignments" TO "service_role";
REVOKE ALL ON TABLE "public"."country_profiles" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."country_profiles" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_profiles" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_profiles" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_profiles" TO "service_role";
REVOKE ALL ON TABLE "public"."country_edition_identities" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."country_edition_identities" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_edition_identities" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_edition_identities" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_edition_identities" TO "service_role";
REVOKE ALL ON TABLE "public"."fantasy_games" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."fantasy_games" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fantasy_games" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fantasy_games" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fantasy_games" TO "service_role";
REVOKE ALL ON TABLE "public"."fantasy_game_entries" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."fantasy_game_entries" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fantasy_game_entries" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fantasy_game_entries" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fantasy_game_entries" TO "service_role";
REVOKE ALL ON TABLE "public"."fan_profiles" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."fan_profiles" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fan_profiles" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fan_profiles" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fan_profiles" TO "service_role";
REVOKE ALL ON TABLE "public"."fan_event_reads" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."fan_event_reads" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fan_event_reads" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fan_event_reads" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fan_event_reads" TO "service_role";
REVOKE ALL ON TABLE "public"."fantasy_teams" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."fantasy_teams" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fantasy_teams" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fantasy_teams" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fantasy_teams" TO "service_role";
REVOKE ALL ON TABLE "public"."fantasy_team_entries" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."fantasy_team_entries" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fantasy_team_entries" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fantasy_team_entries" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fantasy_team_entries" TO "service_role";
REVOKE ALL ON TABLE "public"."notification_preferences" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."notification_preferences" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."notification_preferences" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."notification_preferences" TO "service_role";
REVOKE ALL ON TABLE "public"."fan_follows" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."fan_follows" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fan_follows" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fan_follows" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fan_follows" TO "service_role";
REVOKE ALL ON TABLE "public"."fan_taste_ballots" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."fan_taste_ballots" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fan_taste_ballots" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."fan_taste_ballots" TO "service_role";
REVOKE ALL ON TABLE "public"."prediction_rounds" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."prediction_rounds" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_rounds" TO "anon";
GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_rounds" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_rounds" TO "service_role";
REVOKE ALL ON TABLE "public"."studio2_prediction_round_versions" FROM PUBLIC, "postgres", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_prediction_round_versions" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_prediction_round_versions" TO "service_role";
REVOKE ALL ON TABLE "public"."studio2_prediction_score_versions" FROM PUBLIC, "postgres", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_prediction_score_versions" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_prediction_score_versions" TO "service_role";
REVOKE ALL ON TABLE "public"."prediction_consensus_snapshots" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."prediction_consensus_snapshots" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_consensus_snapshots" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_consensus_snapshots" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_consensus_snapshots" TO "service_role";
REVOKE ALL ON TABLE "public"."prediction_entries" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."prediction_entries" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_entries" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_entries" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_entries" TO "service_role";
REVOKE ALL ON TABLE "public"."prediction_scores" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."prediction_scores" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_scores" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_scores" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_scores" TO "service_role";
COMMIT;
-- LIMITATION: 200/215 relations, original 56 scope-specific, 144 additional full-field digests.
-- 15 identities and all 727 routine implementations, real rows, roles/history/security equivalence still uncertified.
