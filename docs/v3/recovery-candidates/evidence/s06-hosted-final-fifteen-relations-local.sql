-- S06: FINAL FIFTEEN hosted-observed physical table identities (200 -> 215).
-- ONLY metadata from bounded, read-only hosted pg_catalog inspection; zero application rows.
-- This is a disposable NETWORKLESS PG17.11 ICU en-US metadata fixture, NOT a migration.
-- No hosted writes, real function bodies, behavior equivalence or release authority.
BEGIN;
SET LOCAL search_path=public,private,auth,televoting,pg_catalog;
SET LOCAL check_function_bodies=off;
SET LOCAL lock_timeout='5s';

-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('auth.uid()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "auth"."uid"() RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.reconcile_organizer_notification_state()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."reconcile_organizer_notification_state"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.route_organizer_inbox_event()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."route_organizer_inbox_event"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_capture_notice_revision()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_capture_notice_revision"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_guard_direct_client_write()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_guard_direct_client_write"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_guard_direct_confirmation_review_transition()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_guard_direct_confirmation_review_transition"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_guard_incident_strict_dual()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_guard_incident_strict_dual"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_guard_jury_member_user_link()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_guard_jury_member_user_link"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_guard_jury_roster_after_ballot()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_guard_jury_roster_after_ballot"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.studio2_touch_updated_at()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."studio2_touch_updated_at"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.v3_bind_review_history_version()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."v3_bind_review_history_version"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.v3_emit_notice_transition_event()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."v3_emit_notice_transition_event"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.v3_emit_scheduled_publication_event()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."v3_emit_scheduled_publication_event"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.v3_guard_bound_review_history()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."v3_guard_bound_review_history"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.v3_guard_entry_version_lineage()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."v3_guard_entry_version_lineage"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.v3_guard_immutable_entry_evidence()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."v3_guard_immutable_entry_evidence"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.v3_reject_publication_execution_mutation()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."v3_reject_publication_execution_mutation"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.v3_validate_publication_execution()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."v3_validate_publication_execution"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('private.v3_validate_review_history_scope()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "private"."v3_validate_review_history_scope"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('public.capture_prediction_snapshot_after_submission()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."capture_prediction_snapshot_after_submission"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('public.owns_country(uuid)') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."owns_country"(_country_id uuid) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('public.owns_country(uuid,uuid)') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."owns_country"(_user_id uuid, _country_id uuid) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('public.studio2_access_allowed(text,uuid,boolean)') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."studio2_access_allowed"(p_capability text, p_edition_id uuid, p_strict_before_cutover boolean) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('public.studio2_can_manage_communications(uuid)') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."studio2_can_manage_communications"(p_edition_id uuid) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('public.studio2_can_read_notice(uuid,text,timestamp with time zone,text,uuid[],text)') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."studio2_can_read_notice"(p_edition_id uuid, p_status text, p_sent_at timestamp with time zone, p_audience text, p_country_ids uuid[], p_audience_group text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Local-only fail-closed symbol dependency; never replace an existing routine.
DO $s06_guard$ BEGIN IF to_regprocedure('public.touch_country_content_updated_at()') IS NULL THEN EXECUTE $s06_create$CREATE FUNCTION "public"."touch_country_content_updated_at"() RETURNS trigger LANGUAGE plpgsql IMMUTABLE AS $s06_body$ BEGIN RAISE EXCEPTION 'S06 catalog-only placeholder must never execute'; END $s06_body$;$s06_create$; END IF; END $s06_guard$;
-- Physical tables first; no row data.
CREATE TABLE "private"."v3_entry_reviews" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "version_id" uuid NOT NULL,
  "decision" text NOT NULL,
  "reason" text,
  "reviewed_at" timestamp with time zone NOT NULL,
  "actor_id" uuid
);
CREATE TABLE "private"."v3_entry_versions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "target_type" text NOT NULL,
  "entry_id" uuid NOT NULL,
  "submission_id" uuid NOT NULL,
  "edition_id" uuid NOT NULL,
  "revision" bigint NOT NULL,
  "parent_version_id" uuid,
  "source" text NOT NULL,
  "content" jsonb NOT NULL,
  "content_hash" text NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "actor_id" uuid,
  "restored_from_submission_version_id" uuid
);
CREATE TABLE "public"."country_profile_sections" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "country_id" uuid NOT NULL,
  "heading" text NOT NULL,
  "body" text DEFAULT ''::text NOT NULL,
  "image_url" text,
  "image_caption" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "section_type" text DEFAULT 'rich_text'::text NOT NULL,
  "kicker" text,
  "content_mode" text DEFAULT 'manual'::text NOT NULL,
  "visible_on_country" boolean DEFAULT true NOT NULL,
  "visible_on_wiki" boolean DEFAULT true NOT NULL,
  "image_layout" text DEFAULT 'wide'::text NOT NULL,
  "background_tint" text,
  "content_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE "public"."country_themes" (
  "country_id" uuid NOT NULL,
  "background_primary" text DEFAULT '#0b2330'::text NOT NULL,
  "background_secondary" text DEFAULT '#153c46'::text NOT NULL,
  "accent" text DEFAULT '#7dcfc4'::text NOT NULL,
  "text_primary" text DEFAULT '#f5f7f8'::text NOT NULL,
  "text_muted" text DEFAULT '#b7c4c8'::text NOT NULL,
  "surface" text DEFAULT '#102b35'::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "background_mode" text DEFAULT 'gradient'::text NOT NULL,
  "gradient_style" text DEFAULT 'aurora'::text NOT NULL,
  "gradient_angle" integer DEFAULT 145 NOT NULL,
  "background_image_url" text,
  "background_image_storage_path" text,
  "background_position_x" integer DEFAULT 50 NOT NULL,
  "background_position_y" integer DEFAULT 50 NOT NULL,
  "background_overlay" numeric DEFAULT 0.360 NOT NULL,
  "background_blur" integer DEFAULT 0 NOT NULL,
  "hero_layout" text DEFAULT 'classic'::text NOT NULL,
  "decoration_style" text DEFAULT 'auto'::text NOT NULL,
  "background_tertiary" text,
  "button_color" text,
  "flag_enabled" boolean DEFAULT true NOT NULL,
  "design_version" smallint DEFAULT 1 NOT NULL,
  "design_v2" jsonb
);
CREATE TABLE "public"."integrity_case_appeals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "sanction_id" uuid NOT NULL,
  "grounds" text NOT NULL,
  "submitted_by_user_id" uuid,
  "submitted_via" text NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deadline_at" timestamp with time zone NOT NULL,
  "was_timely" boolean NOT NULL,
  "status" text DEFAULT 'submitted'::text NOT NULL,
  "assigned_reviewer" uuid,
  "decision_rationale" text,
  "replacement_sanction_id" uuid,
  "decided_by" uuid,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "extension_granted_at" timestamp with time zone,
  "extension_granted_by" uuid,
  "extension_reason" text
);
CREATE TABLE "public"."prediction_entry_versions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entry_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "payload" jsonb NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."prediction_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entry_id" uuid NOT NULL,
  "country_id" uuid NOT NULL,
  "prediction_type" text NOT NULL,
  "rank" integer,
  "confidence" numeric(5,4),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."public_ux_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "session_id" text NOT NULL,
  "user_id" uuid DEFAULT auth.uid(),
  "event_name" text NOT NULL,
  "pathname" text NOT NULL,
  "target" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE "public"."studio2_incidents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid,
  "title" text NOT NULL,
  "severity" text NOT NULL,
  "status" text DEFAULT 'detected'::text NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "category" text DEFAULT 'other'::text NOT NULL,
  "affected_systems" text[] DEFAULT '{}'::text[] NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "commander_id" uuid,
  "acknowledged_at" timestamp with time zone,
  "acknowledged_by" uuid,
  "resolution" text,
  "postmortem" text,
  "crisis_declared_at" timestamp with time zone,
  "crisis_declared_by" uuid
);
CREATE TABLE "public"."studio2_jury_members" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "country_id" uuid NOT NULL,
  "display_name" text NOT NULL,
  "member_user_id" uuid,
  "status" text DEFAULT 'assigned'::text NOT NULL,
  "assigned_by" uuid,
  "removed_at" timestamp with time zone,
  "removed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."studio2_notice_receipts" (
  "notice_id" uuid NOT NULL,
  "recipient_user_id" uuid NOT NULL,
  "delivered_at" timestamp with time zone,
  "opened_at" timestamp with time zone,
  "acknowledged_at" timestamp with time zone,
  "archived_at" timestamp with time zone
);
CREATE TABLE "public"."studio2_notice_versions" (
  "notice_id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "edition_id" uuid,
  "notice_type" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "severity" text NOT NULL,
  "audience" text NOT NULL,
  "audience_group" text,
  "country_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "acknowledgement_required" boolean DEFAULT false NOT NULL,
  "status" text NOT NULL,
  "scheduled_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "changed_by" uuid,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "display_surfaces" text[] DEFAULT ARRAY['delegation_inbox'::text] NOT NULL,
  "archived_at" timestamp with time zone
);
CREATE TABLE "public"."studio2_official_notices" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "severity" text DEFAULT 'info'::text NOT NULL,
  "audience" text NOT NULL,
  "country_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "acknowledgement_required" boolean DEFAULT false NOT NULL,
  "sent_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "notice_type" text DEFAULT 'official_notice'::text NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "audience_group" text,
  "scheduled_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "cancelled_by" uuid,
  "cancellation_reason" text,
  "supersedes_id" uuid,
  "superseded_by_id" uuid,
  "revision" integer DEFAULT 1 NOT NULL,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "display_surfaces" text[] DEFAULT ARRAY['delegation_inbox'::text] NOT NULL,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "archive_reason" text
);
CREATE TABLE "public"."studio2_show_publication_executions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "show_id" uuid NOT NULL,
  "edition_id" uuid NOT NULL,
  "scheduled_operation_id" uuid,
  "status" text NOT NULL,
  "intended_config" jsonb NOT NULL,
  "source_show_updated_at" timestamp with time zone,
  "source_result_version" bigint,
  "checks" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "failure_reason" text,
  "executed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."submission_review_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "target_type" text NOT NULL,
  "target_entry_id" uuid,
  "artist_snapshot" text,
  "song_title_snapshot" text,
  "action" text NOT NULL,
  "reason" text NOT NULL,
  "admin_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_version_id" uuid
);
-- Check, primary key and unique constraints precede foreign keys.
ALTER TABLE "private"."v3_entry_reviews" ADD CONSTRAINT "v3_entry_reviews_decision_check" CHECK (decision = ANY (ARRAY['accepted'::text, 'declined'::text, 'removed'::text]));
ALTER TABLE "private"."v3_entry_reviews" ADD CONSTRAINT "v3_entry_reviews_pkey" PRIMARY KEY (id);
ALTER TABLE "private"."v3_entry_versions" ADD CONSTRAINT "v3_entry_versions_pkey" PRIMARY KEY (id);
ALTER TABLE "private"."v3_entry_versions" ADD CONSTRAINT "v3_entry_versions_restore_provenance_check" CHECK (source = 'organizer_restore'::text AND restored_from_submission_version_id IS NOT NULL OR source <> 'organizer_restore'::text AND restored_from_submission_version_id IS NULL);
ALTER TABLE "private"."v3_entry_versions" ADD CONSTRAINT "v3_entry_versions_revision_check" CHECK (revision > 0);
ALTER TABLE "private"."v3_entry_versions" ADD CONSTRAINT "v3_entry_versions_source_check" CHECK (source = ANY (ARRAY['legacy_observation'::text, 'canonical_write'::text, 'organizer_restore'::text]));
ALTER TABLE "private"."v3_entry_versions" ADD CONSTRAINT "v3_entry_versions_target_type_check" CHECK (target_type = ANY (ARRAY['internal'::text, 'national_final'::text]));
ALTER TABLE "private"."v3_entry_versions" ADD CONSTRAINT "v3_entry_versions_target_type_entry_id_revision_key" UNIQUE (target_type, entry_id, revision);
ALTER TABLE "public"."country_profile_sections" ADD CONSTRAINT "country_profile_sections_background_tint_check" CHECK (background_tint IS NULL OR background_tint ~ '^#[0-9A-Fa-f]{6}$'::text);
ALTER TABLE "public"."country_profile_sections" ADD CONSTRAINT "country_profile_sections_content_mode_check" CHECK (content_mode = ANY (ARRAY['manual'::text, 'auto'::text]));
ALTER TABLE "public"."country_profile_sections" ADD CONSTRAINT "country_profile_sections_image_layout_check" CHECK (image_layout = ANY (ARRAY['wide'::text, 'split'::text, 'left'::text, 'right'::text, 'full'::text]));
ALTER TABLE "public"."country_profile_sections" ADD CONSTRAINT "country_profile_sections_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."country_profile_sections" ADD CONSTRAINT "country_profile_sections_type_check" CHECK (section_type = ANY (ARRAY['rich_text'::text, 'image'::text, 'quote'::text, 'facts'::text, 'gallery'::text, 'divider'::text, 'timeline'::text]));
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_accent_hex" CHECK (accent ~ '^#[0-9A-Fa-f]{6}$'::text);
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_background_blur_check" CHECK (background_blur >= 0 AND background_blur <= 30);
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_background_mode_check" CHECK (background_mode = ANY (ARRAY['solid'::text, 'gradient'::text, 'image'::text]));
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_background_overlay_check" CHECK (background_overlay >= 0::numeric AND background_overlay <= 0.9);
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_background_position_x_check" CHECK (background_position_x >= 0 AND background_position_x <= 100);
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_background_position_y_check" CHECK (background_position_y >= 0 AND background_position_y <= 100);
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_background_primary_hex" CHECK (background_primary ~ '^#[0-9A-Fa-f]{6}$'::text);
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_background_secondary_hex" CHECK (background_secondary ~ '^#[0-9A-Fa-f]{6}$'::text);
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_background_tertiary_hex" CHECK (background_tertiary IS NULL OR background_tertiary ~ '^#[0-9A-Fa-f]{6}$'::text);
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_decoration_style_check" CHECK (decoration_style = ANY (ARRAY['auto'::text, 'none'::text, 'flag'::text, 'orbits'::text, 'rays'::text, 'grid'::text, 'waves'::text, 'aurora'::text, 'constellation'::text, 'facets'::text, 'topography'::text, 'eclipse'::text]));
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_design_version_check" CHECK (design_version = ANY (ARRAY[1, 2]));
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_gradient_angle_check" CHECK (gradient_angle >= 0 AND gradient_angle <= 360);
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_gradient_style_check" CHECK (gradient_style = ANY (ARRAY['linear'::text, 'radial'::text, 'aurora'::text]));
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_hero_layout_check" CHECK (hero_layout = ANY (ARRAY['classic'::text, 'editorial'::text, 'minimal'::text, 'flag-focus'::text, 'poster'::text, 'split'::text, 'spotlight'::text, 'broadcast'::text, 'panorama'::text, 'monument'::text, 'glass-card'::text, 'newspaper'::text, 'ribbon'::text, 'duotone'::text, 'passport'::text, 'horizon'::text, 'heritage'::text, 'sci-fi'::text, 'water-drop'::text]));
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_pkey" PRIMARY KEY (country_id);
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_surface_hex" CHECK (surface ~ '^#[0-9A-Fa-f]{6}$'::text);
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_text_muted_hex" CHECK (text_muted ~ '^#[0-9A-Fa-f]{6}$'::text);
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_text_primary_hex" CHECK (text_primary ~ '^#[0-9A-Fa-f]{6}$'::text);
ALTER TABLE "public"."integrity_case_appeals" ADD CONSTRAINT "integrity_appeal_extension_consistency" CHECK (extension_granted_at IS NULL AND extension_granted_by IS NULL AND extension_reason IS NULL OR extension_granted_at IS NOT NULL AND extension_granted_by IS NOT NULL AND extension_reason IS NOT NULL);
ALTER TABLE "public"."integrity_case_appeals" ADD CONSTRAINT "integrity_case_appeals_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrity_case_appeals" ADD CONSTRAINT "integrity_case_appeals_status_check" CHECK (status = ANY (ARRAY['submitted'::text, 'under_review'::text, 'upheld'::text, 'reduced'::text, 'increased'::text, 'overturned'::text, 'rejected_late'::text, 'rejected_ineligible'::text]));
ALTER TABLE "public"."integrity_case_appeals" ADD CONSTRAINT "integrity_case_appeals_submitted_via_check" CHECK (submitted_via = ANY (ARRAY['protected_reporter'::text, 'anonymous_recovery'::text, 'organizer'::text]));
ALTER TABLE "public"."prediction_entry_versions" ADD CONSTRAINT "prediction_entry_versions_entry_id_version_key" UNIQUE (entry_id, version);
ALTER TABLE "public"."prediction_entry_versions" ADD CONSTRAINT "prediction_entry_versions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."prediction_entry_versions" ADD CONSTRAINT "prediction_entry_versions_version_check" CHECK (version > 0);
ALTER TABLE "public"."prediction_items" ADD CONSTRAINT "prediction_items_confidence_check" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric);
ALTER TABLE "public"."prediction_items" ADD CONSTRAINT "prediction_items_entry_id_prediction_type_country_id_key" UNIQUE (entry_id, prediction_type, country_id);
ALTER TABLE "public"."prediction_items" ADD CONSTRAINT "prediction_items_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."prediction_items" ADD CONSTRAINT "prediction_items_rank_check" CHECK (rank IS NULL OR rank > 0);
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_event_name_check" CHECK (event_name = ANY (ARRAY['public_nav_clicked'::text, 'section_nav_clicked'::text, 'search_opened'::text, 'search_submitted'::text, 'search_result_clicked'::text, 'search_no_results'::text, 'breadcrumb_clicked'::text, 'advanced_section_opened'::text, 'task_started'::text, 'task_completed'::text, 'hub_primary_clicked'::text]));
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_metadata_device_check" CHECK (NOT metadata ? 'device'::text OR ((metadata ->> 'device'::text) = ANY (ARRAY['mobile'::text, 'tablet'::text, 'desktop'::text])));
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_metadata_elapsed_check" CHECK (NOT metadata ? 'elapsed_ms'::text OR (metadata ->> 'elapsed_ms'::text) ~ '^[0-9]{1,8}$'::text AND ((metadata ->> 'elapsed_ms'::text)::integer) >= 0 AND ((metadata ->> 'elapsed_ms'::text)::integer) <= 86400000);
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_metadata_keys_check" CHECK ((metadata - ARRAY['device'::text, 'area'::text, 'group'::text, 'query_length'::text, 'result_count'::text, 'source'::text, 'visibility'::text, 'task_status'::text, 'interaction'::text, 'beta_task'::text, 'task_run'::text, 'elapsed_ms'::text, 'start_route'::text, 'search_used'::text]) = '{}'::jsonb);
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_metadata_object_check" CHECK (jsonb_typeof(metadata) = 'object'::text);
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_metadata_query_length_check" CHECK (NOT metadata ? 'query_length'::text OR (metadata ->> 'query_length'::text) ~ '^[0-9]{1,4}$'::text AND ((metadata ->> 'query_length'::text)::integer) >= 0 AND ((metadata ->> 'query_length'::text)::integer) <= 500);
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_metadata_result_count_check" CHECK (NOT metadata ? 'result_count'::text OR (metadata ->> 'result_count'::text) ~ '^[0-9]{1,6}$'::text AND ((metadata ->> 'result_count'::text)::integer) >= 0 AND ((metadata ->> 'result_count'::text)::integer) <= 10000);
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_metadata_search_used_check" CHECK (NOT metadata ? 'search_used'::text OR ((metadata ->> 'search_used'::text) = ANY (ARRAY['yes'::text, 'no'::text])));
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_metadata_size_check" CHECK (octet_length(metadata::text) <= 4096);
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_metadata_start_route_check" CHECK (NOT metadata ? 'start_route'::text OR length(metadata ->> 'start_route'::text) >= 1 AND length(metadata ->> 'start_route'::text) <= 120 AND (metadata ->> 'start_route'::text) ~~ '/%'::text);
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_metadata_text_lengths_check" CHECK (COALESCE(length(metadata ->> 'area'::text), 0) <= 120 AND COALESCE(length(metadata ->> 'group'::text), 0) <= 120 AND COALESCE(length(metadata ->> 'source'::text), 0) <= 120 AND COALESCE(length(metadata ->> 'visibility'::text), 0) <= 120 AND COALESCE(length(metadata ->> 'task_status'::text), 0) <= 120 AND COALESCE(length(metadata ->> 'interaction'::text), 0) <= 120 AND COALESCE(length(metadata ->> 'beta_task'::text), 0) <= 120 AND COALESCE(length(metadata ->> 'task_run'::text), 0) <= 120);
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_pathname_check" CHECK (length(pathname) >= 1 AND length(pathname) <= 512 AND pathname ~~ '/%'::text);
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_session_id_check" CHECK (length(session_id) >= 8 AND length(session_id) <= 128);
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_target_check" CHECK (target IS NULL OR length(target) <= 512);
ALTER TABLE "public"."studio2_incidents" ADD CONSTRAINT "studio2_incidents_category_check" CHECK (category = ANY (ARRAY['voting'::text, 'broadcast'::text, 'delegation'::text, 'technical'::text, 'results'::text, 'security'::text, 'integrity'::text, 'publication'::text, 'other'::text]));
ALTER TABLE "public"."studio2_incidents" ADD CONSTRAINT "studio2_incidents_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_incidents" ADD CONSTRAINT "studio2_incidents_resolution_check" CHECK (status = 'resolved'::text AND resolved_at IS NOT NULL OR status <> 'resolved'::text AND resolved_at IS NULL);
ALTER TABLE "public"."studio2_incidents" ADD CONSTRAINT "studio2_incidents_severity_check" CHECK (severity = ANY (ARRAY['sev1'::text, 'sev2'::text, 'sev3'::text, 'sev4'::text]));
ALTER TABLE "public"."studio2_incidents" ADD CONSTRAINT "studio2_incidents_status_check" CHECK (status = ANY (ARRAY['detected'::text, 'investigating'::text, 'mitigating'::text, 'monitoring'::text, 'resolved'::text]));
ALTER TABLE "public"."studio2_incidents" ADD CONSTRAINT "studio2_incidents_title_check" CHECK (length(btrim(title)) > 0);
ALTER TABLE "public"."studio2_jury_members" ADD CONSTRAINT "studio2_jury_members_display_name_check" CHECK (length(btrim(display_name)) > 0);
ALTER TABLE "public"."studio2_jury_members" ADD CONSTRAINT "studio2_jury_members_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_jury_members" ADD CONSTRAINT "studio2_jury_members_removed_state_check" CHECK (status = 'assigned'::text AND removed_at IS NULL AND removed_by IS NULL OR status = 'removed'::text AND removed_at IS NOT NULL);
ALTER TABLE "public"."studio2_jury_members" ADD CONSTRAINT "studio2_jury_members_status_check" CHECK (status = ANY (ARRAY['assigned'::text, 'removed'::text]));
ALTER TABLE "public"."studio2_notice_receipts" ADD CONSTRAINT "studio2_notice_receipts_pkey" PRIMARY KEY (notice_id, recipient_user_id);
ALTER TABLE "public"."studio2_notice_versions" ADD CONSTRAINT "studio2_notice_versions_display_surfaces_check" CHECK (cardinality(display_surfaces) > 0 AND display_surfaces <@ ARRAY['delegation_inbox'::text, 'mysolaris_home'::text, 'public_home'::text] AND array_position(display_surfaces, NULL::text) IS NULL);
ALTER TABLE "public"."studio2_notice_versions" ADD CONSTRAINT "studio2_notice_versions_pkey" PRIMARY KEY (notice_id, revision);
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_audience_check" CHECK (audience = ANY (ARRAY['all_delegations'::text, 'participating_countries'::text, 'specific_countries'::text, 'jurors'::text, 'hods'::text, 'organizers'::text, 'edition_group'::text, 'staff'::text, 'press'::text]));
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_audience_group_check" CHECK (audience = 'edition_group'::text AND (audience_group = ANY (ARRAY['broadcast'::text, 'voting'::text, 'delegations'::text, 'results'::text, 'communications'::text])) OR audience <> 'edition_group'::text AND audience_group IS NULL);
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_body_check" CHECK (length(btrim(body)) > 0);
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_country_scope_check" CHECK (audience = 'specific_countries'::text AND cardinality(country_ids) > 0 OR audience <> 'specific_countries'::text AND cardinality(country_ids) = 0);
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_display_surfaces_check" CHECK (cardinality(display_surfaces) > 0 AND display_surfaces <@ ARRAY['delegation_inbox'::text, 'mysolaris_home'::text, 'public_home'::text] AND array_position(display_surfaces, NULL::text) IS NULL);
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_notice_type_check" CHECK (notice_type = ANY (ARRAY['official_notice'::text, 'deadline_reminder'::text, 'rule_clarification'::text, 'technical_advisory'::text, 'voting_notice'::text, 'emergency_communication'::text, 'broadcast_information'::text]));
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_revision_check" CHECK (revision >= 1);
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_severity_check" CHECK (severity = ANY (ARRAY['info'::text, 'action_required'::text, 'urgent'::text, 'critical'::text]));
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'published'::text, 'cancelled'::text, 'superseded'::text]));
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_title_check" CHECK (length(btrim(title)) > 0);
ALTER TABLE "public"."studio2_show_publication_executions" ADD CONSTRAINT "studio2_show_publication_executions_checks_check" CHECK (jsonb_typeof(checks) = 'object'::text);
ALTER TABLE "public"."studio2_show_publication_executions" ADD CONSTRAINT "studio2_show_publication_executions_intended_config_check" CHECK (jsonb_typeof(intended_config) = 'object'::text);
ALTER TABLE "public"."studio2_show_publication_executions" ADD CONSTRAINT "studio2_show_publication_executions_operation_v3_check" CHECK (scheduled_operation_id IS NOT NULL);
ALTER TABLE "public"."studio2_show_publication_executions" ADD CONSTRAINT "studio2_show_publication_executions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_show_publication_executions" ADD CONSTRAINT "studio2_show_publication_executions_status_check" CHECK (status = ANY (ARRAY['succeeded'::text, 'blocked'::text]));
ALTER TABLE "public"."studio2_show_publication_executions" ADD CONSTRAINT "studio2_show_publication_executions_terminal_v3_check" CHECK (status = 'succeeded'::text AND failure_reason IS NULL OR status = 'blocked'::text AND failure_reason IS NOT NULL);
ALTER TABLE "public"."submission_review_history" ADD CONSTRAINT "submission_review_history_action_check" CHECK (action = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'removed'::text, 'winner_selected'::text, 'winner_cleared'::text]));
ALTER TABLE "public"."submission_review_history" ADD CONSTRAINT "submission_review_history_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."submission_review_history" ADD CONSTRAINT "submission_review_history_target_type_check" CHECK (target_type = ANY (ARRAY['internal'::text, 'national_final'::text]));
-- The pg_constraint trigger ('t') is instantiated by CREATE CONSTRAINT TRIGGER below;
-- ALTER TABLE ADD CONSTRAINT ... TRIGGER is not valid SQL.
-- All external and cyclic FK targets now exist; build FK constraints.
ALTER TABLE "private"."v3_entry_reviews" ADD CONSTRAINT "v3_entry_reviews_version_id_fkey" FOREIGN KEY (version_id) REFERENCES private.v3_entry_versions(id);
ALTER TABLE "private"."v3_entry_versions" ADD CONSTRAINT "v3_entry_versions_parent_version_id_fkey" FOREIGN KEY (parent_version_id) REFERENCES private.v3_entry_versions(id);
ALTER TABLE "public"."country_profile_sections" ADD CONSTRAINT "country_profile_sections_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;
ALTER TABLE "public"."country_themes" ADD CONSTRAINT "country_themes_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_case_appeals" ADD CONSTRAINT "integrity_case_appeals_assigned_reviewer_fkey" FOREIGN KEY (assigned_reviewer) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_case_appeals" ADD CONSTRAINT "integrity_case_appeals_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_case_appeals" ADD CONSTRAINT "integrity_case_appeals_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_case_appeals" ADD CONSTRAINT "integrity_case_appeals_extension_granted_by_fkey" FOREIGN KEY (extension_granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_case_appeals" ADD CONSTRAINT "integrity_case_appeals_replacement_sanction_id_fkey" FOREIGN KEY (replacement_sanction_id) REFERENCES integrity_case_sanctions(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_case_appeals" ADD CONSTRAINT "integrity_case_appeals_sanction_id_fkey" FOREIGN KEY (sanction_id) REFERENCES integrity_case_sanctions(id) ON DELETE RESTRICT;
ALTER TABLE "public"."integrity_case_appeals" ADD CONSTRAINT "integrity_case_appeals_submitted_by_user_id_fkey" FOREIGN KEY (submitted_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."prediction_entry_versions" ADD CONSTRAINT "prediction_entry_versions_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES prediction_entries(id) ON DELETE CASCADE;
ALTER TABLE "public"."prediction_items" ADD CONSTRAINT "prediction_items_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;
ALTER TABLE "public"."prediction_items" ADD CONSTRAINT "prediction_items_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES prediction_entries(id) ON DELETE CASCADE;
ALTER TABLE "public"."public_ux_events" ADD CONSTRAINT "public_ux_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_incidents" ADD CONSTRAINT "studio2_incidents_acknowledged_by_fkey" FOREIGN KEY (acknowledged_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_incidents" ADD CONSTRAINT "studio2_incidents_commander_id_fkey" FOREIGN KEY (commander_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_incidents" ADD CONSTRAINT "studio2_incidents_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_incidents" ADD CONSTRAINT "studio2_incidents_crisis_declared_by_fkey" FOREIGN KEY (crisis_declared_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_incidents" ADD CONSTRAINT "studio2_incidents_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_incidents" ADD CONSTRAINT "studio2_incidents_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_jury_members" ADD CONSTRAINT "studio2_jury_members_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_jury_members" ADD CONSTRAINT "studio2_jury_members_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_jury_members" ADD CONSTRAINT "studio2_jury_members_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_jury_members" ADD CONSTRAINT "studio2_jury_members_member_user_id_fkey" FOREIGN KEY (member_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_jury_members" ADD CONSTRAINT "studio2_jury_members_removed_by_fkey" FOREIGN KEY (removed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_notice_receipts" ADD CONSTRAINT "studio2_notice_receipts_notice_id_fkey" FOREIGN KEY (notice_id) REFERENCES studio2_official_notices(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_notice_receipts" ADD CONSTRAINT "studio2_notice_receipts_recipient_user_id_fkey" FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_notice_versions" ADD CONSTRAINT "studio2_notice_versions_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_notice_versions" ADD CONSTRAINT "studio2_notice_versions_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_notice_versions" ADD CONSTRAINT "studio2_notice_versions_notice_id_fkey" FOREIGN KEY (notice_id) REFERENCES studio2_official_notices(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_cancelled_by_fkey" FOREIGN KEY (cancelled_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_superseded_by_id_fkey" FOREIGN KEY (superseded_by_id) REFERENCES studio2_official_notices(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_supersedes_id_fkey" FOREIGN KEY (supersedes_id) REFERENCES studio2_official_notices(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_official_notices" ADD CONSTRAINT "studio2_official_notices_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_show_publication_executions" ADD CONSTRAINT "studio2_show_publication_executions_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_show_publication_executions" ADD CONSTRAINT "studio2_show_publication_executions_show_edition_v3_fk" FOREIGN KEY (show_id, edition_id) REFERENCES shows(id, edition_id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_show_publication_executions" ADD CONSTRAINT "studio2_show_publication_executions_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_show_publication_executions" ADD CONSTRAINT "studio2_show_publication_executions_source_snapshot_v3_fk" FOREIGN KEY (show_id, source_result_version) REFERENCES private.v3_result_versions(show_id, version) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "public"."submission_review_history" ADD CONSTRAINT "submission_review_history_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE;
-- Non-constraint indexes; key-backed indexes already created by constraints.
CREATE INDEX v3_entry_reviews_version_idx ON private.v3_entry_reviews USING btree (version_id, reviewed_at, id);
CREATE INDEX v3_entry_versions_restore_source_idx ON private.v3_entry_versions USING btree (restored_from_submission_version_id) WHERE (restored_from_submission_version_id IS NOT NULL);
CREATE INDEX country_profile_sections_country_sort_idx ON public.country_profile_sections USING btree (country_id, sort_order, created_at);
CREATE INDEX integrity_case_appeals_case_created_idx ON public.integrity_case_appeals USING btree (case_id, created_at DESC);
CREATE INDEX integrity_case_appeals_status_idx ON public.integrity_case_appeals USING btree (status, submitted_at DESC);
CREATE UNIQUE INDEX integrity_case_one_reporter_appeal_per_sanction_idx ON public.integrity_case_appeals USING btree (sanction_id) WHERE (submitted_via = ANY (ARRAY['protected_reporter'::text, 'anonymous_recovery'::text]));
CREATE INDEX public_ux_events_created_at_idx ON public.public_ux_events USING btree (created_at DESC);
CREATE INDEX public_ux_events_event_created_idx ON public.public_ux_events USING btree (event_name, created_at DESC);
CREATE INDEX public_ux_events_session_created_idx ON public.public_ux_events USING btree (session_id, created_at);
CREATE INDEX public_ux_events_task_run_created_idx ON public.public_ux_events USING btree (((metadata ->> 'task_run'::text)), created_at) WHERE (metadata ? 'task_run'::text);
CREATE INDEX public_ux_events_user_id_idx ON public.public_ux_events USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX studio2_incidents_created_by_idx ON public.studio2_incidents USING btree (created_by);
CREATE INDEX studio2_incidents_edition_category_status_idx ON public.studio2_incidents USING btree (edition_id, category, status, severity, started_at DESC);
CREATE INDEX studio2_incidents_edition_status_idx ON public.studio2_incidents USING btree (edition_id, status, severity, started_at DESC);
CREATE INDEX studio2_incidents_updated_by_idx ON public.studio2_incidents USING btree (updated_by);
CREATE UNIQUE INDEX studio2_jury_members_active_name_key ON public.studio2_jury_members USING btree (edition_id, country_id, lower(btrim(display_name))) WHERE (status = 'assigned'::text);
CREATE INDEX studio2_jury_members_assigned_by_idx ON public.studio2_jury_members USING btree (assigned_by);
CREATE INDEX studio2_jury_members_country_id_idx ON public.studio2_jury_members USING btree (country_id);
CREATE INDEX studio2_jury_members_delegation_idx ON public.studio2_jury_members USING btree (edition_id, country_id, status, created_at);
CREATE INDEX studio2_jury_members_member_user_id_idx ON public.studio2_jury_members USING btree (member_user_id);
CREATE INDEX studio2_jury_members_removed_by_idx ON public.studio2_jury_members USING btree (removed_by);
CREATE INDEX studio2_notice_receipts_recipient_idx ON public.studio2_notice_receipts USING btree (recipient_user_id, acknowledged_at, notice_id);
CREATE INDEX studio2_notice_versions_notice_idx ON public.studio2_notice_versions USING btree (notice_id, revision DESC);
CREATE INDEX studio2_official_notices_archived_idx ON public.studio2_official_notices USING btree (archived_at DESC) WHERE (archived_at IS NOT NULL);
CREATE INDEX studio2_official_notices_created_by_idx ON public.studio2_official_notices USING btree (created_by);
CREATE INDEX studio2_official_notices_display_surfaces_idx ON public.studio2_official_notices USING gin (display_surfaces);
CREATE INDEX studio2_official_notices_edition_sent_idx ON public.studio2_official_notices USING btree (edition_id, sent_at DESC) WHERE (sent_at IS NOT NULL);
CREATE INDEX studio2_official_notices_published_sent_idx ON public.studio2_official_notices USING btree (sent_at DESC) WHERE ((status = 'published'::text) AND (sent_at IS NOT NULL));
CREATE INDEX studio2_official_notices_status_schedule_idx ON public.studio2_official_notices USING btree (status, scheduled_at) WHERE (status = ANY (ARRAY['draft'::text, 'scheduled'::text]));
CREATE UNIQUE INDEX studio2_show_publication_executions_operation_v3_uidx ON public.studio2_show_publication_executions USING btree (scheduled_operation_id) WHERE (scheduled_operation_id IS NOT NULL);
CREATE INDEX studio2_show_publication_executions_show_idx ON public.studio2_show_publication_executions USING btree (show_id, executed_at DESC);
-- Exact observed table RLS and policies (runtime function semantics NOT proved).
CREATE POLICY "country sections owner or capability write delete" ON "public"."country_profile_sections" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)));
CREATE POLICY "country sections owner or capability write insert" ON "public"."country_profile_sections" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)));
CREATE POLICY "country sections owner or capability write update" ON "public"."country_profile_sections" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true))) WITH CHECK ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)));
CREATE POLICY "solaris consolidated anon read" ON "public"."country_profile_sections" AS PERMISSIVE FOR SELECT TO "anon" USING (true);
CREATE POLICY "solaris consolidated authenticated read" ON "public"."country_profile_sections" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true) OR true));
ALTER TABLE "public"."country_profile_sections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "country themes owner or capability write delete" ON "public"."country_themes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)));
CREATE POLICY "country themes owner or capability write insert" ON "public"."country_themes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)));
CREATE POLICY "country themes owner or capability write update" ON "public"."country_themes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true))) WITH CHECK ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true)));
CREATE POLICY "solaris consolidated anon read" ON "public"."country_themes" AS PERMISSIVE FOR SELECT TO "anon" USING (true);
CREATE POLICY "solaris consolidated authenticated read" ON "public"."country_themes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((owns_country(country_id) OR studio2_access_allowed('delegation.manage'::text, NULL::uuid, true) OR true));
ALTER TABLE "public"."country_themes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_case_appeals" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fans read own prediction versions" ON "public"."prediction_entry_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM prediction_entries entry
  WHERE ((entry.id = prediction_entry_versions.entry_id) AND (entry.profile_id = ( SELECT auth.uid() AS uid))))));
