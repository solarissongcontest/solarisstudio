-- S02 local-only reconstruction of 45 actual hosted S14 Archive preflight relations.

-- Derived ONLY from read-only PG17.11 hosted pg_catalog and pg_get_functiondef, 2026-11-09.

-- Synthetic FK parents are explicitly NOT hosted equivalents. Do NOT deploy/migrate this SQL.

-- No application row values, environment secrets, passwords, URLs to hosted providers.

-- Full S14 runtime behavior and SQL effect parity are NOT certified by this schema subset.

BEGIN;

SET search_path = public, private, auth, televoting, pg_catalog;

SET check_function_bodies = off;

CREATE SCHEMA IF NOT EXISTS private;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE SCHEMA IF NOT EXISTS televoting;

DO $roles$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $roles$;

CREATE TYPE televoting.round_status AS ENUM ('draft','open','closed');

-- Eight synthetic FK parent shells, observed key shapes only, not hosted table parity.

CREATE TABLE "auth"."users" ("id" uuid, PRIMARY KEY ("id"));

CREATE TABLE "public"."contest_entities" ("id" uuid, PRIMARY KEY ("id"));

CREATE TABLE "public"."countries" ("id" uuid, PRIMARY KEY ("id"));

CREATE TABLE "public"."studio2_capabilities" ("key" text, PRIMARY KEY ("key"));

CREATE TABLE "public"."themes" ("id" uuid, PRIMARY KEY ("id"));

CREATE TABLE "televoting"."countries" ("code" text, PRIMARY KEY ("code"));

CREATE TABLE "televoting"."editions" ("id" uuid, PRIMARY KEY ("id"));

CREATE TABLE "televoting"."vote_preflight_checks" ("id" uuid, PRIMARY KEY ("id"));

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

CREATE TABLE "public"."editions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "year" integer,
  "slug" text NOT NULL,
  "host_country_id" uuid,
  "host_city" text,
  "logo" text,
  "theme_colors" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "jury_weight" integer DEFAULT 50 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published" boolean DEFAULT false NOT NULL,
  "edition_number" integer,
  "description" text,
  "theme_id" uuid,
  "broadcast_config" jsonb,
  "editing_enabled" boolean DEFAULT true NOT NULL,
  "data_revision" bigint DEFAULT 0 NOT NULL,
  "artwork_url" text,
  "artwork_storage_path" text,
  "design_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "event_date" date
);

CREATE TABLE "public"."entries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "country_id" uuid NOT NULL,
  "contest_entity_id" uuid,
  "artist" text,
  "song_title" text,
  "song_url" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "selection_method" text,
  "source" text DEFAULT 'solaris'::text NOT NULL,
  "source_ref" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."internal_entries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "artist" text,
  "song_title" text,
  "song_url" text,
  "preview_start" text,
  "preview_end" text,
  "final_clip_start" text,
  "final_clip_end" text,
  "replacement_video_required" boolean DEFAULT false NOT NULL,
  "replacement_video_url" text,
  "review_status" text DEFAULT 'pending'::text NOT NULL,
  "review_reason" text,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid,
  "content_revision" bigint,
  "current_version_id" uuid,
  "reviewed_version_id" uuid,
  "credits" jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE "public"."jury_ballot_statuses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "show_id" uuid NOT NULL,
  "voter_id" uuid,
  "voter_country_id" uuid,
  "voter_entity_id" uuid,
  "status" text NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" bigint DEFAULT 1 NOT NULL,
  "changed_by" uuid,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."jury_ballot_submissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "show_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "voter_country_id" uuid NOT NULL,
  "voter_entity_id" uuid,
  "voter_id" uuid,
  "preflight_id" uuid NOT NULL,
  "risk_score" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'submitted'::text NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "review_version" bigint DEFAULT 1 NOT NULL,
  "review_reason" text,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid
);

CREATE TABLE "public"."jury_votes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "voter_country_id" uuid,
  "receiving_country_id" uuid,
  "points" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "show_id" uuid,
  "voter_id" uuid,
  "receiving_entity_id" uuid,
  "voter_entity_id" uuid,
  "ballot_submission_id" uuid
);

CREATE TABLE "public"."jury_voting_windows" (
  "show_id" uuid NOT NULL,
  "edition_id" uuid NOT NULL,
  "status" text DEFAULT 'closed'::text NOT NULL,
  "opened_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "opened_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."national_final_entries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "national_final_id" uuid NOT NULL,
  "artist" text,
  "song_title" text,
  "song_url" text,
  "position" integer DEFAULT 0 NOT NULL,
  "review_status" text DEFAULT 'pending'::text NOT NULL,
  "review_reason" text,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid,
  "removed" boolean DEFAULT false NOT NULL,
  "removed_at" timestamp with time zone,
  "preview_start" text,
  "preview_end" text,
  "final_clip_start" text,
  "final_clip_end" text,
  "replacement_video_required" boolean DEFAULT false NOT NULL,
  "replacement_video_url" text,
  "next_in_line" boolean DEFAULT false NOT NULL,
  "result_position" integer,
  "content_revision" bigint,
  "current_version_id" uuid,
  "reviewed_version_id" uuid,
  "credits" jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE "public"."national_finals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid,
  "nf_name" text,
  "expected_entry_count" integer,
  "winning_entry_id" uuid,
  "country_id" uuid,
  "edition_id" uuid,
  "nf_date" date,
  "result_date" date,
  "source" text DEFAULT 'confirmation'::text NOT NULL,
  "lineup_published" boolean DEFAULT false NOT NULL,
  "results_published" boolean DEFAULT false NOT NULL,
  "pending_winning_entry_id" uuid
);

CREATE TABLE "public"."next_in_line_responses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "source_submission_id" uuid NOT NULL,
  "edition_id" uuid NOT NULL,
  "country" text NOT NULL,
  "participating" boolean DEFAULT true NOT NULL,
  "selection_type" text DEFAULT 'unknown'::text NOT NULL,
  "entry_unknown" boolean DEFAULT false NOT NULL,
  "national_final_entry_id" uuid,
  "artist" text,
  "song_title" text,
  "song_url" text,
  "preview_start" text,
  "preview_end" text,
  "replacement_video_required" boolean DEFAULT false NOT NULL,
  "replacement_video_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."next_in_line_submissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "source_submission_id" uuid NOT NULL,
  "country" text NOT NULL,
  "participating" boolean DEFAULT true NOT NULL,
  "entry_unknown" boolean DEFAULT false NOT NULL,
  "selection_type" text NOT NULL,
  "national_final_entry_id" uuid,
  "artist" text,
  "song_title" text,
  "song_url" text,
  "preview_start" text,
  "preview_end" text,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revision" bigint DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "submitted_by" uuid,
  "last_operation_id" uuid
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

CREATE TABLE "public"."participants" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "country_id" uuid,
  "artist" text,
  "song" text,
  "running_order" integer,
  "semi_final" text DEFAULT 'final'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "show_id" uuid,
  "qualified" boolean,
  "notes" text,
  "contest_entity_id" uuid,
  "participation_status" text DEFAULT 'confirmed'::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "youtube_url" text,
  "spotify_url" text,
  "apple_music_url" text,
  "publication_status" text DEFAULT 'published'::text NOT NULL,
  "scheduled_publish_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "publication_source" text DEFAULT 'legacy'::text NOT NULL,
  "publication_overridden" boolean DEFAULT false NOT NULL,
  "running_order_allocation" text
);

CREATE TABLE "public"."results" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "country_id" uuid,
  "jury_points" integer DEFAULT 0 NOT NULL,
  "televote_points" integer DEFAULT 0 NOT NULL,
  "total_points" integer DEFAULT 0 NOT NULL,
  "final_rank" integer,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "show_id" uuid,
  "contest_entity_id" uuid,
  "televote_components" jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE "public"."shows" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "name" text NOT NULL,
  "kind" text DEFAULT 'semi-final'::text NOT NULL,
  "sort_order" integer DEFAULT 1 NOT NULL,
  "published" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "voting_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "broadcast_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "theme_id" uuid,
  "qualifier_count" integer,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "host_country_id" uuid,
  "host_city" text,
  "publication_config" jsonb,
  "lineup_stage" text DEFAULT 'lineup'::text NOT NULL
);

CREATE TABLE "public"."studio2_confirmation_requirements" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "country_id" uuid NOT NULL,
  "generation" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'required'::text NOT NULL,
  "reason" text NOT NULL,
  "valid_from" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_by_submission_id" uuid,
  "resolved_at" timestamp with time zone,
  "invalidated_at" timestamp with time zone,
  "invalidated_by" uuid,
  "invalidated_reason" text,
  "superseded_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."studio2_contest_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "type" text NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "actor_user_id" uuid,
  "entity_type" text,
  "entity_id" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL
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

CREATE TABLE "public"."studio2_eligibility_overrides" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "country_id" uuid NOT NULL,
  "affected_rule" text NOT NULL,
  "reason" text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid,
  "revocation_reason" text
);

CREATE TABLE "public"."studio2_media_asset_reviews" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "asset_key" text NOT NULL,
  "asset_type" text NOT NULL,
  "country_id" uuid,
  "entry_id" uuid,
  "source_fingerprint" text NOT NULL,
  "decision" text NOT NULL,
  "reason" text NOT NULL,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "superseded_at" timestamp with time zone
);

CREATE TABLE "public"."studio2_next_in_line_windows" (
  "edition_id" uuid NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "opens_at" timestamp with time zone,
  "closes_at" timestamp with time zone,
  "version" bigint DEFAULT 1 NOT NULL,
  "reason" text,
  "changed_by" uuid,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
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

CREATE TABLE "public"."studio2_result_operations" (
  "show_id" uuid NOT NULL,
  "edition_id" uuid NOT NULL,
  "calculation_version" bigint DEFAULT 0 NOT NULL,
  "last_calculated_at" timestamp with time zone,
  "last_calculated_by" uuid,
  "reviewed_version" bigint,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid,
  "locked_version" bigint,
  "locked_at" timestamp with time zone,
  "locked_by" uuid,
  "reveal_ready_version" bigint,
  "reveal_ready_at" timestamp with time zone,
  "reveal_ready_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."studio2_show_publication_controls" (
  "show_id" uuid NOT NULL,
  "edition_id" uuid NOT NULL,
  "state" text DEFAULT 'draft'::text NOT NULL,
  "version" bigint DEFAULT 1 NOT NULL,
  "frozen_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "scheduled_for" timestamp with time zone,
  "scheduled_from_state" text,
  "source_show_updated_at" timestamp with time zone,
  "source_result_version" bigint,
  "scheduled_by" uuid,
  "scheduled_operation_id" uuid,
  "last_failure" text,
  "last_failure_at" timestamp with time zone,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."submission_rounds" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "opens_at" timestamp with time zone,
  "closes_at" timestamp with time zone,
  "response_limit" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "editing_enabled" boolean DEFAULT true NOT NULL
);

CREATE TABLE "public"."submissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "round_id" uuid NOT NULL,
  "instagram_username" text NOT NULL,
  "country" text NOT NULL,
  "country_account" text,
  "has_country_account" boolean DEFAULT false NOT NULL,
  "participating" boolean DEFAULT true NOT NULL,
  "selection_method" text,
  "entry_unknown" boolean DEFAULT false NOT NULL,
  "nf_entries_unknown" boolean DEFAULT false NOT NULL,
  "reveal_date_type" text,
  "reveal_exact_date" date,
  "reveal_approximate_text" text,
  "nf_date_type" text,
  "nf_exact_date" date,
  "nf_approximate_text" text,
  "nf_result_date_type" text,
  "nf_result_exact_date" date,
  "nf_result_approximate_text" text,
  "editing_allowed" boolean DEFAULT false NOT NULL,
  "locked" boolean DEFAULT false NOT NULL,
  "reviewed" boolean DEFAULT false NOT NULL,
  "admin_notes" text,
  "edit_count" integer DEFAULT 0 NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "initial_ip" text,
  "latest_ip" text,
  "browser_session_id" text,
  "last_autosaved_at" timestamp with time zone,
  "recovery_code" text NOT NULL
);

CREATE TABLE "public"."televote_votes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "country_id" uuid,
  "points" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "show_id" uuid,
  "contest_entity_id" uuid
);

CREATE TABLE "public"."televoting_round_bindings" (
  "remote_round_id" text NOT NULL,
  "remote_edition_id" text NOT NULL,
  "edition_id" uuid NOT NULL,
  "show_id" uuid,
  "source_mode" text DEFAULT 'edition'::text NOT NULL,
  "last_synced_at" timestamp with time zone,
  "frozen_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_synced_revision" bigint DEFAULT 0 NOT NULL
);

CREATE TABLE "public"."voters" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "show_id" uuid,
  "country_id" uuid,
  "name" text NOT NULL,
  "kind" text DEFAULT 'country'::text NOT NULL,
  "flag_image" text,
  "accent_color" text DEFAULT '#7dd3fc'::text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "contest_entity_id" uuid
);

CREATE TABLE "televoting"."combined_televote_component_results" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "aggregation_id" uuid NOT NULL,
  "component_id" uuid NOT NULL,
  "component_name" text DEFAULT ''::text NOT NULL,
  "component_type" text DEFAULT 'round'::text NOT NULL,
  "country_code" text NOT NULL,
  "calculation_version" integer DEFAULT 0 NOT NULL,
  "method" text DEFAULT 'rank_weighted'::text NOT NULL,
  "percentage_weight" numeric DEFAULT 0 NOT NULL,
  "component_pool" integer DEFAULT 0 NOT NULL,
  "raw_score" numeric DEFAULT 0 NOT NULL,
  "raw_rank" integer,
  "participant_count" integer DEFAULT 0 NOT NULL,
  "rank_base" integer,
  "rank_exponent" numeric,
  "rank_factor" numeric,
  "weighted_score" numeric,
  "source_weighted_total" numeric,
  "exact_allocation" numeric DEFAULT 0 NOT NULL,
  "floored_allocation" integer DEFAULT 0 NOT NULL,
  "decimal_remainder" numeric DEFAULT 0 NOT NULL,
  "remainder_bonus" integer DEFAULT 0 NOT NULL,
  "final_allocated_points" integer DEFAULT 0 NOT NULL,
  "tie_break_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "televoting"."combined_televote_results" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "aggregation_id" uuid NOT NULL,
  "country_code" text NOT NULL,
  "source_contributions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "pre_conversion_total" numeric DEFAULT 0 NOT NULL,
  "manual_pre_conversion_adjustment" numeric DEFAULT 0 NOT NULL,
  "combined_original_score" numeric DEFAULT 0 NOT NULL,
  "combined_original_rank" integer DEFAULT 0 NOT NULL,
  "participant_count" integer DEFAULT 0 NOT NULL,
  "rank_base" integer DEFAULT 0 NOT NULL,
  "rank_exponent" numeric DEFAULT 1.33 NOT NULL,
  "rank_factor" numeric DEFAULT 0 NOT NULL,
  "weighted_score" numeric DEFAULT 0 NOT NULL,
  "exact_converted_points" numeric DEFAULT 0 NOT NULL,
  "floored_points" integer DEFAULT 0 NOT NULL,
  "decimal_remainder" numeric DEFAULT 0 NOT NULL,
  "remainder_bonus" integer DEFAULT 0 NOT NULL,
  "converted_points" integer DEFAULT 0 NOT NULL,
  "post_conversion_bonus" numeric DEFAULT 0 NOT NULL,
  "post_conversion_adjustment" numeric DEFAULT 0 NOT NULL,
  "final_televote_score" numeric DEFAULT 0 NOT NULL,
  "calculation_version" integer DEFAULT 0 NOT NULL,
  "calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "total_voting_points" numeric DEFAULT 0 NOT NULL,
  "total_activity_points" numeric DEFAULT 0 NOT NULL,
  "final_combined_points" numeric DEFAULT 0 NOT NULL,
  "final_correction" numeric DEFAULT 0 NOT NULL,
  "final_rank" integer DEFAULT 0 NOT NULL,
  "final_tie_break_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "component_breakdown" jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE "televoting"."round_countries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "round_id" uuid NOT NULL,
  "country_code" text NOT NULL,
  "display_order" integer NOT NULL
);

CREATE TABLE "televoting"."round_entries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "round_id" uuid NOT NULL,
  "entry_type" text DEFAULT 'country'::text NOT NULL,
  "entry_key" text NOT NULL,
  "country_code" text,
  "custom_name" text,
  "short_name" text,
  "entry_code" text,
  "subtitle" text,
  "image_url" text,
  "description" text,
  "display_order" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "televoting"."round_results" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "round_id" uuid NOT NULL,
  "country_code" text NOT NULL,
  "original_votes" integer DEFAULT 0 NOT NULL,
  "original_voters" integer DEFAULT 0 NOT NULL,
  "original_rank" integer,
  "participant_count" integer NOT NULL,
  "rank_base" integer,
  "rank_exponent" numeric,
  "rank_factor" numeric,
  "weighted_score" numeric NOT NULL,
  "exact_points" numeric NOT NULL,
  "floored_points" integer NOT NULL,
  "decimal_remainder" numeric NOT NULL,
  "remainder_bonus" integer DEFAULT 0 NOT NULL,
  "final_points" integer NOT NULL,
  "total_points_to_distribute" integer NOT NULL,
  "calculation_version" integer NOT NULL,
  "calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "calculated_by_username" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "engine_version" text DEFAULT 'rank-weighted-v1'::text NOT NULL,
  "effective_points" numeric,
  "supporter_count" integer,
  "effective_supporters" numeric,
  "breadth_ratio" numeric,
  "breadth_factor" numeric,
  "robust_support" numeric,
  "robust_rank" integer,
  "rank_percentile" numeric,
  "rank_boost" numeric,
  "calculation_config" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE "televoting"."rounds" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "name" text NOT NULL,
  "status" televoting.round_status DEFAULT 'draft'::televoting.round_status NOT NULL,
  "opened_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "total_points_to_distribute" integer DEFAULT 0 NOT NULL,
  "rank_exponent" numeric DEFAULT 1.33 NOT NULL,
  "results_status" text DEFAULT 'draft'::text NOT NULL,
  "calculation_version" integer DEFAULT 0 NOT NULL,
  "calculated_at" timestamp with time zone,
  "calculated_by" uuid,
  "calculated_by_username" text,
  "calc_participant_codes" text[],
  "results_outdated" boolean DEFAULT false NOT NULL,
  "public_advanced_transparency" boolean DEFAULT false NOT NULL,
  "broadcast_display_mode" text DEFAULT 'converted'::text NOT NULL,
  "participant_mode" text DEFAULT 'countries'::text NOT NULL,
  "self_voting_mode" text DEFAULT 'country_match'::text NOT NULL,
  "televote_engine_version" text DEFAULT 'robust-televote-v2'::text NOT NULL,
  "ballot_exponent" numeric DEFAULT 0.75 NOT NULL,
  "breadth_floor" numeric DEFAULT 0.75 NOT NULL,
  "breadth_exponent" numeric DEFAULT 0.50 NOT NULL,
  "support_exponent" numeric DEFAULT 1.20 NOT NULL,
  "rank_boost_strength" numeric DEFAULT 0.80 NOT NULL,
  "rank_boost_shape" numeric DEFAULT 1.30 NOT NULL,
  "closes_at" timestamp with time zone
);

CREATE TABLE "televoting"."televote_aggregation_participants" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "aggregation_id" uuid NOT NULL,
  "country_code" text NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "televoting"."televote_aggregation_sources" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "aggregation_id" uuid NOT NULL,
  "source_type" text DEFAULT 'round'::text NOT NULL,
  "source_round_id" uuid,
  "source_name" text NOT NULL,
  "calculation_stage" text DEFAULT 'pre_conversion'::text NOT NULL,
  "weight" numeric DEFAULT 1 NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "percentage_weight" numeric DEFAULT 0 NOT NULL,
  "calculation_method" text DEFAULT 'rank_weighted'::text NOT NULL,
  "exact_point_pool" numeric DEFAULT 0 NOT NULL,
  "floored_point_pool" integer DEFAULT 0 NOT NULL,
  "pool_remainder" numeric DEFAULT 0 NOT NULL,
  "pool_remainder_bonus" integer DEFAULT 0 NOT NULL,
  "final_point_pool" integer DEFAULT 0 NOT NULL,
  "correction_target_source_id" uuid,
  "correction_scope" text DEFAULT 'final'::text NOT NULL,
  "tie_break_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "input_mode" text DEFAULT 'raw_results'::text NOT NULL
);

CREATE TABLE "televoting"."televote_aggregations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid,
  "name" text NOT NULL,
  "combination_method" text DEFAULT 'raw'::text NOT NULL,
  "total_points_to_distribute" integer DEFAULT 0 NOT NULL,
  "rank_exponent" numeric DEFAULT 1.33 NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "calculation_version" integer DEFAULT 0 NOT NULL,
  "calculated_at" timestamp with time zone,
  "calculated_by" uuid,
  "calculated_by_username" text,
  "locked_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "results_outdated" boolean DEFAULT false NOT NULL,
  "public_columns" jsonb DEFAULT '{"bonus": true, "final": true, "sources": false, "converted": true, "combined_original": false}'::jsonb NOT NULL,
  "broadcast_display_mode" text DEFAULT 'final'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "televoting"."vote_entries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "target_country_code" text NOT NULL,
  "points" integer NOT NULL,
  "is_historical" boolean DEFAULT false NOT NULL
);

CREATE TABLE "televoting"."vote_submissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "round_id" uuid NOT NULL,
  "username" text NOT NULL,
  "username_normalized" text NOT NULL,
  "country_code" text NOT NULL,
  "ip_hash" text,
  "fingerprint_hash" text,
  "device_token_hash" text,
  "risk_score" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "ip_country" text,
  "is_vpn" boolean DEFAULT false NOT NULL,
  "moderator_note" text,
  "verified_at" timestamp with time zone,
  "verified_by" uuid,
  "deleted_at" timestamp with time zone,
  "deleted_by" uuid,
  "edited_at" timestamp with time zone,
  "edited_by" uuid,
  "deletion_category" text,
  "deletion_reason" text,
  "is_historical" boolean DEFAULT false NOT NULL
);

-- Exact 140 hosted-observed function bodies, including policy/trigger dependencies.

CREATE OR REPLACE FUNCTION public.append_running_order_for_new_participant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage text;
  v_next integer;
begin
  if new.show_id is null or new.running_order is not null then
    return new;
  end if;
  select s.lineup_stage::text into v_stage from public.shows s where s.id = new.show_id;
  if v_stage = 'running_order' then
    select coalesce(max(p.running_order), 0) + 1 into v_next from public.participants p where p.show_id = new.show_id;
    new.running_order := v_next;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assert_entity_edition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
  v_id uuid;
  v_ed uuid;
BEGIN
  IF TG_TABLE_NAME = 'jury_votes' THEN
    v_ids := ARRAY[NEW.receiving_entity_id, NEW.voter_entity_id];
  ELSE
    v_ids := ARRAY[NEW.contest_entity_id];
  END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    IF v_id IS NOT NULL THEN
      SELECT e.edition_id INTO v_ed FROM public.contest_entities e WHERE e.id = v_id;
      IF v_ed IS NOT NULL AND v_ed <> NEW.edition_id THEN
        RAISE EXCEPTION 'Contest entity belongs to a different edition.' USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.auto_assign_country_hod_for_participation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid;
  v_person uuid;
  v_status text;
  v_existing public.delegation_hod_assignments;
begin
  if new.country_id is null
     or new.show_id is not null
     or new.participation_status <> 'confirmed' then
    return new;
  end if;

  select user_id into v_user
  from public.country_accounts
  where country_id=new.country_id
    and status='active'
    and hod_auto_assign_future=true
  limit 1;
  if v_user is null then return new; end if;

  select status into v_status
  from public.country_hod_edition_claims
  where user_id=v_user and country_id=new.country_id and edition_id=new.edition_id;
  if v_status in ('other','unknown') then return new; end if;

  v_person := public.ensure_account_hod_person(v_user);

  select * into v_existing
  from public.delegation_hod_assignments
  where edition_id=new.edition_id and country_id=new.country_id and channel='delegation';

  if v_existing.id is not null and v_existing.person_id <> v_person then
    insert into public.country_hod_edition_claims(user_id,country_id,edition_id,status,updated_at)
    values(v_user,new.country_id,new.edition_id,'other',now())
    on conflict(user_id,country_id,edition_id)
    do update set status='other',updated_at=now();
    return new;
  end if;

  insert into public.country_hod_edition_claims(user_id,country_id,edition_id,status,updated_at)
  values(v_user,new.country_id,new.edition_id,'mine',now())
  on conflict(user_id,country_id,edition_id) do nothing;

  if v_existing.id is null then
    insert into public.delegation_hod_assignments(edition_id,country_id,person_id,channel,source,confidence,notes)
    values(new.edition_id,new.country_id,v_person,'delegation','country-account-auto',100,'Automatically carried forward for active HOD')
    on conflict(edition_id,country_id,channel) do nothing;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bump_edition_data_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_edition_id uuid;
begin
  v_edition_id := case when tg_op = 'DELETE' then old.edition_id else new.edition_id end;
  if v_edition_id is not null then
    update public.editions
    set data_revision = data_revision + 1
    where id = v_edition_id;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.capture_televoting_binding_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.last_synced_at is null then
    new.last_synced_revision := 0;
  else
    select e.data_revision into new.last_synced_revision
    from public.editions e
    where e.id = new.edition_id;
    new.last_synced_revision := coalesce(new.last_synced_revision, 0);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.compact_running_order_after_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage text;
begin
  if old.show_id is null then return old; end if;
  select s.lineup_stage::text into v_stage from public.shows s where s.id = old.show_id;
  if v_stage = 'running_order' then
    with ordered as (
      select p.id, row_number() over (order by p.running_order nulls last, p.updated_at, p.id)::integer as new_order
      from public.participants p
      where p.show_id = old.show_id
    )
    update public.participants p
       set running_order = ordered.new_order, updated_at = now()
      from ordered
     where p.id = ordered.id and p.running_order is distinct from ordered.new_order;
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.emit_edition_pulse_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.published is true
    and (tg_op = 'INSERT' or old.published is distinct from true)
  then
    insert into public.content_events (
      event_type, entity_type, entity_id, title, summary, route,
      importance, payload, published_at, dedupe_key
    ) values (
      'edition_update', 'edition', new.id,
      coalesce(nullif(new.name, ''), 'A Solaris edition') || ' is now public',
      'The edition hub is live with the public information currently released.',
      '/editions/' || new.slug,
      'important',
      jsonb_build_object('editionId', new.id, 'editionNumber', new.edition_number),
      now(),
      'edition:' || new.id::text || ':published'
    )
    on conflict (dedupe_key) do update set
      title = excluded.title,
      summary = excluded.summary,
      route = excluded.route,
      payload = excluded.payload,
      published_at = least(public.content_events.published_at, excluded.published_at);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.emit_show_pulse_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  old_config jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else coalesce(old.publication_config, '{}'::jsonb) end;
  new_config jsonb := coalesce(new.publication_config, '{}'::jsonb);
  country_ids jsonb := '[]'::jsonb;
  contest_entity_ids jsonb := '[]'::jsonb;
  edition_slug text;
  show_is_public boolean := new.published is true;
  old_show_was_public boolean := case when tg_op = 'INSERT' then false else old.published is true end;
begin
  if not show_is_public then return new; end if;

  select
    coalesce(jsonb_agg(distinct participant.country_id) filter (where participant.country_id is not null), '[]'::jsonb),
    coalesce(jsonb_agg(distinct participant.contest_entity_id) filter (where participant.contest_entity_id is not null), '[]'::jsonb)
  into country_ids, contest_entity_ids
  from public.participants participant
  where participant.show_id = new.id;

  select edition.slug into edition_slug
  from public.editions edition
  where edition.id = new.edition_id;

  if (
    coalesce((new_config ->> 'songs')::boolean, false)
    or coalesce((new_config ->> 'artists')::boolean, false)
  ) and (
    not old_show_was_public
    or not (
      coalesce((old_config ->> 'songs')::boolean, false)
      or coalesce((old_config ->> 'artists')::boolean, false)
    )
  ) then
    insert into public.content_events (
      event_type, entity_type, entity_id, title, summary, route,
      importance, payload, published_at, dedupe_key
    ) values (
      'entry_published', 'show', new.id,
      'Entries are out for ' || new.name,
      'Artists and songs have been released for this show.',
      '/shows/' || new.id::text,
      'important',
      jsonb_build_object(
        'showId', new.id,
        'editionId', new.edition_id,
        'editionSlug', edition_slug,
        'countryIds', country_ids,
        'contestEntityIds', contest_entity_ids
      ),
      now(), 'show:' || new.id::text || ':entries'
    )
    on conflict (dedupe_key) do update set
      title = excluded.title, summary = excluded.summary,
      route = excluded.route, payload = excluded.payload;
  end if;

  if coalesce((new_config ->> 'running_order')::boolean, false)
    and (not old_show_was_public or not coalesce((old_config ->> 'running_order')::boolean, false))
  then
    insert into public.content_events (
      event_type, entity_type, entity_id, title, summary, route,
      importance, payload, published_at, dedupe_key
    ) values (
      'running_order_published', 'show', new.id,
      'Running order published for ' || new.name,
      'The performance order is now public.',
      '/shows/' || new.id::text,
      'normal',
      jsonb_build_object(
        'showId', new.id,
        'editionId', new.edition_id,
        'editionSlug', edition_slug,
        'countryIds', country_ids,
        'contestEntityIds', contest_entity_ids
      ),
      now(), 'show:' || new.id::text || ':running-order'
    )
    on conflict (dedupe_key) do update set
      title = excluded.title, summary = excluded.summary,
      route = excluded.route, payload = excluded.payload;
  end if;

  if coalesce((new_config ->> 'results')::boolean, false)
    and (not old_show_was_public or not coalesce((old_config ->> 'results')::boolean, false))
  then
    insert into public.content_events (
      event_type, entity_type, entity_id, title, summary, route,
      importance, payload, published_at, dedupe_key
    ) values (
      'results_published', 'show', new.id,
      'Results published for ' || new.name,
      'The scoreboard, jury total and televote total are now public.',
      '/shows/' || new.id::text,
      'important',
      jsonb_build_object(
        'showId', new.id,
        'editionId', new.edition_id,
        'editionSlug', edition_slug,
        'countryIds', country_ids,
        'contestEntityIds', contest_entity_ids
      ),
      now(), 'show:' || new.id::text || ':results'
    )
    on conflict (dedupe_key) do update set
      title = excluded.title, summary = excluded.summary,
      route = excluded.route, payload = excluded.payload;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_submission_recovery_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if new.recovery_code is null or trim(new.recovery_code) = '' then
    new.recovery_code := public.generate_recovery_code();
  else
    new.recovery_code := upper(trim(new.recovery_code));
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.inherit_country_entry_listen_links()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_source public.participants;
begin
  if new.show_id is null then return new; end if;
  select p.* into v_source from public.participants p
  where p.edition_id = new.edition_id and p.show_id is null and p.country_id = new.country_id
  order by p.updated_at desc, p.id desc limit 1;
  if v_source.id is not null then
    new.youtube_url := coalesce(new.youtube_url, v_source.youtube_url);
    new.spotify_url := coalesce(new.spotify_url, v_source.spotify_url);
    new.apple_music_url := coalesce(new.apple_music_url, v_source.apple_music_url);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inherit_edition_design_on_show()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e public.editions;
begin
  select * into e from public.editions where id = new.edition_id;
  if e.id is not null then new.theme_id := e.theme_id; new.broadcast_config := coalesce(e.broadcast_config, '{}'::jsonb); end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.keep_historical_entry_public()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_edition_number integer;
  v_newest_edition_number integer;
begin
  select e.edition_number
    into v_edition_number
  from public.editions e
  where e.id = new.edition_id;

  select max(e.edition_number)
    into v_newest_edition_number
  from public.editions e
  where e.edition_number is not null;

  if v_edition_number is not null
     and v_newest_edition_number is not null
     and v_edition_number < v_newest_edition_number
     and new.publication_status = 'draft'
     and new.scheduled_publish_at is null
     and (
       nullif(trim(new.artist), '') is not null
       or nullif(trim(new.song), '') is not null
       or nullif(trim(new.youtube_url), '') is not null
       or nullif(trim(new.spotify_url), '') is not null
       or nullif(trim(new.apple_music_url), '') is not null
     ) then
    new.publication_status := 'published';
    new.published_at := coalesce(new.published_at, new.updated_at, new.created_at, now());
    new.publication_source := coalesce(new.publication_source, 'legacy');
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.materialize_results_on_show_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.published = true
     and coalesce((new.publication_config->>'results')::boolean, false) = true
     and (
       tg_op = 'INSERT'
       or old.published is distinct from new.published
       or old.publication_config is distinct from new.publication_config
     )
  then
    perform public.materialize_show_results_if_missing(new.id);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.national_final_entry_pulse_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin if new.review_status='accepted' and coalesce(new.removed,false)=false and (tg_op='INSERT' or old.review_status is distinct from new.review_status or old.removed is distinct from new.removed) then perform public.emit_national_final_event(new.national_final_id,'national_final_lineup'); end if; return new; end; $function$;

CREATE OR REPLACE FUNCTION public.national_final_pulse_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin if tg_op='INSERT' then perform public.emit_national_final_event(new.id,'national_final_announced'); elsif tg_op='UPDATE' and new.winning_entry_id is distinct from old.winning_entry_id and new.winning_entry_id is not null then perform public.emit_national_final_event(new.id,'national_final_result'); end if; return new; end; $function$;

CREATE OR REPLACE FUNCTION public.normalize_show_publication_channels()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  jury_enabled boolean := true;
  televote_enabled boolean := true;
  jury_weight numeric := 50;
  televote_weight numeric := 50;
begin
  if new.voting_config is not null then
    jury_enabled := coalesce((new.voting_config ->> 'juryEnabled')::boolean, true);
    televote_enabled := coalesce((new.voting_config ->> 'televoteEnabled')::boolean, true);
    jury_weight := coalesce((new.voting_config -> 'weighting' ->> 'jury')::numeric, 50);
    televote_weight := coalesce((new.voting_config -> 'weighting' ->> 'televote')::numeric, 50);
  end if;

  if new.publication_config is not null then
    if not jury_enabled or jury_weight <= 0 then
      new.publication_config := jsonb_set(new.publication_config, '{jury_results}', 'false'::jsonb, true);
    end if;

    if not televote_enabled or televote_weight <= 0 then
      new.publication_config := jsonb_set(new.publication_config, '{televote_results}', 'false'::jsonb, true);
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.owns_country(_country_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.country_accounts ca where ca.user_id = auth.uid() and ca.country_id = _country_id);
$function$;

