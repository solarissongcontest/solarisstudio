-- S06: next 17 hosted-observed physical tables: source-only, ZERO ROW local reconstruction.
-- Strict source observed in bounded read-only PG17.11 pg_catalog, 2026-11-10.
-- DO NOT apply to production, do not copy to supabase/migrations/**.
-- Requires the existing 83-table no-network PG17.11 ICU en-US fixture.
BEGIN;
SET LOCAL search_path = public, private, auth, televoting, pg_catalog;
SET LOCAL lock_timeout = '5s';
-- Hosted pgcrypto lives in extensions; install only in this disposable local database.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $s06roles$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dashboard_user') THEN CREATE ROLE dashboard_user NOLOGIN; END IF;
END $s06roles$;

-- Local fixture prerequisite only: the recreated auth owner must resolve auth.* to issue ACL grants.
-- This is NOT a claim of hosted schema/role membership equivalence.
GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;

CREATE TABLE "auth"."audit_log_entries" (
  "instance_id" uuid,
  "id" uuid NOT NULL,
  "payload" json,
  "created_at" timestamp with time zone,
  "ip_address" character varying(64) DEFAULT ''::character varying NOT NULL
);
ALTER TABLE "auth"."audit_log_entries" OWNER TO "supabase_auth_admin";

CREATE TABLE "auth"."instances" (
  "id" uuid NOT NULL,
  "uuid" uuid,
  "raw_base_config" text,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone
);
ALTER TABLE "auth"."instances" OWNER TO "supabase_auth_admin";

CREATE TABLE "auth"."oauth_client_states" (
  "id" uuid NOT NULL,
  "provider_type" text NOT NULL,
  "code_verifier" text,
  "created_at" timestamp with time zone NOT NULL
);
ALTER TABLE "auth"."oauth_client_states" OWNER TO "supabase_auth_admin";

CREATE TABLE "auth"."schema_migrations" (
  "version" character varying(255) NOT NULL
);
ALTER TABLE "auth"."schema_migrations" OWNER TO "supabase_auth_admin";

CREATE TABLE "public"."ssc_rule_interpretations" (
  "id" uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "title" text NOT NULL,
  "question" text NOT NULL,
  "interpretation" text NOT NULL,
  "rationale" text NOT NULL,
  "rule_ids" text[] DEFAULT '{}'::text[] NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "effective_from" timestamp with time zone,
  "published_at" timestamp with time zone,
  "superseded_by" uuid,
  "created_by" uuid,
  "published_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."ssc_rulebook_change_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "release_id" uuid NOT NULL,
  "rule_id" text NOT NULL,
  "change_kind" text DEFAULT 'modified'::text NOT NULL,
  "before_snapshot" jsonb,
  "after_snapshot" jsonb,
  "rationale" text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."studio2_country_media_upload_tokens" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "country_id" uuid NOT NULL,
  "folder" text NOT NULL,
  "object_path" text NOT NULL,
  "original_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "expected_size" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
  "consumed_at" timestamp with time zone
);

CREATE TABLE "public"."studio2_host_bid_evaluations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "bid_id" uuid NOT NULL,
  "criterion" text NOT NULL,
  "score" numeric(4,2) NOT NULL,
  "comment" text,
  "evaluator_user_id" uuid NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."studio2_host_bids" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "country_id" uuid NOT NULL,
  "city" text NOT NULL,
  "venue_name" text NOT NULL,
  "venue_capacity" integer,
  "venue_address" text,
  "airport_summary" text,
  "transport_summary" text,
  "accommodation_beds" integer,
  "production_summary" text,
  "sustainability_summary" text,
  "accessibility_summary" text,
  "local_broadcaster" text,
  "timezone" text,
  "latitude" numeric(9,6),
  "longitude" numeric(9,6),
  "supporting_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "revision" bigint DEFAULT 1 NOT NULL,
  "submitted_at" timestamp with time zone,
  "selected_at" timestamp with time zone,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."studio2_host_operation_executions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "execution_id" uuid NOT NULL,
  "edition_id" uuid NOT NULL,
  "bid_id" uuid,
  "action" text NOT NULL,
  "reason" text NOT NULL,
  "actor_user_id" uuid,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."studio2_host_operations" (
  "edition_id" uuid NOT NULL,
  "selected_bid_id" uuid NOT NULL,
  "revision" bigint DEFAULT 1 NOT NULL,
  "venue_confirmed" boolean DEFAULT false NOT NULL,
  "contracts_ready" boolean DEFAULT false NOT NULL,
  "stage_access_ready" boolean DEFAULT false NOT NULL,
  "technical_ready" boolean DEFAULT false NOT NULL,
  "accreditation_ready" boolean DEFAULT false NOT NULL,
  "hotels_ready" boolean DEFAULT false NOT NULL,
  "transport_ready" boolean DEFAULT false NOT NULL,
  "security_ready" boolean DEFAULT false NOT NULL,
  "rehearsals_ready" boolean DEFAULT false NOT NULL,
  "press_centre_ready" boolean DEFAULT false NOT NULL,
  "accessibility_ready" boolean DEFAULT false NOT NULL,
  "ceremonies_ready" boolean DEFAULT false NOT NULL,
  "notes" text,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."studio2_platform_exit_preflights" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" uuid NOT NULL,
  "from_mode" text NOT NULL,
  "target_mode" text NOT NULL,
  "platform_version" bigint NOT NULL,
  "checks" jsonb NOT NULL,
  "critical_failures" text[] DEFAULT '{}'::text[] NOT NULL,
  "ready" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL,
  "consumed_at" timestamp with time zone
);

CREATE TABLE "public"."studio2_story_operation_executions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "execution_id" uuid NOT NULL,
  "edition_id" uuid NOT NULL,
  "storyline_id" uuid,
  "item_id" uuid,
  "action" text NOT NULL,
  "reason" text NOT NULL,
  "actor_user_id" uuid,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."studio2_storyline_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "storyline_id" uuid NOT NULL,
  "edition_id" uuid NOT NULL,
  "source_event_id" uuid,
  "source_event_type" text,
  "occurred_at" timestamp with time zone NOT NULL,
  "importance" integer NOT NULL,
  "headline" text NOT NULL,
  "summary" text NOT NULL,
  "canonical_facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "included" boolean DEFAULT true NOT NULL,
  "manual_override" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."studio2_storylines" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "title" text NOT NULL,
  "subtitle" text,
  "introduction" text,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "revision" bigint DEFAULT 1 NOT NULL,
  "source_event_count" integer DEFAULT 0 NOT NULL,
  "generated_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "published_by" uuid,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."studio2_upload_authorizations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" uuid,
  "domain" text NOT NULL,
  "entity_id" uuid,
  "scope" text,
  "final_bucket" text NOT NULL,
  "quarantine_path" text NOT NULL,
  "final_path" text NOT NULL,
  "original_name" text NOT NULL,
  "declared_mime" text NOT NULL,
  "expected_size" bigint NOT NULL,
  "authorization_secret" text NOT NULL,
  "status" text DEFAULT 'prepared'::text NOT NULL,
  "context" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "detected_mime" text,
  "verified_metadata" jsonb,
  "rejection_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
  "finalized_at" timestamp with time zone
);

CREATE TABLE "televoting"."round_influence_results" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "round_id" uuid NOT NULL,
  "calculation_version" integer NOT NULL,
  "subject_type" text NOT NULL,
  "subject_key" text NOT NULL,
  "members" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "winner_changed" boolean DEFAULT false NOT NULL,
  "top_three_changed" boolean DEFAULT false NOT NULL,
  "qualifier_changed" boolean DEFAULT false NOT NULL,
  "max_rank_movement" integer DEFAULT 0 NOT NULL,
  "max_point_movement" integer DEFAULT 0 NOT NULL,
  "most_affected_entry" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "auth"."audit_log_entries" ADD CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."instances" ADD CONSTRAINT "instances_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."oauth_client_states" ADD CONSTRAINT "oauth_client_states_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."schema_migrations" ADD CONSTRAINT "schema_migrations_pkey" PRIMARY KEY (version);
ALTER TABLE "public"."ssc_rule_interpretations" ADD CONSTRAINT "ssc_rule_interpretation_has_rules" CHECK (cardinality(rule_ids) > 0);
ALTER TABLE "public"."ssc_rule_interpretations" ADD CONSTRAINT "ssc_rule_interpretation_not_self_superseded" CHECK (superseded_by IS NULL OR superseded_by <> id);
ALTER TABLE "public"."ssc_rule_interpretations" ADD CONSTRAINT "ssc_rule_interpretation_publication_consistency" CHECK (status = 'draft'::text AND published_at IS NULL AND published_by IS NULL AND superseded_by IS NULL OR status = 'published'::text AND published_at IS NOT NULL AND superseded_by IS NULL OR status = 'superseded'::text AND published_at IS NOT NULL AND superseded_by IS NOT NULL);
ALTER TABLE "public"."ssc_rule_interpretations" ADD CONSTRAINT "ssc_rule_interpretations_code_key" UNIQUE (code);
ALTER TABLE "public"."ssc_rule_interpretations" ADD CONSTRAINT "ssc_rule_interpretations_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."ssc_rule_interpretations" ADD CONSTRAINT "ssc_rule_interpretations_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'superseded'::text]));
ALTER TABLE "public"."ssc_rulebook_change_items" ADD CONSTRAINT "ssc_rulebook_change_items_change_kind_check" CHECK (change_kind = ANY (ARRAY['added'::text, 'modified'::text, 'removed'::text, 'interpretation'::text]));
ALTER TABLE "public"."ssc_rulebook_change_items" ADD CONSTRAINT "ssc_rulebook_change_items_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."ssc_rulebook_change_items" ADD CONSTRAINT "ssc_rulebook_change_items_release_id_rule_id_key" UNIQUE (release_id, rule_id);
ALTER TABLE "public"."ssc_rulebook_change_items" ADD CONSTRAINT "ssc_rulebook_change_items_rule_id_check" CHECK (rule_id ~ '^[0-9]+\.[0-9]+$'::text);
ALTER TABLE "public"."ssc_rulebook_change_items" ADD CONSTRAINT "ssc_rulebook_change_snapshot_requirements" CHECK (change_kind = 'added'::text AND before_snapshot IS NULL AND after_snapshot IS NOT NULL OR (change_kind = ANY (ARRAY['modified'::text, 'interpretation'::text])) AND before_snapshot IS NOT NULL AND after_snapshot IS NOT NULL OR change_kind = 'removed'::text AND before_snapshot IS NOT NULL AND after_snapshot IS NULL);
ALTER TABLE "public"."ssc_rulebook_change_items" ADD CONSTRAINT "ssc_rulebook_snapshot_shape" CHECK ((before_snapshot IS NULL OR jsonb_typeof(before_snapshot) = 'object'::text) AND (after_snapshot IS NULL OR jsonb_typeof(after_snapshot) = 'object'::text));
ALTER TABLE "public"."studio2_country_media_upload_tokens" ADD CONSTRAINT "studio2_country_media_upload_expiry_check" CHECK (expires_at > created_at);
ALTER TABLE "public"."studio2_country_media_upload_tokens" ADD CONSTRAINT "studio2_country_media_upload_tokens_expected_size_check" CHECK (expected_size > 0 AND expected_size <= 8388608);
ALTER TABLE "public"."studio2_country_media_upload_tokens" ADD CONSTRAINT "studio2_country_media_upload_tokens_folder_check" CHECK (folder = ANY (ARRAY['flags'::text, 'gallery'::text, 'backgrounds'::text]));
ALTER TABLE "public"."studio2_country_media_upload_tokens" ADD CONSTRAINT "studio2_country_media_upload_tokens_mime_type_check" CHECK (mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'image/gif'::text]));
ALTER TABLE "public"."studio2_country_media_upload_tokens" ADD CONSTRAINT "studio2_country_media_upload_tokens_object_path_key" UNIQUE (object_path);
ALTER TABLE "public"."studio2_country_media_upload_tokens" ADD CONSTRAINT "studio2_country_media_upload_tokens_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_host_bid_evaluations" ADD CONSTRAINT "studio2_host_bid_evaluations_bid_id_criterion_evaluator_use_key" UNIQUE (bid_id, criterion, evaluator_user_id);
ALTER TABLE "public"."studio2_host_bid_evaluations" ADD CONSTRAINT "studio2_host_bid_evaluations_criterion_check" CHECK (criterion = ANY (ARRAY['technical'::text, 'venue'::text, 'transport'::text, 'accommodation'::text, 'security'::text, 'cost'::text, 'broadcaster'::text, 'accessibility'::text, 'sustainability'::text]));
ALTER TABLE "public"."studio2_host_bid_evaluations" ADD CONSTRAINT "studio2_host_bid_evaluations_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_host_bid_evaluations" ADD CONSTRAINT "studio2_host_bid_evaluations_score_check" CHECK (score >= 0::numeric AND score <= 10::numeric);
ALTER TABLE "public"."studio2_host_bids" ADD CONSTRAINT "studio2_host_bids_accommodation_beds_check" CHECK (accommodation_beds IS NULL OR accommodation_beds >= 0);
ALTER TABLE "public"."studio2_host_bids" ADD CONSTRAINT "studio2_host_bids_city_check" CHECK (length(btrim(city)) >= 2);
ALTER TABLE "public"."studio2_host_bids" ADD CONSTRAINT "studio2_host_bids_latitude_check" CHECK (latitude IS NULL OR latitude >= '-90'::integer::numeric AND latitude <= 90::numeric);
ALTER TABLE "public"."studio2_host_bids" ADD CONSTRAINT "studio2_host_bids_longitude_check" CHECK (longitude IS NULL OR longitude >= '-180'::integer::numeric AND longitude <= 180::numeric);
ALTER TABLE "public"."studio2_host_bids" ADD CONSTRAINT "studio2_host_bids_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_host_bids" ADD CONSTRAINT "studio2_host_bids_revision_check" CHECK (revision >= 1);
ALTER TABLE "public"."studio2_host_bids" ADD CONSTRAINT "studio2_host_bids_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'eligible'::text, 'shortlisted'::text, 'selected'::text, 'rejected'::text, 'withdrawn'::text, 'superseded'::text]));
ALTER TABLE "public"."studio2_host_bids" ADD CONSTRAINT "studio2_host_bids_supporting_links_check" CHECK (jsonb_typeof(supporting_links) = 'array'::text);
ALTER TABLE "public"."studio2_host_bids" ADD CONSTRAINT "studio2_host_bids_venue_capacity_check" CHECK (venue_capacity IS NULL OR venue_capacity > 0);
ALTER TABLE "public"."studio2_host_bids" ADD CONSTRAINT "studio2_host_bids_venue_name_check" CHECK (length(btrim(venue_name)) >= 2);
ALTER TABLE "public"."studio2_host_operation_executions" ADD CONSTRAINT "studio2_host_operation_executions_action_check" CHECK (action = ANY (ARRAY['create_bid'::text, 'update_bid'::text, 'submit_bid'::text, 'mark_eligible'::text, 'shortlist_bid'::text, 'reject_bid'::text, 'withdraw_bid'::text, 'select_bid'::text, 'evaluate_bid'::text, 'update_operations'::text, 'set_show_host'::text, 'sync_show_hosts'::text]));
ALTER TABLE "public"."studio2_host_operation_executions" ADD CONSTRAINT "studio2_host_operation_executions_execution_id_key" UNIQUE (execution_id);
ALTER TABLE "public"."studio2_host_operation_executions" ADD CONSTRAINT "studio2_host_operation_executions_payload_check" CHECK (jsonb_typeof(payload) = 'object'::text);
ALTER TABLE "public"."studio2_host_operation_executions" ADD CONSTRAINT "studio2_host_operation_executions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_host_operation_executions" ADD CONSTRAINT "studio2_host_operation_executions_reason_check" CHECK (length(btrim(reason)) >= 5);
ALTER TABLE "public"."studio2_host_operations" ADD CONSTRAINT "studio2_host_operations_pkey" PRIMARY KEY (edition_id);
ALTER TABLE "public"."studio2_host_operations" ADD CONSTRAINT "studio2_host_operations_revision_check" CHECK (revision >= 1);
ALTER TABLE "public"."studio2_host_operations" ADD CONSTRAINT "studio2_host_operations_selected_bid_id_key" UNIQUE (selected_bid_id);
ALTER TABLE "public"."studio2_platform_exit_preflights" ADD CONSTRAINT "studio2_platform_exit_preflight_expiry_check" CHECK (expires_at > created_at);
ALTER TABLE "public"."studio2_platform_exit_preflights" ADD CONSTRAINT "studio2_platform_exit_preflights_checks_check" CHECK (jsonb_typeof(checks) = 'object'::text);
ALTER TABLE "public"."studio2_platform_exit_preflights" ADD CONSTRAINT "studio2_platform_exit_preflights_from_mode_check" CHECK (from_mode = ANY (ARRAY['maintenance'::text, 'read_only'::text]));
ALTER TABLE "public"."studio2_platform_exit_preflights" ADD CONSTRAINT "studio2_platform_exit_preflights_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_platform_exit_preflights" ADD CONSTRAINT "studio2_platform_exit_preflights_platform_version_check" CHECK (platform_version > 0);
ALTER TABLE "public"."studio2_platform_exit_preflights" ADD CONSTRAINT "studio2_platform_exit_preflights_target_mode_check" CHECK (target_mode = ANY (ARRAY['read_only'::text, 'degraded'::text]));
ALTER TABLE "public"."studio2_story_operation_executions" ADD CONSTRAINT "studio2_story_operation_executions_action_check" CHECK (action = ANY (ARRAY['generate_storyline'::text, 'update_storyline'::text, 'create_manual_item'::text, 'update_item'::text, 'reorder_item'::text, 'publish_storyline'::text, 'unpublish_storyline'::text]));
ALTER TABLE "public"."studio2_story_operation_executions" ADD CONSTRAINT "studio2_story_operation_executions_execution_id_key" UNIQUE (execution_id);
ALTER TABLE "public"."studio2_story_operation_executions" ADD CONSTRAINT "studio2_story_operation_executions_payload_check" CHECK (jsonb_typeof(payload) = 'object'::text);
ALTER TABLE "public"."studio2_story_operation_executions" ADD CONSTRAINT "studio2_story_operation_executions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_story_operation_executions" ADD CONSTRAINT "studio2_story_operation_executions_reason_check" CHECK (length(btrim(reason)) >= 5);
ALTER TABLE "public"."studio2_storyline_items" ADD CONSTRAINT "studio2_storyline_items_canonical_facts_check" CHECK (jsonb_typeof(canonical_facts) = 'object'::text);
ALTER TABLE "public"."studio2_storyline_items" ADD CONSTRAINT "studio2_storyline_items_headline_check" CHECK (length(btrim(headline)) >= 3);
ALTER TABLE "public"."studio2_storyline_items" ADD CONSTRAINT "studio2_storyline_items_importance_check" CHECK (importance >= 0 AND importance <= 100);
ALTER TABLE "public"."studio2_storyline_items" ADD CONSTRAINT "studio2_storyline_items_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_storyline_items" ADD CONSTRAINT "studio2_storyline_items_summary_check" CHECK (length(btrim(summary)) >= 3);
ALTER TABLE "public"."studio2_storylines" ADD CONSTRAINT "studio2_storylines_edition_id_key" UNIQUE (edition_id);
ALTER TABLE "public"."studio2_storylines" ADD CONSTRAINT "studio2_storylines_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_storylines" ADD CONSTRAINT "studio2_storylines_publication_check" CHECK (status = 'published'::text AND published_at IS NOT NULL OR status = 'draft'::text AND published_at IS NULL);
ALTER TABLE "public"."studio2_storylines" ADD CONSTRAINT "studio2_storylines_revision_check" CHECK (revision >= 1);
ALTER TABLE "public"."studio2_storylines" ADD CONSTRAINT "studio2_storylines_source_event_count_check" CHECK (source_event_count >= 0);
ALTER TABLE "public"."studio2_storylines" ADD CONSTRAINT "studio2_storylines_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]));
ALTER TABLE "public"."studio2_storylines" ADD CONSTRAINT "studio2_storylines_title_check" CHECK (length(btrim(title)) >= 3);
ALTER TABLE "public"."studio2_upload_authorizations" ADD CONSTRAINT "studio2_upload_authorization_expiry_check" CHECK (expires_at > created_at);
ALTER TABLE "public"."studio2_upload_authorizations" ADD CONSTRAINT "studio2_upload_authorizations_context_check" CHECK (jsonb_typeof(context) = 'object'::text);
ALTER TABLE "public"."studio2_upload_authorizations" ADD CONSTRAINT "studio2_upload_authorizations_domain_check" CHECK (domain = ANY (ARRAY['country_media'::text, 'edition_artwork'::text, 'country_font'::text, 'beta_feedback'::text, 'integrity_evidence'::text]));
ALTER TABLE "public"."studio2_upload_authorizations" ADD CONSTRAINT "studio2_upload_authorizations_expected_size_check" CHECK (expected_size > 0 AND expected_size <= 15728640);
ALTER TABLE "public"."studio2_upload_authorizations" ADD CONSTRAINT "studio2_upload_authorizations_final_path_key" UNIQUE (final_path);
ALTER TABLE "public"."studio2_upload_authorizations" ADD CONSTRAINT "studio2_upload_authorizations_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_upload_authorizations" ADD CONSTRAINT "studio2_upload_authorizations_quarantine_path_key" UNIQUE (quarantine_path);
ALTER TABLE "public"."studio2_upload_authorizations" ADD CONSTRAINT "studio2_upload_authorizations_status_check" CHECK (status = ANY (ARRAY['prepared'::text, 'verified'::text, 'rejected'::text, 'expired'::text]));
ALTER TABLE "televoting"."round_influence_results" ADD CONSTRAINT "round_influence_results_pkey" PRIMARY KEY (id);
ALTER TABLE "televoting"."round_influence_results" ADD CONSTRAINT "round_influence_results_round_id_calculation_version_subjec_key" UNIQUE (round_id, calculation_version, subject_type, subject_key);
ALTER TABLE "televoting"."round_influence_results" ADD CONSTRAINT "round_influence_results_subject_type_check" CHECK (subject_type = ANY (ARRAY['voter'::text, 'cluster'::text]));

-- Every referenced primary/unique key is installed before foreign keys.
ALTER TABLE "public"."ssc_rule_interpretations" ADD CONSTRAINT "ssc_rule_interpretations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."ssc_rule_interpretations" ADD CONSTRAINT "ssc_rule_interpretations_published_by_fkey" FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."ssc_rule_interpretations" ADD CONSTRAINT "ssc_rule_interpretations_superseded_by_fkey" FOREIGN KEY (superseded_by) REFERENCES ssc_rule_interpretations(id) ON DELETE RESTRICT;
ALTER TABLE "public"."ssc_rulebook_change_items" ADD CONSTRAINT "ssc_rulebook_change_items_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."ssc_rulebook_change_items" ADD CONSTRAINT "ssc_rulebook_change_items_release_id_fkey" FOREIGN KEY (release_id) REFERENCES ssc_rulebook_releases(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_country_media_upload_tokens" ADD CONSTRAINT "studio2_country_media_upload_tokens_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_country_media_upload_tokens" ADD CONSTRAINT "studio2_country_media_upload_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_host_bid_evaluations" ADD CONSTRAINT "studio2_host_bid_evaluations_bid_id_fkey" FOREIGN KEY (bid_id) REFERENCES studio2_host_bids(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_host_bid_evaluations" ADD CONSTRAINT "studio2_host_bid_evaluations_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_host_bid_evaluations" ADD CONSTRAINT "studio2_host_bid_evaluations_evaluator_user_id_fkey" FOREIGN KEY (evaluator_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_host_bids" ADD CONSTRAINT "studio2_host_bids_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE RESTRICT;
ALTER TABLE "public"."studio2_host_bids" ADD CONSTRAINT "studio2_host_bids_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_host_bids" ADD CONSTRAINT "studio2_host_bids_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_host_bids" ADD CONSTRAINT "studio2_host_bids_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_host_operation_executions" ADD CONSTRAINT "studio2_host_operation_executions_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_host_operation_executions" ADD CONSTRAINT "studio2_host_operation_executions_bid_id_fkey" FOREIGN KEY (bid_id) REFERENCES studio2_host_bids(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_host_operation_executions" ADD CONSTRAINT "studio2_host_operation_executions_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_host_operations" ADD CONSTRAINT "studio2_host_operations_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_host_operations" ADD CONSTRAINT "studio2_host_operations_selected_bid_id_fkey" FOREIGN KEY (selected_bid_id) REFERENCES studio2_host_bids(id) ON DELETE RESTRICT;
ALTER TABLE "public"."studio2_host_operations" ADD CONSTRAINT "studio2_host_operations_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_platform_exit_preflights" ADD CONSTRAINT "studio2_platform_exit_preflights_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_story_operation_executions" ADD CONSTRAINT "studio2_story_operation_executions_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_story_operation_executions" ADD CONSTRAINT "studio2_story_operation_executions_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_story_operation_executions" ADD CONSTRAINT "studio2_story_operation_executions_item_id_fkey" FOREIGN KEY (item_id) REFERENCES studio2_storyline_items(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_story_operation_executions" ADD CONSTRAINT "studio2_story_operation_executions_storyline_id_fkey" FOREIGN KEY (storyline_id) REFERENCES studio2_storylines(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_storyline_items" ADD CONSTRAINT "studio2_storyline_items_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_storyline_items" ADD CONSTRAINT "studio2_storyline_items_source_event_id_fkey" FOREIGN KEY (source_event_id) REFERENCES studio2_contest_events(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_storyline_items" ADD CONSTRAINT "studio2_storyline_items_storyline_id_fkey" FOREIGN KEY (storyline_id) REFERENCES studio2_storylines(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_storyline_items" ADD CONSTRAINT "studio2_storyline_items_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_storylines" ADD CONSTRAINT "studio2_storylines_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_storylines" ADD CONSTRAINT "studio2_storylines_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_storylines" ADD CONSTRAINT "studio2_storylines_published_by_fkey" FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_storylines" ADD CONSTRAINT "studio2_storylines_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_upload_authorizations" ADD CONSTRAINT "studio2_upload_authorizations_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "televoting"."round_influence_results" ADD CONSTRAINT "round_influence_results_round_id_fkey" FOREIGN KEY (round_id) REFERENCES televoting.rounds(id) ON DELETE CASCADE;

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);
CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);
CREATE INDEX ssc_rule_interpretations_publication_idx ON public.ssc_rule_interpretations USING btree (status, effective_from DESC, published_at DESC);
CREATE INDEX ssc_rule_interpretations_rules_idx ON public.ssc_rule_interpretations USING gin (rule_ids);
CREATE INDEX ssc_rulebook_change_release_idx ON public.ssc_rulebook_change_items USING btree (release_id, rule_id);
CREATE INDEX studio2_country_media_upload_tokens_active_idx ON public.studio2_country_media_upload_tokens USING btree (user_id, expires_at) WHERE (consumed_at IS NULL);
CREATE INDEX studio2_host_bid_evaluations_bid_idx ON public.studio2_host_bid_evaluations USING btree (bid_id);
CREATE INDEX studio2_host_bid_evaluations_edition_idx ON public.studio2_host_bid_evaluations USING btree (edition_id, bid_id);
CREATE INDEX studio2_host_bid_evaluations_evaluator_idx ON public.studio2_host_bid_evaluations USING btree (evaluator_user_id);
CREATE INDEX studio2_host_bids_country_idx ON public.studio2_host_bids USING btree (country_id);
CREATE INDEX studio2_host_bids_created_by_idx ON public.studio2_host_bids USING btree (created_by);
CREATE INDEX studio2_host_bids_edition_status_idx ON public.studio2_host_bids USING btree (edition_id, status, updated_at DESC);
CREATE UNIQUE INDEX studio2_host_bids_one_selected_per_edition_idx ON public.studio2_host_bids USING btree (edition_id) WHERE (status = 'selected'::text);
CREATE INDEX studio2_host_bids_updated_by_idx ON public.studio2_host_bids USING btree (updated_by);
CREATE INDEX studio2_host_operation_executions_actor_idx ON public.studio2_host_operation_executions USING btree (actor_user_id);
CREATE INDEX studio2_host_operation_executions_bid_idx ON public.studio2_host_operation_executions USING btree (bid_id, created_at DESC);
CREATE INDEX studio2_host_operation_executions_edition_idx ON public.studio2_host_operation_executions USING btree (edition_id, created_at DESC);
CREATE INDEX studio2_host_operations_updated_by_idx ON public.studio2_host_operations USING btree (updated_by);
CREATE INDEX studio2_platform_exit_preflights_actor_idx ON public.studio2_platform_exit_preflights USING btree (actor_id, created_at DESC);
CREATE INDEX studio2_story_operation_executions_actor_idx ON public.studio2_story_operation_executions USING btree (actor_user_id);
CREATE INDEX studio2_story_operation_executions_edition_idx ON public.studio2_story_operation_executions USING btree (edition_id, created_at DESC);
CREATE INDEX studio2_story_operation_executions_item_idx ON public.studio2_story_operation_executions USING btree (item_id, created_at DESC);
CREATE INDEX studio2_story_operation_executions_storyline_idx ON public.studio2_story_operation_executions USING btree (storyline_id, created_at DESC);
CREATE INDEX studio2_storyline_items_edition_time_idx ON public.studio2_storyline_items USING btree (edition_id, occurred_at DESC);
CREATE INDEX studio2_storyline_items_source_event_idx ON public.studio2_storyline_items USING btree (source_event_id);
CREATE UNIQUE INDEX studio2_storyline_items_source_unique_idx ON public.studio2_storyline_items USING btree (storyline_id, source_event_id) WHERE (source_event_id IS NOT NULL);
CREATE INDEX studio2_storyline_items_storyline_order_idx ON public.studio2_storyline_items USING btree (storyline_id, included, sort_order, occurred_at);
CREATE INDEX studio2_storyline_items_updated_by_idx ON public.studio2_storyline_items USING btree (updated_by);
CREATE INDEX studio2_storylines_created_by_idx ON public.studio2_storylines USING btree (created_by);
CREATE INDEX studio2_storylines_published_by_idx ON public.studio2_storylines USING btree (published_by);
CREATE INDEX studio2_storylines_status_idx ON public.studio2_storylines USING btree (status, published_at DESC);
CREATE INDEX studio2_storylines_updated_by_idx ON public.studio2_storylines USING btree (updated_by);
CREATE INDEX studio2_upload_authorizations_active_idx ON public.studio2_upload_authorizations USING btree (expires_at, domain) WHERE (status = 'prepared'::text);
CREATE INDEX televoting_round_influence_round_idx ON televoting.round_influence_results USING btree (round_id, calculation_version);

ALTER TABLE "auth"."audit_log_entries" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): auth.audit_log_entries
SET ROLE "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."audit_log_entries" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."audit_log_entries" TO "dashboard_user";
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."audit_log_entries" TO "postgres";
GRANT SELECT ON TABLE "auth"."audit_log_entries" TO "postgres" WITH GRANT OPTION;
RESET ROLE;

ALTER TABLE "auth"."instances" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): auth.instances
SET ROLE "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."instances" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."instances" TO "dashboard_user";
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."instances" TO "postgres";
GRANT SELECT ON TABLE "auth"."instances" TO "postgres" WITH GRANT OPTION;
RESET ROLE;

-- Exact observed relation ACL entries (order and grant options retained): auth.oauth_client_states
SET ROLE "supabase_auth_admin";
-- Unlike the other auth tables, hosted pg_class.relacl lists postgres first.
-- Clear the initial owner default ACL locally, then grant in observed array order.
-- Ownership is retained; this changes NO production state or grant policy.
REVOKE ALL ON TABLE "auth"."oauth_client_states" FROM "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."oauth_client_states" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."oauth_client_states" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."oauth_client_states" TO "dashboard_user";
RESET ROLE;

ALTER TABLE "auth"."schema_migrations" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): auth.schema_migrations
SET ROLE "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."schema_migrations" TO "supabase_auth_admin";
GRANT SELECT ON TABLE "auth"."schema_migrations" TO "postgres" WITH GRANT OPTION;
RESET ROLE;

ALTER TABLE "public"."ssc_rule_interpretations" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): public.ssc_rule_interpretations
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."ssc_rule_interpretations" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."ssc_rule_interpretations" TO "service_role";

ALTER TABLE "public"."ssc_rulebook_change_items" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): public.ssc_rulebook_change_items
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."ssc_rulebook_change_items" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."ssc_rulebook_change_items" TO "service_role";

ALTER TABLE "public"."studio2_country_media_upload_tokens" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): public.studio2_country_media_upload_tokens
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_country_media_upload_tokens" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_country_media_upload_tokens" TO "service_role";

ALTER TABLE "public"."studio2_host_bid_evaluations" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): public.studio2_host_bid_evaluations
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_host_bid_evaluations" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_host_bid_evaluations" TO "service_role";

ALTER TABLE "public"."studio2_host_bids" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): public.studio2_host_bids
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_host_bids" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_host_bids" TO "service_role";

ALTER TABLE "public"."studio2_host_operation_executions" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): public.studio2_host_operation_executions
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_host_operation_executions" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_host_operation_executions" TO "service_role";

ALTER TABLE "public"."studio2_host_operations" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): public.studio2_host_operations
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_host_operations" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_host_operations" TO "service_role";

ALTER TABLE "public"."studio2_platform_exit_preflights" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): public.studio2_platform_exit_preflights
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_platform_exit_preflights" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_platform_exit_preflights" TO "service_role";

ALTER TABLE "public"."studio2_story_operation_executions" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): public.studio2_story_operation_executions
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_story_operation_executions" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_story_operation_executions" TO "service_role";

ALTER TABLE "public"."studio2_storyline_items" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): public.studio2_storyline_items
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_storyline_items" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_storyline_items" TO "service_role";

ALTER TABLE "public"."studio2_storylines" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): public.studio2_storylines
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_storylines" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_storylines" TO "service_role";

ALTER TABLE "public"."studio2_upload_authorizations" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): public.studio2_upload_authorizations
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_upload_authorizations" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_upload_authorizations" TO "service_role";

ALTER TABLE "televoting"."round_influence_results" ENABLE ROW LEVEL SECURITY;
-- Exact observed relation ACL entries (order and grant options retained): televoting.round_influence_results
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "televoting"."round_influence_results" TO "postgres";

COMMIT;