ALTER TABLE "public"."prediction_entry_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fans read own prediction items" ON "public"."prediction_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM prediction_entries entry
  WHERE ((entry.id = prediction_items.entry_id) AND (entry.profile_id = ( SELECT auth.uid() AS uid))))));
ALTER TABLE "public"."prediction_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Organizers can read public UX events" ON "public"."public_ux_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (studio2_access_allowed('rollout.manage'::text, NULL::uuid, false));
CREATE POLICY "Public UX events can be recorded" ON "public"."public_ux_events" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK ((NOT (user_id IS DISTINCT FROM ( SELECT auth.uid() AS uid))));
ALTER TABLE "public"."public_ux_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "studio2_incidents_capability_read" ON "public"."studio2_incidents" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('incident.read'::text, edition_id, false) OR studio2_access_allowed('integrity.read'::text, edition_id, false)));
ALTER TABLE "public"."studio2_incidents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "studio2_jury_members_capability_read" ON "public"."studio2_jury_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((owns_country(( SELECT auth.uid() AS uid), country_id) OR studio2_access_allowed('jury.ballots.read'::text, edition_id, false)));
ALTER TABLE "public"."studio2_jury_members" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "studio2_notice_receipts_capability_read" ON "public"."studio2_notice_receipts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((recipient_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM studio2_official_notices n
  WHERE ((n.id = studio2_notice_receipts.notice_id) AND studio2_access_allowed('communications.read'::text, n.edition_id, false))))));