CREATE OR REPLACE FUNCTION public.preserve_edition_participation_before_show_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.show_id is not null
     and old.country_id is not null
     and not exists (
       select 1
       from public.participants p
       where p.edition_id = old.edition_id
         and p.country_id = old.country_id
         and p.show_id is null
     ) then
    insert into public.participants (
      edition_id,
      country_id,
      artist,
      song,
      running_order,
      semi_final,
      show_id,
      qualified,
      notes,
      contest_entity_id,
      participation_status
    ) values (
      old.edition_id,
      old.country_id,
      old.artist,
      old.song,
      null,
      'final',
      null,
      null,
      coalesce(old.notes, 'Preserved when removed from show line-up'),
      old.contest_entity_id,
      old.participation_status
    )
    on conflict do nothing;
  end if;

  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.preserve_edition_public_design_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  _key text;
  _keys text[] := array[
    'publicStyle',
    'publicRadius',
    'publicSurfaceStrength',
    'publicHeroGlow',
    'publicAccentGradient',
    'publicSurfaceGradient'
  ];
begin
  if old.theme_colors is null or jsonb_typeof(old.theme_colors) <> 'object' then
    return new;
  end if;
  if new.theme_colors is null or jsonb_typeof(new.theme_colors) <> 'object' then
    return new;
  end if;

  foreach _key in array _keys loop
    if not (new.theme_colors ? _key) and (old.theme_colors ? _key) then
      new.theme_colors := new.theme_colors || jsonb_build_object(_key, old.theme_colors -> _key);
    end if;
  end loop;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.preserve_historical_voter_display()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_country uuid;
  v_alias text;
  v_alias_flag text;
  v_current_flag text;
begin
  v_country := new.country_id;
  if v_country is null and new.contest_entity_id is not null then
    select ce.country_id into v_country
    from public.contest_entities ce
    where ce.id = new.contest_entity_id
      and ce.entity_type = 'global';
  end if;

  if v_country is null or new.edition_id is null then
    return new;
  end if;

  select cei.display_name, cei.flag_image, c.flag_image
    into v_alias, v_alias_flag, v_current_flag
  from public.country_edition_identities cei
  join public.countries c on c.id = cei.country_id
  where cei.country_id = v_country
    and cei.edition_id = new.edition_id;

  if found then
    new.name := v_alias;
    new.flag_image := coalesce(v_alias_flag, v_current_flag);
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_result_publication_requires_reveal_ready()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_new_outcome_exposure boolean := false;
  v_ops public.studio2_result_operations%rowtype;
begin
  if coalesce(new.published, false) then
    if tg_op = 'INSERT' then
      v_new_outcome_exposure :=
        coalesce((new.publication_config ->> 'qualifiers')::boolean, false)
        or coalesce((new.publication_config ->> 'results')::boolean, false)
        or coalesce((new.publication_config ->> 'jury_results')::boolean, false)
        or coalesce((new.publication_config ->> 'televote_results')::boolean, false)
        or coalesce((new.publication_config ->> 'detailed_voting')::boolean, false);
    else
      v_new_outcome_exposure :=
        (
          coalesce((new.publication_config ->> 'qualifiers')::boolean, false)
          and (
            not coalesce(old.published, false)
            or not coalesce((old.publication_config ->> 'qualifiers')::boolean, false)
          )
        )
        or (
          coalesce((new.publication_config ->> 'results')::boolean, false)
          and (
            not coalesce(old.published, false)
            or not coalesce((old.publication_config ->> 'results')::boolean, false)
          )
        )
        or (
          coalesce((new.publication_config ->> 'jury_results')::boolean, false)
          and (
            not coalesce(old.published, false)
            or not coalesce((old.publication_config ->> 'jury_results')::boolean, false)
          )
        )
        or (
          coalesce((new.publication_config ->> 'televote_results')::boolean, false)
          and (
            not coalesce(old.published, false)
            or not coalesce((old.publication_config ->> 'televote_results')::boolean, false)
          )
        )
        or (
          coalesce((new.publication_config ->> 'detailed_voting')::boolean, false)
          and (
            not coalesce(old.published, false)
            or not coalesce((old.publication_config ->> 'detailed_voting')::boolean, false)
          )
        );
    end if;
  end if;

  if v_new_outcome_exposure then
    select *
      into v_ops
      from public.studio2_result_operations
      where show_id = new.id;

    if not found
       or v_ops.calculation_version <= 0
       or v_ops.reviewed_version is distinct from v_ops.calculation_version
       or v_ops.locked_version is distinct from v_ops.calculation_version
       or v_ops.reveal_ready_version is distinct from v_ops.calculation_version then
      raise exception
        'Qualification and result outcomes cannot be published until the current calculation is reviewed, locked and marked reveal ready.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.revoke_confirmation_tokens_on_edition_close()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if not coalesce(new.editing_enabled, false) then
    update public.edit_tokens t set active = false
    from public.submissions s
    where s.edition_id = new.id and t.submission_id = s.id and t.active = true;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.revoke_confirmation_tokens_on_round_close()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if not coalesce(new.editing_enabled, false) then
    update public.edit_tokens t set active = false
    from public.submissions s
    where s.round_id = new.id and t.submission_id = s.id and t.active = true;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.revoke_confirmation_tokens_on_submission_close()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if (not coalesce(new.editing_allowed, false)) or coalesce(new.locked, false) then
    update public.edit_tokens set active = false where submission_id = new.id and active = true;
  end if;
  return new;
end;
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

CREATE OR REPLACE FUNCTION private.studio2_claim_operation(p_operation_id uuid, p_idempotency_key text, p_correlation_id uuid, p_command text, p_risk_class text, p_scope jsonb, p_semantic_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_command text := nullif(btrim(coalesce(p_command, '')), '');
  v_correlation_id uuid := coalesce(p_correlation_id, p_operation_id);
  v_scope jsonb := coalesce(p_scope, '{}'::jsonb);
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_operation_id is null or v_key is null or v_command is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_risk_class not in ('R0', 'R1', 'R2', 'R3') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if jsonb_typeof(v_scope) <> 'object'
     or jsonb_typeof(coalesce(p_semantic_request, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_fingerprint := private.studio2_request_fingerprint(
    v_command,
    p_risk_class,
    v_scope,
    p_semantic_request
  );

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
     or (
       receipt.actor_id = v_actor
       and receipt.command = v_command
       and receipt.idempotency_key = v_key
     )
  order by case when receipt.operation_id = p_operation_id then 0 else 1 end
  limit 1
  for update;

  if v_receipt.operation_id is not null then
    if v_receipt.actor_id is distinct from v_actor
       or v_receipt.command is distinct from v_command
       or v_receipt.idempotency_key is distinct from v_key
       or v_receipt.request_fingerprint is distinct from v_fingerprint then
      raise exception using
        errcode = 'P0001',
        message = 'IDEMPOTENCY_CONFLICT',
        hint = 'Use the original semantic request or a new idempotency key.';
    end if;

    return jsonb_build_object(
      'replayed', true,
      'operationId', v_receipt.operation_id,
      'correlationId', v_receipt.correlation_id,
      'status', v_receipt.status,
      'result', v_receipt.result,
      'error', case
        when v_receipt.error_code is null then null
        else jsonb_build_object(
          'code', v_receipt.error_code,
          'metadata', coalesce(v_receipt.error_metadata, '{}'::jsonb)
        )
      end
    );
  end if;

  if not coalesce(private.studio2_platform_mutation_allowed(v_command), false) then
    raise exception using errcode = '25006', message = 'STATE_CHANGED';
  end if;

  insert into public.studio2_operation_receipts (
    operation_id,
    actor_id,
    idempotency_key,
    correlation_id,
    request_fingerprint,
    command,
    risk_class,
    scope
  )
  values (
    p_operation_id,
    v_actor,
    v_key,
    v_correlation_id,
    v_fingerprint,
    v_command,
    p_risk_class,
    v_scope
  )
  on conflict do nothing;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
     or (
       receipt.actor_id = v_actor
       and receipt.command = v_command
       and receipt.idempotency_key = v_key
     )
  order by case when receipt.operation_id = p_operation_id then 0 else 1 end
  limit 1
  for update;

  if v_receipt.operation_id is null then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  if v_receipt.actor_id is distinct from v_actor
     or v_receipt.command is distinct from v_command
     or v_receipt.idempotency_key is distinct from v_key
     or v_receipt.request_fingerprint is distinct from v_fingerprint then
    raise exception using
      errcode = 'P0001',
      message = 'IDEMPOTENCY_CONFLICT',
      hint = 'Use the original semantic request or a new idempotency key.';
  end if;

  if v_receipt.operation_id is distinct from p_operation_id then
    return jsonb_build_object(
      'replayed', true,
      'operationId', v_receipt.operation_id,
      'correlationId', v_receipt.correlation_id,
      'status', v_receipt.status,
      'result', v_receipt.result,
      'error', case
        when v_receipt.error_code is null then null
        else jsonb_build_object(
          'code', v_receipt.error_code,
          'metadata', coalesce(v_receipt.error_metadata, '{}'::jsonb)
        )
      end
    );
  end if;

  return jsonb_build_object(
    'replayed', false,
    'operationId', v_receipt.operation_id,
    'correlationId', v_receipt.correlation_id,
    'status', v_receipt.status
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_complete_operation(p_operation_id uuid, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_receipt public.studio2_operation_receipts;
begin
  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
    and receipt.actor_id = v_actor
  for update;

  if v_receipt.operation_id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;

  if v_receipt.status = 'succeeded' then
    return coalesce(v_receipt.result, '{}'::jsonb);
  end if;
  if v_receipt.status <> 'processing' then
    raise exception using errcode = 'P0001', message = 'STATE_CHANGED';
  end if;

  update public.studio2_operation_receipts
  set
    status = 'succeeded',
    result = coalesce(p_result, '{}'::jsonb),
    error_code = null,
    error_metadata = null,
    completed_at = now(),
    updated_at = now()
  where operation_id = p_operation_id;

  return coalesce(p_result, '{}'::jsonb);
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_confirmation_submission_requirement_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_new_country_id uuid;
  v_old_country_id uuid;
begin
  if tg_op <> 'DELETE' then
    v_new_country_id := private.studio2_confirmation_country_id(new.country);
    perform private.studio2_reconcile_confirmation_requirement(new.edition_id, v_new_country_id);
  end if;

  if tg_op <> 'INSERT' then
    v_old_country_id := private.studio2_confirmation_country_id(old.country);
    if tg_op = 'DELETE'
       or old.edition_id is distinct from new.edition_id
       or v_old_country_id is distinct from v_new_country_id then
      perform private.studio2_reconcile_confirmation_requirement(old.edition_id, v_old_country_id);
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_create_show_publication_control()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  insert into public.studio2_show_publication_controls (
    show_id,
    edition_id,
    state,
    frozen_config,
    source_show_updated_at
  )
  values (
    new.id,
    new.edition_id,
    case
      when new.published
        and private.studio2_publication_has_any(new.publication_config)
      then 'public'
      else 'draft'
    end,
    private.studio2_normalise_publication_config(new.publication_config),
    new.updated_at
  )
  on conflict (show_id) do nothing;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_default_subsystems(p_state text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_states constant text[] := array[
    'draft', 'planning', 'host_selection', 'confirmations', 'submissions',
    'pre_show', 'rehearsals', 'jury_voting', 'live_show', 'televoting',
    'vote_verification', 'results', 'post_edition', 'archived'
  ];
  v_index integer;
begin
  v_index := array_position(v_states, p_state);
  if v_index is null then
    raise exception 'Unknown Studio 2 edition state: %', p_state using errcode = '22023';
  end if;

  return jsonb_build_object(
    'confirmations', case
      when p_state = 'confirmations' then 'open'
      when v_index > array_position(v_states, 'confirmations') then 'locked'
      else 'not_started'
    end,
    'submissions', case
      when p_state = 'submissions' then 'open'
      when v_index > array_position(v_states, 'submissions') then 'locked'
      else 'not_started'
    end,
    'juryVoting', case
      when p_state = 'jury_voting' then 'open'
      when v_index > array_position(v_states, 'jury_voting') then 'locked'
      else 'not_started'
    end,
    'televoting', case
      when p_state = 'televoting' then 'open'
      when v_index > array_position(v_states, 'televoting') then 'locked'
      else 'not_started'
    end,
    'results', case
      when v_index >= array_position(v_states, 'results') then 'published'
      else 'not_started'
    end,
    'predictions', case
      when p_state in ('confirmations', 'submissions', 'pre_show', 'rehearsals') then 'open'
      when v_index >= array_position(v_states, 'jury_voting') then 'locked'
      else 'not_started'
    end
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_enforce_locked_rundown_live_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_rundown jsonb;
begin
  if new.broadcast_config is not distinct from old.broadcast_config then
    return new;
  end if;

  v_rundown := new.broadcast_config -> 'studio2Rundown';
  if v_rundown is null then
    return new;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_rundown -> 'segments', '[]'::jsonb)) as items(segment)
    where segment ->> 'status' = 'live'
  ) and nullif(v_rundown ->> 'lockedAt', '') is null then
    raise exception 'Lock the broadcast rundown before taking a segment live' using errcode = '55000';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_guard_confirmation_resolution_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_submission public.submissions;
  v_submission_country_id uuid;
begin
  if new.resolved_by_submission_id is null then
    return new;
  end if;

  if new.status not in ('satisfied', 'waived') then
    raise exception
      'A confirmation resolution submission requires satisfied or waived status'
      using errcode = '23514';
  end if;

  select submission.*
  into v_submission
  from public.submissions submission
  where submission.id = new.resolved_by_submission_id;

  if v_submission.id is null then
    return new; -- The foreign key supplies the canonical missing-row error.
  end if;

  v_submission_country_id := private.studio2_confirmation_country_id(v_submission.country);

  if v_submission.edition_id is distinct from new.edition_id
     or v_submission_country_id is distinct from new.country_id
     or coalesce(v_submission.updated_at, v_submission.submitted_at) < new.valid_from then
    raise exception
      'Confirmation resolution submission is outside the requirement generation scope'
      using errcode = '23514';
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

CREATE OR REPLACE FUNCTION private.studio2_guard_direct_confirmation_review_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Selection review transitions must use the Organisation OS V5 operation contract.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_guard_direct_confirmation_round_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      raise exception
        'Confirmation rounds must be created through the Organisation OS operation contract.'
        using errcode = '42501';
    end if;

    if tg_op = 'DELETE' then
      raise exception
        'Confirmation rounds must be deleted through the Organisation OS operation contract.'
        using errcode = '42501';
    end if;

    if
      new.name is distinct from old.name
      or new.status is distinct from old.status
      or new.opens_at is distinct from old.opens_at
      or new.closes_at is distinct from old.closes_at
      or new.response_limit is distinct from old.response_limit
      or new.editing_enabled is distinct from old.editing_enabled
      or new.edition_id is distinct from old.edition_id
    then
      raise exception
        'Confirmation round changes must use the Organisation OS operation contract.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_guard_direct_show_publication_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Show publication must use the Organisation OS V5 publication operation contract.'
      using errcode = '42501';
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_guard_direct_televote_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if new.status is distinct from old.status
     and current_user in ('authenticated', 'anon') then
    raise exception
      'Televote round status must use the Organisation OS operation contract.'
      using errcode = '42501';
  end if;
  return new;
end
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

CREATE OR REPLACE FUNCTION private.studio2_guard_duplicate_confirmation_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_country_id uuid;
  v_requirement_status text;
  v_requirement_generation integer;
begin
  if tg_op = 'UPDATE'
     and old.country is not distinct from new.country
     and old.edition_id is not distinct from new.edition_id then
    return new;
  end if;

  v_country_id := private.studio2_confirmation_country_id(new.country);

  if v_country_id is null then
    return new;
  end if;

  -- Serialize destination-country claims so two browser requests cannot both
  -- observe the requirement as available and then satisfy it concurrently.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'studio2-confirmation-requirement:' || new.edition_id::text || ':' || v_country_id::text,
      0
    )
  );

  select requirement.status, requirement.generation
  into v_requirement_status, v_requirement_generation
  from public.studio2_confirmation_requirements requirement
  where requirement.edition_id = new.edition_id
    and requirement.country_id = v_country_id
    and requirement.superseded_at is null
  limit 1
  for update;

  if v_requirement_status in ('satisfied', 'waived') then
    raise exception
      'This delegation already completed confirmation requirement generation %. A new submission requires explicit reconfirmation.',
      v_requirement_generation
      using errcode = '23505';
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

CREATE OR REPLACE FUNCTION private.studio2_guard_published_result_operation_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_published boolean := false;
begin
  select coalesce(s.published, false)
      and coalesce((s.publication_config ->> 'results')::boolean, false)
    into v_published
  from public.shows s
  where s.id = new.show_id;

  if v_published and new is distinct from old then
    raise exception 'Make the published result layer private before changing result operations.' using errcode = '55000';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_jury_ballot_review_task_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  perform private.studio2_reconcile_jury_ballot_review_tasks(new.edition_id);
  perform private.studio2_sync_task_notifications(new.edition_id);
  perform private.studio2_prune_stale_task_notifications(new.edition_id);
  return null;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_normalise_publication_config(p_config jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_raw jsonb := case when jsonb_typeof(p_config) = 'object' then p_config else '{}'::jsonb end;
  v_participants boolean := coalesce((v_raw ->> 'participants')::boolean, false);
  v_artists boolean := coalesce((v_raw ->> 'artists')::boolean, false);
  v_songs boolean := coalesce((v_raw ->> 'songs')::boolean, false);
  v_semi boolean := coalesce((v_raw ->> 'semi_split')::boolean, false);
  v_running boolean := coalesce((v_raw ->> 'running_order')::boolean, false);
  v_qualifiers boolean := coalesce((v_raw ->> 'qualifiers')::boolean, false);
  v_results boolean := coalesce((v_raw ->> 'results')::boolean, false);
  v_jury boolean := coalesce((v_raw ->> 'jury_results')::boolean, false);
  v_televote boolean := coalesce((v_raw ->> 'televote_results')::boolean, false);
  v_detailed boolean := coalesce((v_raw ->> 'detailed_voting')::boolean, false);
begin
  if v_artists or v_songs or v_semi or v_running or v_qualifiers
     or v_results or v_jury or v_televote or v_detailed then
    v_participants := true;
  end if;

  if v_semi or v_running or v_qualifiers or v_results or v_detailed then
    v_artists := true;
    v_songs := true;
  end if;

  if v_qualifiers then
    v_semi := true;
  end if;

  if v_jury or v_televote or v_detailed then
    v_results := true;
  end if;

  if v_detailed then
    v_jury := true;
    v_televote := true;
  end if;

  return jsonb_build_object(
    'participants', v_participants,
    'artists', v_artists,
    'songs', v_songs,
    'semi_split', v_semi,
    'running_order', v_running,
    'qualifiers', v_qualifiers,
    'results', v_results,
    'jury_results', v_jury,
    'televote_results', v_televote,
    'detailed_voting', v_detailed
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_prune_stale_task_notifications(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_changed integer := 0;
  v_count integer := 0;
begin
  update public.admin_notifications notification
  set
    resolved_at = coalesce(notification.resolved_at, now()),
    requires_action = false
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.resolution_mode = 'domain'
    and task.state <> 'resolved'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and not private.studio2_task_recipient_eligible(
      task.id,
      notification.recipient_id
    )
    and (
      notification.resolved_at is null
      or notification.requires_action
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  update public.notification_deliveries delivery
  set
    status = 'suppressed',
    processing_started_at = null,
    error = case
      when task.state = 'resolved'
        then 'Organizer Task resolved before delivery.'
      else 'Organizer Task recipient is no longer eligible.'
    end
  from public.studio2_organizer_tasks task
  where delivery.category = 'organizer_tasks'
    and delivery.subject_id = task.id::text
    and delivery.status in ('pending', 'processing', 'failed')
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and (
      task.state = 'resolved'
      or not private.studio2_task_recipient_eligible(
        task.id,
        delivery.user_id
      )
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  return v_changed;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_reconcile_all_organizer_tasks(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'televoting', 'auth'
AS $function$
begin
  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_repair_jury_missing_ballot_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);
  perform private.studio2_reconcile_permission_approval_tasks();
  perform private.studio2_reconcile_system_job_tasks();
  perform private.studio2_reconcile_jury_ballot_review_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_sync_tasks();
  perform private.studio2_sync_task_notifications(p_edition_id);
  perform private.studio2_prune_stale_task_notifications(p_edition_id);
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'confirmation_requirement'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.studio2_confirmation_requirements requirement
      where requirement.id::text = task.source_id
        and requirement.superseded_at is null
        and requirement.status = 'required'
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    country_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    due_at,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    requirement.edition_id,
    requirement.country_id,
    'confirmation_requirement',
    requirement.id::text,
    'confirmation-requirement:' || requirement.id::text,
    'confirmation.required',
    'confirmation.manage',
    'high',
    'open',
    country.name || ' still needs confirmation',
    'This edition-level requirement remains unresolved. Submission rounds only provide a window to satisfy it and cannot create another requirement.',
    '/confirmations/admin/requirements',
    (
      select min(submission_round.closes_at)
      from public.submission_rounds submission_round
      where submission_round.edition_id = requirement.edition_id
        and submission_round.status = 'open'
        and submission_round.closes_at > now()
    ),
    jsonb_build_object(
      'table', 'studio2_confirmation_requirements',
      'requirementId', requirement.id,
      'generation', requirement.generation,
      'resolvedWhen', 'current requirement becomes satisfied or waived'
    ),
    requirement.valid_from,
    null,
    now(),
    now()
  from public.studio2_confirmation_requirements requirement
  join public.countries country on country.id = requirement.country_id
  where requirement.superseded_at is null
    and requirement.status = 'required'
    and (p_edition_id is null or requirement.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    country_id = excluded.country_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    due_at = excluded.due_at,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_reconcile_confirmation_sync_tasks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_changed integer := 0;
  v_count integer := 0;
begin
  with latest as (
    select distinct on (event.remote_id)
      event.id,
      event.remote_id,
      event.status,
      event.last_error,
      event.updated_at,
      edition.id as edition_id
    from public.integration_events event
    left join public.editions edition
      on edition.edition_number = case
        when coalesce(event.payload -> 'edition' ->> 'edition_number', '') ~ '^[0-9]+$'
          then (event.payload -> 'edition' ->> 'edition_number')::integer
        else null
      end
    where event.service = 'confirmations'
      and event.event_type = 'confirmation.snapshot.synced'
      and event.remote_id is not null
    order by event.remote_id, event.updated_at desc, event.id desc
  )
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'confirmation_sync'
    and not exists (
      select 1
      from latest
      where latest.remote_id = task.source_id
        and latest.status = 'failed'
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  with latest as (
    select distinct on (event.remote_id)
      event.id,
      event.remote_id,
      event.status,
      event.last_error,
      event.updated_at,
      edition.id as edition_id
    from public.integration_events event
    left join public.editions edition
      on edition.edition_number = case
        when coalesce(event.payload -> 'edition' ->> 'edition_number', '') ~ '^[0-9]+$'
          then (event.payload -> 'edition' ->> 'edition_number')::integer
        else null
      end
    where event.service = 'confirmations'
      and event.event_type = 'confirmation.snapshot.synced'
      and event.remote_id is not null
    order by event.remote_id, event.updated_at desc, event.id desc
  )
  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    latest.edition_id,
    'confirmation_sync',
    latest.remote_id,
    'confirmation-sync:' || latest.remote_id,
    'confirmation.sync.recover',
    'confirmation.manage',
    'high',
    'open',
    'Confirmation sync needs recovery',
    coalesce(
      nullif(btrim(latest.last_error), ''),
      'The latest Confirmations → Solaris projection failed.'
    )
      || ' Open Sync, correct the underlying mismatch or service failure, then retry. '
      || 'This task resolves only after a later successful sync for the same submission.',
    '/confirmations/admin/sync',
    jsonb_build_object(
      'table', 'integration_events',
      'service', 'confirmations',
      'eventType', 'confirmation.snapshot.synced',
      'remoteId', latest.remote_id,
      'resolvedWhen', 'latest status = completed'
    ),
    latest.updated_at,
    null,
    now(),
    now()
  from latest
  where latest.status = 'failed'
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    opened_at = least(
      public.studio2_organizer_tasks.opened_at,
      excluded.opened_at
    ),
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  return v_changed;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_reconcile_jury_ballot_review_tasks(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'jury_ballot_review'
    and not exists (
      select 1
      from public.jury_ballot_submissions ballot
      where ballot.id::text = task.source_id
        and ballot.status in ('submitted', 'needs_review')
        and (
          p_edition_id is null
          or ballot.edition_id = p_edition_id
        )
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    country_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    due_at,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    ballot.edition_id,
    ballot.voter_country_id,
    'jury_ballot_review',
    ballot.id::text,
    'jury-ballot-review:' || ballot.id::text,
    'jury.ballot.review',
    'jury.ballots.manage',
    case
      when ballot.status = 'needs_review' or ballot.risk_score >= 80 then 'critical'
      else 'high'
    end,
    'open',
    case
      when ballot.status = 'needs_review' then 'Review flagged jury ballot'
      else 'Validate submitted jury ballot'
    end,
    'Participant-submitted jury evidence is waiting for an Organizer validation state. Submitted content is immutable; review only changes the lifecycle around it.',
    '/admin/jury/' || edition.slug || '?show=' || ballot.show_id::text,
    null,
    jsonb_build_object(
      'table', 'jury_ballot_submissions',
      'id', ballot.id,
      'resolvedWhen', jsonb_build_array('valid', 'invalidated', 'superseded'),
      'currentStatus', ballot.status,
      'reviewVersion', ballot.review_version
    ),
    ballot.submitted_at,
    null,
    now(),
    now()
  from public.jury_ballot_submissions ballot
  join public.editions edition on edition.id = ballot.edition_id
  where ballot.status in ('submitted', 'needs_review')
    and (p_edition_id is null or ballot.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    country_id = excluded.country_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_reconcile_organizer_tasks_operational(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'televoting'
AS $function$
begin
  -- ----------------------------------------------------------
  -- Existing confirmation / entry submissions awaiting review
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'confirmation_review'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.submissions submission
      where submission.id::text = task.source_id
        and (
          submission.reviewed = false
          or exists (
            select 1
            from public.internal_entries internal_entry
            where internal_entry.submission_id = submission.id
              and internal_entry.review_status = 'pending'
          )
          or exists (
            select 1
            from public.national_finals national_final
            join public.national_final_entries national_final_entry
              on national_final_entry.national_final_id = national_final.id
            where national_final.submission_id = submission.id
              and national_final_entry.review_status = 'pending'
              and national_final_entry.removed = false
          )
        )
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    submission.edition_id,
    'confirmation_review',
    submission.id::text,
    'confirmation-review:' || submission.id::text,
    'confirmation.review',
    'confirmation.manage',
    'normal',
    'open',
    submission.country || ' confirmation needs review',
    'Review the submitted confirmation and any pending entry-review decisions. This task exists because a submission already exists; opening another round does not create a duplicate requirement.',
    '/confirmations/admin/responses/' || submission.id::text,
    jsonb_build_object(
      'table', 'submissions',
      'id', submission.id,
      'resolvedWhen', 'submission reviewed and no child entry review remains pending'
    ),
    submission.submitted_at,
    null,
    now(),
    now()
  from public.submissions submission
  where (
      submission.reviewed = false
      or exists (
        select 1
        from public.internal_entries internal_entry
        where internal_entry.submission_id = submission.id
          and internal_entry.review_status = 'pending'
      )
      or exists (
        select 1
        from public.national_finals national_final
        join public.national_final_entries national_final_entry
          on national_final_entry.national_final_id = national_final.id
        where national_final.submission_id = submission.id
          and national_final_entry.review_status = 'pending'
          and national_final_entry.removed = false
      )
    )
    and (p_edition_id is null or submission.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- ----------------------------------------------------------
  -- Missing jury ballots while the authoritative jury window is open
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'jury_missing_ballots'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.jury_voting_windows jury_window
      where jury_window.show_id::text = task.source_id
        and jury_window.status = 'open'
        and exists (
          select 1
          from public.voters voter
          where voter.show_id = jury_window.show_id
            and voter.country_id is not null
            and not exists (
              select 1
              from public.jury_ballot_submissions ballot
              where ballot.show_id = jury_window.show_id
                and ballot.voter_country_id = voter.country_id
                and ballot.status = 'submitted'
            )
            and not exists (
              select 1
              from public.jury_ballot_statuses ballot_status
              where ballot_status.show_id = jury_window.show_id
                and ballot_status.status = 'did_not_vote'
                and (
                  ballot_status.voter_id = voter.id
                  or (
                    voter.country_id is not null
                    and ballot_status.voter_country_id = voter.country_id
                  )
                  or (
                    voter.contest_entity_id is not null
                    and ballot_status.voter_entity_id = voter.contest_entity_id
                  )
                )
            )
        )
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    jury_window.edition_id,
    'jury_missing_ballots',
    jury_window.show_id::text,
    'jury-missing-ballots:' || jury_window.show_id::text,
    'jury.ballots.missing',
    'jury.ballots.manage',
    'high',
    'open',
    'Jury voting is missing ' || missing.missing_count::text || ' ballot' ||
      case when missing.missing_count = 1 then '' else 's' end,
    'The jury window is open and at least one expected country jury has neither submitted a ballot nor been recorded as did not vote.',
    '/admin/jury/' || edition.slug,
    jsonb_build_object(
      'table', 'jury_voting_windows',
      'showId', jury_window.show_id,
      'resolvedWhen', 'window closed or every expected jury has submitted / DNV state'
    ),
    coalesce(jury_window.opened_at, jury_window.updated_at),
    null,
    now(),
    now()
  from public.jury_voting_windows jury_window
  join public.editions edition on edition.id = jury_window.edition_id
  cross join lateral (
    select count(*)::integer as missing_count
    from public.voters voter
    where voter.show_id = jury_window.show_id
      and voter.country_id is not null
      and not exists (
        select 1
        from public.jury_ballot_submissions ballot
        where ballot.show_id = jury_window.show_id
          and ballot.voter_country_id = voter.country_id
          and ballot.status = 'submitted'
      )
      and not exists (
        select 1
        from public.jury_ballot_statuses ballot_status
        where ballot_status.show_id = jury_window.show_id
          and ballot_status.status = 'did_not_vote'
          and (
            ballot_status.voter_id = voter.id
            or ballot_status.voter_country_id = voter.country_id
            or (
              voter.contest_entity_id is not null
              and ballot_status.voter_entity_id = voter.contest_entity_id
            )
          )
      )
  ) missing
  where jury_window.status = 'open'
    and missing.missing_count > 0
    and (p_edition_id is null or jury_window.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- ----------------------------------------------------------
  -- Public-vote submissions requiring integrity moderation
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'televote_suspicious'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.televoting_round_bindings binding
      join televoting.rounds round
        on round.id::text = binding.remote_round_id
      join televoting.vote_submissions submission
        on submission.round_id = round.id
      where round.id::text = task.source_id
        and submission.status = 'suspicious'
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    binding.edition_id,
    'televote_suspicious',
    round.id::text,
    'televote-suspicious:' || round.id::text,
    'televote.integrity.review',
    'televote.ballots.manage',
    'high',
    'open',
    suspicious.suspicious_count::text || ' public-vote submission' ||
      case when suspicious.suspicious_count = 1 then ' needs' else 's need' end ||
      ' integrity review',
    'Suspicious public-vote submissions remain unresolved in the authoritative Televoting backend.',
    '/televoting/admin/integrity',
    jsonb_build_object(
      'schema', 'televoting',
      'table', 'vote_submissions',
      'roundId', round.id,
      'resolvedWhen', 'no submissions remain suspicious'
    ),
    suspicious.first_seen_at,
    null,
    now(),
    now()
  from public.televoting_round_bindings binding
  join televoting.rounds round
    on round.id::text = binding.remote_round_id
  cross join lateral (
    select
      count(*)::integer as suspicious_count,
      min(submission.created_at) as first_seen_at
    from televoting.vote_submissions submission
    where submission.round_id = round.id
      and submission.status = 'suspicious'
  ) suspicious
  where suspicious.suspicious_count > 0
    and (p_edition_id is null or binding.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    opened_at = least(
      public.studio2_organizer_tasks.opened_at,
      excluded.opened_at
    ),
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- ----------------------------------------------------------
  -- Result lifecycle after a calculation exists
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'result_lifecycle'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.studio2_result_operations result_operation
      where result_operation.show_id::text = task.source_id
        and result_operation.calculation_version > 0
        and result_operation.reveal_ready_version is distinct from result_operation.calculation_version
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    result_operation.edition_id,
    'result_lifecycle',
    result_operation.show_id::text,
    'result-lifecycle:' || result_operation.show_id::text,
    case
      when result_operation.reviewed_version is distinct from result_operation.calculation_version
        then 'results.review'
      when result_operation.locked_version is distinct from result_operation.calculation_version
        then 'results.lock'
      else 'results.reveal_ready'
    end,
    'results.verify',
    case
      when result_operation.reviewed_version is distinct from result_operation.calculation_version
        then 'high'
      when result_operation.locked_version is distinct from result_operation.calculation_version
        then 'high'
      else 'normal'
    end,
    'open',
    case
      when result_operation.reviewed_version is distinct from result_operation.calculation_version
        then 'Review ' || show_row.name || ' result calculation'
      when result_operation.locked_version is distinct from result_operation.calculation_version
        then 'Lock the verified ' || show_row.name || ' result'
      else 'Mark ' || show_row.name || ' result reveal ready'
    end,
    case
      when result_operation.reviewed_version is distinct from result_operation.calculation_version
        then 'The current result calculation version has not been reviewed.'
      when result_operation.locked_version is distinct from result_operation.calculation_version
        then 'The reviewed result version has not been locked.'
      else 'The locked result version is not yet marked reveal ready.'
    end,
    '/admin/results',
    jsonb_build_object(
      'table', 'studio2_result_operations',
      'showId', result_operation.show_id,
      'calculationVersion', result_operation.calculation_version,
      'resolvedWhen', 'current calculation version reaches reveal-ready state'
    ),
    coalesce(result_operation.last_calculated_at, result_operation.updated_at),
    null,
    now(),
    now()
  from public.studio2_result_operations result_operation
  join public.shows show_row on show_row.id = result_operation.show_id
  where result_operation.calculation_version > 0
    and result_operation.reveal_ready_version is distinct from result_operation.calculation_version
    and (p_edition_id is null or result_operation.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    task_type = excluded.task_type,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- Keep notification resolution aligned with newly-added canonical task sources.
  update public.admin_notifications notification
  set resolved_at = task.resolved_at
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.requires_action = true
    and notification.resolved_at is distinct from task.resolved_at;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_reconcile_organizer_tasks_truth(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'televoting'
AS $function$
begin
  -- ----------------------------------------------------------
  -- Canonical entries awaiting Organizer approval
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'entry_approval'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.entries entry
      where entry.id::text = task.source_id
        and entry.status = 'pending'
        and nullif(btrim(entry.artist), '') is not null
        and nullif(btrim(entry.song_title), '') is not null
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    country_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    entry.edition_id,
    entry.country_id,
    'entry_approval',
    entry.id::text,
    'entry-approval:' || entry.id::text,
    'entry.approval',
    'entry.approve',
    'high',
    'open',
    country.name || ' entry needs approval',
    'Canonical artist and song data are present, but the edition entry is still pending Organizer approval.',
    '/admin/countries/' || entry.country_id::text || '?tab=entry',
    jsonb_build_object(
      'table', 'entries',
      'entryId', entry.id,
      'resolvedWhen', 'entry status is no longer pending'
    ),
    entry.created_at,
    null,
    now(),
    now()
  from public.entries entry
  join public.countries country on country.id = entry.country_id
  where entry.status = 'pending'
    and nullif(btrim(entry.artist), '') is not null
    and nullif(btrim(entry.song_title), '') is not null
    and (p_edition_id is null or entry.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    country_id = excluded.country_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- ----------------------------------------------------------
  -- Required media slots that are missing or explicitly invalid
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'media_required_fault'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from private.studio2_required_media_faults(p_edition_id) fault
      where (
        fault.edition_id::text || ':' || fault.country_id::text
      ) = task.source_id
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    country_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    fault.edition_id,
    fault.country_id,
    'media_required_fault',
    fault.edition_id::text || ':' || fault.country_id::text,
    'media-required:' || fault.edition_id::text || ':' || fault.country_id::text,
    'media.required',
    'entry.approve',
    'high',
    'open',
    fault.country_name || ' required media needs attention',
    fault.fault_count::text || ' required media slot' ||
      case when fault.fault_count = 1 then ' is' else 's are' end ||
      ' unresolved (' || fault.missing_count::text || ' missing, ' ||
      fault.invalid_count::text || ' explicitly invalid).',
    '/admin/media-assets',
    jsonb_build_object(
      'table', 'studio2_media_asset_reviews',
      'editionId', fault.edition_id,
      'countryId', fault.country_id,
      'resolvedWhen', 'required flag and confirmed-entry performance video are present and have no current invalid review'
    ),
    now(),
    null,
    now(),
    now()
  from private.studio2_required_media_faults(p_edition_id) fault
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    country_id = excluded.country_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- ----------------------------------------------------------
  -- Persistent integration links whose canonical sync state is error
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'integration_link_error'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and not exists (
      select 1
      from public.integration_links link
      where link.id::text = task.source_id
        and link.sync_status = 'error'
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    link.edition_id,
    'integration_link_error',
    link.id::text,
    'integration-link-error:' || link.id::text,
    'integration.link.repair',
    case
      when link.service = 'confirmations' then 'confirmation.manage'
      else 'voting.manage'
    end,
    'high',
    'open',
    initcap(link.service) || ' integration link needs repair',
    'The canonical ' || link.entity_type || ' integration link is in error state. Open Sync Health before continuing dependent operations.',
    '/admin/sync-health',
    jsonb_build_object(
      'table', 'integration_links',
      'linkId', link.id,
      'resolvedWhen', 'sync_status is no longer error'
    ),
    link.updated_at,
    null,
    now(),
    now()
  from public.integration_links link
  where link.sync_status = 'error'
    and (
      p_edition_id is null
      or link.edition_id is null
      or link.edition_id = p_edition_id
    )
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- ----------------------------------------------------------
  -- Latest integration operation for an object is failed
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'integration_failure'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and not exists (
      select 1
      from private.studio2_current_integration_failures(p_edition_id) failure
      where failure.source_id = task.source_id
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    failure.edition_id,
    'integration_failure',
    failure.source_id,
    'integration-failure:' || failure.source_id,
    'integration.operation.failed',
    case
      when failure.service = 'confirmations' then 'confirmation.manage'
      else 'voting.manage'
    end,
    'high',
    'open',
    initcap(failure.service) || ' integration operation failed',
    'The latest ' || failure.event_type ||
      ' state for this integration object failed. Open Sync Health to inspect the authoritative diagnostic event and retry path.',
    '/admin/sync-health',
    jsonb_build_object(
      'table', 'integration_events',
      'sourceId', failure.source_id,
      'resolvedWhen', 'a later canonical event for the same operation object is completed or skipped'
    ),
    failure.updated_at,
    null,
    now(),
    now()
  from private.studio2_current_integration_failures(p_edition_id) failure
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    opened_at = least(
      public.studio2_organizer_tasks.opened_at,
      excluded.opened_at
    ),
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  update public.admin_notifications notification
  set resolved_at = task.resolved_at
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.requires_action = true
    and notification.resolved_at is distinct from task.resolved_at;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_reconcile_organizer_tasks(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  -- Incidents. Any non-resolved incident is actionable. The task resolves only
  -- when the incident domain itself reaches resolved.
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'incident'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.studio2_incidents incident
      where incident.id::text = task.source_id
        and incident.status <> 'resolved'
    );

  insert into public.studio2_organizer_tasks (
    edition_id, source_kind, source_id, source_key, task_type,
    required_capability, priority, state, title, description, href,
    resolution_predicate, opened_at, resolved_at, last_evaluated_at, updated_at
  )
  select
    incident.edition_id,
    'incident',
    incident.id::text,
    'studio2_incidents:' || incident.id::text,
    'incident.response',
    'incident.read',
    case incident.severity when 'sev1' then 'critical' when 'sev2' then 'high' else 'normal' end,
    'open',
    upper(incident.severity) || ' · ' || incident.title,
    'Resolve the incident in Incident Command. Task state follows the canonical incident lifecycle.',
    '/admin/incidents',
    jsonb_build_object(
      'table', 'studio2_incidents',
      'id', incident.id,
      'field', 'status',
      'resolvedWhen', jsonb_build_array('resolved')
    ),
    incident.started_at,
    null,
    now(),
    now()
  from public.studio2_incidents incident
  where incident.status <> 'resolved'
    and (p_edition_id is null or incident.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- Critical lifecycle approvals. They are waiting work until approved/applied
  -- or expiry makes the request no longer actionable.
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'transition_approval'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.studio2_transition_approval_requests request
      where request.id::text = task.source_id
        and request.consumed_at is null
        and request.approved_at is null
        and request.expires_at > now()
    );

  insert into public.studio2_organizer_tasks (
    edition_id, assigned_to, source_kind, source_id, source_key, task_type,
    required_capability, priority, state, title, description, href, due_at,
    resolution_predicate, opened_at, resolved_at, last_evaluated_at, updated_at
  )
  select
    request.edition_id,
    null,
    'transition_approval',
    request.id::text,
    'studio2_transition_approval_requests:' || request.id::text,
    'edition.transition.approval',
    'edition.manage',
    'critical',
    'waiting',
    'Approve critical edition transition',
    replace(request.from_state, '_', ' ') || ' → ' || replace(request.to_state, '_', ' ') || '. ' || request.reason,
    '/admin/control-room',
    request.expires_at,
    jsonb_build_object(
      'table', 'studio2_transition_approval_requests',
      'id', request.id,
      'resolvedWhen', jsonb_build_array('approved', 'consumed', 'expired')
    ),
    request.requested_at,
    null,
    now(),
    now()
  from public.studio2_transition_approval_requests request
  where request.consumed_at is null
    and request.approved_at is null
    and request.expires_at > now()
    and (p_edition_id is null or request.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'waiting',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    due_at = excluded.due_at,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- Integrity cases. Keep details generic enough for the task list; capability
  -- filtering below determines whether the caller can even see that the task exists.
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'integrity_case'
    and not exists (
      select 1
      from public.integrity_cases integrity_case
      where integrity_case.id::text = task.source_id
        and integrity_case.status not like 'closed%'
    );

  insert into public.studio2_organizer_tasks (
    assigned_to, source_kind, source_id, source_key, task_type,
    required_capability, priority, state, title, description, href,
    resolution_predicate, opened_at, resolved_at, last_evaluated_at, updated_at
  )
  select
    integrity_case.assigned_to,
    'integrity_case',
    integrity_case.id::text,
    'integrity_cases:' || integrity_case.id::text,
    'integrity.case.review',
    'integrity.read',
    case integrity_case.priority when 'urgent' then 'critical' when 'high' then 'high' else 'normal' end,
    'open',
    'Integrity case needs review',
    'Case ' || integrity_case.public_code || ' remains in ' || replace(integrity_case.status, '_', ' ') || ' state.',
    '/admin/integrity-case/' || integrity_case.id::text,
    jsonb_build_object(
      'table', 'integrity_cases',
      'id', integrity_case.id,
      'field', 'status',
      'resolvedWhen', 'closed*'
    ),
    integrity_case.created_at,
    null,
    now(),
    now()
  from public.integrity_cases integrity_case
  where integrity_case.status not like 'closed%'
  on conflict (source_key) do update set
    assigned_to = excluded.assigned_to,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- Appeals remain actionable while submitted or under review.
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'integrity_appeal'
    and not exists (
      select 1
      from public.integrity_case_appeals appeal
      where appeal.id::text = task.source_id
        and appeal.status in ('submitted', 'under_review')
    );

  insert into public.studio2_organizer_tasks (
    assigned_to, source_kind, source_id, source_key, task_type,
    required_capability, priority, state, title, description, href, due_at,
    resolution_predicate, opened_at, resolved_at, last_evaluated_at, updated_at
  )
  select
    appeal.assigned_reviewer,
    'integrity_appeal',
    appeal.id::text,
    'integrity_case_appeals:' || appeal.id::text,
    'integrity.appeal.review',
    'integrity.read',
    'high',
    case when appeal.assigned_reviewer is null then 'waiting' else 'open' end,
    'Integrity appeal needs review',
    'An active appeal remains ' || replace(appeal.status, '_', ' ') || '.',
    '/admin/integrity-appeals',
    appeal.deadline_at,
    jsonb_build_object(
      'table', 'integrity_case_appeals',
      'id', appeal.id,
      'field', 'status',
      'resolvedWhen', jsonb_build_array(
        'upheld', 'reduced', 'increased', 'overturned',
        'rejected_late', 'rejected_ineligible'
      )
    ),
    appeal.submitted_at,
    null,
    now(),
    now()
  from public.integrity_case_appeals appeal
  where appeal.status in ('submitted', 'under_review')
  on conflict (source_key) do update set
    assigned_to = excluded.assigned_to,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = excluded.state,
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    due_at = excluded.due_at,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- Break-glass disclosure requests are unresolved while pending or approved.
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'identity_disclosure'
    and not exists (
      select 1
      from public.integrity_identity_disclosure_requests disclosure
      where disclosure.id::text = task.source_id
        and disclosure.status in ('pending', 'approved')
    );

  insert into public.studio2_organizer_tasks (
    source_kind, source_id, source_key, task_type,
    required_capability, priority, state, title, description, href, due_at,
    resolution_predicate, opened_at, resolved_at, last_evaluated_at, updated_at
  )
  select
    'identity_disclosure',
    disclosure.id::text,
    'integrity_identity_disclosure_requests:' || disclosure.id::text,
    'integrity.identity.disclosure',
    'integrity.manage',
    'critical',
    case when disclosure.status = 'approved' then 'waiting' else 'open' end,
    'Protected identity disclosure requires governed handling',
    case
      when disclosure.status = 'approved'
        then 'The disclosure request is approved but has not yet reached a terminal used, rejected or expired state.'
      else 'A sealed-identity disclosure request requires a governed organizer decision.'
    end,
    '/admin/integrity-disclosure',
    disclosure.approval_expires_at,
    jsonb_build_object(
      'table', 'integrity_identity_disclosure_requests',
      'id', disclosure.id,
      'field', 'status',
      'resolvedWhen', jsonb_build_array('rejected', 'used', 'expired')
    ),
    disclosure.requested_at,
    null,
    now(),
    now()
  from public.integrity_identity_disclosure_requests disclosure
  where disclosure.status in ('pending', 'approved')
  on conflict (source_key) do update set
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = excluded.state,
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    due_at = excluded.due_at,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- A paused subsystem is domain state, not a manually dismissible warning.
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'subsystem_pause'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.studio2_edition_runtime runtime
      cross join lateral jsonb_each_text(runtime.subsystems) subsystem(key, value)
      where (runtime.edition_id::text || ':' || subsystem.key) = task.source_id
        and subsystem.value = 'paused'
    );

  insert into public.studio2_organizer_tasks (
    edition_id, source_kind, source_id, source_key, task_type,
    required_capability, priority, state, title, description, href,
    resolution_predicate, opened_at, resolved_at, last_evaluated_at, updated_at
  )
  select
    runtime.edition_id,
    'subsystem_pause',
    runtime.edition_id::text || ':' || subsystem.key,
    'studio2_subsystem_pause:' || runtime.edition_id::text || ':' || subsystem.key,
    'edition.subsystem.paused',
    'edition.read',
    'high',
    'open',
    case subsystem.key
      when 'juryVoting' then 'Jury voting is paused'
      when 'televoting' then 'Televoting is paused'
      when 'confirmations' then 'Confirmations are paused'
      when 'submissions' then 'Submissions are paused'
      when 'results' then 'Results are paused'
      when 'predictions' then 'Predictions are paused'
      else 'Edition subsystem is paused'
    end,
    'Resume or deliberately transition the subsystem in the authoritative control surface.',
    '/admin/control-room',
    jsonb_build_object(
      'table', 'studio2_edition_runtime',
      'editionId', runtime.edition_id,
      'subsystem', subsystem.key,
      'resolvedWhen', 'value != paused'
    ),
    runtime.updated_at,
    null,
    now(),
    now()
  from public.studio2_edition_runtime runtime
  cross join lateral jsonb_each_text(runtime.subsystems) subsystem(key, value)
  where subsystem.value = 'paused'
    and (p_edition_id is null or runtime.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- Notification read state is delivery-only. For notifications that refer to a
  -- canonical task source, resolution follows the task's domain truth.
  update public.admin_notifications notification
  set resolved_at = task.resolved_at
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.requires_action = true
    and notification.resolved_at is distinct from task.resolved_at;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_reconcile_permission_approval_tasks()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'auth'
AS $function$
begin
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'permission_approval'
    and not exists (
      select 1
      from public.studio2_permission_change_approval_requests request
      where request.id::text = task.source_id
        and request.consumed_at is null
        and request.approved_at is null
        and request.approval_expires_at > now()
        and request.requested_by is not null
        and task.assigned_to is not null
        and task.assigned_to <> request.requested_by
        and private.studio2_user_has_capability(
          task.assigned_to,
          'permissions.manage',
          null
        )
    );

  insert into public.studio2_organizer_tasks (
    assigned_to,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    due_at,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    candidate.id,
    'permission_approval',
    request.id::text,
    'permission-approval:' || request.id::text || ':approve:' || candidate.id::text,
    'permissions.r3.approve',
    'permissions.manage',
    'critical',
    'open',
    'Approve R3 permission change',
    'Review the exact ' ||
      replace(request.change_kind, '_', ' ') ||
      ' operation for ' ||
      request.permission_key ||
      '. The requester cannot approve their own operation.',
    '/admin/access-permissions',
    request.approval_expires_at,
    jsonb_build_object(
      'table', 'studio2_permission_change_approval_requests',
      'id', request.id,
      'phase', 'approve',
      'resolvedWhen', jsonb_build_array('approved', 'consumed', 'expired')
    ),
    request.requested_at,
    null,
    now(),
    now()
  from public.studio2_permission_change_approval_requests request
  join auth.users candidate
    on candidate.id <> request.requested_by
   and private.studio2_user_has_capability(
     candidate.id,
     'permissions.manage',
     null
   )
  where request.consumed_at is null
    and request.approved_at is null
    and request.approval_expires_at > now()
    and request.requested_by is not null
  on conflict (source_key) do update set
    assigned_to = excluded.assigned_to,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    due_at = excluded.due_at,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'permission_approval_apply'
    and not exists (
      select 1
      from public.studio2_permission_change_approval_requests request
      where request.id::text = task.source_id
        and request.consumed_at is null
        and request.approved_at is not null
        and request.approved_by is not null
        and request.requested_by is not null
        and request.approval_expires_at > now()
        and task.assigned_to = request.requested_by
        and private.studio2_user_has_capability(
          request.requested_by,
          'permissions.manage',
          null
        )
    );

  insert into public.studio2_organizer_tasks (
    assigned_to,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    due_at,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    request.requested_by,
    'permission_approval_apply',
    request.id::text,
    'permission-approval:' || request.id::text || ':apply',
    'permissions.r3.apply',
    'permissions.manage',
    'critical',
    'open',
    'Apply approved R3 permission change',
    'A different authorized organizer approved the bound ' ||
      replace(request.change_kind, '_', ' ') ||
      ' operation for ' ||
      request.permission_key ||
      '. Reauthenticate and apply it before the approval expires.',
    '/admin/access-permissions',
    request.approval_expires_at,
    jsonb_build_object(
      'table', 'studio2_permission_change_approval_requests',
      'id', request.id,
      'phase', 'apply',
      'resolvedWhen', jsonb_build_array('consumed', 'expired')
    ),
    coalesce(request.approved_at, request.requested_at),
    null,
    now(),
    now()
  from public.studio2_permission_change_approval_requests request
  where request.consumed_at is null
    and request.approved_at is not null
    and request.approved_by is not null
    and request.requested_by is not null
    and request.approval_expires_at > now()
    and private.studio2_user_has_capability(
      request.requested_by,
      'permissions.manage',
      null
    )
  on conflict (source_key) do update set
    assigned_to = excluded.assigned_to,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    due_at = excluded.due_at,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_reconcile_system_job_tasks()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if to_regclass('cron.job') is null or to_regclass('cron.job_run_details') is null then
    update public.studio2_organizer_tasks
    set
      state = 'resolved',
      resolved_at = coalesce(resolved_at, now()),
      last_evaluated_at = now(),
      updated_at = now()
    where source_kind = 'system_job'
      and state <> 'resolved';
    return;
  end if;

  -- Re-evaluate from authoritative scheduler state on every Task reconciliation.
  update public.studio2_organizer_tasks
  set
    state = 'resolved',
    resolved_at = coalesce(resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where source_kind = 'system_job'
    and state <> 'resolved';

  execute $jobs$
    insert into public.studio2_organizer_tasks (
      assigned_to,
      source_kind,
      source_id,
      source_key,
      task_type,
      required_capability,
      priority,
      state,
      title,
      description,
      href,
      due_at,
      resolution_predicate,
      opened_at,
      resolved_at,
      last_evaluated_at,
      updated_at
    )
    select
      null,
      'system_job',
      job.jobid::text,
      'system-job:' || job.jobid::text,
      'system.job.failure',
      'system.manage',
      case
        when not job.active or coalesce(recent.consecutive_failures, 0) >= 3
          then 'critical'
        else 'high'
      end,
      'open',
      case
        when not job.active then 'Solaris background job is inactive'
        when coalesce(recent.consecutive_failures, 0) >= 3
          then 'Solaris background job repeatedly failed'
        else 'Solaris background job failed'
      end,
      job.jobname || ' · ' ||
        case
          when not job.active
            then 'The scheduler job is disabled and requires operator review.'
          when coalesce(recent.consecutive_failures, 0) >= 3
            then 'Three recent runs failed. Treat this as dead-letter attention; inspect the source condition before relying on the next scheduled retry.'
          else
            'The last completed run failed. The active scheduler will retry on its normal cadence; inspect the failure before the next deadline.'
        end,
      '/admin/system-operations',
      null,
      jsonb_build_object(
        'table', 'cron.job_run_details',
        'jobId', job.jobid,
        'jobName', job.jobname,
        'resolvedWhen', 'job active and latest completed run succeeds',
        'automaticRetry', job.active,
        'deadLetterThreshold', 3
      ),
      coalesce(recent.last_start_at, now()),
      null,
      now(),
      now()
    from cron.job job
    left join lateral (
      select
        latest.status as last_status,
        latest.start_time as last_start_at,
        (
          select count(*)::integer
          from (
            select lower(coalesce(run.status, '')) as status
            from cron.job_run_details run
            where run.jobid = job.jobid
              and lower(coalesce(run.status, '')) <> 'running'
            order by run.start_time desc nulls last, run.runid desc
            limit 3
          ) recent_three
          where recent_three.status not in ('success', 'succeeded')
        ) as consecutive_failures
      from lateral (
        select run.status, run.start_time
        from cron.job_run_details run
        where run.jobid = job.jobid
          and lower(coalesce(run.status, '')) <> 'running'
        order by run.start_time desc nulls last, run.runid desc
        limit 1
      ) latest
    ) recent on true
    where job.jobname like 'solaris-%'
      and (
        not job.active
        or (
          recent.last_status is not null
          and lower(recent.last_status) not in ('success', 'succeeded')
        )
      )
    on conflict (source_key) do update set
      assigned_to = excluded.assigned_to,
      required_capability = excluded.required_capability,
      priority = excluded.priority,
      state = 'open',
      title = excluded.title,
      description = excluded.description,
      href = excluded.href,
      due_at = excluded.due_at,
      resolution_predicate = excluded.resolution_predicate,
      resolved_at = null,
      last_evaluated_at = now(),
      updated_at = now()
  $jobs$;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_repair_jury_missing_ballot_tasks(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  with missing_by_show as (
    select
      jury_window.show_id,
      jury_window.edition_id,
      count(*) filter (
        where not exists (
          select 1
          from public.jury_ballot_submissions ballot
          where ballot.show_id = jury_window.show_id
            and ballot.voter_country_id = voter.country_id
            and ballot.status in ('submitted', 'needs_review', 'valid')
        )
        and not exists (
          select 1
          from public.jury_ballot_statuses ballot_status
          where ballot_status.show_id = jury_window.show_id
            and ballot_status.status = 'did_not_vote'
            and (
              ballot_status.voter_id = voter.id
              or ballot_status.voter_country_id = voter.country_id
              or (
                voter.contest_entity_id is not null
                and ballot_status.voter_entity_id = voter.contest_entity_id
              )
            )
        )
      )::integer as missing_count
    from public.jury_voting_windows jury_window
    join public.voters voter
      on voter.show_id = jury_window.show_id
     and voter.country_id is not null
    where jury_window.status = 'open'
      and (p_edition_id is null or jury_window.edition_id = p_edition_id)
    group by jury_window.show_id, jury_window.edition_id
  )
  update public.studio2_organizer_tasks task
  set
    state = case when missing.missing_count > 0 then 'open' else 'resolved' end,
    title = case
      when missing.missing_count > 0 then
        'Jury voting is missing ' || missing.missing_count::text || ' ballot' ||
        case when missing.missing_count = 1 then '' else 's' end
      else task.title
    end,
    resolved_at = case
      when missing.missing_count > 0 then null
      else coalesce(task.resolved_at, now())
    end,
    last_evaluated_at = now(),
    updated_at = now()
  from missing_by_show missing
  where task.source_kind = 'jury_missing_ballots'
    and task.source_id = missing.show_id::text;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_request_is_service_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
$function$;

CREATE OR REPLACE FUNCTION private.studio2_seed_edition_runtime()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_state text;
begin
  v_state := private.studio2_normalize_legacy_edition_status(new.status);

  insert into public.studio2_edition_runtime (edition_id, state, subsystems)
  values (new.id, v_state, private.studio2_default_subsystems(v_state))
  on conflict (edition_id) do nothing;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_serialize_show_publication_with_results()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('studio2-results:' || new.id::text, 0)
  );

  if coalesce(new.published, false)
     and private.studio2_publication_has_outcomes(new.publication_config)
     and not private.studio2_result_release_ready(new.id) then
    raise exception
      'The current result version is not reviewed, locked and reveal ready.'
      using errcode = '55000';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_submission_access_allowed(p_capability text, p_submission_id uuid, p_strict_before_cutover boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  select coalesce((
    select public.studio2_access_allowed(
      p_capability,
      s.edition_id,
      p_strict_before_cutover
    )
    from public.submissions s
    where s.id = p_submission_id
  ), false);
$function$;

CREATE OR REPLACE FUNCTION private.studio2_sync_results_after_jury_ballot_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_show_id uuid := case when tg_op = 'DELETE' then old.show_id else new.show_id end;
  v_edition_id uuid;
begin
  if v_show_id is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-results:' || v_show_id::text, 0)
  );

  -- Published result layers are terminal until explicitly made private. Do not
  -- let a ballot review silently rewrite what the public can already see.
  if exists (
    select 1
    from public.shows show
    where show.id = v_show_id
      and coalesce(show.published, false)
      and private.studio2_publication_has_outcomes(show.publication_config)
  ) then
    raise exception
      'Make the published result layer private before changing a jury ballot lifecycle.'
      using errcode = '55000';
  end if;

  select show.edition_id
  into v_edition_id
  from public.shows show
  where show.id = v_show_id;

  perform public.sync_show_results_from_votes(v_show_id);

  if v_edition_id is not null then
    insert into public.studio2_result_operations (
      show_id,
      edition_id,
      calculation_version,
      last_calculated_at,
      last_calculated_by,
      reviewed_version,
      reviewed_at,
      reviewed_by,
      locked_version,
      locked_at,
      locked_by,
      reveal_ready_version,
      reveal_ready_at,
      reveal_ready_by,
      updated_at
    )
    values (
      v_show_id,
      v_edition_id,
      1,
      now(),
      auth.uid(),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      now()
    )
    on conflict (show_id) do update set
      calculation_version = public.studio2_result_operations.calculation_version + 1,
      last_calculated_at = now(),
      last_calculated_by = auth.uid(),
      reviewed_version = null,
      reviewed_at = null,
      reviewed_by = null,
      locked_version = null,
      locked_at = null,
      locked_by = null,
      reveal_ready_version = null,
      reveal_ready_at = null,
      reveal_ready_by = null,
      updated_at = now();
  end if;

  return null;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_sync_story_source_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  update public.studio2_storylines s
  set source_event_count = (
    select count(*)
    from public.studio2_contest_events e
    where e.edition_id = new.edition_id
      and e.type not like 'storyline.%'
  )
  where s.edition_id = new.edition_id;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_sync_task_notifications(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'auth'
AS $function$
declare
  v_changed integer := 0;
  v_count integer := 0;
begin
  -- Domain resolution is authoritative for every Task-backed Inbox item.
  update public.admin_notifications notification
  set
    resolved_at = task.resolved_at,
    requires_action = true,
    resolution_mode = 'domain'
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.resolution_mode = 'domain'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and notification.resolved_at is distinct from task.resolved_at;

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  -- Assigned Tasks notify only the assigned capable operator. Unassigned Tasks,
  -- or assignments that lost permission, fan out to operators who actually
  -- hold the Task's required capability in the same scope.
  with active_tasks as (
    select task.*
    from public.studio2_organizer_tasks task
    where task.state <> 'resolved'
      and (
        p_edition_id is null
        or task.edition_id is null
        or task.edition_id = p_edition_id
      )
  ),
  recipients as (
    select
      task.id as task_id,
      task.assigned_to as user_id
    from active_tasks task
    where task.assigned_to is not null
      and private.studio2_user_has_capability(
        task.assigned_to,
        task.required_capability,
        task.edition_id
      )

    union

    select
      task.id,
      direct_grant.user_id
    from active_tasks task
    join public.studio2_capability_grants direct_grant
      on direct_grant.capability = task.required_capability
     and (direct_grant.expires_at is null or direct_grant.expires_at > now())
     and (
       direct_grant.edition_id is null
       or (
         task.edition_id is not null
         and direct_grant.edition_id = task.edition_id
       )
     )
    where task.assigned_to is null
       or not private.studio2_user_has_capability(
         task.assigned_to,
         task.required_capability,
         task.edition_id
       )

    union

    select
      task.id,
      assignment.user_id
    from active_tasks task
    join public.studio2_role_capabilities role_capability
      on role_capability.capability = task.required_capability
    join public.studio2_role_assignments assignment
      on assignment.role_key = role_capability.role_key
     and (assignment.expires_at is null or assignment.expires_at > now())
     and (
       assignment.edition_id is null
       or (
         task.edition_id is not null
         and assignment.edition_id = task.edition_id
       )
     )
    where task.assigned_to is null
       or not private.studio2_user_has_capability(
         task.assigned_to,
         task.required_capability,
         task.edition_id
       )

    union

    select
      task.id,
      legacy_role.user_id
    from active_tasks task
    join public.studio2_role_capabilities role_capability
      on role_capability.capability = task.required_capability
    join public.user_roles legacy_role
      on legacy_role.role::text = role_capability.role_key
    where task.assigned_to is null
       or not private.studio2_user_has_capability(
         task.assigned_to,
         task.required_capability,
         task.edition_id
       )
  )
  insert into public.admin_notifications (
    recipient_id,
    severity,
    title,
    body,
    href,
    source_key,
    read_at,
    resolved_at,
    requires_action,
    resolution_mode
  )
  select distinct
    recipient.user_id,
    case
      when task.priority = 'critical' then 'critical'
      when task.priority = 'high' then 'action'
      else 'warning'
    end,
    task.title,
    task.description,
    task.href,
    task.source_key,
    null::timestamptz,
    null::timestamptz,
    true,
    'domain'
  from recipients recipient
  join active_tasks task on task.id = recipient.task_id
  where recipient.user_id is not null
  on conflict (recipient_id, source_key)
    where source_key is not null
  do update set
    severity = excluded.severity,
    title = excluded.title,
    body = excluded.body,
    href = excluded.href,
    requires_action = true,
    resolution_mode = 'domain',
    resolved_at = null,
    read_at = case
      when public.admin_notifications.resolved_at is not null
        then null
      else public.admin_notifications.read_at
    end;

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  -- High and critical Task activations join the existing push queue. This is a
  -- required Organizer delivery class: global push enable/disable and quiet
  -- hours still apply, but it is not disguised as a participant category.
  insert into public.notification_deliveries (
    user_id,
    category,
    event_type,
    subject_id,
    dedupe_key,
    route,
    title,
    body,
    scheduled_for
  )
  select
    notification.recipient_id,
    'organizer_tasks',
    case
      when task.priority = 'critical'
        then 'organizer_task.critical'
      else 'organizer_task.high'
    end,
    task.id::text,
    'organizer-task:' || task.source_key || ':' || notification.recipient_id::text,
    task.href,
    task.title,
    left(task.description, 240),
    now()
  from public.admin_notifications notification
  join public.studio2_organizer_tasks task
    on task.source_key = notification.source_key
  where notification.resolution_mode = 'domain'
    and notification.requires_action = true
    and notification.resolved_at is null
    and task.state <> 'resolved'
    and task.priority in ('critical', 'high')
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  return v_changed;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_task_recipient_eligible(p_task_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select exists (
    select 1
    from public.studio2_organizer_tasks task
    where task.id = p_task_id
      and task.state <> 'resolved'
      and p_user_id is not null
      and private.studio2_user_has_capability(
        p_user_id,
        task.required_capability,
        task.edition_id
      )
      and (
        task.assigned_to = p_user_id
        or task.assigned_to is null
        or not coalesce(
          private.studio2_user_has_capability(
            task.assigned_to,
            task.required_capability,
            task.edition_id
          ),
          false
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.studio2_touch_confirmation_review_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_submission_id uuid;
  v_national_final_id uuid;
begin
  if tg_table_name = 'internal_entries' then
    v_submission_id := coalesce(new.submission_id, old.submission_id);
  elsif tg_table_name = 'national_finals' then
    v_submission_id := coalesce(new.submission_id, old.submission_id);
  elsif tg_table_name = 'national_final_entries' then
    v_national_final_id := coalesce(new.national_final_id, old.national_final_id);
    select nf.submission_id
    into v_submission_id
    from public.national_finals nf
    where nf.id = v_national_final_id;
  end if;

  -- A cascading response delete must not recreate a CAS row for a gone parent.
  if v_submission_id is not null and exists (
    select 1 from public.submissions where id=v_submission_id
  ) then
    insert into public.studio2_confirmation_review_versions (
      submission_id,
      version,
      updated_at
    )
    values (v_submission_id, 1, now())
    on conflict (submission_id)
    do update set
      version = public.studio2_confirmation_review_versions.version + 1,
      updated_at = now();
  end if;

  return coalesce(new, old);
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_touch_confirmation_round_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_new_round uuid;
  v_old_round uuid;
begin
  if tg_table_name = 'submission_rounds' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    v_new_round := new.id;
    if tg_op = 'UPDATE' then
      v_old_round := old.id;
    end if;
  elsif tg_table_name = 'submissions' then
    if tg_op <> 'DELETE' then
      v_new_round := new.round_id;
    end if;
    if tg_op <> 'INSERT' then
      v_old_round := old.round_id;
    end if;
  end if;

  if v_new_round is not null
     and exists (select 1 from public.submission_rounds r where r.id = v_new_round) then
    insert into public.studio2_confirmation_round_versions (round_id, version, updated_at)
    values (v_new_round, 1, now())
    on conflict (round_id) do update
    set version = public.studio2_confirmation_round_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if v_old_round is not null
     and v_old_round is distinct from v_new_round
     and exists (select 1 from public.submission_rounds r where r.id = v_old_round) then
    insert into public.studio2_confirmation_round_versions (round_id, version, updated_at)
    values (v_old_round, 1, now())
    on conflict (round_id) do update
    set version = public.studio2_confirmation_round_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_touch_eligibility_override_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_new_edition uuid;
  v_new_country uuid;
  v_new_rule text;
  v_old_edition uuid;
  v_old_country uuid;
  v_old_rule text;
begin
  if tg_op <> 'DELETE' then
    v_new_edition := new.edition_id;
    v_new_country := new.country_id;
    v_new_rule := new.affected_rule;
  end if;

  if tg_op <> 'INSERT' then
    v_old_edition := old.edition_id;
    v_old_country := old.country_id;
    v_old_rule := old.affected_rule;
  end if;

  if v_new_edition is not null and v_new_country is not null and v_new_rule is not null then
    insert into public.studio2_eligibility_override_versions (
      edition_id,
      country_id,
      affected_rule,
      version,
      updated_at
    )
    values (v_new_edition, v_new_country, v_new_rule, 1, now())
    on conflict (edition_id, country_id, affected_rule) do update
    set version = public.studio2_eligibility_override_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if v_old_edition is not null
     and v_old_country is not null
     and v_old_rule is not null
     and (
       v_new_edition is distinct from v_old_edition
       or v_new_country is distinct from v_old_country
       or v_new_rule is distinct from v_old_rule
     ) then
    insert into public.studio2_eligibility_override_versions (
      edition_id,
      country_id,
      affected_rule,
      version,
      updated_at
    )
    values (v_old_edition, v_old_country, v_old_rule, 1, now())
    on conflict (edition_id, country_id, affected_rule) do update
    set version = public.studio2_eligibility_override_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_touch_jury_window_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_edition_id uuid;
begin
  v_edition_id := case when tg_op = 'DELETE' then old.edition_id else new.edition_id end;

  insert into public.studio2_jury_window_versions (edition_id, version, updated_at)
  values (v_edition_id, 1, now())
  on conflict (edition_id) do update
  set version = public.studio2_jury_window_versions.version + 1,
      updated_at = excluded.updated_at;

  if tg_op = 'UPDATE'
     and old.edition_id is distinct from new.edition_id then
    insert into public.studio2_jury_window_versions (edition_id, version, updated_at)
    values (old.edition_id, 1, now())
    on conflict (edition_id) do update
    set version = public.studio2_jury_window_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_touch_participation_status_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_new_edition uuid;
  v_old_edition uuid;
  v_new_subject text;
  v_old_subject text;
begin
  if tg_table_name = 'participants' then
    if tg_op <> 'DELETE' then
      v_new_edition := new.edition_id;
      v_new_subject := private.studio2_participation_subject_key(
        new.country_id,
        new.contest_entity_id
      );
    end if;
    if tg_op <> 'INSERT' then
      v_old_edition := old.edition_id;
      v_old_subject := private.studio2_participation_subject_key(
        old.country_id,
        old.contest_entity_id
      );
    end if;
  elsif tg_table_name = 'entries' then
    if tg_op <> 'DELETE' then
      v_new_edition := new.edition_id;
      v_new_subject := private.studio2_participation_subject_key(new.country_id, null);
    end if;
    if tg_op <> 'INSERT' then
      v_old_edition := old.edition_id;
      v_old_subject := private.studio2_participation_subject_key(old.country_id, null);
    end if;
  end if;

  if v_new_edition is not null and v_new_subject is not null then
    insert into public.studio2_participation_status_versions (
      edition_id,
      subject_key,
      version,
      updated_at
    )
    values (v_new_edition, v_new_subject, 1, now())
    on conflict (edition_id, subject_key) do update
    set version = public.studio2_participation_status_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if v_old_edition is not null
     and v_old_subject is not null
     and (
       v_new_edition is distinct from v_old_edition
       or v_new_subject is distinct from v_old_subject
     ) then
    insert into public.studio2_participation_status_versions (
      edition_id,
      subject_key,
      version,
      updated_at
    )
    values (v_old_edition, v_old_subject, 1, now())
    on conflict (edition_id, subject_key) do update
    set version = public.studio2_participation_status_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_touch_televote_global_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  insert into public.studio2_televote_global_versions (singleton, version, updated_at)
  values (true, 1, now())
  on conflict (singleton) do update
  set version = public.studio2_televote_global_versions.version + 1,
      updated_at = excluded.updated_at;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.studio2_touch_televote_round_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'televoting'
AS $function$
declare
  v_new_round uuid;
  v_old_round uuid;
begin
  if tg_table_name = 'rounds' then
    if tg_op = 'DELETE' then
      delete from public.studio2_televote_round_versions
      where round_id = old.id;
      return old;
    end if;
    v_new_round := new.id;
    if tg_op = 'UPDATE' then
      v_old_round := old.id;
    end if;
  elsif tg_table_name = 'round_entries' then
    if tg_op <> 'DELETE' then
      v_new_round := new.round_id;
    end if;
    if tg_op <> 'INSERT' then
      v_old_round := old.round_id;
    end if;
  end if;

  if v_new_round is not null
     and exists (select 1 from televoting.rounds r where r.id = v_new_round) then
    insert into public.studio2_televote_round_versions (round_id, version, updated_at)
    values (v_new_round, 1, now())
    on conflict (round_id) do update
    set version = public.studio2_televote_round_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if v_old_round is not null
     and v_old_round is distinct from v_new_round
     and exists (select 1 from televoting.rounds r where r.id = v_old_round) then
    insert into public.studio2_televote_round_versions (round_id, version, updated_at)
    values (v_old_round, 1, now())
    on conflict (round_id) do update
    set version = public.studio2_televote_round_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
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

CREATE OR REPLACE FUNCTION private.studio2_transition_risk(p_from text, p_to text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  select case p_from || '->' || p_to
    when 'vote_verification->televoting' then 'critical'
    when 'results->vote_verification' then 'critical'
    when 'post_edition->results' then 'critical'
    when 'host_selection->planning' then 'elevated'
    when 'confirmations->planning' then 'elevated'
    when 'submissions->confirmations' then 'elevated'
    when 'pre_show->submissions' then 'elevated'
    when 'rehearsals->pre_show' then 'elevated'
    when 'jury_voting->rehearsals' then 'elevated'
    when 'live_show->jury_voting' then 'elevated'
    when 'televoting->live_show' then 'elevated'
    when 'draft->planning' then 'normal'
    when 'planning->host_selection' then 'normal'
    when 'planning->confirmations' then 'normal'
    when 'host_selection->confirmations' then 'normal'
    when 'confirmations->submissions' then 'normal'
    when 'submissions->pre_show' then 'normal'
    when 'pre_show->rehearsals' then 'normal'
    when 'rehearsals->jury_voting' then 'normal'
    when 'jury_voting->live_show' then 'normal'
    when 'live_show->televoting' then 'normal'
    when 'televoting->vote_verification' then 'normal'
    when 'vote_verification->results' then 'normal'
    when 'results->post_edition' then 'normal'
    when 'post_edition->archived' then 'normal'
    else null
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

CREATE OR REPLACE FUNCTION private.v3_apply_entry_credits_context()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_context_text text;
  v_context jsonb;
  v_candidate jsonb;
  v_top_artist text;
  v_top_song text;
begin
  v_context_text := current_setting('solaris.v3_entry_credits_context', true);
  if nullif(v_context_text, '') is null then
    return new;
  end if;

  begin
    v_context := v_context_text::jsonb;
  exception when others then
    raise exception 'Canonical Entry credits context is invalid' using errcode = '22023';
  end;

  if tg_table_name = 'internal_entries' then
    if v_context ? 'credits' then
      new.credits := private.v3_normalize_entry_credits(v_context -> 'credits');
    end if;
    return new;
  end if;

  if tg_table_name <> 'national_final_entries' then
    return new;
  end if;

  -- Top-level Confirmation artist/song represent the selected NF winner. Its
  -- Credits section therefore overrides a duplicated candidate-level value.
  v_top_artist := private.v3_normalize_confirmation_entry_text(v_context ->> 'artist');
  v_top_song := private.v3_normalize_confirmation_entry_text(v_context ->> 'song_title');
  if v_context ? 'credits'
     and v_top_artist <> ''
     and v_top_song <> ''
     and private.v3_normalize_confirmation_entry_text(new.artist) = v_top_artist
     and private.v3_normalize_confirmation_entry_text(new.song_title) = v_top_song then
    new.credits := private.v3_normalize_entry_credits(v_context -> 'credits');
    return new;
  end if;

  select candidate
  into v_candidate
  from jsonb_array_elements(
    case
      when jsonb_typeof(v_context -> 'nf_entries') = 'array'
        then v_context -> 'nf_entries'
      else '[]'::jsonb
    end
  ) candidate
  where private.v3_normalize_confirmation_entry_text(candidate ->> 'artist')
          = private.v3_normalize_confirmation_entry_text(new.artist)
    and private.v3_normalize_confirmation_entry_text(candidate ->> 'song_title')
          = private.v3_normalize_confirmation_entry_text(new.song_title)
  limit 1;

  if v_candidate ? 'credits' then
    new.credits := private.v3_normalize_entry_credits(v_candidate -> 'credits');
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_bind_confirmation_entry_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  submission_uuid uuid;
  edition_uuid uuid;
  target text := case when tg_table_name='internal_entries' then 'internal' else 'national_final' end;
  content_snapshot jsonb := private.v3_entry_content(to_jsonb(new));
  changed boolean;
  restore_version_uuid uuid;
  version_source text;
begin
  if tg_op='UPDATE' then
    if old.current_version_id is not null and (
      new.id is distinct from old.id
      or to_jsonb(new)->'submission_id' is distinct from to_jsonb(old)->'submission_id'
      or to_jsonb(new)->'national_final_id' is distinct from to_jsonb(old)->'national_final_id'
    ) then
      raise exception 'Versioned entries cannot change their Confirmation ownership' using errcode='22023';
    end if;
  end if;

  if target='internal' then
    submission_uuid:=new.submission_id;
  else
    select nf.submission_id into submission_uuid
    from public.national_finals nf
    where nf.id=(to_jsonb(new)->>'national_final_id')::uuid;
  end if;

  -- Historical national finals without Confirmation ownership keep their own workflow.
  if submission_uuid is null then
    new.current_version_id:=null;
    new.content_revision:=null;
    new.reviewed_version_id:=null;
    return new;
  end if;

  select s.edition_id into edition_uuid
  from public.submissions s
  where s.id=submission_uuid;

  restore_version_uuid := nullif(
    current_setting('solaris.v3_restore_submission_version_id', true),
    ''
  )::uuid;
  if restore_version_uuid is not null and not exists (
    select 1
    from public.submission_versions v
    where v.id=restore_version_uuid
      and v.submission_id=submission_uuid
  ) then
    raise exception 'Entry restore provenance does not belong to this Confirmation submission'
      using errcode='22023';
  end if;
  version_source := case
    when restore_version_uuid is not null then 'organizer_restore'
    else 'canonical_write'
  end;

  if tg_op='UPDATE' then
    new.current_version_id:=old.current_version_id;
    new.content_revision:=old.content_revision;
    new.reviewed_version_id:=old.reviewed_version_id;
    changed:=old.current_version_id is null
      or coalesce(current_setting('solaris.v3_force_entry_version',true)=submission_uuid::text,false)
      or content_snapshot is distinct from private.v3_entry_content(to_jsonb(old));
  else
    changed:=true;
    new.content_revision:=0;
    new.current_version_id:=null;
    new.reviewed_version_id:=null;
  end if;

  if changed then
    if target='national_final' and tg_op='UPDATE' and exists (
      select 1 from public.national_finals nf
      where nf.id=(to_jsonb(new)->>'national_final_id')::uuid
        and nf.winning_entry_id=new.id
    ) then
      raise exception 'Clear the National Final winner before editing its reviewed content' using errcode='22023';
    end if;

    new.content_revision:=coalesce(new.content_revision,0)+1;
    if tg_op='INSERT' then
      -- ON CONFLICT can discard an INSERT candidate after BEFORE triggers.
      -- Record its evidence only in AFTER INSERT, once a row really exists.
      new.current_version_id:=gen_random_uuid();
    else
      insert into private.v3_entry_versions(
        target_type, entry_id, submission_id, edition_id,
        revision, parent_version_id, source,
        restored_from_submission_version_id,
        content, content_hash, actor_id
      )
      values(
        target,new.id,submission_uuid,edition_uuid,
        new.content_revision,new.current_version_id,version_source,
        restore_version_uuid,
        content_snapshot,
        encode(extensions.digest(content_snapshot::text,'sha256'),'hex'),
        auth.uid()
      )
      returning id into new.current_version_id;
    end if;

    new.reviewed_version_id:=null;
    if tg_op='UPDATE' then
      if new.review_status <> 'removed' then new.review_status:='pending'; end if;
      new.review_reason:=null;
      new.reviewed_at:=null;
      new.reviewed_by:=null;
    end if;
  elsif new.review_status='pending' then
    new.reviewed_version_id:=null;
  elsif new.reviewed_at is not null and (
    new.reviewed_at is distinct from old.reviewed_at
    or new.reviewed_by is distinct from old.reviewed_by
    or new.review_status is distinct from old.review_status
    or new.review_reason is distinct from old.review_reason
  ) then
    new.reviewed_version_id:=new.current_version_id;
    insert into private.v3_entry_reviews(version_id,decision,reason,reviewed_at,actor_id)
    values(new.current_version_id,new.review_status,new.review_reason,new.reviewed_at,new.reviewed_by);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.v3_capture_result_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_rows jsonb;
  v_count integer;
begin
  if new.calculation_version < 1
     or (tg_op = 'UPDATE' and new.calculation_version = old.calculation_version) then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.calculation_version <> old.calculation_version + 1 then
    raise exception 'Result calculation versions must advance exactly once'
      using errcode = '23514';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', result.id,
          'countryId', result.country_id,
          'contestEntityId', result.contest_entity_id,
          'juryPoints', result.jury_points,
          'televotePoints', result.televote_points,
          'televoteComponents', result.televote_components,
          'totalPoints', result.total_points,
          'finalRank', result.final_rank
        ) order by result.id
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_rows, v_count
  from public.results result
  where result.show_id = new.show_id
    and result.edition_id = new.edition_id;

  insert into private.v3_result_versions (
    show_id, edition_id, version, result_rows, result_row_count, created_by
  ) values (
    new.show_id, new.edition_id, new.calculation_version,
    v_rows, v_count, new.last_calculated_by
  );

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

CREATE OR REPLACE FUNCTION private.v3_emit_domain_event(p_event_type text, p_aggregate_type text, p_aggregate_id text, p_aggregate_version bigint, p_operation_id uuid, p_edition_id uuid DEFAULT NULL::uuid, p_show_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_schema_version integer DEFAULT 1, p_consumers text[] DEFAULT ARRAY[]::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'auth'
AS $function$
declare
  v_receipt public.studio2_operation_receipts;
  v_event private.v3_domain_events;
  v_event_id uuid := gen_random_uuid();
  v_edition_id uuid := p_edition_id;
  v_show_edition_id uuid;
  v_consumer text;
  v_consumers text[];
begin
  if p_operation_id is null then
    raise exception 'Domain event operation is required' using errcode = '22023';
  end if;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
  for share;

  if v_receipt.operation_id is null then
    raise exception 'Domain event operation does not exist' using errcode = '23503';
  end if;
  if v_receipt.status not in ('processing', 'succeeded') then
    raise exception 'Domain events may only describe a completing or completed operation'
      using errcode = '55000';
  end if;

  if nullif(btrim(coalesce(p_event_type, '')), '') is null
     or p_event_type !~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$' then
    raise exception 'Domain event type is invalid' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_aggregate_type, '')), '') is null
     or p_aggregate_type !~ '^[a-z][a-z0-9_-]*$' then
    raise exception 'Domain event aggregate type is invalid' using errcode = '22023';
  end if;
  if length(coalesce(p_aggregate_id, '')) not between 1 and 240 then
    raise exception 'Domain event aggregate id is invalid' using errcode = '22023';
  end if;
  if p_aggregate_version is null or p_aggregate_version < 0 then
    raise exception 'Domain event aggregate version is invalid' using errcode = '22023';
  end if;
  if p_schema_version is null or p_schema_version < 1 then
    raise exception 'Domain event schema version is invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
     or pg_column_size(coalesce(p_payload, '{}'::jsonb)) > 65536 then
    raise exception 'Domain event payload must be a bounded JSON object' using errcode = '22023';
  end if;

  if p_show_id is not null then
    select show_row.edition_id
    into v_show_edition_id
    from public.shows show_row
    where show_row.id = p_show_id;
    if v_show_edition_id is null then
      raise exception 'Domain event show does not exist' using errcode = '23503';
    end if;
    if v_edition_id is not null and v_edition_id is distinct from v_show_edition_id then
      raise exception 'Domain event show and edition scope disagree' using errcode = '23514';
    end if;
    v_edition_id := v_show_edition_id;
  elsif v_edition_id is not null
        and not exists (select 1 from public.editions where id = v_edition_id) then
    raise exception 'Domain event edition does not exist' using errcode = '23503';
  end if;

  select coalesce(array_agg(consumer order by consumer), array[]::text[])
  into v_consumers
  from (
    select distinct btrim(raw_consumer) as consumer
    from unnest(coalesce(p_consumers, array[]::text[])) raw_consumer
    where nullif(btrim(raw_consumer), '') is not null
  ) normalized;

  if exists (
    select 1
    from unnest(v_consumers) consumer
    where consumer !~ '^[a-z][a-z0-9_.:-]{0,159}$'
  ) then
    raise exception 'Domain event consumer key is invalid' using errcode = '22023';
  end if;

  insert into private.v3_domain_events (
    id,
    event_type,
    aggregate_type,
    aggregate_id,
    aggregate_version,
    operation_id,
    correlation_id,
    edition_id,
    show_id,
    actor_id,
    payload,
    schema_version
  ) values (
    v_event_id,
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    p_aggregate_version,
    p_operation_id,
    v_receipt.correlation_id,
    v_edition_id,
    p_show_id,
    v_receipt.actor_id,
    coalesce(p_payload, '{}'::jsonb),
    p_schema_version
  )
  on conflict (operation_id, event_type, aggregate_type, aggregate_id, aggregate_version)
  do nothing;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.operation_id = p_operation_id
    and event_row.event_type = p_event_type
    and event_row.aggregate_type = p_aggregate_type
    and event_row.aggregate_id = p_aggregate_id
    and event_row.aggregate_version = p_aggregate_version;

  if v_event.id is null then
    raise exception 'Canonical domain event could not be persisted' using errcode = 'P0001';
  end if;

  if v_event.correlation_id is distinct from v_receipt.correlation_id
     or v_event.edition_id is distinct from v_edition_id
     or v_event.show_id is distinct from p_show_id
     or v_event.actor_id is distinct from v_receipt.actor_id
     or v_event.payload is distinct from coalesce(p_payload, '{}'::jsonb)
     or v_event.schema_version is distinct from p_schema_version then
    raise exception 'IDEMPOTENCY_CONFLICT: canonical domain event semantics changed'
      using errcode = 'P0001';
  end if;

  foreach v_consumer in array v_consumers loop
    insert into private.v3_domain_event_outbox (event_id, consumer_key)
    values (v_event.id, v_consumer)
    on conflict (event_id, consumer_key) do nothing;
  end loop;

  return v_event.id;
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

CREATE OR REPLACE FUNCTION private.v3_enforce_televote_submission_deadline()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'televoting'
AS $function$
declare
  v_deadline timestamptz;
begin
  if coalesce(new.is_historical, false) then
    return new;
  end if;

  select round_row.closes_at
  into v_deadline
  from televoting.rounds round_row
  where round_row.id = new.round_id
  for share;

  if not found then
    raise exception 'Voting round not found' using errcode = '23503';
  end if;

  if v_deadline is not null and now() >= v_deadline then
    raise exception 'Voting deadline has passed' using errcode = '22023';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_guard_direct_televote_deadline()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if new.closes_at is distinct from old.closes_at
     and current_user in ('authenticated', 'anon') then
    raise exception
      'Televote deadline must use the governed deadline operation contract.'
      using errcode = '42501';
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_guard_entry_parent_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if tg_table_name='submissions' then
    if new.edition_id is distinct from old.edition_id and exists (
      select 1 from private.v3_entry_versions v where v.submission_id=old.id
    ) then
      raise exception 'Versioned Confirmation submissions cannot change edition' using errcode='22023';
    end if;
  else
    if new.submission_id is distinct from old.submission_id and exists (
      select 1 from public.national_final_entries i where i.national_final_id=old.id and i.current_version_id is not null
    ) then
      raise exception 'Versioned National Finals cannot change Confirmation ownership' using errcode='22023';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.v3_guard_exact_reviewed_winner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  candidate public.national_final_entries;
  participant_write boolean :=
    coalesce(current_setting('solaris.v3_confirmation_participant_write', true), '') = 'on';
begin
  if new.submission_id is null then
    return new;
  end if;

  if new.winning_entry_id is null then
    if participant_write then
      new.pending_winning_entry_id := null;
    end if;
    return new;
  end if;

  -- Existing canonical winners created before exact-version review binding are
  -- not reinterpreted retroactively. Only a winner transition requires fresh
  -- exact-version proof, matching the original guard semantics.
  if tg_op = 'UPDATE'
     and new.winning_entry_id is not distinct from old.winning_entry_id then
    return new;
  end if;

  select *
  into candidate
  from public.national_final_entries
  where id = new.winning_entry_id
  for update;

  if candidate.id is null
     or candidate.national_final_id is distinct from new.id
     or coalesce(candidate.removed, false)
     or candidate.current_version_id is null then
    raise exception 'Review the exact current National Final entry version before selecting it as winner'
      using errcode = '22023';
  end if;

  if candidate.review_status = 'accepted'
     and candidate.reviewed_version_id is not distinct from candidate.current_version_id then
    if participant_write then
      new.pending_winning_entry_id := null;
    end if;
    return new;
  end if;

  if participant_write then
    new.pending_winning_entry_id := new.winning_entry_id;
    new.winning_entry_id := case
      when tg_op = 'UPDATE' then old.winning_entry_id
      else null
    end;

    -- A legacy accepted flag without exact-version evidence is not enough to
    -- promote a winner, but it must become visible in the Organizer review
    -- queue once the participant explicitly selects it.
    update public.national_final_entries
    set review_status = 'pending',
        review_reason = null,
        reviewed_at = null,
        reviewed_by = null
    where id = candidate.id
      and (
        review_status is distinct from 'pending'
        or reviewed_version_id is not null
        or review_reason is not null
        or reviewed_at is not null
        or reviewed_by is not null
      );

    return new;
  end if;

  raise exception 'Review the exact current National Final entry version before selecting it as winner'
    using errcode = '22023';
end;
$function$;

CREATE OR REPLACE FUNCTION private.v3_guard_jury_ballot_reference_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if exists (
    select 1
    from public.jury_votes vote
    where vote.ballot_submission_id = old.id
      and (
        vote.edition_id is distinct from new.edition_id
        or vote.show_id is distinct from new.show_id
      )
  ) then
    raise exception 'Referenced jury vote prevents ballot submission scope drift' using errcode = '42501';
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_guard_jury_show_reference_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if new.edition_id is distinct from old.edition_id and exists (
    select 1 from public.jury_votes vote
    where vote.show_id = old.id
      and vote.edition_id is distinct from new.edition_id
  ) then
    raise exception 'Referenced jury vote prevents show edition drift' using errcode = '42501';
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_guard_jury_vote_object_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  perform private.v3_assert_jury_vote_object_scope(
    new.edition_id,
    new.show_id,
    new.voter_id,
    new.voter_country_id,
    new.voter_entity_id,
    new.receiving_country_id,
    new.receiving_entity_id,
    new.ballot_submission_id
  );
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_guard_jury_voter_reference_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if exists (
    select 1
    from public.jury_votes vote
    where vote.voter_id = old.id
      and (
        vote.edition_id is distinct from new.edition_id
        or (new.show_id is not null and vote.show_id is distinct from new.show_id)
        or (vote.voter_country_id is not null and new.country_id is distinct from vote.voter_country_id)
        or (
          new.contest_entity_id is not null
          and vote.voter_entity_id is not null
          and new.contest_entity_id is distinct from vote.voter_entity_id
        )
      )
  ) then
    raise exception 'Referenced jury vote prevents voter scope drift' using errcode = '42501';
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_guard_media_asset_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_current_source text;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.edition_id is distinct from old.edition_id
       or new.asset_key is distinct from old.asset_key
       or new.asset_type is distinct from old.asset_type
       or new.country_id is distinct from old.country_id
       or new.entry_id is distinct from old.entry_id
       or new.source_fingerprint is distinct from old.source_fingerprint
       or new.decision is distinct from old.decision
       or new.reason is distinct from old.reason
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Media review history is immutable' using errcode = '23514';
    end if;

    if old.superseded_at is not null
       or new.superseded_at is null
       or new.superseded_at < old.reviewed_at then
      raise exception 'A media review may only transition once from active to superseded'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if new.superseded_at is not null then
    raise exception 'A new media review must begin as the active decision'
      using errcode = '23514';
  end if;

  if new.reviewed_at > clock_timestamp() then
    raise exception 'Media review timestamp cannot be in the future'
      using errcode = '23514';
  end if;

  if new.entry_id is not null and not exists (
    select 1
    from public.entries entry
    where entry.id = new.entry_id
      and entry.edition_id = new.edition_id
      and entry.country_id = new.country_id
  ) then
    raise exception 'Entry media review is outside its edition/country scope'
      using errcode = '23514';
  end if;

  v_current_source := private.studio2_resolve_media_asset_source(
    new.edition_id,
    new.asset_key,
    new.asset_type,
    new.country_id,
    new.entry_id
  );

  if v_current_source is null
     or btrim(v_current_source) is distinct from new.source_fingerprint then
    raise exception 'Media review must reference the exact current canonical source'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_guard_pending_nf_winner_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  candidate public.national_final_entries;
begin
  if new.pending_winning_entry_id is null then
    return new;
  end if;

  select *
  into candidate
  from public.national_final_entries
  where id = new.pending_winning_entry_id;

  if candidate.id is null
     or candidate.national_final_id is distinct from new.id
     or coalesce(candidate.removed, false) then
    raise exception 'Pending National Final winner must be an active entry from the same National Final'
      using errcode = '22023';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.v3_guard_televote_entry_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'televoting'
AS $function$
declare
  v_submission televoting.vote_submissions;
begin
  select submission.*
    into v_submission
  from televoting.vote_submissions submission
  where submission.id = new.submission_id;

  if v_submission.id is null then
    raise exception 'Televote vote entry must reference an existing ballot'
      using errcode = '23503';
  end if;

  if new.is_historical is distinct from v_submission.is_historical then
    raise exception 'Televote vote entry must preserve its ballot history classification'
      using errcode = '23514';
  end if;

  if not v_submission.is_historical and not exists (
    select 1
    from televoting.round_entries round_entry
    where round_entry.round_id = v_submission.round_id
      and round_entry.entry_key = new.target_country_code
  ) then
    raise exception 'Modern Televote vote entry must belong to its ballot round'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_guard_televote_submission_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'televoting'
AS $function$
begin
  if not new.is_historical then
    if length(btrim(new.username)) < 2
       or new.username_normalized is distinct from lower(btrim(new.username)) then
      raise exception 'Modern Televote ballot identity must use the normalized submitted username'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from televoting.countries country
      where country.code = new.country_code
    ) then
      raise exception 'Modern Televote ballot must use a known voting country'
        using errcode = '23514';
    end if;
  end if;

  if exists (
    select 1
    from televoting.vote_entries vote_entry
    where vote_entry.submission_id = new.id
      and vote_entry.is_historical is distinct from new.is_historical
  ) then
    raise exception 'Televote ballot history classification cannot drift from its vote entries'
      using errcode = '23514';
  end if;

  if not new.is_historical and exists (
    select 1
    from televoting.vote_entries vote_entry
    where vote_entry.submission_id = new.id
      and not exists (
        select 1
        from televoting.round_entries round_entry
        where round_entry.round_id = new.round_id
          and round_entry.entry_key = vote_entry.target_country_code
      )
  ) then
    raise exception 'Modern Televote ballot cannot move outside the scope of its vote entries'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from televoting.vote_preflight_checks preflight
    where preflight.channel = 'televote'
      and preflight.submission_id = new.id
      and (
        new.is_historical
        or preflight.round_id is distinct from new.round_id
        or preflight.username_normalized is distinct from new.username_normalized
        or upper(preflight.country_code) is distinct from upper(new.country_code)
        or preflight.submitted_at is null
      )
  ) then
    raise exception 'Televote ballot identity cannot drift from its completed integrity preflight'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_promote_pending_nf_winner_after_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if coalesce(new.removed, false) then
    update public.national_finals nf
    set pending_winning_entry_id = null
    where nf.id = new.national_final_id
      and nf.pending_winning_entry_id = new.id;
    return new;
  end if;

  if new.review_status = 'accepted'
     and new.current_version_id is not null
     and new.reviewed_version_id is not distinct from new.current_version_id then
    update public.national_finals nf
    set winning_entry_id = new.id,
        pending_winning_entry_id = null
    where nf.id = new.national_final_id
      and nf.pending_winning_entry_id = new.id;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.v3_publication_result_version_release_ready(p_show_id uuid, p_version bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select p_version is not null and exists (
    select 1
    from public.studio2_result_operations operation
    join private.v3_result_versions version
      on version.show_id = operation.show_id
     and version.version = p_version
     and version.edition_id = operation.edition_id
    where operation.show_id = p_show_id
      and operation.calculation_version = p_version
      and operation.last_calculated_at is not null
      and operation.reviewed_version = p_version
      and operation.reviewed_at is not null
      and operation.locked_version = p_version
      and operation.locked_at is not null
      and operation.reveal_ready_version = p_version
      and operation.reveal_ready_at is not null
  );
$function$;

CREATE OR REPLACE FUNCTION private.v3_record_inserted_entry_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  submission_uuid uuid;
  edition_uuid uuid;
  content_snapshot jsonb;
  restore_version_uuid uuid;
  version_source text;
begin
  if new.current_version_id is null then return new; end if;

  if tg_table_name='internal_entries' then
    submission_uuid:=new.submission_id;
  else
    select nf.submission_id into submission_uuid
    from public.national_finals nf
    where nf.id=(to_jsonb(new)->>'national_final_id')::uuid;
  end if;
  select s.edition_id into edition_uuid
  from public.submissions s
  where s.id=submission_uuid;

  restore_version_uuid := nullif(
    current_setting('solaris.v3_restore_submission_version_id', true),
    ''
  )::uuid;
  if restore_version_uuid is not null and not exists (
    select 1
    from public.submission_versions v
    where v.id=restore_version_uuid
      and v.submission_id=submission_uuid
  ) then
    raise exception 'Entry restore provenance does not belong to this Confirmation submission'
      using errcode='22023';
  end if;
  version_source := case
    when restore_version_uuid is not null then 'organizer_restore'
    else 'canonical_write'
  end;

  content_snapshot:=private.v3_entry_content(to_jsonb(new));
  insert into private.v3_entry_versions(
    id,target_type,entry_id,submission_id,edition_id,revision,source,
    restored_from_submission_version_id,content,content_hash,actor_id
  )
  values(
    new.current_version_id,
    case when tg_table_name='internal_entries' then 'internal' else 'national_final' end,
    new.id,submission_uuid,edition_uuid,1,version_source,
    restore_version_uuid,content_snapshot,
    encode(extensions.digest(content_snapshot::text,'sha256'),'hex'),auth.uid()
  );
  return new;
end;
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

CREATE OR REPLACE FUNCTION private.v3_stage_current_nf_winner_before_participant_entry_edit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if coalesce(current_setting('solaris.v3_confirmation_participant_write', true), '') <> 'on' then
    return new;
  end if;

  if private.v3_entry_content(to_jsonb(new)) is distinct from private.v3_entry_content(to_jsonb(old))
     and exists (
       select 1
       from public.national_finals nf
       where nf.id = old.national_final_id
         and nf.winning_entry_id = old.id
     ) then
    update public.national_finals nf
    set winning_entry_id = null
    where nf.id = old.national_final_id
      and nf.winning_entry_id = old.id;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.v3_supersede_stale_media_reviews()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if tg_table_name = 'entries' then
    update public.studio2_media_asset_reviews review
    set superseded_at = clock_timestamp()
    where review.entry_id = new.id
      and review.superseded_at is null
      and review.source_fingerprint is distinct from private.studio2_resolve_media_asset_source(
        review.edition_id,
        review.asset_key,
        review.asset_type,
        review.country_id,
        review.entry_id
      );
  elsif tg_table_name = 'countries' then
    update public.studio2_media_asset_reviews review
    set superseded_at = clock_timestamp()
    where review.country_id = new.id
      and review.asset_type = 'flag'
      and review.superseded_at is null
      and review.source_fingerprint is distinct from nullif(btrim(new.flag_image), '');
  elsif tg_table_name = 'editions' then
    update public.studio2_media_asset_reviews review
    set superseded_at = clock_timestamp()
    where review.edition_id = new.id
      and review.asset_type = 'logo'
      and review.superseded_at is null
      and review.source_fingerprint is distinct from nullif(btrim(new.logo), '');
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_validate_current_entry_pointer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
declare
  v_target_type text := case
    when tg_table_name = 'internal_entries' then 'internal'
    else 'national_final'
  end;
  v_submission_id uuid;
  v_edition_id uuid;
  v_version private.v3_entry_versions;
begin
  if v_target_type = 'internal' then
    select submission.id, submission.edition_id
    into v_submission_id, v_edition_id
    from public.submissions submission
    where submission.id = new.submission_id;
  else
    select submission.id, submission.edition_id
    into v_submission_id, v_edition_id
    from public.national_finals national_final
    join public.submissions submission on submission.id = national_final.submission_id
    where national_final.id = new.national_final_id;
  end if;

  if v_submission_id is null then
    if new.current_version_id is not null
       or new.content_revision is not null
       or new.reviewed_version_id is not null then
      raise exception 'Unowned historical Entry cannot carry canonical version pointers'
        using errcode = '23514';
    end if;
    return new;
  end if;

  select * into v_version
  from private.v3_entry_versions version
  where version.id = new.current_version_id;

  if v_version.id is null
     or v_version.target_type is distinct from v_target_type
     or v_version.entry_id is distinct from new.id
     or v_version.submission_id is distinct from v_submission_id
     or v_version.edition_id is distinct from v_edition_id
     or v_version.revision is distinct from new.content_revision
     or v_version.content_hash is distinct from encode(
       extensions.digest(private.v3_entry_content(to_jsonb(new))::text, 'sha256'),
       'hex'
     )
     or exists (
       select 1
       from private.v3_entry_versions later
       where later.target_type = v_target_type
         and later.entry_id = new.id
         and later.revision > v_version.revision
     ) then
    raise exception 'Entry current pointer must reference its latest exact immutable content version'
      using errcode = '23514';
  end if;

  if new.reviewed_version_id is not null and (
    new.reviewed_version_id is distinct from new.current_version_id
    or not exists (
      select 1 from private.v3_entry_reviews review
      where review.version_id = new.reviewed_version_id
    )
  ) then
    raise exception 'Entry review must bind to the exact current immutable version'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_validate_jury_dnv_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_show_edition_id uuid;
begin
  select show_row.edition_id
  into v_show_edition_id
  from public.shows show_row
  where show_row.id = new.show_id;

  if v_show_edition_id is null
     or v_show_edition_id is distinct from new.edition_id then
    raise exception 'Jury did-not-vote state must use the edition owned by its show'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.jury_ballot_submissions ballot
    where ballot.show_id = new.show_id
      and (
        (new.voter_id is not null and new.voter_id = ballot.voter_id)
        or (
          new.voter_entity_id is not null
          and new.voter_entity_id = ballot.voter_entity_id
        )
        or (
          new.voter_country_id is not null
          and new.voter_country_id = ballot.voter_country_id
        )
      )
  ) then
    raise exception 'Jury did-not-vote state cannot coexist with a submitted ballot'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_validate_jury_submission_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'televoting'
AS $function$
declare
  v_show_edition_id uuid;
  v_preflight televoting.vote_preflight_checks;
begin
  select show_row.edition_id
  into v_show_edition_id
  from public.shows show_row
  where show_row.id = new.show_id;

  if v_show_edition_id is null
     or v_show_edition_id is distinct from new.edition_id then
    raise exception 'Jury ballot submission must use the edition owned by its show'
      using errcode = '23514';
  end if;

  select preflight.*
  into v_preflight
  from televoting.vote_preflight_checks preflight
  where preflight.id = new.preflight_id;

  if v_preflight.id is null
     or v_preflight.channel is distinct from 'jury'
     or v_preflight.show_id is distinct from new.show_id
     or v_preflight.canonical_edition_id is distinct from new.edition_id
     or v_preflight.account_user_id is distinct from new.user_id
     or v_preflight.jury_ballot_submission_id is distinct from new.id
     or v_preflight.submitted_at is null then
    raise exception 'Jury ballot submission must bind to its exact completed integrity preflight'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.jury_ballot_statuses status_row
    where status_row.show_id = new.show_id
      and status_row.status = 'did_not_vote'
      and (
        (status_row.voter_id is not null and status_row.voter_id = new.voter_id)
        or (
          status_row.voter_entity_id is not null
          and status_row.voter_entity_id = new.voter_entity_id
        )
        or (
          status_row.voter_country_id is not null
          and status_row.voter_country_id = new.voter_country_id
        )
      )
  ) then
    raise exception 'A submitted jury ballot cannot coexist with did-not-vote state'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_validate_jury_vote_ballot_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_ballot public.jury_ballot_submissions;
  v_show_edition_id uuid;
begin
  if new.show_id is not null then
    select show_row.edition_id
    into v_show_edition_id
    from public.shows show_row
    where show_row.id = new.show_id;

    if v_show_edition_id is null
       or v_show_edition_id is distinct from new.edition_id then
      raise exception 'Jury vote must use the edition owned by its show'
        using errcode = '23514';
    end if;
  end if;

  if new.ballot_submission_id is null then
    return new;
  end if;

  select ballot.*
  into v_ballot
  from public.jury_ballot_submissions ballot
  where ballot.id = new.ballot_submission_id;

  if v_ballot.id is null
     or new.show_id is distinct from v_ballot.show_id
     or new.edition_id is distinct from v_ballot.edition_id
     or new.voter_country_id is distinct from v_ballot.voter_country_id
     or (
       v_ballot.voter_id is not null
       and new.voter_id is distinct from v_ballot.voter_id
     )
     or (
       v_ballot.voter_entity_id is not null
       and new.voter_entity_id is distinct from v_ballot.voter_entity_id
     ) then
    raise exception 'Linked jury vote must remain inside its exact ballot scope'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_validate_jury_window_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_show_edition_id uuid;
begin
  select show_row.edition_id
  into v_show_edition_id
  from public.shows show_row
  where show_row.id = new.show_id;

  if v_show_edition_id is null
     or v_show_edition_id is distinct from new.edition_id then
    raise exception 'Jury voting window must use the edition owned by its show'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_validate_publication_control()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_has_outcomes boolean;
  v_show_updated_at timestamptz;
begin
  if tg_op = 'UPDATE' then
    if new.version <> old.version + 1 then
      raise exception 'Publication control version must advance exactly once'
        using errcode = '23514';
    end if;

    if new.state is distinct from old.state
       and not private.studio2_show_publication_transition_allowed(old.state, new.state) then
      raise exception 'Invalid publication transition: % -> %', old.state, new.state
        using errcode = '23514';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-results:' || new.show_id::text, 0)
  );

  v_has_outcomes := private.studio2_publication_has_outcomes(new.frozen_config);

  if new.state in ('scheduled', 'public') and v_has_outcomes then
    if new.source_result_version is null then
      raise exception 'Outcome publication requires an exact immutable result version'
        using errcode = '23514';
    end if;

    if not private.v3_publication_result_version_release_ready(
      new.show_id,
      new.source_result_version
    ) then
      raise exception 'Publication result version is not the exact current reviewed, locked and reveal-ready result'
        using errcode = '23514';
    end if;
  elsif new.state in ('scheduled', 'public')
        and not v_has_outcomes
        and new.source_result_version is not null then
    raise exception 'Publication without outcome layers must not claim result-version provenance'
      using errcode = '23514';
  end if;

  if new.state = 'scheduled' then
    select show.updated_at
    into v_show_updated_at
    from public.shows show
    where show.id = new.show_id;

    if v_show_updated_at is null
       or new.source_show_updated_at is distinct from v_show_updated_at then
      raise exception 'Scheduled publication must bind the exact current show version'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.v3_validate_show_publication_projection()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_show_id uuid;
  v_show public.shows;
  v_control public.studio2_show_publication_controls;
  v_has_outcomes boolean;
begin
  if tg_table_name = 'shows' then
    v_show_id := coalesce(new.id, old.id);
  else
    v_show_id := coalesce(new.show_id, old.show_id);
  end if;

  select * into v_show
  from public.shows show
  where show.id = v_show_id;

  if v_show.id is null then
    return null;
  end if;

  select * into v_control
  from public.studio2_show_publication_controls control
  where control.show_id = v_show_id;

  if v_control.show_id is null then
    raise exception 'Show publication projection is missing its canonical control row'
      using errcode = '23503';
  end if;

  if v_control.state = 'public' then
    if not coalesce(v_show.published, false) then
      raise exception 'Public publication control requires the show public projection'
        using errcode = '23514';
    end if;

    if v_control.last_failure is null
       and private.studio2_normalise_publication_config(v_show.publication_config)
         is distinct from v_control.frozen_config then
      raise exception 'Public show projection differs from canonical publication configuration'
        using errcode = '23514';
    end if;

    v_has_outcomes := private.studio2_publication_has_outcomes(v_show.publication_config);
    if v_has_outcomes then
      if v_control.source_result_version is null
         or not private.v3_publication_result_version_release_ready(
           v_show_id,
           v_control.source_result_version
         ) then
        raise exception 'Public outcome projection lacks exact finalized result-version provenance'
          using errcode = '23514';
      end if;
    end if;

  elsif v_control.state in ('draft', 'hidden') then
    if coalesce(v_show.published, false) then
      raise exception 'Private publication control cannot leave the show public'
        using errcode = '23514';
    end if;

  elsif v_control.state = 'scheduled' then
    if coalesce(v_show.published, false)
       is distinct from (v_control.scheduled_from_state = 'public') then
      raise exception 'Scheduled publication no longer reflects its frozen source state'
        using errcode = '23514';
    end if;
  end if;

  return null;
end
$function$;

CREATE OR REPLACE FUNCTION public.protect_confirmation_synced_entry_default()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.show_id is null
     and new.notes = 'Synced from Confirmations'
     and coalesce(new.publication_source, 'legacy') = 'legacy'
     and coalesce(new.publication_overridden, false) = false then
    new.publication_status := 'draft';
    new.scheduled_publish_at := null;
    new.published_at := null;
    new.publication_source := 'confirmation';
    new.publication_overridden := false;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_submission_browser()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.browser_session_id is not null and trim(new.browser_session_id) <> '' then
    insert into public.submission_browser_sessions(submission_id, browser_session_id)
    values (new.id, new.browser_session_id)
    on conflict (submission_id, browser_session_id) do update
    set last_used_at = now();
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.rerank_results_after_voting_config_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.voting_config is distinct from new.voting_config then
    perform public.sync_show_results_from_votes(new.id);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.show_publication_enabled(_show_id uuid, _key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.shows s
    where s.id = _show_id
      and s.published = true
      and s.publication_config ->> _key = 'true'
  );
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

CREATE OR REPLACE FUNCTION public.studio2_complete_domain_event_delivery(p_event_id uuid, p_consumer_key text, p_worker_id text, p_result_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_delivery private.v3_domain_event_outbox;
  v_replayed boolean := false;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_event_id is null
     or p_consumer_key is null
     or p_consumer_key !~ '^[a-z][a-z0-9_.:-]{0,159}$'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or jsonb_typeof(coalesce(p_result_metadata, '{}'::jsonb)) <> 'object'
     or pg_column_size(coalesce(p_result_metadata, '{}'::jsonb)) > 8192 then
    raise exception 'Invalid domain event completion parameters' using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Domain event delivery was not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from private.v3_domain_event_consumer_receipts consumed
    where consumed.event_id = p_event_id
      and consumed.consumer_key = p_consumer_key
  ) then
    v_replayed := true;
  else
    if v_delivery.status <> 'processing'
       or v_delivery.lease_owner is distinct from p_worker_id
       or v_delivery.lease_expires_at <= now() then
      raise exception 'Domain event delivery lease is no longer owned by this worker'
        using errcode = '40001';
    end if;

    insert into private.v3_domain_event_consumer_receipts (
      event_id, consumer_key, result_metadata
    ) values (
      p_event_id, p_consumer_key, coalesce(p_result_metadata, '{}'::jsonb)
    );
  end if;

  update private.v3_domain_event_outbox
  set status = 'completed',
      lease_owner = null,
      lease_expires_at = null,
      completed_at = coalesce(completed_at, now()),
      dead_lettered_at = null,
      updated_at = now()
  where event_id = p_event_id
    and consumer_key = p_consumer_key;

  return jsonb_build_object(
    'ok', true,
    'replayed', v_replayed,
    'eventId', p_event_id,
    'consumerKey', p_consumer_key,
    'status', 'completed'
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.studio2_transition_edition_v2(p_edition_id uuid, p_to text, p_reason text DEFAULT NULL::text, p_approval_request_id uuid DEFAULT NULL::uuid)
 RETURNS studio2_edition_runtime
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_runtime public.studio2_edition_runtime%rowtype;
  v_status text;
  v_from text;
  v_risk text;
  v_reason text := nullif(btrim(p_reason), '');
  v_required_capability text;
  v_approval public.studio2_transition_approval_requests%rowtype;
begin
  if p_edition_id is null or p_to is null then
    raise exception 'Edition id and target state are required' using errcode = '22023';
  end if;

  v_required_capability := case
    when p_to = 'archived' then 'edition.archive'
    else 'edition.manage'
  end;

  if not public.studio2_access_allowed(v_required_capability, p_edition_id, false) then
    raise exception 'Missing Solaris capability: %', v_required_capability using errcode = '42501';
  end if;

  select * into v_runtime
  from public.studio2_edition_runtime
  where edition_id = p_edition_id
  for update;

  if not found then
    select e.status into v_status
    from public.editions e
    where e.id = p_edition_id;

    if not found then
      raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
    end if;

    insert into public.studio2_edition_runtime (
      edition_id, state, subsystems, updated_by
    ) values (
      p_edition_id,
      private.studio2_normalize_legacy_edition_status(v_status),
      private.studio2_default_subsystems(private.studio2_normalize_legacy_edition_status(v_status)),
      v_actor
    )
    on conflict (edition_id) do nothing;

    select * into v_runtime
    from public.studio2_edition_runtime
    where edition_id = p_edition_id
    for update;
  end if;

  v_from := v_runtime.state;
  v_risk := private.studio2_transition_risk(v_from, p_to);

  if v_risk is null then
    raise exception 'Illegal edition state transition: % -> %', v_from, p_to using errcode = '22023';
  end if;

  if v_risk in ('elevated', 'critical') and v_reason is null then
    raise exception 'A reason is required for % edition transitions', v_risk using errcode = '22023';
  end if;

  if v_risk = 'critical' then
    if v_actor is null or p_approval_request_id is null then
      raise exception 'An approved second-person request is required for critical edition transitions'
        using errcode = '42501';
    end if;

    select * into v_approval
    from public.studio2_transition_approval_requests
    where id = p_approval_request_id
    for update;

    if not found
       or v_approval.edition_id <> p_edition_id
       or v_approval.from_state <> v_from
       or v_approval.to_state <> p_to
       or v_approval.requested_by <> v_actor
       or v_approval.approved_by is null
       or v_approval.approved_by = v_actor
       or v_approval.approved_at is null
       or v_approval.consumed_at is not null
       or v_approval.expires_at <= now()
       or v_approval.reason <> v_reason then
      raise exception 'Critical transition approval is missing, stale, mismatched, or already consumed'
        using errcode = '42501';
    end if;
  elsif p_approval_request_id is not null then
    raise exception 'Approval request ids are only valid for critical transitions' using errcode = '22023';
  end if;

  update public.studio2_edition_runtime
  set state = p_to,
      subsystems = private.studio2_default_subsystems(p_to),
      version = version + 1,
      updated_by = v_actor
  where edition_id = p_edition_id
  returning * into v_runtime;

  if v_risk = 'critical' then
    update public.studio2_transition_approval_requests
    set consumed_at = now()
    where id = v_approval.id;
  end if;

  insert into public.studio2_contest_events (
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    p_edition_id,
    'edition.state_changed',
    v_actor,
    'edition',
    p_edition_id::text,
    jsonb_build_object(
      'from', v_from,
      'to', p_to,
      'risk', v_risk,
      'reason', v_reason,
      'approvalRequestId', case when v_risk = 'critical' then v_approval.id else null end,
      'secondApproverUserId', case when v_risk = 'critical' then v_approval.approved_by else null end
    )
  );

  return v_runtime;
end
$function$;

CREATE OR REPLACE FUNCTION public.sync_confirmation_entry_youtube_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.source = 'confirmations'
     and new.country_id is not null
     and new.edition_id is not null
     and new.song_url is not null
     and (
       new.song_url ~* '^https://((www|music)\.)?youtube\.com/'
       or new.song_url ~* '^https://youtu\.be/'
     ) then
    update public.participants p
    set youtube_url = new.song_url
    where p.edition_id = new.edition_id
      and p.country_id = new.country_id
      and p.youtube_url is distinct from new.song_url;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_edition_design_to_shows()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.shows set theme_id = new.theme_id, broadcast_config = coalesce(new.broadcast_config, '{}'::jsonb) where edition_id = new.id;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_edition_palette_after_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.theme_colors is distinct from new.theme_colors then
    perform public.sync_edition_palette_to_linked_themes(new.id);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_edition_publication_from_shows()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old_edition uuid;
  v_new_edition uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_edition := old.edition_id;
  end if;

  if tg_op <> 'DELETE' then
    v_new_edition := new.edition_id;
  end if;

  if v_old_edition is not null then
    update public.editions e
    set
      published = exists (
        select 1
        from public.shows s
        where s.edition_id = v_old_edition
          and s.published = true
      ),
      status = case
        when exists (
          select 1
          from public.shows s
          where s.edition_id = v_old_edition
            and s.published = true
        ) and lower(coalesce(e.status, '')) = 'draft' then 'active'
        when not exists (
          select 1
          from public.shows s
          where s.edition_id = v_old_edition
            and s.published = true
        ) and lower(coalesce(e.status, '')) not in ('complete', 'completed') then 'draft'
        else e.status
      end
    where e.id = v_old_edition;
  end if;

  if v_new_edition is not null and v_new_edition is distinct from v_old_edition then
    update public.editions e
    set
      published = exists (
        select 1
        from public.shows s
        where s.edition_id = v_new_edition
          and s.published = true
      ),
      status = case
        when exists (
          select 1
          from public.shows s
          where s.edition_id = v_new_edition
            and s.published = true
        ) and lower(coalesce(e.status, '')) = 'draft' then 'active'
        when not exists (
          select 1
          from public.shows s
          where s.edition_id = v_new_edition
            and s.published = true
        ) and lower(coalesce(e.status, '')) not in ('complete', 'completed') then 'draft'
        else e.status
      end
    where e.id = v_new_edition;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_edition_year_from_event_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.event_date is not null then
    new.year := extract(year from new.event_date)::integer;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_participant_entry_details()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_artist text;
  v_song text;
BEGIN
  -- Prevent the sibling updates below from recursively syncing again.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- A newly supplied non-null value is authoritative. Null must never erase
  -- a value already known for the same edition entry.
  v_artist := NEW.artist;
  v_song := NEW.song;

  IF v_artist IS NULL THEN
    SELECT p.artist
      INTO v_artist
    FROM public.participants p
    WHERE p.id <> NEW.id
      AND public.participant_same_edition_identity(
        NEW.edition_id, NEW.country_id, NEW.contest_entity_id,
        p.edition_id, p.country_id, p.contest_entity_id
      )
      AND p.artist IS NOT NULL
    ORDER BY p.updated_at DESC, p.created_at DESC, p.id DESC
    LIMIT 1;
  END IF;

  IF v_song IS NULL THEN
    SELECT p.song
      INTO v_song
    FROM public.participants p
    WHERE p.id <> NEW.id
      AND public.participant_same_edition_identity(
        NEW.edition_id, NEW.country_id, NEW.contest_entity_id,
        p.edition_id, p.country_id, p.contest_entity_id
      )
      AND p.song IS NOT NULL
    ORDER BY p.updated_at DESC, p.created_at DESC, p.id DESC
    LIMIT 1;
  END IF;

  UPDATE public.participants p
  SET
    artist = COALESCE(v_artist, p.artist),
    song = COALESCE(v_song, p.song)
  WHERE public.participant_same_edition_identity(
      NEW.edition_id, NEW.country_id, NEW.contest_entity_id,
      p.edition_id, p.country_id, p.contest_entity_id
    )
    AND (
      (v_artist IS NOT NULL AND p.artist IS DISTINCT FROM v_artist)
      OR (v_song IS NOT NULL AND p.song IS DISTINCT FROM v_song)
    );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_qualifiers_after_result_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_show_qualifiers(old.show_id);
    return old;
  end if;

  perform public.refresh_show_qualifiers(new.show_id);

  if tg_op = 'UPDATE' and old.show_id is distinct from new.show_id then
    perform public.refresh_show_qualifiers(old.show_id);
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_qualifiers_after_show_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.refresh_edition_qualifications(new.edition_id);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_results_after_participant_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.sync_show_results_from_votes(coalesce(new.show_id, old.show_id));
  if tg_op = 'UPDATE' and new.show_id is distinct from old.show_id then
    perform public.sync_show_results_from_votes(old.show_id);
  end if;
  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_results_after_vote_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.sync_show_results_from_votes(coalesce(new.show_id, old.show_id));
  if tg_op = 'UPDATE' and new.show_id is distinct from old.show_id then
    perform public.sync_show_results_from_votes(old.show_id);
  end if;
  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_round_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  rid uuid;
begin
  rid := case when tg_op = 'DELETE' then old.round_id else new.round_id end;

  insert into public.round_stats(round_id, submitted_count, updated_at)
  values (
    rid,
    (select count(*) from public.submissions where round_id = rid),
    now()
  )
  on conflict (round_id) do update
  set submitted_count = excluded.submitted_count,
      updated_at = now();

  return null;
end
$function$;

CREATE OR REPLACE FUNCTION televoting.block_sanctioned_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'televoting', 'pg_temp'
AS $function$
declare v_hod uuid; v_sanction televoting.voter_sanctions%rowtype;
begin
  select check_row.hod_person_id into v_hod from televoting.vote_preflight_checks check_row
  where check_row.round_id=new.round_id and check_row.username_normalized=new.username_normalized and upper(check_row.country_code)=upper(new.country_code)
    and check_row.submitted_at is null and check_row.expires_at>now()
  order by check_row.created_at desc limit 1;
  select * into v_sanction from televoting.voter_sanctions sanction
  where sanction.revoked_at is null and sanction.active_from<=now() and (sanction.expires_at is null or sanction.expires_at>now())
    and televoting.integrity_sanction_matches(sanction.scope_type,sanction.hod_person_id,sanction.country_code,sanction.username_normalized,v_hod,new.country_code,new.username_normalized)
  limit 1;
  if found then raise exception 'Your SSC televoting access is suspended by an organizer decision.' using errcode='42501'; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION televoting.enforce_robust_round_combined_input()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'televoting', 'pg_temp'
AS $function$
declare
  v_engine text;
begin
  if new.source_round_id is null then
    return new;
  end if;

  select r.televote_engine_version into v_engine
  from televoting.rounds r
  where r.id = new.source_round_id;

  if v_engine = 'robust-televote-v2' then
    new.input_mode := 'converted_points';
    new.calculation_method := 'rescaled';
    new.calculation_stage := 'pre_conversion';
  end if;

  return new;
end $function$;

CREATE OR REPLACE FUNCTION televoting.flag_aggregation_outdated()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'televoting', 'pg_temp'
AS $function$
declare v_agg uuid;
begin
  if tg_table_name = 'external_score_entries' then
    select s.aggregation_id into v_agg from televoting.televote_aggregation_sources s where s.id = coalesce(new.source_id,old.source_id);
  else
    v_agg := coalesce(new.aggregation_id,old.aggregation_id);
  end if;
  update televoting.televote_aggregations set results_outdated = true where id = v_agg and calculation_version > 0;
  return coalesce(new,old);
end $function$;

CREATE OR REPLACE FUNCTION televoting.flag_round_results_outdated()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'televoting', 'pg_temp'
AS $function$
declare v_round uuid;
begin
  v_round := coalesce(new.round_id, old.round_id);
  update televoting.rounds set results_outdated = true where id = v_round and calculation_version > 0;
  return coalesce(new,old);
end $function$;

CREATE OR REPLACE FUNCTION televoting.round_entries_normalize()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'televoting', 'pg_temp'
AS $function$
begin
  if new.entry_type = 'country' then
    new.entry_key := new.country_code;
  elsif tg_op = 'INSERT' then
    new.entry_key := coalesce(
      nullif(btrim(new.entry_key), ''),
      'x_' || encode(extensions.gen_random_bytes(6), 'hex')
    );
  else
    new.entry_key := old.entry_key;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION televoting.round_entries_sync_countries()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'televoting', 'pg_temp'
AS $function$
begin
  if tg_op = 'DELETE' then
    if old.entry_type = 'country' then
      delete from televoting.round_countries where round_id = old.round_id and country_code = old.country_code;
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.entry_type = 'country' and (new.entry_type <> 'country' or new.country_code is distinct from old.country_code) then
    delete from televoting.round_countries where round_id = old.round_id and country_code = old.country_code;
  end if;
  if new.entry_type = 'country' then
    delete from televoting.round_countries where round_id = new.round_id and country_code <> new.country_code and display_order = new.display_order;
    insert into televoting.round_countries(round_id,country_code,display_order)
    values(new.round_id,new.country_code,new.display_order)
    on conflict (round_id,country_code) do update set display_order = excluded.display_order;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION televoting.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'televoting', 'pg_temp'
AS $function$
begin
  new.updated_at := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

-- Constraint dependency sourced from read-only hosted catalog (pg_depend).
CREATE OR REPLACE FUNCTION private.v3_normalize_entry_credits(p_credits jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare
  v_item jsonb;
  v_role text;
  v_name text;
  v_normalized jsonb := '[]'::jsonb;
  v_count integer;
begin
  if p_credits is null or p_credits = 'null'::jsonb then
    return '[]'::jsonb;
  end if;

  if jsonb_typeof(p_credits) <> 'array' then
    raise exception 'Entry credits must be a JSON array' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_credits);
  if v_count > 32 then
    raise exception 'Entry credits may contain at most 32 records' using errcode = '54000';
  end if;

  for v_item in select value from jsonb_array_elements(p_credits)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each Entry credit must be an object' using errcode = '22023';
    end if;
    if (v_item - array['role', 'name']::text[]) <> '{}'::jsonb then
      raise exception 'Entry credit contains unsupported fields' using errcode = '22023';
    end if;

    v_role := lower(btrim(coalesce(v_item ->> 'role', '')));
    v_name := btrim(regexp_replace(coalesce(v_item ->> 'name', ''), '[[:space:]]+', ' ', 'g'));

    if v_role not in ('composer', 'lyricist', 'songwriter', 'producer', 'arranger', 'other') then
      raise exception 'Unknown Entry credit role: %', v_role using errcode = '22023';
    end if;
    if v_name = '' or char_length(v_name) > 160 then
      raise exception 'Entry credit name must contain 1 to 160 characters' using errcode = '22023';
    end if;

    if v_normalized @> jsonb_build_array(jsonb_build_object('role', v_role, 'name', v_name)) then
      raise exception 'Duplicate Entry credit: % / %', v_role, v_name using errcode = '22023';
    end if;

    v_normalized := v_normalized || jsonb_build_array(
      jsonb_build_object('role', v_role, 'name', v_name)
    );
  end loop;

  return v_normalized;
end
$function$;

-- All observed check/unique/primary constraints before FK references.

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

ALTER TABLE "public"."editions" ADD CONSTRAINT "editions_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."editions" ADD CONSTRAINT "editions_slug_key" UNIQUE (slug);

ALTER TABLE "public"."entries" ADD CONSTRAINT "entries_edition_id_country_id_key" UNIQUE (edition_id, country_id);

ALTER TABLE "public"."entries" ADD CONSTRAINT "entries_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."entries" ADD CONSTRAINT "entries_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'withdrawn'::text, 'disqualified'::text]));

ALTER TABLE "public"."internal_entries" ADD CONSTRAINT "internal_entries_credits_canonical_check" CHECK (credits = private.v3_normalize_entry_credits(credits));

ALTER TABLE "public"."internal_entries" ADD CONSTRAINT "internal_entries_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."internal_entries" ADD CONSTRAINT "internal_entries_review_status_check" CHECK (review_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text]));

ALTER TABLE "public"."internal_entries" ADD CONSTRAINT "internal_entries_submission_id_key" UNIQUE (submission_id);


ALTER TABLE "public"."jury_ballot_statuses" ADD CONSTRAINT "jury_ballot_status_identity_chk" CHECK (voter_id IS NOT NULL OR voter_country_id IS NOT NULL OR voter_entity_id IS NOT NULL);

ALTER TABLE "public"."jury_ballot_statuses" ADD CONSTRAINT "jury_ballot_statuses_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."jury_ballot_statuses" ADD CONSTRAINT "jury_ballot_statuses_status_check" CHECK (status = 'did_not_vote'::text);

ALTER TABLE "public"."jury_ballot_statuses" ADD CONSTRAINT "jury_ballot_statuses_timeline_v3_check" CHECK (version >= 1 AND changed_at >= created_at AND updated_at >= created_at);


ALTER TABLE "public"."jury_ballot_submissions" ADD CONSTRAINT "jury_ballot_submissions_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."jury_ballot_submissions" ADD CONSTRAINT "jury_ballot_submissions_preflight_id_key" UNIQUE (preflight_id);

ALTER TABLE "public"."jury_ballot_submissions" ADD CONSTRAINT "jury_ballot_submissions_review_lifecycle_v3_check" CHECK (review_version >= 1 AND submitted_at <= updated_at AND (status = 'submitted'::text AND reviewed_at IS NULL AND reviewed_by IS NULL AND review_reason IS NULL OR status = 'valid'::text AND reviewed_at IS NOT NULL AND reviewed_at >= submitted_at OR (status = ANY (ARRAY['needs_review'::text, 'invalidated'::text, 'superseded'::text])) AND reviewed_at IS NOT NULL AND reviewed_at >= submitted_at AND NULLIF(btrim(review_reason), ''::text) IS NOT NULL));

ALTER TABLE "public"."jury_ballot_submissions" ADD CONSTRAINT "jury_ballot_submissions_risk_score_check" CHECK (risk_score >= 0 AND risk_score <= 100);

ALTER TABLE "public"."jury_ballot_submissions" ADD CONSTRAINT "jury_ballot_submissions_show_id_voter_country_id_key" UNIQUE (show_id, voter_country_id);

ALTER TABLE "public"."jury_ballot_submissions" ADD CONSTRAINT "jury_ballot_submissions_status_check" CHECK (status = ANY (ARRAY['submitted'::text, 'valid'::text, 'needs_review'::text, 'invalidated'::text, 'superseded'::text]));


ALTER TABLE "public"."jury_votes" ADD CONSTRAINT "jury_votes_check" CHECK (voter_country_id <> receiving_country_id);

ALTER TABLE "public"."jury_votes" ADD CONSTRAINT "jury_votes_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."jury_votes" ADD CONSTRAINT "jury_votes_points_positive" CHECK (points > 0);

ALTER TABLE "public"."jury_votes" ADD CONSTRAINT "jury_votes_recipient_identity_chk" CHECK (receiving_country_id IS NOT NULL OR receiving_entity_id IS NOT NULL);

ALTER TABLE "public"."jury_votes" ADD CONSTRAINT "jury_votes_voter_identity_check" CHECK (voter_id IS NOT NULL OR voter_country_id IS NOT NULL OR voter_entity_id IS NOT NULL);


ALTER TABLE "public"."jury_voting_windows" ADD CONSTRAINT "jury_voting_windows_lifecycle_v3_check" CHECK (status = 'open'::text AND opened_at IS NOT NULL AND closed_at IS NULL OR status = 'closed'::text AND (opened_at IS NULL OR closed_at IS NOT NULL AND closed_at >= opened_at));

ALTER TABLE "public"."jury_voting_windows" ADD CONSTRAINT "jury_voting_windows_pkey" PRIMARY KEY (show_id);

ALTER TABLE "public"."jury_voting_windows" ADD CONSTRAINT "jury_voting_windows_status_check" CHECK (status = ANY (ARRAY['open'::text, 'closed'::text]));

ALTER TABLE "public"."national_final_entries" ADD CONSTRAINT "national_final_entries_credits_canonical_check" CHECK (credits = private.v3_normalize_entry_credits(credits));

ALTER TABLE "public"."national_final_entries" ADD CONSTRAINT "national_final_entries_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."national_final_entries" ADD CONSTRAINT "national_final_entries_review_status_check" CHECK (review_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'removed'::text]));


ALTER TABLE "public"."national_finals" ADD CONSTRAINT "national_finals_owner_source_check" CHECK (submission_id IS NOT NULL OR country_id IS NOT NULL);

ALTER TABLE "public"."national_finals" ADD CONSTRAINT "national_finals_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."national_finals" ADD CONSTRAINT "national_finals_results_require_lineup_check" CHECK (NOT results_published OR lineup_published);

ALTER TABLE "public"."national_finals" ADD CONSTRAINT "national_finals_source_check" CHECK (source = ANY (ARRAY['confirmation'::text, 'manual'::text]));

ALTER TABLE "public"."national_finals" ADD CONSTRAINT "national_finals_submission_id_key" UNIQUE (submission_id);

ALTER TABLE "public"."next_in_line_responses" ADD CONSTRAINT "next_in_line_responses_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."next_in_line_responses" ADD CONSTRAINT "next_in_line_responses_selection_type_check" CHECK (selection_type = ANY (ARRAY['internal'::text, 'national_final'::text, 'unknown'::text]));

ALTER TABLE "public"."next_in_line_submissions" ADD CONSTRAINT "next_in_line_submissions_artist_length_v3_check" CHECK (artist IS NULL OR length(artist) <= 160);

ALTER TABLE "public"."next_in_line_submissions" ADD CONSTRAINT "next_in_line_submissions_country_length_v3_check" CHECK (length(country) >= 1 AND length(country) <= 80);

ALTER TABLE "public"."next_in_line_submissions" ADD CONSTRAINT "next_in_line_submissions_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."next_in_line_submissions" ADD CONSTRAINT "next_in_line_submissions_preview_end_length_v3_check" CHECK (preview_end IS NULL OR length(preview_end) <= 10);

ALTER TABLE "public"."next_in_line_submissions" ADD CONSTRAINT "next_in_line_submissions_preview_start_length_v3_check" CHECK (preview_start IS NULL OR length(preview_start) <= 10);

ALTER TABLE "public"."next_in_line_submissions" ADD CONSTRAINT "next_in_line_submissions_revision_v3_check" CHECK (revision > 0);

ALTER TABLE "public"."next_in_line_submissions" ADD CONSTRAINT "next_in_line_submissions_selection_type_check" CHECK (selection_type = ANY (ARRAY['none'::text, 'unknown'::text, 'internal'::text, 'national_final'::text]));

ALTER TABLE "public"."next_in_line_submissions" ADD CONSTRAINT "next_in_line_submissions_song_length_v3_check" CHECK (song_title IS NULL OR length(song_title) <= 160);

ALTER TABLE "public"."next_in_line_submissions" ADD CONSTRAINT "next_in_line_submissions_url_length_v3_check" CHECK (song_url IS NULL OR length(song_url) <= 500);

ALTER TABLE "public"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_route_check" CHECK (route ~~ '/%'::text);

ALTER TABLE "public"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'suppressed'::text]));

ALTER TABLE "public"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_dedupe_key_key" UNIQUE (user_id, dedupe_key);

ALTER TABLE "public"."participants" ADD CONSTRAINT "participants_identity_chk" CHECK (country_id IS NOT NULL OR contest_entity_id IS NOT NULL);

ALTER TABLE "public"."participants" ADD CONSTRAINT "participants_participation_status_check" CHECK (participation_status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'waitlist'::text, 'withdrawn'::text, 'disqualified'::text]));

ALTER TABLE "public"."participants" ADD CONSTRAINT "participants_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."participants" ADD CONSTRAINT "participants_publication_source_check" CHECK (publication_source = ANY (ARRAY['legacy'::text, 'manual'::text, 'confirmation'::text]));

ALTER TABLE "public"."participants" ADD CONSTRAINT "participants_publication_status_check" CHECK (publication_status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'published'::text]));

ALTER TABLE "public"."participants" ADD CONSTRAINT "participants_running_order_allocation_check" CHECK (running_order_allocation IS NULL OR (running_order_allocation = ANY (ARRAY['first_half'::text, 'second_half'::text, 'producer_choice'::text])));

ALTER TABLE "public"."results" ADD CONSTRAINT "results_identity_chk" CHECK (country_id IS NOT NULL OR contest_entity_id IS NOT NULL);

ALTER TABLE "public"."results" ADD CONSTRAINT "results_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."results" ADD CONSTRAINT "results_televote_components_array_chk" CHECK (jsonb_typeof(televote_components) = 'array'::text);

ALTER TABLE "public"."shows" ADD CONSTRAINT "shows_lineup_stage_check" CHECK (lineup_stage = ANY (ARRAY['lineup'::text, 'allocation'::text, 'running_order'::text]));

ALTER TABLE "public"."shows" ADD CONSTRAINT "shows_pkey" PRIMARY KEY (id);


ALTER TABLE "public"."studio2_confirmation_requirements" ADD CONSTRAINT "studio2_confirmation_requirem_edition_id_country_id_generat_key" UNIQUE (edition_id, country_id, generation);

ALTER TABLE "public"."studio2_confirmation_requirements" ADD CONSTRAINT "studio2_confirmation_requirement_invalidation_check" CHECK (status <> 'invalidated'::text OR invalidated_at IS NOT NULL AND invalidated_reason IS NOT NULL);

ALTER TABLE "public"."studio2_confirmation_requirements" ADD CONSTRAINT "studio2_confirmation_requirement_lifecycle_v3_check" CHECK (status = 'required'::text AND superseded_at IS NULL AND resolved_at IS NULL AND resolved_by_submission_id IS NULL AND invalidated_at IS NULL AND invalidated_by IS NULL AND invalidated_reason IS NULL OR (status = ANY (ARRAY['satisfied'::text, 'waived'::text])) AND superseded_at IS NULL AND resolved_at IS NOT NULL AND invalidated_at IS NULL AND invalidated_by IS NULL AND invalidated_reason IS NULL OR status = 'invalidated'::text AND superseded_at IS NOT NULL AND invalidated_at IS NOT NULL AND NULLIF(btrim(invalidated_reason), ''::text) IS NOT NULL AND superseded_at >= invalidated_at);

ALTER TABLE "public"."studio2_confirmation_requirements" ADD CONSTRAINT "studio2_confirmation_requirement_resolution_check" CHECK (status = 'required'::text AND resolved_at IS NULL OR (status = ANY (ARRAY['satisfied'::text, 'waived'::text])) AND resolved_at IS NOT NULL OR status = 'invalidated'::text);

ALTER TABLE "public"."studio2_confirmation_requirements" ADD CONSTRAINT "studio2_confirmation_requirements_generation_check" CHECK (generation >= 1);

ALTER TABLE "public"."studio2_confirmation_requirements" ADD CONSTRAINT "studio2_confirmation_requirements_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."studio2_confirmation_requirements" ADD CONSTRAINT "studio2_confirmation_requirements_reason_check" CHECK (length(btrim(reason)) >= 3);

ALTER TABLE "public"."studio2_confirmation_requirements" ADD CONSTRAINT "studio2_confirmation_requirements_status_check" CHECK (status = ANY (ARRAY['required'::text, 'satisfied'::text, 'waived'::text, 'invalidated'::text]));

ALTER TABLE "public"."studio2_contest_events" ADD CONSTRAINT "studio2_contest_events_payload_object_check" CHECK (jsonb_typeof(payload) = 'object'::text);

ALTER TABLE "public"."studio2_contest_events" ADD CONSTRAINT "studio2_contest_events_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."studio2_contest_events" ADD CONSTRAINT "studio2_contest_events_type_check" CHECK (type = ANY (ARRAY['edition.created'::text, 'edition.state_changed'::text, 'edition.archived'::text, 'edition.transition_approval_requested'::text, 'edition.transition_approval_granted'::text, 'confirmation.opened'::text, 'confirmation.closed'::text, 'country.confirmed'::text, 'entry.submitted'::text, 'entry.changed'::text, 'entry.locked'::text, 'jury.opened'::text, 'jury.closed'::text, 'jury.ballot_submitted'::text, 'televote.opened'::text, 'televote.closed'::text, 'televote.ballot_submitted'::text, 'vote.flagged'::text, 'integrity.case_created'::text, 'integrity.case_closed'::text, 'results.calculated'::text, 'results.verified'::text, 'results.published'::text, 'broadcast.segment_started'::text, 'broadcast.segment_completed'::text, 'incident.created'::text, 'incident.updated'::text, 'incident.resolved'::text, 'notice.sent'::text, 'notice.acknowledged'::text, 'rule.changed'::text, 'storyline.generated'::text, 'storyline.updated'::text, 'storyline.published'::text, 'storyline.unpublished'::text]));

ALTER TABLE "public"."studio2_edition_runtime" ADD CONSTRAINT "studio2_edition_runtime_pkey" PRIMARY KEY (edition_id);

ALTER TABLE "public"."studio2_edition_runtime" ADD CONSTRAINT "studio2_edition_runtime_state_check" CHECK (state = ANY (ARRAY['draft'::text, 'planning'::text, 'host_selection'::text, 'confirmations'::text, 'submissions'::text, 'pre_show'::text, 'rehearsals'::text, 'jury_voting'::text, 'live_show'::text, 'televoting'::text, 'vote_verification'::text, 'results'::text, 'post_edition'::text, 'archived'::text]));

ALTER TABLE "public"."studio2_edition_runtime" ADD CONSTRAINT "studio2_edition_runtime_subsystems_object_check" CHECK (jsonb_typeof(subsystems) = 'object'::text);

ALTER TABLE "public"."studio2_edition_runtime" ADD CONSTRAINT "studio2_edition_runtime_subsystems_shape_check" CHECK (subsystems ?& ARRAY['confirmations'::text, 'submissions'::text, 'juryVoting'::text, 'televoting'::text, 'results'::text, 'predictions'::text] AND ((subsystems ->> 'confirmations'::text) = ANY (ARRAY['not_started'::text, 'open'::text, 'paused'::text, 'closed'::text, 'locked'::text, 'verified'::text, 'published'::text])) AND ((subsystems ->> 'submissions'::text) = ANY (ARRAY['not_started'::text, 'open'::text, 'paused'::text, 'closed'::text, 'locked'::text, 'verified'::text, 'published'::text])) AND ((subsystems ->> 'juryVoting'::text) = ANY (ARRAY['not_started'::text, 'open'::text, 'paused'::text, 'closed'::text, 'locked'::text, 'verified'::text, 'published'::text])) AND ((subsystems ->> 'televoting'::text) = ANY (ARRAY['not_started'::text, 'open'::text, 'paused'::text, 'closed'::text, 'locked'::text, 'verified'::text, 'published'::text])) AND ((subsystems ->> 'results'::text) = ANY (ARRAY['not_started'::text, 'open'::text, 'paused'::text, 'closed'::text, 'locked'::text, 'verified'::text, 'published'::text])) AND ((subsystems ->> 'predictions'::text) = ANY (ARRAY['not_started'::text, 'open'::text, 'paused'::text, 'closed'::text, 'locked'::text, 'verified'::text, 'published'::text])));

ALTER TABLE "public"."studio2_edition_runtime" ADD CONSTRAINT "studio2_edition_runtime_version_check" CHECK (version > 0);

ALTER TABLE "public"."studio2_eligibility_overrides" ADD CONSTRAINT "studio2_eligibility_override_revocation_check" CHECK (revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL OR revoked_at IS NOT NULL AND revocation_reason IS NOT NULL AND length(btrim(revocation_reason)) >= 5);

ALTER TABLE "public"."studio2_eligibility_overrides" ADD CONSTRAINT "studio2_eligibility_overrides_affected_rule_check" CHECK (length(btrim(affected_rule)) >= 1 AND length(btrim(affected_rule)) <= 100 AND affected_rule ~ '^[a-z0-9][a-z0-9._-]*$'::text);

ALTER TABLE "public"."studio2_eligibility_overrides" ADD CONSTRAINT "studio2_eligibility_overrides_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."studio2_eligibility_overrides" ADD CONSTRAINT "studio2_eligibility_overrides_reason_check" CHECK (length(btrim(reason)) >= 8);

ALTER TABLE "public"."studio2_media_asset_reviews" ADD CONSTRAINT "studio2_media_asset_reviews_approved_source_check" CHECK (decision <> 'approved'::text OR btrim(source_fingerprint) ~* '^https?://'::text);

ALTER TABLE "public"."studio2_media_asset_reviews" ADD CONSTRAINT "studio2_media_asset_reviews_asset_key_check" CHECK (length(btrim(asset_key)) >= 3 AND length(btrim(asset_key)) <= 220);

ALTER TABLE "public"."studio2_media_asset_reviews" ADD CONSTRAINT "studio2_media_asset_reviews_asset_type_check" CHECK (asset_type = ANY (ARRAY['logo'::text, 'flag'::text, 'artist_photo'::text, 'cover_artwork'::text, 'audio_master'::text, 'performance_video'::text, 'postcard'::text, 'press_image'::text, 'broadcast_graphic'::text]));

ALTER TABLE "public"."studio2_media_asset_reviews" ADD CONSTRAINT "studio2_media_asset_reviews_decision_check" CHECK (decision = ANY (ARRAY['approved'::text, 'invalid'::text]));

ALTER TABLE "public"."studio2_media_asset_reviews" ADD CONSTRAINT "studio2_media_asset_reviews_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."studio2_media_asset_reviews" ADD CONSTRAINT "studio2_media_asset_reviews_reason_check" CHECK (length(btrim(reason)) >= 5);

ALTER TABLE "public"."studio2_media_asset_reviews" ADD CONSTRAINT "studio2_media_asset_reviews_scope_check" CHECK (asset_type = 'logo'::text AND country_id IS NULL AND entry_id IS NULL AND asset_key = (('edition:'::text || edition_id::text) || ':logo'::text) OR asset_type = 'flag'::text AND country_id IS NOT NULL AND entry_id IS NULL AND asset_key = (('country:'::text || country_id::text) || ':flag'::text) OR (asset_type <> ALL (ARRAY['logo'::text, 'flag'::text])) AND country_id IS NOT NULL AND entry_id IS NOT NULL AND asset_key = ((('entry:'::text || entry_id::text) || ':'::text) || asset_type));

ALTER TABLE "public"."studio2_media_asset_reviews" ADD CONSTRAINT "studio2_media_asset_reviews_source_fingerprint_check" CHECK (length(btrim(source_fingerprint)) >= 1);

ALTER TABLE "public"."studio2_media_asset_reviews" ADD CONSTRAINT "studio2_media_asset_reviews_timeline_check" CHECK (superseded_at IS NULL OR superseded_at >= reviewed_at);

ALTER TABLE "public"."studio2_next_in_line_windows" ADD CONSTRAINT "studio2_next_in_line_window_time_order" CHECK (opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at);

ALTER TABLE "public"."studio2_next_in_line_windows" ADD CONSTRAINT "studio2_next_in_line_windows_pkey" PRIMARY KEY (edition_id);

ALTER TABLE "public"."studio2_next_in_line_windows" ADD CONSTRAINT "studio2_next_in_line_windows_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'open'::text, 'closed'::text, 'cancelled'::text]));

ALTER TABLE "public"."studio2_next_in_line_windows" ADD CONSTRAINT "studio2_next_in_line_windows_version_check" CHECK (version > 0);

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

ALTER TABLE "public"."studio2_result_operations" ADD CONSTRAINT "studio2_result_operations_calculation_version_check" CHECK (calculation_version >= 0);

ALTER TABLE "public"."studio2_result_operations" ADD CONSTRAINT "studio2_result_operations_locked_version_check" CHECK (locked_version IS NULL OR locked_version > 0 AND locked_version <= calculation_version);

ALTER TABLE "public"."studio2_result_operations" ADD CONSTRAINT "studio2_result_operations_pkey" PRIMARY KEY (show_id);

ALTER TABLE "public"."studio2_result_operations" ADD CONSTRAINT "studio2_result_operations_reveal_version_check" CHECK (reveal_ready_version IS NULL OR reveal_ready_version > 0 AND reveal_ready_version <= calculation_version);

ALTER TABLE "public"."studio2_result_operations" ADD CONSTRAINT "studio2_result_operations_reviewed_version_check" CHECK (reviewed_version IS NULL OR reviewed_version > 0 AND reviewed_version <= calculation_version);


ALTER TABLE "public"."studio2_show_publication_controls" ADD CONSTRAINT "studio2_show_publication_controls_failure_pair_v3_check" CHECK ((last_failure IS NULL) = (last_failure_at IS NULL));

ALTER TABLE "public"."studio2_show_publication_controls" ADD CONSTRAINT "studio2_show_publication_controls_frozen_config_check" CHECK (jsonb_typeof(frozen_config) = 'object'::text);

ALTER TABLE "public"."studio2_show_publication_controls" ADD CONSTRAINT "studio2_show_publication_controls_pkey" PRIMARY KEY (show_id);

ALTER TABLE "public"."studio2_show_publication_controls" ADD CONSTRAINT "studio2_show_publication_controls_schedule_owner_v3_check" CHECK (state <> 'scheduled'::text OR scheduled_by IS NOT NULL AND scheduled_operation_id IS NOT NULL);

ALTER TABLE "public"."studio2_show_publication_controls" ADD CONSTRAINT "studio2_show_publication_controls_scheduled_from_state_check" CHECK (scheduled_from_state IS NULL OR (scheduled_from_state = ANY (ARRAY['draft'::text, 'public'::text, 'hidden'::text])));

ALTER TABLE "public"."studio2_show_publication_controls" ADD CONSTRAINT "studio2_show_publication_controls_state_check" CHECK (state = ANY (ARRAY['draft'::text, 'scheduled'::text, 'public'::text, 'hidden'::text]));

ALTER TABLE "public"."studio2_show_publication_controls" ADD CONSTRAINT "studio2_show_publication_controls_version_check" CHECK (version > 0);

ALTER TABLE "public"."studio2_show_publication_controls" ADD CONSTRAINT "studio2_show_publication_schedule_consistency" CHECK (state = 'scheduled'::text AND scheduled_for IS NOT NULL AND scheduled_from_state IS NOT NULL AND source_show_updated_at IS NOT NULL OR state <> 'scheduled'::text AND scheduled_for IS NULL AND scheduled_from_state IS NULL);


ALTER TABLE "public"."submission_rounds" ADD CONSTRAINT "submission_rounds_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."submissions" ADD CONSTRAINT "submissions_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."televote_votes" ADD CONSTRAINT "televote_identity_chk" CHECK (country_id IS NOT NULL OR contest_entity_id IS NOT NULL);

ALTER TABLE "public"."televote_votes" ADD CONSTRAINT "televote_votes_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."televoting_round_bindings" ADD CONSTRAINT "televoting_round_bindings_pkey" PRIMARY KEY (remote_round_id);

ALTER TABLE "public"."televoting_round_bindings" ADD CONSTRAINT "televoting_round_bindings_source_mode_check" CHECK (source_mode = ANY (ARRAY['edition'::text, 'show'::text]));

ALTER TABLE "public"."voters" ADD CONSTRAINT "voters_pkey" PRIMARY KEY (id);

ALTER TABLE "televoting"."combined_televote_component_results" ADD CONSTRAINT "combined_televote_component_r_aggregation_id_component_id_c_key" UNIQUE (aggregation_id, component_id, country_code, calculation_version);

ALTER TABLE "televoting"."combined_televote_component_results" ADD CONSTRAINT "combined_televote_component_results_pkey" PRIMARY KEY (id);

ALTER TABLE "televoting"."combined_televote_results" ADD CONSTRAINT "combined_televote_results_pkey" PRIMARY KEY (id);

ALTER TABLE "televoting"."round_countries" ADD CONSTRAINT "round_countries_pkey" PRIMARY KEY (id);

ALTER TABLE "televoting"."round_countries" ADD CONSTRAINT "round_countries_round_id_country_code_key" UNIQUE (round_id, country_code);

ALTER TABLE "televoting"."round_countries" ADD CONSTRAINT "round_countries_round_id_display_order_key" UNIQUE (round_id, display_order);

ALTER TABLE "televoting"."round_entries" ADD CONSTRAINT "round_entries_entry_type_check" CHECK (entry_type = ANY (ARRAY['country'::text, 'custom'::text]));

ALTER TABLE "televoting"."round_entries" ADD CONSTRAINT "round_entries_pkey" PRIMARY KEY (id);

ALTER TABLE "televoting"."round_entries" ADD CONSTRAINT "round_entries_round_id_entry_key_key" UNIQUE (round_id, entry_key);

ALTER TABLE "televoting"."round_entries" ADD CONSTRAINT "televoting_round_entries_identity_chk" CHECK (entry_type = 'country'::text AND country_code IS NOT NULL AND custom_name IS NULL OR entry_type = 'custom'::text AND custom_name IS NOT NULL AND country_code IS NULL);

ALTER TABLE "televoting"."round_results" ADD CONSTRAINT "round_results_pkey" PRIMARY KEY (id);

ALTER TABLE "televoting"."round_results" ADD CONSTRAINT "round_results_round_id_country_code_key" UNIQUE (round_id, country_code);

ALTER TABLE "televoting"."rounds" ADD CONSTRAINT "rounds_broadcast_display_mode_check" CHECK (broadcast_display_mode = ANY (ARRAY['original'::text, 'converted'::text, 'combined'::text]));

ALTER TABLE "televoting"."rounds" ADD CONSTRAINT "rounds_participant_mode_check" CHECK (participant_mode = ANY (ARRAY['countries'::text, 'custom'::text, 'mixed'::text]));

ALTER TABLE "televoting"."rounds" ADD CONSTRAINT "rounds_pkey" PRIMARY KEY (id);

ALTER TABLE "televoting"."rounds" ADD CONSTRAINT "rounds_results_status_check" CHECK (results_status = ANY (ARRAY['draft'::text, 'calculated'::text, 'locked'::text, 'published'::text]));

ALTER TABLE "televoting"."rounds" ADD CONSTRAINT "rounds_self_voting_mode_check" CHECK (self_voting_mode = ANY (ARRAY['country_match'::text, 'linked_identity'::text, 'disabled'::text, 'unrestricted'::text]));

ALTER TABLE "televoting"."rounds" ADD CONSTRAINT "rounds_total_points_to_distribute_check" CHECK (total_points_to_distribute >= 0);

ALTER TABLE "televoting"."televote_aggregation_participants" ADD CONSTRAINT "televote_aggregation_participan_aggregation_id_country_code_key" UNIQUE (aggregation_id, country_code);

ALTER TABLE "televoting"."televote_aggregation_participants" ADD CONSTRAINT "televote_aggregation_participants_pkey" PRIMARY KEY (id);

ALTER TABLE "televoting"."televote_aggregation_sources" ADD CONSTRAINT "televote_aggregation_sources_input_mode_check" CHECK (input_mode = ANY (ARRAY['raw_results'::text, 'converted_points'::text, 'activity_points'::text, 'correction'::text]));

ALTER TABLE "televoting"."televote_aggregation_sources" ADD CONSTRAINT "televote_aggregation_sources_pkey" PRIMARY KEY (id);

ALTER TABLE "televoting"."televote_aggregations" ADD CONSTRAINT "televote_aggregations_pkey" PRIMARY KEY (id);

ALTER TABLE "televoting"."vote_entries" ADD CONSTRAINT "vote_entries_pkey" PRIMARY KEY (id);

ALTER TABLE "televoting"."vote_entries" ADD CONSTRAINT "vote_entries_points_check" CHECK (points >= 1 AND (is_historical OR points <= 10));

ALTER TABLE "televoting"."vote_entries" ADD CONSTRAINT "vote_entries_submission_id_target_country_code_key" UNIQUE (submission_id, target_country_code);

ALTER TABLE "televoting"."vote_submissions" ADD CONSTRAINT "vote_submissions_modern_identity_v3_check" CHECK (is_historical OR length(btrim(username)) >= 2 AND username_normalized = lower(btrim(username)));

ALTER TABLE "televoting"."vote_submissions" ADD CONSTRAINT "vote_submissions_pkey" PRIMARY KEY (id);

ALTER TABLE "televoting"."vote_submissions" ADD CONSTRAINT "vote_submissions_status_check" CHECK (status = ANY (ARRAY['active'::text, 'suspicious'::text, 'verified'::text, 'deleted'::text]));

-- Build hosted-observed secondary/unique indexes BEFORE foreign keys that reference them.

-- Secondary indexes never duplicate constraint-owned unique/primary indexes.

CREATE INDEX v3_domain_event_outbox_claim_idx ON private.v3_domain_event_outbox USING btree (consumer_key, status, available_at, lease_expires_at, created_at);

CREATE INDEX v3_domain_event_outbox_dead_letter_idx ON private.v3_domain_event_outbox USING btree (consumer_key, dead_lettered_at DESC) WHERE (status = 'dead_letter'::text);

CREATE INDEX v3_domain_events_aggregate_idx ON private.v3_domain_events USING btree (aggregate_type, aggregate_id, aggregate_version DESC);

CREATE INDEX v3_domain_events_correlation_time_idx ON private.v3_domain_events USING btree (correlation_id, occurred_at, id);

CREATE INDEX v3_domain_events_scope_time_idx ON private.v3_domain_events USING btree (edition_id, show_id, occurred_at DESC);

CREATE INDEX admin_notifications_recipient_idx ON public.admin_notifications USING btree (recipient_id, read_at, created_at DESC);

CREATE INDEX admin_notifications_recipient_resolved_idx ON public.admin_notifications USING btree (recipient_id, resolved_at, created_at DESC);

CREATE UNIQUE INDEX admin_notifications_source_unique_idx ON public.admin_notifications USING btree (recipient_id, source_key) WHERE (source_key IS NOT NULL);

CREATE INDEX editions_event_date_idx ON public.editions USING btree (event_date) WHERE (event_date IS NOT NULL);

CREATE INDEX entries_country_idx ON public.entries USING btree (country_id);

CREATE INDEX entries_edition_idx ON public.entries USING btree (edition_id);

CREATE INDEX entries_entity_idx ON public.entries USING btree (contest_entity_id);

CREATE INDEX jury_ballot_status_edition_idx ON public.jury_ballot_statuses USING btree (edition_id);

CREATE UNIQUE INDEX jury_ballot_status_identity_key ON public.jury_ballot_statuses USING btree (show_id, COALESCE(voter_id, voter_entity_id, voter_country_id));

CREATE INDEX jury_ballot_status_show_idx ON public.jury_ballot_statuses USING btree (show_id);

CREATE INDEX jury_ballot_submissions_user_idx ON public.jury_ballot_submissions USING btree (user_id, submitted_at DESC);

CREATE INDEX idx_jury_votes_voter ON public.jury_votes USING btree (voter_id);

CREATE INDEX jury_votes_ballot_submission_idx ON public.jury_votes USING btree (ballot_submission_id);

CREATE UNIQUE INDEX jury_votes_edition_voter_points_key ON public.jury_votes USING btree (edition_id, COALESCE(voter_id, voter_entity_id, voter_country_id), points) WHERE (show_id IS NULL);

CREATE UNIQUE INDEX jury_votes_edition_voter_recipient_key ON public.jury_votes USING btree (edition_id, COALESCE(voter_id, voter_entity_id, voter_country_id), COALESCE(receiving_entity_id, receiving_country_id)) WHERE (show_id IS NULL);

CREATE INDEX jury_votes_receiving_country_id_idx ON public.jury_votes USING btree (receiving_country_id);

CREATE INDEX jury_votes_receiving_entity_idx ON public.jury_votes USING btree (receiving_entity_id);

CREATE INDEX jury_votes_show_idx ON public.jury_votes USING btree (show_id);

CREATE UNIQUE INDEX jury_votes_show_voter_points_key ON public.jury_votes USING btree (show_id, COALESCE(voter_id, voter_entity_id, voter_country_id), points) WHERE (show_id IS NOT NULL);

CREATE UNIQUE INDEX jury_votes_show_voter_recipient_key ON public.jury_votes USING btree (show_id, COALESCE(voter_id, voter_entity_id, voter_country_id), COALESCE(receiving_entity_id, receiving_country_id)) WHERE (show_id IS NOT NULL);

CREATE INDEX jury_votes_voter_country_id_idx ON public.jury_votes USING btree (voter_country_id);

CREATE INDEX jury_votes_voter_entity_id_idx ON public.jury_votes USING btree (voter_entity_id);

CREATE INDEX jury_voting_windows_edition_idx ON public.jury_voting_windows USING btree (edition_id, status);

CREATE UNIQUE INDEX jury_voting_windows_one_open_per_edition_v3_idx ON public.jury_voting_windows USING btree (edition_id) WHERE (status = 'open'::text);

CREATE INDEX national_final_entries_national_final_id_idx ON public.national_final_entries USING btree (national_final_id) WHERE (COALESCE(removed, false) = false);

CREATE UNIQUE INDEX national_final_entries_one_next_in_line_idx ON public.national_final_entries USING btree (national_final_id) WHERE ((next_in_line = true) AND (removed = false));

CREATE INDEX national_finals_country_edition_idx ON public.national_finals USING btree (country_id, edition_id);

CREATE UNIQUE INDEX next_in_line_responses_edition_country_unique ON public.next_in_line_responses USING btree (edition_id, lower(country));

CREATE UNIQUE INDEX next_in_line_edition_country_unique ON public.next_in_line_submissions USING btree (edition_id, lower(country));

CREATE UNIQUE INDEX next_in_line_submissions_edition_source_v3_uidx ON public.next_in_line_submissions USING btree (edition_id, source_submission_id);

CREATE INDEX notification_deliveries_pending_idx ON public.notification_deliveries USING btree (status, scheduled_for) WHERE (status = 'pending'::text);

CREATE INDEX notification_deliveries_processing_lease_idx ON public.notification_deliveries USING btree (processing_started_at) WHERE (status = 'processing'::text);

CREATE INDEX notification_deliveries_user_idx ON public.notification_deliveries USING btree (user_id, created_at DESC);

CREATE INDEX participants_country_id_idx ON public.participants USING btree (country_id);

CREATE UNIQUE INDEX participants_edition_country_noshow_key ON public.participants USING btree (edition_id, country_id) WHERE (show_id IS NULL);

CREATE INDEX participants_entity_idx ON public.participants USING btree (contest_entity_id);

CREATE INDEX participants_scheduled_publish_idx ON public.participants USING btree (scheduled_publish_at) WHERE ((publication_status = 'scheduled'::text) AND (show_id IS NULL));

CREATE UNIQUE INDEX participants_show_country_key ON public.participants USING btree (show_id, country_id) WHERE (show_id IS NOT NULL);

CREATE UNIQUE INDEX participants_show_entity_key ON public.participants USING btree (show_id, contest_entity_id) WHERE ((show_id IS NOT NULL) AND (contest_entity_id IS NOT NULL));

CREATE INDEX participants_show_idx ON public.participants USING btree (show_id);

CREATE INDEX results_country_id_idx ON public.results USING btree (country_id);

CREATE UNIQUE INDEX results_edition_country_noshow_key ON public.results USING btree (edition_id, country_id) WHERE (show_id IS NULL);

CREATE INDEX results_entity_idx ON public.results USING btree (contest_entity_id);

CREATE UNIQUE INDEX results_show_country_key ON public.results USING btree (show_id, country_id) WHERE (show_id IS NOT NULL);

CREATE UNIQUE INDEX results_show_entity_key ON public.results USING btree (show_id, contest_entity_id) WHERE ((show_id IS NOT NULL) AND (contest_entity_id IS NOT NULL));

CREATE INDEX results_show_idx ON public.results USING btree (show_id);

CREATE UNIQUE INDEX shows_id_edition_id_v3_uidx ON public.shows USING btree (id, edition_id);

CREATE UNIQUE INDEX studio2_confirmation_requirements_current_idx ON public.studio2_confirmation_requirements USING btree (edition_id, country_id) WHERE (superseded_at IS NULL);

CREATE INDEX studio2_confirmation_requirements_edition_state_idx ON public.studio2_confirmation_requirements USING btree (edition_id, status, country_id) WHERE (superseded_at IS NULL);

CREATE INDEX studio2_confirmation_requirements_submission_idx ON public.studio2_confirmation_requirements USING btree (resolved_by_submission_id) WHERE (resolved_by_submission_id IS NOT NULL);

CREATE INDEX studio2_contest_events_actor_user_id_idx ON public.studio2_contest_events USING btree (actor_user_id);

CREATE INDEX studio2_contest_events_edition_time_idx ON public.studio2_contest_events USING btree (edition_id, occurred_at DESC);

CREATE INDEX studio2_contest_events_edition_type_time_idx ON public.studio2_contest_events USING btree (edition_id, type, occurred_at DESC);

CREATE INDEX studio2_edition_runtime_updated_by_idx ON public.studio2_edition_runtime USING btree (updated_by);

CREATE INDEX studio2_eligibility_overrides_active_idx ON public.studio2_eligibility_overrides USING btree (edition_id, country_id, expires_at) WHERE (revoked_at IS NULL);

CREATE INDEX studio2_eligibility_overrides_country_id_idx ON public.studio2_eligibility_overrides USING btree (country_id);

CREATE INDEX studio2_eligibility_overrides_created_by_idx ON public.studio2_eligibility_overrides USING btree (created_by);

CREATE INDEX studio2_eligibility_overrides_revoked_by_idx ON public.studio2_eligibility_overrides USING btree (revoked_by);

CREATE INDEX studio2_eligibility_overrides_scope_idx ON public.studio2_eligibility_overrides USING btree (edition_id, country_id, affected_rule, created_at DESC);

CREATE UNIQUE INDEX studio2_media_asset_reviews_active_idx ON public.studio2_media_asset_reviews USING btree (edition_id, asset_key) WHERE (superseded_at IS NULL);

CREATE INDEX studio2_media_asset_reviews_asset_idx ON public.studio2_media_asset_reviews USING btree (edition_id, asset_key, reviewed_at DESC);

CREATE INDEX studio2_media_asset_reviews_country_id_idx ON public.studio2_media_asset_reviews USING btree (country_id);

CREATE INDEX studio2_media_asset_reviews_edition_idx ON public.studio2_media_asset_reviews USING btree (edition_id, reviewed_at DESC);

CREATE INDEX studio2_media_asset_reviews_entry_id_idx ON public.studio2_media_asset_reviews USING btree (entry_id);

CREATE INDEX studio2_media_asset_reviews_reviewed_by_idx ON public.studio2_media_asset_reviews USING btree (reviewed_by);

CREATE UNIQUE INDEX studio2_next_in_line_one_open_window_idx ON public.studio2_next_in_line_windows USING btree ((true)) WHERE ((enabled = true) AND (status = 'open'::text));

CREATE INDEX studio2_operation_receipts_actor_time_idx ON public.studio2_operation_receipts USING btree (actor_id, created_at DESC);

CREATE INDEX studio2_operation_receipts_command_time_idx ON public.studio2_operation_receipts USING btree (command, created_at DESC);

CREATE INDEX studio2_operation_receipts_correlation_time_idx ON public.studio2_operation_receipts USING btree (correlation_id, created_at DESC);

CREATE INDEX studio2_organizer_tasks_assignee_idx ON public.studio2_organizer_tasks USING btree (assigned_to, state, opened_at DESC) WHERE (assigned_to IS NOT NULL);

CREATE INDEX studio2_organizer_tasks_open_idx ON public.studio2_organizer_tasks USING btree (edition_id, priority, due_at, opened_at DESC) WHERE (state <> 'resolved'::text);

CREATE INDEX studio2_organizer_tasks_source_idx ON public.studio2_organizer_tasks USING btree (source_kind, source_id);

CREATE INDEX studio2_result_operations_edition_idx ON public.studio2_result_operations USING btree (edition_id, updated_at DESC);

CREATE INDEX studio2_result_operations_last_calculated_by_idx ON public.studio2_result_operations USING btree (last_calculated_by);

CREATE INDEX studio2_result_operations_locked_by_idx ON public.studio2_result_operations USING btree (locked_by);

CREATE INDEX studio2_result_operations_reveal_ready_by_idx ON public.studio2_result_operations USING btree (reveal_ready_by);

CREATE INDEX studio2_result_operations_reviewed_by_idx ON public.studio2_result_operations USING btree (reviewed_by);

CREATE INDEX studio2_show_publication_controls_due_idx ON public.studio2_show_publication_controls USING btree (scheduled_for) WHERE (state = 'scheduled'::text);

CREATE INDEX studio2_show_publication_controls_edition_idx ON public.studio2_show_publication_controls USING btree (edition_id, state, updated_at DESC);

CREATE UNIQUE INDEX submissions_recovery_code_uniq ON public.submissions USING btree (upper(recovery_code));

CREATE UNIQUE INDEX submissions_round_country_uniq ON public.submissions USING btree (round_id, lower(country));

CREATE INDEX submissions_session_idx ON public.submissions USING btree (browser_session_id);

CREATE INDEX televote_entity_idx ON public.televote_votes USING btree (contest_entity_id);

CREATE UNIQUE INDEX televote_show_entity_key ON public.televote_votes USING btree (show_id, contest_entity_id) WHERE ((show_id IS NOT NULL) AND (contest_entity_id IS NOT NULL));

CREATE INDEX televote_show_idx ON public.televote_votes USING btree (show_id);

CREATE INDEX televote_votes_country_id_idx ON public.televote_votes USING btree (country_id);

CREATE UNIQUE INDEX televote_votes_edition_country_noshow_key ON public.televote_votes USING btree (edition_id, country_id) WHERE (show_id IS NULL);

CREATE UNIQUE INDEX televote_votes_show_country_key ON public.televote_votes USING btree (show_id, country_id) WHERE (show_id IS NOT NULL);

CREATE INDEX televoting_round_bindings_edition_idx ON public.televoting_round_bindings USING btree (edition_id);

CREATE INDEX televoting_round_bindings_show_idx ON public.televoting_round_bindings USING btree (show_id);

CREATE INDEX idx_voters_edition ON public.voters USING btree (edition_id);

CREATE INDEX idx_voters_show ON public.voters USING btree (show_id);

CREATE INDEX voters_contest_entity_id_idx ON public.voters USING btree (contest_entity_id);

CREATE INDEX voters_country_id_idx ON public.voters USING btree (country_id);

CREATE INDEX televoting_component_results_lookup ON televoting.combined_televote_component_results USING btree (aggregation_id, calculation_version);

CREATE UNIQUE INDEX televoting_combined_results_version_key ON televoting.combined_televote_results USING btree (aggregation_id, country_code, calculation_version);

CREATE INDEX televoting_round_entries_round_idx ON televoting.round_entries USING btree (round_id, display_order);

CREATE INDEX televoting_round_results_round_idx ON televoting.round_results USING btree (round_id);

CREATE UNIQUE INDEX televoting_rounds_single_open ON televoting.rounds USING btree ((true)) WHERE (status = 'open'::televoting.round_status);

CREATE INDEX televoting_vote_entries_submission ON televoting.vote_entries USING btree (submission_id);

CREATE INDEX televoting_vote_entries_target ON televoting.vote_entries USING btree (target_country_code);

CREATE INDEX televoting_vs_country ON televoting.vote_submissions USING btree (country_code);

CREATE INDEX televoting_vs_created ON televoting.vote_submissions USING btree (created_at DESC);

CREATE INDEX televoting_vs_delcat ON televoting.vote_submissions USING btree (deletion_category);

CREATE INDEX televoting_vs_historical_idx ON televoting.vote_submissions USING btree (round_id, is_historical);

CREATE UNIQUE INDEX televoting_vs_round_dt ON televoting.vote_submissions USING btree (round_id, device_token_hash) WHERE ((device_token_hash IS NOT NULL) AND (status <> 'deleted'::text));

CREATE UNIQUE INDEX televoting_vs_round_fp ON televoting.vote_submissions USING btree (round_id, fingerprint_hash) WHERE ((fingerprint_hash IS NOT NULL) AND (status <> 'deleted'::text));

CREATE UNIQUE INDEX televoting_vs_round_ip ON televoting.vote_submissions USING btree (round_id, ip_hash) WHERE ((ip_hash IS NOT NULL) AND (status <> 'deleted'::text));

CREATE INDEX televoting_vs_round_risk ON televoting.vote_submissions USING btree (round_id, risk_score DESC);

CREATE INDEX televoting_vs_round_status ON televoting.vote_submissions USING btree (round_id, status);

CREATE UNIQUE INDEX televoting_vs_round_username ON televoting.vote_submissions USING btree (round_id, username_normalized) WHERE (status <> 'deleted'::text);

ALTER TABLE "private"."v3_domain_event_outbox" ADD CONSTRAINT "v3_domain_event_outbox_event_id_fkey" FOREIGN KEY (event_id) REFERENCES private.v3_domain_events(id) ON DELETE RESTRICT;

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE RESTRICT;

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_operation_id_fkey" FOREIGN KEY (operation_id) REFERENCES studio2_operation_receipts(operation_id) ON DELETE RESTRICT;

ALTER TABLE "private"."v3_domain_events" ADD CONSTRAINT "v3_domain_events_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE RESTRICT;

ALTER TABLE "private"."v3_result_versions" ADD CONSTRAINT "v3_result_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "private"."v3_result_versions" ADD CONSTRAINT "v3_result_versions_show_edition_fk" FOREIGN KEY (show_id, edition_id) REFERENCES shows(id, edition_id);

ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "admin_notifications_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."editions" ADD CONSTRAINT "editions_host_country_id_fkey" FOREIGN KEY (host_country_id) REFERENCES countries(id) ON DELETE SET NULL;

ALTER TABLE "public"."editions" ADD CONSTRAINT "editions_theme_id_fkey" FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE SET NULL;

ALTER TABLE "public"."entries" ADD CONSTRAINT "entries_contest_entity_id_fkey" FOREIGN KEY (contest_entity_id) REFERENCES contest_entities(id) ON DELETE SET NULL;

ALTER TABLE "public"."entries" ADD CONSTRAINT "entries_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;

ALTER TABLE "public"."entries" ADD CONSTRAINT "entries_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."internal_entries" ADD CONSTRAINT "internal_entries_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE;

ALTER TABLE "public"."jury_ballot_statuses" ADD CONSTRAINT "jury_ballot_statuses_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."jury_ballot_statuses" ADD CONSTRAINT "jury_ballot_statuses_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."jury_ballot_statuses" ADD CONSTRAINT "jury_ballot_statuses_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;

ALTER TABLE "public"."jury_ballot_statuses" ADD CONSTRAINT "jury_ballot_statuses_voter_country_id_fkey" FOREIGN KEY (voter_country_id) REFERENCES countries(id) ON DELETE CASCADE;

ALTER TABLE "public"."jury_ballot_statuses" ADD CONSTRAINT "jury_ballot_statuses_voter_entity_id_fkey" FOREIGN KEY (voter_entity_id) REFERENCES contest_entities(id) ON DELETE CASCADE;

ALTER TABLE "public"."jury_ballot_statuses" ADD CONSTRAINT "jury_ballot_statuses_voter_id_fkey" FOREIGN KEY (voter_id) REFERENCES voters(id) ON DELETE CASCADE;

ALTER TABLE "public"."jury_ballot_submissions" ADD CONSTRAINT "jury_ballot_submissions_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."jury_ballot_submissions" ADD CONSTRAINT "jury_ballot_submissions_preflight_id_fkey" FOREIGN KEY (preflight_id) REFERENCES televoting.vote_preflight_checks(id) ON DELETE RESTRICT;

ALTER TABLE "public"."jury_ballot_submissions" ADD CONSTRAINT "jury_ballot_submissions_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."jury_ballot_submissions" ADD CONSTRAINT "jury_ballot_submissions_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;

ALTER TABLE "public"."jury_ballot_submissions" ADD CONSTRAINT "jury_ballot_submissions_voter_country_id_fkey" FOREIGN KEY (voter_country_id) REFERENCES countries(id) ON DELETE RESTRICT;

ALTER TABLE "public"."jury_ballot_submissions" ADD CONSTRAINT "jury_ballot_submissions_voter_entity_id_fkey" FOREIGN KEY (voter_entity_id) REFERENCES contest_entities(id) ON DELETE SET NULL;

ALTER TABLE "public"."jury_ballot_submissions" ADD CONSTRAINT "jury_ballot_submissions_voter_id_fkey" FOREIGN KEY (voter_id) REFERENCES voters(id) ON DELETE SET NULL;

ALTER TABLE "public"."jury_votes" ADD CONSTRAINT "jury_votes_ballot_submission_id_fkey" FOREIGN KEY (ballot_submission_id) REFERENCES jury_ballot_submissions(id) ON DELETE SET NULL;

ALTER TABLE "public"."jury_votes" ADD CONSTRAINT "jury_votes_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."jury_votes" ADD CONSTRAINT "jury_votes_receiving_country_id_fkey" FOREIGN KEY (receiving_country_id) REFERENCES countries(id) ON DELETE CASCADE;

ALTER TABLE "public"."jury_votes" ADD CONSTRAINT "jury_votes_receiving_entity_id_fkey" FOREIGN KEY (receiving_entity_id) REFERENCES contest_entities(id) ON DELETE RESTRICT;

ALTER TABLE "public"."jury_votes" ADD CONSTRAINT "jury_votes_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;

ALTER TABLE "public"."jury_votes" ADD CONSTRAINT "jury_votes_voter_country_id_fkey" FOREIGN KEY (voter_country_id) REFERENCES countries(id) ON DELETE CASCADE;

ALTER TABLE "public"."jury_votes" ADD CONSTRAINT "jury_votes_voter_entity_id_fkey" FOREIGN KEY (voter_entity_id) REFERENCES contest_entities(id) ON DELETE RESTRICT;

ALTER TABLE "public"."jury_votes" ADD CONSTRAINT "jury_votes_voter_id_fkey" FOREIGN KEY (voter_id) REFERENCES voters(id) ON DELETE RESTRICT;

ALTER TABLE "public"."jury_voting_windows" ADD CONSTRAINT "jury_voting_windows_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."jury_voting_windows" ADD CONSTRAINT "jury_voting_windows_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;

ALTER TABLE "public"."national_final_entries" ADD CONSTRAINT "national_final_entries_national_final_id_fkey" FOREIGN KEY (national_final_id) REFERENCES national_finals(id) ON DELETE CASCADE;

ALTER TABLE "public"."national_finals" ADD CONSTRAINT "national_finals_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;

ALTER TABLE "public"."national_finals" ADD CONSTRAINT "national_finals_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE SET NULL;

ALTER TABLE "public"."national_finals" ADD CONSTRAINT "national_finals_pending_winning_entry_id_fkey" FOREIGN KEY (pending_winning_entry_id) REFERENCES national_final_entries(id) ON DELETE SET NULL;

ALTER TABLE "public"."national_finals" ADD CONSTRAINT "national_finals_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE;

ALTER TABLE "public"."national_finals" ADD CONSTRAINT "national_finals_winning_entry_id_fkey" FOREIGN KEY (winning_entry_id) REFERENCES national_final_entries(id) ON DELETE SET NULL;

ALTER TABLE "public"."next_in_line_responses" ADD CONSTRAINT "next_in_line_responses_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."next_in_line_responses" ADD CONSTRAINT "next_in_line_responses_national_final_entry_id_fkey" FOREIGN KEY (national_final_entry_id) REFERENCES national_final_entries(id) ON DELETE SET NULL;

ALTER TABLE "public"."next_in_line_responses" ADD CONSTRAINT "next_in_line_responses_source_submission_id_fkey" FOREIGN KEY (source_submission_id) REFERENCES submissions(id) ON DELETE CASCADE;

ALTER TABLE "public"."next_in_line_submissions" ADD CONSTRAINT "next_in_line_submissions_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."next_in_line_submissions" ADD CONSTRAINT "next_in_line_submissions_last_operation_id_fkey" FOREIGN KEY (last_operation_id) REFERENCES studio2_operation_receipts(operation_id) ON DELETE SET NULL;

ALTER TABLE "public"."next_in_line_submissions" ADD CONSTRAINT "next_in_line_submissions_national_final_entry_id_fkey" FOREIGN KEY (national_final_entry_id) REFERENCES national_final_entries(id) ON DELETE SET NULL;

ALTER TABLE "public"."next_in_line_submissions" ADD CONSTRAINT "next_in_line_submissions_source_submission_id_fkey" FOREIGN KEY (source_submission_id) REFERENCES submissions(id) ON DELETE CASCADE;

ALTER TABLE "public"."next_in_line_submissions" ADD CONSTRAINT "next_in_line_submissions_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."participants" ADD CONSTRAINT "participants_contest_entity_id_fkey" FOREIGN KEY (contest_entity_id) REFERENCES contest_entities(id) ON DELETE RESTRICT;

ALTER TABLE "public"."participants" ADD CONSTRAINT "participants_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;

ALTER TABLE "public"."participants" ADD CONSTRAINT "participants_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."participants" ADD CONSTRAINT "participants_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;

ALTER TABLE "public"."results" ADD CONSTRAINT "results_contest_entity_id_fkey" FOREIGN KEY (contest_entity_id) REFERENCES contest_entities(id) ON DELETE RESTRICT;

ALTER TABLE "public"."results" ADD CONSTRAINT "results_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;

ALTER TABLE "public"."results" ADD CONSTRAINT "results_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."results" ADD CONSTRAINT "results_show_edition_v3_fk" FOREIGN KEY (show_id, edition_id) REFERENCES shows(id, edition_id) ON DELETE CASCADE;

ALTER TABLE "public"."results" ADD CONSTRAINT "results_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;

ALTER TABLE "public"."shows" ADD CONSTRAINT "shows_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."shows" ADD CONSTRAINT "shows_host_country_id_fkey" FOREIGN KEY (host_country_id) REFERENCES countries(id) ON DELETE SET NULL;

ALTER TABLE "public"."shows" ADD CONSTRAINT "shows_theme_id_fkey" FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_confirmation_requirements" ADD CONSTRAINT "studio2_confirmation_requirement_resolved_by_submission_id_fkey" FOREIGN KEY (resolved_by_submission_id) REFERENCES submissions(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_confirmation_requirements" ADD CONSTRAINT "studio2_confirmation_requirements_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_confirmation_requirements" ADD CONSTRAINT "studio2_confirmation_requirements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_confirmation_requirements" ADD CONSTRAINT "studio2_confirmation_requirements_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_confirmation_requirements" ADD CONSTRAINT "studio2_confirmation_requirements_invalidated_by_fkey" FOREIGN KEY (invalidated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_contest_events" ADD CONSTRAINT "studio2_contest_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_contest_events" ADD CONSTRAINT "studio2_contest_events_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_edition_runtime" ADD CONSTRAINT "studio2_edition_runtime_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_edition_runtime" ADD CONSTRAINT "studio2_edition_runtime_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_eligibility_overrides" ADD CONSTRAINT "studio2_eligibility_overrides_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_eligibility_overrides" ADD CONSTRAINT "studio2_eligibility_overrides_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_eligibility_overrides" ADD CONSTRAINT "studio2_eligibility_overrides_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_eligibility_overrides" ADD CONSTRAINT "studio2_eligibility_overrides_revoked_by_fkey" FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_media_asset_reviews" ADD CONSTRAINT "studio2_media_asset_reviews_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_media_asset_reviews" ADD CONSTRAINT "studio2_media_asset_reviews_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_media_asset_reviews" ADD CONSTRAINT "studio2_media_asset_reviews_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_media_asset_reviews" ADD CONSTRAINT "studio2_media_asset_reviews_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_next_in_line_windows" ADD CONSTRAINT "studio2_next_in_line_windows_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_next_in_line_windows" ADD CONSTRAINT "studio2_next_in_line_windows_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_operation_receipts" ADD CONSTRAINT "studio2_operation_receipts_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_organizer_tasks" ADD CONSTRAINT "studio2_organizer_tasks_required_capability_fkey" FOREIGN KEY (required_capability) REFERENCES studio2_capabilities(key) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "public"."studio2_result_operations" ADD CONSTRAINT "studio2_result_operations_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_result_operations" ADD CONSTRAINT "studio2_result_operations_last_calculated_by_fkey" FOREIGN KEY (last_calculated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_result_operations" ADD CONSTRAINT "studio2_result_operations_locked_by_fkey" FOREIGN KEY (locked_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_result_operations" ADD CONSTRAINT "studio2_result_operations_locked_snapshot_v3_fk" FOREIGN KEY (show_id, locked_version) REFERENCES private.v3_result_versions(show_id, version) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "public"."studio2_result_operations" ADD CONSTRAINT "studio2_result_operations_reveal_ready_by_fkey" FOREIGN KEY (reveal_ready_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_result_operations" ADD CONSTRAINT "studio2_result_operations_reveal_snapshot_v3_fk" FOREIGN KEY (show_id, reveal_ready_version) REFERENCES private.v3_result_versions(show_id, version) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "public"."studio2_result_operations" ADD CONSTRAINT "studio2_result_operations_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_result_operations" ADD CONSTRAINT "studio2_result_operations_reviewed_snapshot_v3_fk" FOREIGN KEY (show_id, reviewed_version) REFERENCES private.v3_result_versions(show_id, version) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "public"."studio2_result_operations" ADD CONSTRAINT "studio2_result_operations_show_edition_v3_fk" FOREIGN KEY (show_id, edition_id) REFERENCES shows(id, edition_id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_result_operations" ADD CONSTRAINT "studio2_result_operations_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_show_publication_controls" ADD CONSTRAINT "studio2_show_publication_controls_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_show_publication_controls" ADD CONSTRAINT "studio2_show_publication_controls_scheduled_by_fkey" FOREIGN KEY (scheduled_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_show_publication_controls" ADD CONSTRAINT "studio2_show_publication_controls_show_edition_v3_fk" FOREIGN KEY (show_id, edition_id) REFERENCES shows(id, edition_id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_show_publication_controls" ADD CONSTRAINT "studio2_show_publication_controls_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_show_publication_controls" ADD CONSTRAINT "studio2_show_publication_controls_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_show_publication_controls" ADD CONSTRAINT "studio2_show_publication_source_snapshot_v3_fk" FOREIGN KEY (show_id, source_result_version) REFERENCES private.v3_result_versions(show_id, version) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "public"."submission_rounds" ADD CONSTRAINT "submission_rounds_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."submissions" ADD CONSTRAINT "submissions_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."submissions" ADD CONSTRAINT "submissions_round_id_fkey" FOREIGN KEY (round_id) REFERENCES submission_rounds(id) ON DELETE RESTRICT;

ALTER TABLE "public"."televote_votes" ADD CONSTRAINT "televote_votes_contest_entity_id_fkey" FOREIGN KEY (contest_entity_id) REFERENCES contest_entities(id) ON DELETE RESTRICT;

ALTER TABLE "public"."televote_votes" ADD CONSTRAINT "televote_votes_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;

ALTER TABLE "public"."televote_votes" ADD CONSTRAINT "televote_votes_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."televote_votes" ADD CONSTRAINT "televote_votes_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;

ALTER TABLE "public"."televoting_round_bindings" ADD CONSTRAINT "televoting_round_bindings_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."televoting_round_bindings" ADD CONSTRAINT "televoting_round_bindings_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE SET NULL;

ALTER TABLE "public"."voters" ADD CONSTRAINT "voters_contest_entity_id_fkey" FOREIGN KEY (contest_entity_id) REFERENCES contest_entities(id) ON DELETE RESTRICT;

ALTER TABLE "public"."voters" ADD CONSTRAINT "voters_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL;

ALTER TABLE "public"."voters" ADD CONSTRAINT "voters_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."voters" ADD CONSTRAINT "voters_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;

ALTER TABLE "televoting"."combined_televote_component_results" ADD CONSTRAINT "combined_televote_component_results_aggregation_id_fkey" FOREIGN KEY (aggregation_id) REFERENCES televoting.televote_aggregations(id) ON DELETE CASCADE;

ALTER TABLE "televoting"."combined_televote_component_results" ADD CONSTRAINT "combined_televote_component_results_component_id_fkey" FOREIGN KEY (component_id) REFERENCES televoting.televote_aggregation_sources(id) ON DELETE CASCADE;

ALTER TABLE "televoting"."combined_televote_results" ADD CONSTRAINT "combined_televote_results_aggregation_id_fkey" FOREIGN KEY (aggregation_id) REFERENCES televoting.televote_aggregations(id) ON DELETE CASCADE;

ALTER TABLE "televoting"."round_countries" ADD CONSTRAINT "round_countries_country_code_fkey" FOREIGN KEY (country_code) REFERENCES televoting.countries(code);

ALTER TABLE "televoting"."round_countries" ADD CONSTRAINT "round_countries_round_id_fkey" FOREIGN KEY (round_id) REFERENCES televoting.rounds(id) ON DELETE CASCADE;

ALTER TABLE "televoting"."round_entries" ADD CONSTRAINT "round_entries_round_id_fkey" FOREIGN KEY (round_id) REFERENCES televoting.rounds(id) ON DELETE CASCADE;

ALTER TABLE "televoting"."round_results" ADD CONSTRAINT "round_results_round_id_fkey" FOREIGN KEY (round_id) REFERENCES televoting.rounds(id) ON DELETE CASCADE;

ALTER TABLE "televoting"."rounds" ADD CONSTRAINT "rounds_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES televoting.editions(id) ON DELETE CASCADE;

ALTER TABLE "televoting"."televote_aggregation_participants" ADD CONSTRAINT "televote_aggregation_participants_aggregation_id_fkey" FOREIGN KEY (aggregation_id) REFERENCES televoting.televote_aggregations(id) ON DELETE CASCADE;

ALTER TABLE "televoting"."televote_aggregation_sources" ADD CONSTRAINT "televote_aggregation_sources_aggregation_id_fkey" FOREIGN KEY (aggregation_id) REFERENCES televoting.televote_aggregations(id) ON DELETE CASCADE;

ALTER TABLE "televoting"."televote_aggregation_sources" ADD CONSTRAINT "televote_aggregation_sources_correction_target_source_id_fkey" FOREIGN KEY (correction_target_source_id) REFERENCES televoting.televote_aggregation_sources(id) ON DELETE SET NULL;

ALTER TABLE "televoting"."televote_aggregation_sources" ADD CONSTRAINT "televote_aggregation_sources_source_round_id_fkey" FOREIGN KEY (source_round_id) REFERENCES televoting.rounds(id) ON DELETE SET NULL;

ALTER TABLE "televoting"."televote_aggregations" ADD CONSTRAINT "televote_aggregations_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES televoting.editions(id) ON DELETE SET NULL;

ALTER TABLE "televoting"."vote_entries" ADD CONSTRAINT "vote_entries_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES televoting.vote_submissions(id) ON DELETE CASCADE;

ALTER TABLE "televoting"."vote_submissions" ADD CONSTRAINT "vote_submissions_round_id_fkey" FOREIGN KEY (round_id) REFERENCES televoting.rounds(id) ON DELETE CASCADE;

CREATE TRIGGER v3_domain_events_immutable BEFORE DELETE OR UPDATE ON private.v3_domain_events FOR EACH ROW EXECUTE FUNCTION private.v3_reject_domain_event_mutation();

CREATE TRIGGER v3_reject_result_version_mutation BEFORE DELETE OR UPDATE ON private.v3_result_versions FOR EACH ROW EXECUTE FUNCTION private.v3_reject_result_version_mutation();

CREATE TRIGGER studio2_bump_notification_activation BEFORE UPDATE OF resolved_at ON admin_notifications FOR EACH ROW EXECUTE FUNCTION private.studio2_bump_notification_activation();

CREATE TRIGGER studio2_guard_domain_notification_resolution BEFORE UPDATE ON admin_notifications FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_domain_notification_resolution();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON admin_notifications FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER editions_sync_year_from_event_date BEFORE INSERT OR UPDATE OF event_date ON editions FOR EACH ROW EXECUTE FUNCTION sync_edition_year_from_event_date();

CREATE TRIGGER revoke_confirmation_tokens_on_edition_close AFTER INSERT OR UPDATE OF editing_enabled ON editions FOR EACH ROW WHEN (NOT COALESCE(new.editing_enabled, false)) EXECUTE FUNCTION private.revoke_confirmation_tokens_on_edition_close();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON editions FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER studio2_seed_edition_runtime_after_insert AFTER INSERT ON editions FOR EACH ROW EXECUTE FUNCTION private.studio2_seed_edition_runtime();

CREATE TRIGGER trg_emit_edition_pulse_event AFTER INSERT OR UPDATE ON editions FOR EACH ROW EXECUTE FUNCTION emit_edition_pulse_event();

CREATE TRIGGER trg_preserve_edition_public_design_metadata BEFORE UPDATE OF theme_colors ON editions FOR EACH ROW EXECUTE FUNCTION preserve_edition_public_design_metadata();

CREATE TRIGGER trg_sync_edition_design_to_shows AFTER UPDATE OF theme_id, broadcast_config ON editions FOR EACH ROW EXECUTE FUNCTION sync_edition_design_to_shows();

CREATE TRIGGER trg_sync_edition_palette_after_change AFTER UPDATE OF theme_colors ON editions FOR EACH ROW WHEN (old.theme_colors IS DISTINCT FROM new.theme_colors) EXECUTE FUNCTION sync_edition_palette_after_change();

CREATE TRIGGER v3_s3_supersede_edition_logo_reviews AFTER UPDATE OF logo ON editions FOR EACH ROW EXECUTE FUNCTION private.v3_supersede_stale_media_reviews();

CREATE TRIGGER entries_bump_edition_revision AFTER INSERT OR DELETE OR UPDATE ON entries FOR EACH ROW EXECUTE FUNCTION bump_edition_data_revision();

CREATE TRIGGER entries_sync_confirmation_youtube AFTER INSERT OR UPDATE OF song_url, source, country_id, edition_id ON entries FOR EACH ROW EXECUTE FUNCTION sync_confirmation_entry_youtube_link();

CREATE TRIGGER studio2_entries_touch_participation_status_version AFTER INSERT OR DELETE OR UPDATE OF edition_id, country_id, status ON entries FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_participation_status_version();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON entries FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER update_entries_updated_at BEFORE UPDATE ON entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER v3_s3_supersede_entry_media_reviews AFTER UPDATE OF song_url, metadata ON entries FOR EACH ROW EXECUTE FUNCTION private.v3_supersede_stale_media_reviews();

CREATE TRIGGER studio2_guard_internal_entry_review_transition BEFORE UPDATE OF review_status, review_reason, reviewed_at, reviewed_by ON internal_entries FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_direct_confirmation_review_transition();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON internal_entries FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER studio2_touch_internal_entry_review_version AFTER INSERT OR DELETE OR UPDATE ON internal_entries FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_confirmation_review_version();

CREATE TRIGGER v3_00_apply_internal_entry_credits_context BEFORE INSERT OR UPDATE ON internal_entries FOR EACH ROW EXECUTE FUNCTION private.v3_apply_entry_credits_context();

CREATE TRIGGER v3_bind_internal_entry BEFORE INSERT OR UPDATE ON internal_entries FOR EACH ROW EXECUTE FUNCTION private.v3_bind_confirmation_entry_version();

CREATE TRIGGER v3_record_inserted_internal_entry AFTER INSERT ON internal_entries FOR EACH ROW EXECUTE FUNCTION private.v3_record_inserted_entry_version();

CREATE CONSTRAINT TRIGGER v3_s3_validate_internal_entry_pointer AFTER INSERT OR UPDATE ON internal_entries DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION private.v3_validate_current_entry_pointer();

CREATE TRIGGER jury_ballot_statuses_updated_at BEFORE UPDATE ON jury_ballot_statuses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON jury_ballot_statuses FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE CONSTRAINT TRIGGER v3_s3_validate_jury_dnv_scope AFTER INSERT OR UPDATE ON jury_ballot_statuses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.v3_validate_jury_dnv_scope();

CREATE TRIGGER studio2_jury_ballot_review_results_sync AFTER UPDATE OF status ON jury_ballot_submissions FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION private.studio2_sync_results_after_jury_ballot_review();

CREATE TRIGGER studio2_jury_ballot_review_task_reconcile AFTER INSERT OR UPDATE OF status, review_version ON jury_ballot_submissions FOR EACH ROW EXECUTE FUNCTION private.studio2_jury_ballot_review_task_trigger();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON jury_ballot_submissions FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER v3_guard_jury_ballot_reference_scope BEFORE UPDATE OF edition_id, show_id ON jury_ballot_submissions FOR EACH ROW EXECUTE FUNCTION private.v3_guard_jury_ballot_reference_scope();

CREATE CONSTRAINT TRIGGER v3_s3_validate_jury_submission_scope AFTER INSERT OR UPDATE ON jury_ballot_submissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.v3_validate_jury_submission_scope();

CREATE TRIGGER jury_votes_entity_edition BEFORE INSERT OR UPDATE ON jury_votes FOR EACH ROW EXECUTE FUNCTION assert_entity_edition();

CREATE TRIGGER jury_votes_sync_results AFTER INSERT OR DELETE OR UPDATE ON jury_votes FOR EACH ROW EXECUTE FUNCTION sync_results_after_vote_change();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON jury_votes FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER v3_guard_jury_vote_object_scope BEFORE INSERT OR UPDATE OF edition_id, show_id, voter_id, voter_country_id, voter_entity_id, receiving_country_id, receiving_entity_id, ballot_submission_id ON jury_votes FOR EACH ROW EXECUTE FUNCTION private.v3_guard_jury_vote_object_scope();

CREATE CONSTRAINT TRIGGER v3_s3_validate_jury_vote_ballot_scope AFTER INSERT OR UPDATE ON jury_votes DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION private.v3_validate_jury_vote_ballot_scope();

CREATE TRIGGER studio2_jury_window_touch_edition_version AFTER INSERT OR DELETE OR UPDATE ON jury_voting_windows FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_jury_window_version();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON jury_voting_windows FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER v3_s3_validate_jury_window_scope BEFORE INSERT OR UPDATE OF show_id, edition_id ON jury_voting_windows FOR EACH ROW EXECUTE FUNCTION private.v3_validate_jury_window_scope();

CREATE TRIGGER national_final_entry_pulse AFTER INSERT OR UPDATE OF review_status, removed ON national_final_entries FOR EACH ROW EXECUTE FUNCTION national_final_entry_pulse_trigger();

CREATE TRIGGER studio2_guard_nf_entry_review_transition BEFORE UPDATE OF review_status, review_reason, reviewed_at, reviewed_by, removed, removed_at ON national_final_entries FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_direct_confirmation_review_transition();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON national_final_entries FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER studio2_touch_nf_entry_review_version AFTER INSERT OR DELETE OR UPDATE ON national_final_entries FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_confirmation_review_version();

CREATE TRIGGER v3_00_apply_nf_entry_credits_context BEFORE INSERT OR UPDATE ON national_final_entries FOR EACH ROW EXECUTE FUNCTION private.v3_apply_entry_credits_context();

CREATE TRIGGER v3_00_stage_current_nf_winner_before_participant_entry_edit BEFORE UPDATE ON national_final_entries FOR EACH ROW EXECUTE FUNCTION private.v3_stage_current_nf_winner_before_participant_entry_edit();

CREATE TRIGGER v3_bind_nf_entry BEFORE INSERT OR UPDATE ON national_final_entries FOR EACH ROW EXECUTE FUNCTION private.v3_bind_confirmation_entry_version();

CREATE TRIGGER v3_promote_pending_nf_winner_after_review AFTER UPDATE OF review_status, reviewed_version_id, removed ON national_final_entries FOR EACH ROW EXECUTE FUNCTION private.v3_promote_pending_nf_winner_after_review();

CREATE TRIGGER v3_record_inserted_nf_entry AFTER INSERT ON national_final_entries FOR EACH ROW EXECUTE FUNCTION private.v3_record_inserted_entry_version();

CREATE CONSTRAINT TRIGGER v3_s3_validate_nf_entry_pointer AFTER INSERT OR UPDATE ON national_final_entries DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION private.v3_validate_current_entry_pointer();

CREATE TRIGGER national_final_pulse AFTER INSERT OR UPDATE OF winning_entry_id ON national_finals FOR EACH ROW EXECUTE FUNCTION national_final_pulse_trigger();

CREATE TRIGGER studio2_guard_nf_winner_transition BEFORE UPDATE OF winning_entry_id, pending_winning_entry_id ON national_finals FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_direct_confirmation_review_transition();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON national_finals FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER studio2_touch_nf_review_version AFTER INSERT OR DELETE OR UPDATE ON national_finals FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_confirmation_review_version();

CREATE TRIGGER v3_guard_entry_nf_scope BEFORE UPDATE OF submission_id ON national_finals FOR EACH ROW EXECUTE FUNCTION private.v3_guard_entry_parent_scope();

CREATE TRIGGER v3_guard_exact_reviewed_winner BEFORE INSERT OR UPDATE OF winning_entry_id ON national_finals FOR EACH ROW EXECUTE FUNCTION private.v3_guard_exact_reviewed_winner();

CREATE TRIGGER v3_guard_pending_nf_winner_scope BEFORE INSERT OR UPDATE ON national_finals FOR EACH ROW EXECUTE FUNCTION private.v3_guard_pending_nf_winner_scope();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON next_in_line_responses FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON next_in_line_submissions FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON notification_deliveries FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER studio2_version_organizer_delivery_dedupe BEFORE INSERT ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION private.studio2_version_organizer_delivery_dedupe();

CREATE TRIGGER v3_emit_notification_delivery_event AFTER INSERT OR UPDATE OF status ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION private.v3_emit_notification_delivery_event();

CREATE TRIGGER participants_append_running_order BEFORE INSERT ON participants FOR EACH ROW EXECUTE FUNCTION append_running_order_for_new_participant();

CREATE TRIGGER participants_auto_assign_country_hod AFTER INSERT OR UPDATE OF country_id, edition_id, participation_status, show_id ON participants FOR EACH ROW EXECUTE FUNCTION auto_assign_country_hod_for_participation();

CREATE TRIGGER participants_bump_edition_revision AFTER INSERT OR DELETE OR UPDATE ON participants FOR EACH ROW EXECUTE FUNCTION bump_edition_data_revision();

CREATE TRIGGER participants_compact_running_order_after_delete AFTER DELETE ON participants FOR EACH ROW EXECUTE FUNCTION compact_running_order_after_delete();

CREATE TRIGGER participants_entity_edition BEFORE INSERT OR UPDATE ON participants FOR EACH ROW EXECUTE FUNCTION assert_entity_edition();

CREATE TRIGGER participants_inherit_listen_links BEFORE INSERT ON participants FOR EACH ROW EXECUTE FUNCTION inherit_country_entry_listen_links();

CREATE TRIGGER participants_keep_historical_entry_public BEFORE INSERT OR UPDATE OF publication_status, scheduled_publish_at, artist, song, youtube_url, spotify_url, apple_music_url ON participants FOR EACH ROW EXECUTE FUNCTION keep_historical_entry_public();

CREATE TRIGGER participants_preserve_edition_participation BEFORE DELETE ON participants FOR EACH ROW EXECUTE FUNCTION preserve_edition_participation_before_show_delete();

CREATE TRIGGER participants_protect_confirmation_synced_entry_default BEFORE INSERT ON participants FOR EACH ROW EXECUTE FUNCTION protect_confirmation_synced_entry_default();

CREATE TRIGGER participants_sync_entry_details AFTER INSERT OR UPDATE OF artist, song ON participants FOR EACH ROW EXECUTE FUNCTION sync_participant_entry_details();

CREATE TRIGGER participants_sync_results AFTER INSERT OR DELETE OR UPDATE OF show_id, country_id, contest_entity_id, running_order ON participants FOR EACH ROW EXECUTE FUNCTION sync_results_after_participant_change();

CREATE TRIGGER studio2_participants_touch_status_version AFTER INSERT OR DELETE OR UPDATE OF edition_id, country_id, contest_entity_id, participation_status ON participants FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_participation_status_version();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON participants FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER update_participants_updated_at BEFORE UPDATE ON participants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER results_entity_edition BEFORE INSERT OR UPDATE ON results FOR EACH ROW EXECUTE FUNCTION assert_entity_edition();

CREATE TRIGGER results_sync_semi_final_qualifiers AFTER INSERT OR DELETE OR UPDATE OF show_id, country_id, contest_entity_id, final_rank ON results FOR EACH ROW EXECUTE FUNCTION sync_qualifiers_after_result_change();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON results FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER guard_result_publication_requires_reveal_ready BEFORE INSERT OR UPDATE OF published, publication_config ON shows FOR EACH ROW EXECUTE FUNCTION private.guard_result_publication_requires_reveal_ready();

CREATE TRIGGER normalize_show_publication_channels_trigger BEFORE INSERT OR UPDATE OF voting_config, publication_config ON shows FOR EACH ROW EXECUTE FUNCTION normalize_show_publication_channels();

CREATE TRIGGER shows_sync_edition_publication AFTER INSERT OR DELETE OR UPDATE OF published, edition_id, publication_config ON shows FOR EACH ROW EXECUTE FUNCTION sync_edition_publication_from_shows();

CREATE TRIGGER shows_sync_semi_final_qualifiers AFTER UPDATE OF qualifier_count, voting_config, kind ON shows FOR EACH ROW WHEN (old.qualifier_count IS DISTINCT FROM new.qualifier_count OR old.voting_config IS DISTINCT FROM new.voting_config OR old.kind IS DISTINCT FROM new.kind) EXECUTE FUNCTION sync_qualifiers_after_show_change();

CREATE TRIGGER studio2_create_show_publication_control AFTER INSERT ON shows FOR EACH ROW EXECUTE FUNCTION private.studio2_create_show_publication_control();

CREATE TRIGGER studio2_guard_direct_show_publication_write BEFORE UPDATE OF published, publication_config ON shows FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_direct_show_publication_write();

CREATE TRIGGER studio2_locked_rundown_live_state_guard BEFORE UPDATE OF broadcast_config ON shows FOR EACH ROW EXECUTE FUNCTION private.studio2_enforce_locked_rundown_live_state();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON shows FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER studio2_serialize_show_publication_with_results BEFORE UPDATE OF published, publication_config ON shows FOR EACH ROW EXECUTE FUNCTION private.studio2_serialize_show_publication_with_results();

CREATE TRIGGER trg_emit_show_pulse_events AFTER INSERT OR UPDATE ON shows FOR EACH ROW EXECUTE FUNCTION emit_show_pulse_events();

CREATE TRIGGER trg_inherit_edition_design_on_show BEFORE INSERT ON shows FOR EACH ROW EXECUTE FUNCTION inherit_edition_design_on_show();

CREATE TRIGGER trg_materialize_results_on_show_publish AFTER INSERT OR UPDATE OF published, publication_config ON shows FOR EACH ROW EXECUTE FUNCTION materialize_results_on_show_publish();

CREATE TRIGGER trg_rerank_results_after_voting_config_change AFTER UPDATE OF voting_config ON shows FOR EACH ROW WHEN (old.voting_config IS DISTINCT FROM new.voting_config) EXECUTE FUNCTION rerank_results_after_voting_config_change();

CREATE TRIGGER update_shows_updated_at BEFORE UPDATE ON shows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER v3_guard_jury_show_reference_scope BEFORE UPDATE OF edition_id ON shows FOR EACH ROW EXECUTE FUNCTION private.v3_guard_jury_show_reference_scope();

CREATE CONSTRAINT TRIGGER v3_validate_publication_projection_from_show AFTER UPDATE OF published, publication_config ON shows DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.v3_validate_show_publication_projection();

CREATE TRIGGER studio2_confirmation_resolution_scope_guard BEFORE INSERT OR UPDATE OF edition_id, country_id, status, valid_from, resolved_by_submission_id ON studio2_confirmation_requirements FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_confirmation_resolution_scope();

CREATE TRIGGER studio2_story_source_count_sync AFTER INSERT ON studio2_contest_events FOR EACH ROW WHEN (new.type = ANY (ARRAY['storyline.generated'::text, 'storyline.updated'::text, 'storyline.published'::text, 'storyline.unpublished'::text])) EXECUTE FUNCTION private.studio2_sync_story_source_count();

CREATE TRIGGER studio2_edition_runtime_strict_dual_guard BEFORE INSERT OR UPDATE ON studio2_edition_runtime FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_edition_runtime_strict_dual();

CREATE TRIGGER studio2_edition_runtime_touch_updated_at BEFORE UPDATE ON studio2_edition_runtime FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_updated_at();

CREATE TRIGGER studio2_eligibility_override_touch_version AFTER INSERT OR DELETE OR UPDATE ON studio2_eligibility_overrides FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_eligibility_override_version();

CREATE TRIGGER v3_s3_guard_media_asset_review BEFORE INSERT OR UPDATE ON studio2_media_asset_reviews FOR EACH ROW EXECUTE FUNCTION private.v3_guard_media_asset_review();

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

CREATE TRIGGER trg_studio2_guard_published_result_operation_update BEFORE UPDATE ON studio2_result_operations FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_published_result_operation_update();

CREATE TRIGGER v3_capture_result_version AFTER INSERT OR UPDATE OF calculation_version ON studio2_result_operations FOR EACH ROW EXECUTE FUNCTION private.v3_capture_result_version();

CREATE CONSTRAINT TRIGGER v3_validate_publication_projection_from_results AFTER INSERT OR DELETE OR UPDATE ON studio2_result_operations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.v3_validate_show_publication_projection();

CREATE TRIGGER v3_validate_publication_control BEFORE INSERT OR UPDATE ON studio2_show_publication_controls FOR EACH ROW EXECUTE FUNCTION private.v3_validate_publication_control();

CREATE CONSTRAINT TRIGGER v3_validate_publication_projection_from_control AFTER INSERT OR UPDATE ON studio2_show_publication_controls DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.v3_validate_show_publication_projection();

CREATE TRIGGER revoke_confirmation_tokens_on_round_close AFTER INSERT OR UPDATE OF editing_enabled ON submission_rounds FOR EACH ROW WHEN (NOT COALESCE(new.editing_enabled, false)) EXECUTE FUNCTION private.revoke_confirmation_tokens_on_round_close();

CREATE TRIGGER studio2_confirmation_round_touch_version AFTER INSERT OR UPDATE ON submission_rounds FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_confirmation_round_version();

CREATE TRIGGER studio2_guard_direct_confirmation_round_delete BEFORE DELETE ON submission_rounds FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_direct_confirmation_round_mutation();

CREATE TRIGGER studio2_guard_direct_confirmation_round_update BEFORE INSERT OR UPDATE ON submission_rounds FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_direct_confirmation_round_mutation();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON submission_rounds FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER ensure_submission_recovery_code_trg BEFORE INSERT ON submissions FOR EACH ROW EXECUTE FUNCTION ensure_submission_recovery_code();

CREATE TRIGGER register_submission_browser_trg AFTER INSERT ON submissions FOR EACH ROW EXECUTE FUNCTION register_submission_browser();

CREATE TRIGGER revoke_confirmation_tokens_on_submission_close AFTER INSERT OR UPDATE OF editing_allowed, locked ON submissions FOR EACH ROW WHEN (NOT COALESCE(new.editing_allowed, false) OR COALESCE(new.locked, false)) EXECUTE FUNCTION private.revoke_confirmation_tokens_on_submission_close();

CREATE TRIGGER studio2_confirmation_duplicate_submission_guard BEFORE INSERT OR UPDATE OF country, edition_id ON submissions FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_duplicate_confirmation_submission();

CREATE TRIGGER studio2_confirmation_requirement_reconcile AFTER INSERT OR DELETE OR UPDATE ON submissions FOR EACH ROW EXECUTE FUNCTION private.studio2_confirmation_submission_requirement_trigger();

CREATE TRIGGER studio2_confirmation_submission_touch_round_version AFTER INSERT OR DELETE OR UPDATE ON submissions FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_confirmation_round_version();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON submissions FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER submissions_stats_trg AFTER INSERT OR DELETE ON submissions FOR EACH ROW EXECUTE FUNCTION sync_round_stats();

CREATE TRIGGER v3_guard_entry_submission_scope BEFORE UPDATE OF edition_id ON submissions FOR EACH ROW EXECUTE FUNCTION private.v3_guard_entry_parent_scope();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON televote_votes FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER televote_entity_edition BEFORE INSERT OR UPDATE ON televote_votes FOR EACH ROW EXECUTE FUNCTION assert_entity_edition();

CREATE TRIGGER televote_votes_sync_results AFTER INSERT OR DELETE OR UPDATE ON televote_votes FOR EACH ROW EXECUTE FUNCTION sync_results_after_vote_change();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON televoting_round_bindings FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER televoting_binding_capture_revision BEFORE INSERT OR UPDATE OF last_synced_at, edition_id ON televoting_round_bindings FOR EACH ROW EXECUTE FUNCTION capture_televoting_binding_revision();

CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON voters FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();

CREATE TRIGGER v3_guard_jury_voter_reference_scope BEFORE UPDATE OF edition_id, show_id, country_id, contest_entity_id ON voters FOR EACH ROW EXECUTE FUNCTION private.v3_guard_jury_voter_reference_scope();

CREATE TRIGGER voters_preserve_historical_display BEFORE INSERT OR UPDATE OF name, flag_image, country_id, contest_entity_id, edition_id ON voters FOR EACH ROW EXECUTE FUNCTION preserve_historical_voter_display();

CREATE TRIGGER televoting_combined_results_updated_at BEFORE UPDATE ON televoting.combined_televote_results FOR EACH ROW EXECUTE FUNCTION televoting.update_updated_at_column();

CREATE TRIGGER round_countries_flag_outdated AFTER INSERT OR DELETE OR UPDATE ON televoting.round_countries FOR EACH ROW EXECUTE FUNCTION televoting.flag_round_results_outdated();

CREATE TRIGGER round_entries_flag_outdated AFTER INSERT OR DELETE OR UPDATE ON televoting.round_entries FOR EACH ROW EXECUTE FUNCTION televoting.flag_round_results_outdated();

CREATE TRIGGER round_entries_normalize_trg BEFORE INSERT OR UPDATE ON televoting.round_entries FOR EACH ROW EXECUTE FUNCTION televoting.round_entries_normalize();

CREATE TRIGGER round_entries_sync_countries_trg AFTER INSERT OR DELETE OR UPDATE ON televoting.round_entries FOR EACH ROW EXECUTE FUNCTION televoting.round_entries_sync_countries();

CREATE TRIGGER studio2_televote_entries_touch_round_version AFTER INSERT OR DELETE OR UPDATE ON televoting.round_entries FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_televote_round_version();

CREATE TRIGGER televoting_round_results_updated_at BEFORE UPDATE ON televoting.round_results FOR EACH ROW EXECUTE FUNCTION televoting.update_updated_at_column();

CREATE TRIGGER studio2_guard_direct_televote_status BEFORE UPDATE OF status ON televoting.rounds FOR EACH ROW EXECUTE FUNCTION private.studio2_guard_direct_televote_status();

CREATE TRIGGER studio2_televote_rounds_touch_global_version AFTER INSERT OR DELETE OR UPDATE OF status ON televoting.rounds FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_televote_global_version();

CREATE TRIGGER studio2_televote_rounds_touch_round_version AFTER INSERT OR UPDATE ON televoting.rounds FOR EACH ROW EXECUTE FUNCTION private.studio2_touch_televote_round_version();

CREATE TRIGGER televoting_rounds_updated_at BEFORE UPDATE ON televoting.rounds FOR EACH ROW EXECUTE FUNCTION televoting.update_updated_at_column();

CREATE TRIGGER v3_guard_direct_televote_deadline BEFORE UPDATE OF closes_at ON televoting.rounds FOR EACH ROW EXECUTE FUNCTION private.v3_guard_direct_televote_deadline();

CREATE TRIGGER televoting_participants_outdated AFTER INSERT OR DELETE OR UPDATE ON televoting.televote_aggregation_participants FOR EACH ROW EXECUTE FUNCTION televoting.flag_aggregation_outdated();

CREATE TRIGGER televoting_aggregation_source_robust_input BEFORE INSERT OR UPDATE OF source_round_id, input_mode, calculation_method ON televoting.televote_aggregation_sources FOR EACH ROW EXECUTE FUNCTION televoting.enforce_robust_round_combined_input();

CREATE TRIGGER televoting_sources_outdated AFTER INSERT OR DELETE OR UPDATE ON televoting.televote_aggregation_sources FOR EACH ROW EXECUTE FUNCTION televoting.flag_aggregation_outdated();

CREATE TRIGGER televoting_sources_updated_at BEFORE UPDATE ON televoting.televote_aggregation_sources FOR EACH ROW EXECUTE FUNCTION televoting.update_updated_at_column();

CREATE TRIGGER televoting_aggregations_updated_at BEFORE UPDATE ON televoting.televote_aggregations FOR EACH ROW EXECUTE FUNCTION televoting.update_updated_at_column();

CREATE TRIGGER v3_s3_guard_televote_entry_scope BEFORE INSERT OR UPDATE OF submission_id, target_country_code, is_historical ON televoting.vote_entries FOR EACH ROW EXECUTE FUNCTION private.v3_guard_televote_entry_scope();

CREATE TRIGGER trg_block_sanctioned_submission BEFORE INSERT ON televoting.vote_submissions FOR EACH ROW EXECUTE FUNCTION televoting.block_sanctioned_submission();

CREATE TRIGGER v3_enforce_televote_submission_deadline BEFORE INSERT ON televoting.vote_submissions FOR EACH ROW EXECUTE FUNCTION private.v3_enforce_televote_submission_deadline();

CREATE TRIGGER v3_s3_guard_televote_submission_identity BEFORE INSERT OR UPDATE OF round_id, username, username_normalized, country_code, is_historical ON televoting.vote_submissions FOR EACH ROW EXECUTE FUNCTION private.v3_guard_televote_submission_identity();

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

ALTER TABLE "public"."editions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."editions" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "editions capability write delete" ON "public"."editions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('edition.manage'::text, id, true));

CREATE POLICY "editions capability write insert" ON "public"."editions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('edition.manage'::text, id, true));

CREATE POLICY "editions capability write update" ON "public"."editions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('edition.manage'::text, id, true)) WITH CHECK (studio2_access_allowed('edition.manage'::text, id, true));

CREATE POLICY "solaris consolidated anon read" ON "public"."editions" AS PERMISSIVE FOR SELECT TO "anon" USING ((published OR studio2_access_allowed('edition.read'::text, id, false)));

CREATE POLICY "solaris consolidated authenticated read" ON "public"."editions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('edition.manage'::text, id, true) OR (published OR studio2_access_allowed('edition.read'::text, id, false))));

ALTER TABLE "public"."entries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entries" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "entries capability write delete" ON "public"."entries" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('entry.edit'::text, edition_id, true));

CREATE POLICY "entries capability write insert" ON "public"."entries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('entry.edit'::text, edition_id, true));

CREATE POLICY "entries capability write update" ON "public"."entries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('entry.edit'::text, edition_id, true)) WITH CHECK (studio2_access_allowed('entry.edit'::text, edition_id, true));

CREATE POLICY "solaris consolidated anon read" ON "public"."entries" AS PERMISSIVE FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM editions e
  WHERE ((e.id = entries.edition_id) AND ((e.published = true) OR studio2_access_allowed('entry.read_private'::text, entries.edition_id, false))))));

CREATE POLICY "solaris consolidated authenticated read" ON "public"."entries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('entry.edit'::text, edition_id, true) OR (EXISTS ( SELECT 1
   FROM editions e
  WHERE ((e.id = entries.edition_id) AND ((e.published = true) OR studio2_access_allowed('entry.read_private'::text, entries.edition_id, false))))) OR (EXISTS ( SELECT 1
   FROM country_accounts ca
  WHERE ((ca.user_id = ( SELECT auth.uid() AS uid)) AND (ca.status = 'active'::text) AND (ca.country_id = entries.country_id))))));

ALTER TABLE "public"."internal_entries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."internal_entries" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "internal_entries_organizer_all" ON "public"."internal_entries" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.studio2_submission_access_allowed('entry.approve'::text, submission_id, false)) WITH CHECK (private.studio2_submission_access_allowed('entry.approve'::text, submission_id, false));

ALTER TABLE "public"."jury_ballot_statuses" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."jury_ballot_statuses" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "jury ballot statuses capability read" ON "public"."jury_ballot_statuses" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('jury.ballots.read'::text, edition_id, false) OR studio2_access_allowed('jury.ballots.manage'::text, edition_id, false)));

ALTER TABLE "public"."jury_ballot_submissions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."jury_ballot_submissions" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "solaris consolidated authenticated read" ON "public"."jury_ballot_submissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) OR studio2_access_allowed('jury.ballots.read'::text, edition_id, false)));

ALTER TABLE "public"."jury_votes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."jury_votes" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "jury votes capability write delete" ON "public"."jury_votes" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('jury.ballots.manage'::text, edition_id, true));

CREATE POLICY "jury votes capability write insert" ON "public"."jury_votes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('jury.ballots.manage'::text, edition_id, true));

CREATE POLICY "jury votes capability write update" ON "public"."jury_votes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('jury.ballots.manage'::text, edition_id, true)) WITH CHECK (studio2_access_allowed('jury.ballots.manage'::text, edition_id, true));

CREATE POLICY "solaris consolidated anon read" ON "public"."jury_votes" AS PERMISSIVE FOR SELECT TO "anon" USING ((((show_id IS NOT NULL) AND show_publication_enabled(show_id, 'detailed_voting'::text)) OR ((show_id IS NULL) AND (EXISTS ( SELECT 1
   FROM editions e
  WHERE ((e.id = jury_votes.edition_id) AND (e.published = true))))) OR studio2_access_allowed('jury.ballots.read'::text, edition_id, false)));

CREATE POLICY "solaris consolidated authenticated read" ON "public"."jury_votes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((((show_id IS NOT NULL) AND show_publication_enabled(show_id, 'detailed_voting'::text)) OR ((show_id IS NULL) AND (EXISTS ( SELECT 1
   FROM editions e
  WHERE ((e.id = jury_votes.edition_id) AND (e.published = true))))) OR studio2_access_allowed('jury.ballots.read'::text, edition_id, false) OR studio2_access_allowed('jury.ballots.manage'::text, edition_id, true)));