ALTER TABLE "public"."studio2_notice_receipts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "studio2_notice_versions_organizer_read" ON "public"."studio2_notice_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (studio2_can_manage_communications(edition_id));
ALTER TABLE "public"."studio2_notice_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "studio2_official_notices_read" ON "public"."studio2_official_notices" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_can_read_notice(edition_id, status, sent_at, audience, country_ids, audience_group) AND ((archived_at IS NULL) OR studio2_can_manage_communications(edition_id))));
ALTER TABLE "public"."studio2_official_notices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."studio2_show_publication_executions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "submission review history capability manage" ON "public"."submission_review_history" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM submissions s
  WHERE ((s.id = submission_review_history.submission_id) AND studio2_access_allowed('confirmation.manage'::text, s.edition_id, true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM submissions s
  WHERE ((s.id = submission_review_history.submission_id) AND studio2_access_allowed('confirmation.manage'::text, s.edition_id, true)))));
ALTER TABLE "public"."submission_review_history" ENABLE ROW LEVEL SECURITY;
-- Trigger identities reproduced; fail-closed placeholder functions are not operational equivalents.
CREATE TRIGGER v3_entry_reviews_immutable BEFORE DELETE OR UPDATE ON private.v3_entry_reviews FOR EACH ROW EXECUTE FUNCTION private.v3_guard_immutable_entry_evidence();
CREATE TRIGGER v3_entry_versions_immutable BEFORE DELETE OR UPDATE ON private.v3_entry_versions FOR EACH ROW EXECUTE FUNCTION private.v3_guard_immutable_entry_evidence();
CREATE TRIGGER v3_s3_guard_entry_version_lineage BEFORE INSERT ON private.v3_entry_versions FOR EACH ROW EXECUTE FUNCTION private.v3_guard_entry_version_lineage();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON country_profile_sections FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER touch_country_sections_updated_at BEFORE UPDATE ON country_profile_sections FOR EACH ROW EXECUTE FUNCTION touch_country_content_updated_at();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON country_themes FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER touch_country_themes_updated_at BEFORE UPDATE ON country_themes FOR EACH ROW EXECUTE FUNCTION touch_country_content_updated_at();
CREATE TRIGGER organizer_inbox_appeal_state AFTER UPDATE OF status ON integrity_case_appeals FOR EACH ROW EXECUTE FUNCTION private.reconcile_organizer_notification_state();
CREATE TRIGGER organizer_inbox_integrity_appeal_insert AFTER INSERT ON integrity_case_appeals FOR EACH ROW EXECUTE FUNCTION private.route_organizer_inbox_event();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON prediction_entry_versions FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER trg_capture_prediction_consensus_snapshot AFTER INSERT ON prediction_entry_versions FOR EACH ROW EXECUTE FUNCTION capture_prediction_snapshot_after_submission();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON prediction_items FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public_ux_events FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER studio2_incidents_strict_dual_guard BEFORE INSERT OR UPDATE ON studio2_incidents FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_incident_strict_dual();
CREATE TRIGGER studio2_incidents_touch_updated_at BEFORE UPDATE ON studio2_incidents FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_updated_at();
CREATE TRIGGER studio2_jury_members_freeze_after_ballot BEFORE INSERT OR UPDATE ON studio2_jury_members FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_jury_roster_after_ballot();
CREATE TRIGGER studio2_jury_members_guard_user_link BEFORE INSERT OR UPDATE OF member_user_id ON studio2_jury_members FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_jury_member_user_link();
CREATE TRIGGER studio2_jury_members_touch_updated_at BEFORE UPDATE ON studio2_jury_members FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_updated_at();
CREATE TRIGGER studio2_official_notices_capture_revision BEFORE UPDATE ON studio2_official_notices FOR EACH ROW EXECUTE FUNCTION private.studio2_capture_notice_revision();
CREATE TRIGGER v3_emit_notice_transition_event AFTER INSERT OR UPDATE OF status, sent_at, superseded_by_id ON studio2_official_notices FOR EACH ROW EXECUTE FUNCTION private.v3_emit_notice_transition_event();
CREATE TRIGGER v3_emit_scheduled_publication_event AFTER INSERT ON studio2_show_publication_executions FOR EACH ROW EXECUTE FUNCTION private.v3_emit_scheduled_publication_event();
CREATE TRIGGER v3_reject_publication_execution_mutation BEFORE DELETE OR UPDATE ON studio2_show_publication_executions FOR EACH ROW EXECUTE FUNCTION private.v3_reject_publication_execution_mutation();
CREATE TRIGGER v3_validate_publication_execution BEFORE INSERT ON studio2_show_publication_executions FOR EACH ROW EXECUTE FUNCTION private.v3_validate_publication_execution();
CREATE TRIGGER studio2_guard_direct_review_history_insert BEFORE INSERT ON submission_review_history FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_direct_confirmation_review_transition();
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON submission_review_history FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE TRIGGER v3_bind_review_history BEFORE INSERT ON submission_review_history FOR EACH ROW EXECUTE FUNCTION private.v3_bind_review_history_version();
CREATE TRIGGER v3_guard_bound_review_history BEFORE DELETE OR UPDATE ON submission_review_history FOR EACH ROW EXECUTE FUNCTION private.v3_guard_bound_review_history();
CREATE CONSTRAINT TRIGGER v3_s3_validate_review_history_scope AFTER INSERT OR UPDATE ON submission_review_history DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION private.v3_validate_review_history_scope();
-- ACL ordering matches bounded read-only relacl observation.
REVOKE ALL ON TABLE "private"."v3_entry_reviews" FROM PUBLIC, "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "private"."v3_entry_reviews" TO "postgres";
REVOKE ALL ON TABLE "private"."v3_entry_versions" FROM PUBLIC, "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "private"."v3_entry_versions" TO "postgres";
REVOKE ALL ON TABLE "public"."country_profile_sections" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."country_profile_sections" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_profile_sections" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_profile_sections" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_profile_sections" TO "service_role";
REVOKE ALL ON TABLE "public"."country_themes" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."country_themes" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_themes" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_themes" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."country_themes" TO "service_role";
REVOKE ALL ON TABLE "public"."integrity_case_appeals" FROM PUBLIC, "postgres", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_case_appeals" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_case_appeals" TO "service_role";
REVOKE ALL ON TABLE "public"."prediction_entry_versions" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."prediction_entry_versions" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_entry_versions" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_entry_versions" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_entry_versions" TO "service_role";
REVOKE ALL ON TABLE "public"."prediction_items" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."prediction_items" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_items" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_items" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."prediction_items" TO "service_role";
REVOKE ALL ON TABLE "public"."public_ux_events" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."public_ux_events" TO "postgres";
GRANT INSERT ON TABLE "public"."public_ux_events" TO "anon";
GRANT INSERT, SELECT ON TABLE "public"."public_ux_events" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."public_ux_events" TO "service_role";
REVOKE ALL ON TABLE "public"."studio2_incidents" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_incidents" TO "postgres";
GRANT SELECT ON TABLE "public"."studio2_incidents" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_incidents" TO "service_role";
REVOKE ALL ON TABLE "public"."studio2_jury_members" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_jury_members" TO "postgres";
GRANT SELECT ON TABLE "public"."studio2_jury_members" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_jury_members" TO "service_role";
REVOKE ALL ON TABLE "public"."studio2_notice_receipts" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_notice_receipts" TO "postgres";
GRANT SELECT ON TABLE "public"."studio2_notice_receipts" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_notice_receipts" TO "service_role";
REVOKE ALL ON TABLE "public"."studio2_notice_versions" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_notice_versions" TO "postgres";
GRANT SELECT ON TABLE "public"."studio2_notice_versions" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_notice_versions" TO "service_role";
REVOKE ALL ON TABLE "public"."studio2_official_notices" FROM PUBLIC, "postgres", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_official_notices" TO "postgres";
GRANT SELECT ON TABLE "public"."studio2_official_notices" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_official_notices" TO "service_role";
REVOKE ALL ON TABLE "public"."studio2_show_publication_executions" FROM PUBLIC, "postgres", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_show_publication_executions" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_show_publication_executions" TO "service_role";
REVOKE ALL ON TABLE "public"."submission_review_history" FROM PUBLIC, "postgres", "anon", "authenticated", "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."submission_review_history" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."submission_review_history" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."submission_review_history" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."submission_review_history" TO "service_role";
COMMIT;
-- LIMITATION: 215 physical table names (56 original scoped; 159 later strict hashes).
-- S06 remains NOT CERTIFIED: 727 routines, runtime authorization, roles, extensions, data, history, hosted rollout still unproven.