ALTER TABLE "public"."jury_voting_windows" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."jury_voting_windows" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "capability can manage jury voting windows delete" ON "public"."jury_voting_windows" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, edition_id, true));

CREATE POLICY "capability can manage jury voting windows insert" ON "public"."jury_voting_windows" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('voting.manage'::text, edition_id, true));

CREATE POLICY "capability can manage jury voting windows update" ON "public"."jury_voting_windows" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, edition_id, true)) WITH CHECK (studio2_access_allowed('voting.manage'::text, edition_id, true));

CREATE POLICY "solaris consolidated authenticated read" ON "public"."jury_voting_windows" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('voting.manage'::text, edition_id, true) OR studio2_access_allowed('voting.read'::text, edition_id, false)));

ALTER TABLE "public"."national_final_entries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."national_final_entries" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "national final entries capability manage" ON "public"."national_final_entries" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM national_finals nf
  WHERE ((nf.id = national_final_entries.national_final_id) AND studio2_access_allowed('confirmation.manage'::text, nf.edition_id, true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM national_finals nf
  WHERE ((nf.id = national_final_entries.national_final_id) AND studio2_access_allowed('confirmation.manage'::text, nf.edition_id, true)))));

ALTER TABLE "public"."national_finals" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."national_finals" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "national finals capability manage" ON "public"."national_finals" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('confirmation.manage'::text, edition_id, true)) WITH CHECK (studio2_access_allowed('confirmation.manage'::text, edition_id, true));

ALTER TABLE "public"."next_in_line_responses" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."next_in_line_responses" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "next in line responses capability manage" ON "public"."next_in_line_responses" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('confirmation.manage'::text, edition_id, true)) WITH CHECK (studio2_access_allowed('confirmation.manage'::text, edition_id, true));

ALTER TABLE "public"."next_in_line_submissions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."next_in_line_submissions" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "next in line submissions capability manage" ON "public"."next_in_line_submissions" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('confirmation.manage'::text, edition_id, true)) WITH CHECK (studio2_access_allowed('confirmation.manage'::text, edition_id, true));

ALTER TABLE "public"."notification_deliveries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."notification_deliveries" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "users read own notification deliveries" ON "public"."notification_deliveries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));

ALTER TABLE "public"."participants" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."participants" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "participants capability write delete" ON "public"."participants" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('entry.edit'::text, edition_id, true));

CREATE POLICY "participants capability write insert" ON "public"."participants" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('entry.edit'::text, edition_id, true));

CREATE POLICY "participants capability write update" ON "public"."participants" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('entry.edit'::text, edition_id, true)) WITH CHECK (studio2_access_allowed('entry.edit'::text, edition_id, true));

CREATE POLICY "solaris consolidated anon read" ON "public"."participants" AS PERMISSIVE FOR SELECT TO "anon" USING ((((show_id IS NOT NULL) AND show_publication_enabled(show_id, 'participants'::text)) OR ((show_id IS NULL) AND (EXISTS ( SELECT 1
   FROM editions e
  WHERE ((e.id = participants.edition_id) AND (e.published = true))))) OR studio2_access_allowed('entry.read_private'::text, edition_id, false) OR (publication_status = 'published'::text) OR ((publication_status = 'scheduled'::text) AND (scheduled_publish_at IS NOT NULL) AND (scheduled_publish_at <= now())) OR owns_country(country_id)));

CREATE POLICY "solaris consolidated authenticated read" ON "public"."participants" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('entry.edit'::text, edition_id, true) OR ((show_id IS NOT NULL) AND show_publication_enabled(show_id, 'participants'::text)) OR ((show_id IS NULL) AND (EXISTS ( SELECT 1
   FROM editions e
  WHERE ((e.id = participants.edition_id) AND (e.published = true))))) OR studio2_access_allowed('entry.read_private'::text, edition_id, false) OR (publication_status = 'published'::text) OR ((publication_status = 'scheduled'::text) AND (scheduled_publish_at IS NOT NULL) AND (scheduled_publish_at <= now())) OR owns_country(country_id)));

ALTER TABLE "public"."results" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."results" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "results capability write delete" ON "public"."results" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('results.verify'::text, edition_id, true));

CREATE POLICY "results capability write insert" ON "public"."results" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('results.verify'::text, edition_id, true));

CREATE POLICY "results capability write update" ON "public"."results" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('results.verify'::text, edition_id, true)) WITH CHECK (studio2_access_allowed('results.verify'::text, edition_id, true));

CREATE POLICY "solaris consolidated anon read" ON "public"."results" AS PERMISSIVE FOR SELECT TO "anon" USING ((((show_id IS NOT NULL) AND show_publication_enabled(show_id, 'results'::text)) OR studio2_access_allowed('results.preview'::text, edition_id, false)));

CREATE POLICY "solaris consolidated authenticated read" ON "public"."results" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('results.verify'::text, edition_id, true) OR (((show_id IS NOT NULL) AND show_publication_enabled(show_id, 'results'::text)) OR studio2_access_allowed('results.preview'::text, edition_id, false))));

ALTER TABLE "public"."shows" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."shows" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "shows capability write delete" ON "public"."shows" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('edition.manage'::text, edition_id, true));

CREATE POLICY "shows capability write insert" ON "public"."shows" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('edition.manage'::text, edition_id, true));

CREATE POLICY "shows capability write update" ON "public"."shows" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('edition.manage'::text, edition_id, true)) WITH CHECK (studio2_access_allowed('edition.manage'::text, edition_id, true));

CREATE POLICY "solaris consolidated anon read" ON "public"."shows" AS PERMISSIVE FOR SELECT TO "anon" USING ((published OR studio2_access_allowed('edition.read'::text, edition_id, false)));

CREATE POLICY "solaris consolidated authenticated read" ON "public"."shows" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('edition.manage'::text, edition_id, true) OR (published OR studio2_access_allowed('edition.read'::text, edition_id, false))));

ALTER TABLE "public"."studio2_confirmation_requirements" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_confirmation_requirements" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_contest_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_contest_events" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "studio2_contest_events_capability_read" ON "public"."studio2_contest_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (studio2_access_allowed('edition.read'::text, edition_id, false));

ALTER TABLE "public"."studio2_edition_runtime" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_edition_runtime" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "studio2_edition_runtime_capability_read" ON "public"."studio2_edition_runtime" AS PERMISSIVE FOR SELECT TO "authenticated" USING (studio2_access_allowed('edition.read'::text, edition_id, false));

ALTER TABLE "public"."studio2_eligibility_overrides" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_eligibility_overrides" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_media_asset_reviews" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_media_asset_reviews" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_next_in_line_windows" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_next_in_line_windows" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_operation_receipts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_operation_receipts" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_organizer_tasks" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_organizer_tasks" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_result_operations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_result_operations" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_show_publication_controls" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_show_publication_controls" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."submission_rounds" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."submission_rounds" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "solaris consolidated anon read" ON "public"."submission_rounds" AS PERMISSIVE FOR SELECT TO "anon" USING (true);

CREATE POLICY "solaris consolidated authenticated read" ON "public"."submission_rounds" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('confirmation.manage'::text, edition_id, true) OR true));

CREATE POLICY "submission rounds capability manage delete" ON "public"."submission_rounds" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('confirmation.manage'::text, edition_id, true));

CREATE POLICY "submission rounds capability manage insert" ON "public"."submission_rounds" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('confirmation.manage'::text, edition_id, true));

CREATE POLICY "submission rounds capability manage update" ON "public"."submission_rounds" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('confirmation.manage'::text, edition_id, true)) WITH CHECK (studio2_access_allowed('confirmation.manage'::text, edition_id, true));

ALTER TABLE "public"."submissions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."submissions" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "submissions capability manage" ON "public"."submissions" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('confirmation.manage'::text, edition_id, true)) WITH CHECK (studio2_access_allowed('confirmation.manage'::text, edition_id, true));

ALTER TABLE "public"."televote_votes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."televote_votes" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "solaris consolidated anon read" ON "public"."televote_votes" AS PERMISSIVE FOR SELECT TO "anon" USING ((((show_id IS NOT NULL) AND show_publication_enabled(show_id, 'detailed_voting'::text)) OR ((show_id IS NULL) AND (EXISTS ( SELECT 1
   FROM editions e
  WHERE ((e.id = televote_votes.edition_id) AND (e.published = true))))) OR studio2_access_allowed('televote.ballots.read'::text, edition_id, false)));

CREATE POLICY "solaris consolidated authenticated read" ON "public"."televote_votes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('televote.ballots.manage'::text, edition_id, true) OR (((show_id IS NOT NULL) AND show_publication_enabled(show_id, 'detailed_voting'::text)) OR ((show_id IS NULL) AND (EXISTS ( SELECT 1
   FROM editions e
  WHERE ((e.id = televote_votes.edition_id) AND (e.published = true))))) OR studio2_access_allowed('televote.ballots.read'::text, edition_id, false))));

CREATE POLICY "televote capability write delete" ON "public"."televote_votes" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('televote.ballots.manage'::text, edition_id, true));

CREATE POLICY "televote capability write insert" ON "public"."televote_votes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('televote.ballots.manage'::text, edition_id, true));

CREATE POLICY "televote capability write update" ON "public"."televote_votes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('televote.ballots.manage'::text, edition_id, true)) WITH CHECK (studio2_access_allowed('televote.ballots.manage'::text, edition_id, true));

ALTER TABLE "public"."televoting_round_bindings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."televoting_round_bindings" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "televoting round bindings organizer only" ON "public"."televoting_round_bindings" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, edition_id, false)) WITH CHECK (studio2_access_allowed('voting.manage'::text, edition_id, false));

ALTER TABLE "public"."voters" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."voters" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "solaris consolidated anon read" ON "public"."voters" AS PERMISSIVE FOR SELECT TO "anon" USING ((((show_id IS NOT NULL) AND show_publication_enabled(show_id, 'detailed_voting'::text)) OR ((show_id IS NULL) AND (EXISTS ( SELECT 1
   FROM editions e
  WHERE ((e.id = voters.edition_id) AND (e.published = true))))) OR studio2_access_allowed('voting.read'::text, edition_id, false)));

CREATE POLICY "solaris consolidated authenticated read" ON "public"."voters" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('voting.manage'::text, edition_id, true) OR (((show_id IS NOT NULL) AND show_publication_enabled(show_id, 'detailed_voting'::text)) OR ((show_id IS NULL) AND (EXISTS ( SELECT 1
   FROM editions e
  WHERE ((e.id = voters.edition_id) AND (e.published = true))))) OR studio2_access_allowed('voting.read'::text, edition_id, false))));

CREATE POLICY "voters capability write delete" ON "public"."voters" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, edition_id, true));

CREATE POLICY "voters capability write insert" ON "public"."voters" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('voting.manage'::text, edition_id, true));

CREATE POLICY "voters capability write update" ON "public"."voters" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, edition_id, true)) WITH CHECK (studio2_access_allowed('voting.manage'::text, edition_id, true));

ALTER TABLE "televoting"."combined_televote_component_results" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "televoting"."combined_televote_component_results" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "solaris consolidated anon read" ON "televoting"."combined_televote_component_results" AS PERMISSIVE FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM televoting.televote_aggregations a
  WHERE ((a.id = combined_televote_component_results.aggregation_id) AND (a.status = 'published'::text)))));

CREATE POLICY "solaris consolidated authenticated read" ON "televoting"."combined_televote_component_results" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('voting.manage'::text, NULL::uuid, false) OR (EXISTS ( SELECT 1
   FROM televoting.televote_aggregations a
  WHERE ((a.id = combined_televote_component_results.aggregation_id) AND (a.status = 'published'::text))))));

CREATE POLICY "televoting organizer full access delete" ON "televoting"."combined_televote_component_results" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access insert" ON "televoting"."combined_televote_component_results" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access update" ON "televoting"."combined_televote_component_results" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

ALTER TABLE "televoting"."combined_televote_results" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "televoting"."combined_televote_results" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "solaris consolidated anon read" ON "televoting"."combined_televote_results" AS PERMISSIVE FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM televoting.televote_aggregations a
  WHERE ((a.id = combined_televote_results.aggregation_id) AND (a.status = 'published'::text)))));

CREATE POLICY "solaris consolidated authenticated read" ON "televoting"."combined_televote_results" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('voting.manage'::text, NULL::uuid, false) OR (EXISTS ( SELECT 1
   FROM televoting.televote_aggregations a
  WHERE ((a.id = combined_televote_results.aggregation_id) AND (a.status = 'published'::text))))));

CREATE POLICY "televoting organizer full access delete" ON "televoting"."combined_televote_results" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access insert" ON "televoting"."combined_televote_results" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access update" ON "televoting"."combined_televote_results" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

ALTER TABLE "televoting"."round_countries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "televoting"."round_countries" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "solaris consolidated anon read" ON "televoting"."round_countries" AS PERMISSIVE FOR SELECT TO "anon" USING (true);

CREATE POLICY "solaris consolidated authenticated read" ON "televoting"."round_countries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('voting.manage'::text, NULL::uuid, false) OR true));

CREATE POLICY "televoting organizer full access delete" ON "televoting"."round_countries" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access insert" ON "televoting"."round_countries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access update" ON "televoting"."round_countries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

ALTER TABLE "televoting"."round_entries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "televoting"."round_entries" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "solaris consolidated anon read" ON "televoting"."round_entries" AS PERMISSIVE FOR SELECT TO "anon" USING (true);

CREATE POLICY "solaris consolidated authenticated read" ON "televoting"."round_entries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('voting.manage'::text, NULL::uuid, false) OR true));

CREATE POLICY "televoting organizer full access delete" ON "televoting"."round_entries" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access insert" ON "televoting"."round_entries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access update" ON "televoting"."round_entries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

ALTER TABLE "televoting"."round_results" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "televoting"."round_results" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "solaris consolidated anon read" ON "televoting"."round_results" AS PERMISSIVE FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM televoting.rounds r
  WHERE ((r.id = round_results.round_id) AND (r.results_status = 'published'::text)))));

CREATE POLICY "solaris consolidated authenticated read" ON "televoting"."round_results" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('voting.manage'::text, NULL::uuid, false) OR (EXISTS ( SELECT 1
   FROM televoting.rounds r
  WHERE ((r.id = round_results.round_id) AND (r.results_status = 'published'::text))))));

CREATE POLICY "televoting organizer full access delete" ON "televoting"."round_results" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access insert" ON "televoting"."round_results" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access update" ON "televoting"."round_results" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

ALTER TABLE "televoting"."rounds" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "televoting"."rounds" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "solaris consolidated anon read" ON "televoting"."rounds" AS PERMISSIVE FOR SELECT TO "anon" USING (true);

CREATE POLICY "solaris consolidated authenticated read" ON "televoting"."rounds" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('voting.manage'::text, NULL::uuid, false) OR true));

CREATE POLICY "televoting organizer full access delete" ON "televoting"."rounds" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access insert" ON "televoting"."rounds" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access update" ON "televoting"."rounds" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

ALTER TABLE "televoting"."televote_aggregation_participants" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "televoting"."televote_aggregation_participants" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "solaris consolidated anon read" ON "televoting"."televote_aggregation_participants" AS PERMISSIVE FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM televoting.televote_aggregations a
  WHERE ((a.id = televote_aggregation_participants.aggregation_id) AND (a.status = 'published'::text)))));

CREATE POLICY "solaris consolidated authenticated read" ON "televoting"."televote_aggregation_participants" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('voting.manage'::text, NULL::uuid, false) OR (EXISTS ( SELECT 1
   FROM televoting.televote_aggregations a
  WHERE ((a.id = televote_aggregation_participants.aggregation_id) AND (a.status = 'published'::text))))));

CREATE POLICY "televoting organizer full access delete" ON "televoting"."televote_aggregation_participants" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access insert" ON "televoting"."televote_aggregation_participants" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access update" ON "televoting"."televote_aggregation_participants" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

ALTER TABLE "televoting"."televote_aggregation_sources" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "televoting"."televote_aggregation_sources" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "televoting organizer full access" ON "televoting"."televote_aggregation_sources" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

ALTER TABLE "televoting"."televote_aggregations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "televoting"."televote_aggregations" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "solaris consolidated anon read" ON "televoting"."televote_aggregations" AS PERMISSIVE FOR SELECT TO "anon" USING ((status = 'published'::text));

CREATE POLICY "solaris consolidated authenticated read" ON "televoting"."televote_aggregations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((studio2_access_allowed('voting.manage'::text, NULL::uuid, false) OR (status = 'published'::text)));

CREATE POLICY "televoting organizer full access delete" ON "televoting"."televote_aggregations" AS PERMISSIVE FOR DELETE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access insert" ON "televoting"."televote_aggregations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

CREATE POLICY "televoting organizer full access update" ON "televoting"."televote_aggregations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));

ALTER TABLE "televoting"."vote_entries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "televoting"."vote_entries" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "televoting organizer full access" ON "televoting"."vote_entries" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('televote.ballots.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('televote.ballots.manage'::text, NULL::uuid, false));

ALTER TABLE "televoting"."vote_submissions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "televoting"."vote_submissions" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "televoting organizer full access" ON "televoting"."vote_submissions" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('televote.ballots.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('televote.ballots.manage'::text, NULL::uuid, false));

SET check_function_bodies = on;

COMMIT;
