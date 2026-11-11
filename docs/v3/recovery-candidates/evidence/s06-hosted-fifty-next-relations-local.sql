-- S06 50 more hosted-observed empty table identities, 100 -> 150 / 215.
-- Generated solely from bounded, read-only PG17.11 pg_catalog metadata. NO user rows, credentials, source secrets or hosted writes.
-- Strict parity must be verified again in a --network none disposable PostgreSQL 17.11 container.
-- This is NOT hosted data equivalence, functional trigger/RPC parity, migration authorization, or release certification.
BEGIN;
SET LOCAL search_path=public,private,auth,televoting,pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL check_function_bodies=off;
-- Two local-only sequence dependencies required by the hosted column defaults.
-- They contain no application values and are not counted as table identities.
CREATE SEQUENCE IF NOT EXISTS auth.refresh_tokens_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.admin_audit_log_id_seq;
-- Two additional hosted policy symbols are catalog dependencies, NOT verified bodies.
-- Local-only fail-closed replacements prevent falsely claiming live authorization parity.
CREATE OR REPLACE FUNCTION private.studio2_can_manage_permissions(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql AS $s06_unverified_policy$ BEGIN
  RAISE EXCEPTION 'S06 catalog-only authorization placeholder must never execute';
END $s06_unverified_policy$;
CREATE OR REPLACE FUNCTION private.solaris_confirmation_admin_allowed()
RETURNS boolean LANGUAGE plpgsql AS $s06_unverified_policy$ BEGIN
  RAISE EXCEPTION 'S06 catalog-only authorization placeholder must never execute';
END $s06_unverified_policy$;
-- Hosted integrity-safety CHECK function symbol is catalog-only, not a real implementation.
-- PostgreSQL must resolve it when adding an empty-table CHECK; fail if evaluated.
CREATE OR REPLACE FUNCTION public.integrity_sanction_label(_level integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $s06_unverified_check$ BEGIN
  RAISE EXCEPTION 'S06 catalog-only integrity CHECK placeholder must never execute';
END $s06_unverified_check$;
DO $s06_enum$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='auth' AND t.typname='aal_level') THEN CREATE TYPE "auth"."aal_level" AS ENUM ('aal1', 'aal2', 'aal3'); END IF; END $s06_enum$;
DO $s06_enum$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='auth' AND t.typname='code_challenge_method') THEN CREATE TYPE "auth"."code_challenge_method" AS ENUM ('s256', 'plain'); END IF; END $s06_enum$;
DO $s06_enum$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='auth' AND t.typname='factor_status') THEN CREATE TYPE "auth"."factor_status" AS ENUM ('unverified', 'verified'); END IF; END $s06_enum$;
DO $s06_enum$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='auth' AND t.typname='factor_type') THEN CREATE TYPE "auth"."factor_type" AS ENUM ('totp', 'webauthn', 'phone', 'recovery_code'); END IF; END $s06_enum$;
DO $s06_enum$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='auth' AND t.typname='oauth_authorization_status') THEN CREATE TYPE "auth"."oauth_authorization_status" AS ENUM ('pending', 'approved', 'denied', 'expired'); END IF; END $s06_enum$;
DO $s06_enum$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='auth' AND t.typname='oauth_client_type') THEN CREATE TYPE "auth"."oauth_client_type" AS ENUM ('public', 'confidential'); END IF; END $s06_enum$;
DO $s06_enum$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='auth' AND t.typname='oauth_registration_type') THEN CREATE TYPE "auth"."oauth_registration_type" AS ENUM ('dynamic', 'manual'); END IF; END $s06_enum$;
DO $s06_enum$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='auth' AND t.typname='oauth_response_type') THEN CREATE TYPE "auth"."oauth_response_type" AS ENUM ('code'); END IF; END $s06_enum$;
DO $s06_enum$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='auth' AND t.typname='one_time_token_type') THEN CREATE TYPE "auth"."one_time_token_type" AS ENUM ('confirmation_token', 'reauthentication_token', 'recovery_token', 'email_change_token_new', 'email_change_token_current', 'phone_change_token'); END IF; END $s06_enum$;
-- S06-only nonfunctional trigger placeholder: catalog shape verification; never execute writes in this fixture.
CREATE OR REPLACE FUNCTION "private"."reconcile_organizer_notification_state"() RETURNS trigger LANGUAGE plpgsql AS $s06_placeholder$ BEGIN RAISE EXCEPTION 'S06 catalog-only trigger placeholder must never execute'; END $s06_placeholder$;
-- S06-only nonfunctional trigger placeholder: catalog shape verification; never execute writes in this fixture.
CREATE OR REPLACE FUNCTION "private"."route_organizer_inbox_event"() RETURNS trigger LANGUAGE plpgsql AS $s06_placeholder$ BEGIN RAISE EXCEPTION 'S06 catalog-only trigger placeholder must never execute'; END $s06_placeholder$;
-- S06-only nonfunctional trigger placeholder: catalog shape verification; never execute writes in this fixture.
CREATE OR REPLACE FUNCTION "private"."studio2_permission_approval_task_trigger"() RETURNS trigger LANGUAGE plpgsql AS $s06_placeholder$ BEGIN RAISE EXCEPTION 'S06 catalog-only trigger placeholder must never execute'; END $s06_placeholder$;
-- S06-only nonfunctional trigger placeholder: catalog shape verification; never execute writes in this fixture.
CREATE OR REPLACE FUNCTION "private"."sync_organizer_inbox_integrity_case_resolution"() RETURNS trigger LANGUAGE plpgsql AS $s06_placeholder$ BEGIN RAISE EXCEPTION 'S06 catalog-only trigger placeholder must never execute'; END $s06_placeholder$;
-- S06-only nonfunctional trigger placeholder: catalog shape verification; never execute writes in this fixture.
CREATE OR REPLACE FUNCTION "private"."v3_bridge_confirmation_submission_operation"() RETURNS trigger LANGUAGE plpgsql AS $s06_placeholder$ BEGIN RAISE EXCEPTION 'S06 catalog-only trigger placeholder must never execute'; END $s06_placeholder$;
-- S06-only nonfunctional trigger placeholder: catalog shape verification; never execute writes in this fixture.
CREATE OR REPLACE FUNCTION "private"."v3_emit_result_execution_event"() RETURNS trigger LANGUAGE plpgsql AS $s06_placeholder$ BEGIN RAISE EXCEPTION 'S06 catalog-only trigger placeholder must never execute'; END $s06_placeholder$;
-- S06-only nonfunctional trigger placeholder: catalog shape verification; never execute writes in this fixture.
CREATE OR REPLACE FUNCTION "public"."integrity_apply_case_retention_to_evidence"() RETURNS trigger LANGUAGE plpgsql AS $s06_placeholder$ BEGIN RAISE EXCEPTION 'S06 catalog-only trigger placeholder must never execute'; END $s06_placeholder$;
-- S06-only nonfunctional trigger placeholder: catalog shape verification; never execute writes in this fixture.
CREATE OR REPLACE FUNCTION "public"."integrity_validate_evidence_lineage"() RETURNS trigger LANGUAGE plpgsql AS $s06_placeholder$ BEGIN RAISE EXCEPTION 'S06 catalog-only trigger placeholder must never execute'; END $s06_placeholder$;
CREATE TABLE "auth"."custom_oauth_providers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "provider_type" text NOT NULL,
  "identifier" text NOT NULL,
  "name" text NOT NULL,
  "client_id" text NOT NULL,
  "client_secret" text NOT NULL,
  "acceptable_client_ids" text[] DEFAULT '{}'::text[] NOT NULL,
  "scopes" text[] DEFAULT '{}'::text[] NOT NULL,
  "pkce_enabled" boolean DEFAULT true NOT NULL,
  "attribute_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "authorization_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "email_optional" boolean DEFAULT false NOT NULL,
  "issuer" text,
  "discovery_url" text,
  "skip_nonce_check" boolean DEFAULT false NOT NULL,
  "cached_discovery" jsonb,
  "discovery_cached_at" timestamp with time zone,
  "authorization_url" text,
  "token_url" text,
  "userinfo_url" text,
  "jwks_uri" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "custom_claims_allowlist" text[] DEFAULT '{}'::text[] NOT NULL
);
ALTER TABLE "auth"."custom_oauth_providers" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."flow_state" (
  "id" uuid NOT NULL,
  "user_id" uuid,
  "auth_code" text,
  "code_challenge_method" auth.code_challenge_method,
  "code_challenge" text,
  "provider_type" text NOT NULL,
  "provider_access_token" text,
  "provider_refresh_token" text,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "authentication_method" text NOT NULL,
  "auth_code_issued_at" timestamp with time zone,
  "invite_token" text,
  "referrer" text,
  "oauth_client_state_id" uuid,
  "linking_target_id" uuid,
  "email_optional" boolean DEFAULT false NOT NULL
);
ALTER TABLE "auth"."flow_state" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."identities" (
  "provider_id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "identity_data" jsonb NOT NULL,
  "provider" text NOT NULL,
  "last_sign_in_at" timestamp with time zone,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "email" text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
  "id" uuid DEFAULT gen_random_uuid() NOT NULL
);
ALTER TABLE "auth"."identities" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."mfa_amr_claims" (
  "session_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "authentication_method" text NOT NULL,
  "id" uuid NOT NULL
);
ALTER TABLE "auth"."mfa_amr_claims" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."mfa_challenges" (
  "id" uuid NOT NULL,
  "factor_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "verified_at" timestamp with time zone,
  "ip_address" inet NOT NULL,
  "otp_code" text,
  "web_authn_session_data" jsonb
);
ALTER TABLE "auth"."mfa_challenges" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."mfa_factors" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "friendly_name" text,
  "factor_type" auth.factor_type NOT NULL,
  "status" auth.factor_status NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "secret" text,
  "phone" text,
  "last_challenged_at" timestamp with time zone,
  "web_authn_credential" jsonb,
  "web_authn_aaguid" uuid,
  "last_webauthn_challenge_data" jsonb
);
ALTER TABLE "auth"."mfa_factors" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."mfa_recovery_code_sets" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "mfa_factor_id" uuid NOT NULL,
  "failed_verification_count" integer DEFAULT 0 NOT NULL,
  "verification_locked_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "auth"."mfa_recovery_code_sets" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."mfa_recovery_codes" (
  "id" uuid NOT NULL,
  "mfa_recovery_code_set_id" uuid NOT NULL,
  "code_hash" text NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "auth"."mfa_recovery_codes" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."oauth_authorizations" (
  "id" uuid NOT NULL,
  "authorization_id" text NOT NULL,
  "client_id" uuid NOT NULL,
  "user_id" uuid,
  "redirect_uri" text NOT NULL,
  "scope" text NOT NULL,
  "state" text,
  "resource" text,
  "code_challenge" text,
  "code_challenge_method" auth.code_challenge_method,
  "response_type" auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
  "status" auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
  "authorization_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
  "approved_at" timestamp with time zone,
  "nonce" text
);
ALTER TABLE "auth"."oauth_authorizations" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."oauth_clients" (
  "id" uuid NOT NULL,
  "client_secret_hash" text,
  "registration_type" auth.oauth_registration_type NOT NULL,
  "redirect_uris" text NOT NULL,
  "grant_types" text NOT NULL,
  "client_name" text,
  "client_uri" text,
  "logo_uri" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "client_type" auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
  "token_endpoint_auth_method" text NOT NULL
);
ALTER TABLE "auth"."oauth_clients" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."oauth_consents" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "client_id" uuid NOT NULL,
  "scopes" text NOT NULL,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone
);
ALTER TABLE "auth"."oauth_consents" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."one_time_tokens" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "token_type" auth.one_time_token_type NOT NULL,
  "token_hash" text NOT NULL,
  "relates_to" text NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone
);
ALTER TABLE "auth"."one_time_tokens" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."refresh_tokens" (
  "instance_id" uuid,
  "id" bigint DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass) NOT NULL,
  "token" character varying(255),
  "user_id" character varying(255),
  "revoked" boolean,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "parent" character varying(255),
  "session_id" uuid
);
ALTER TABLE "auth"."refresh_tokens" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."saml_providers" (
  "id" uuid NOT NULL,
  "sso_provider_id" uuid NOT NULL,
  "entity_id" text NOT NULL,
  "metadata_xml" text NOT NULL,
  "metadata_url" text,
  "attribute_mapping" jsonb,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "name_id_format" text
);
ALTER TABLE "auth"."saml_providers" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."saml_relay_states" (
  "id" uuid NOT NULL,
  "sso_provider_id" uuid NOT NULL,
  "request_id" text NOT NULL,
  "for_email" text,
  "redirect_to" text,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "flow_state_id" uuid
);
ALTER TABLE "auth"."saml_relay_states" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."scim_tokens" (
  "id" uuid NOT NULL,
  "sso_provider_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "prefix" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "last_used_at" timestamp with time zone
);
ALTER TABLE "auth"."scim_tokens" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."scim_users" (
  "id" uuid NOT NULL,
  "sso_provider_id" uuid NOT NULL,
  "user_id" uuid,
  "resource" jsonb NOT NULL,
  "user_name" text GENERATED ALWAYS AS (lower((resource ->> 'userName'::text))) STORED NOT NULL,
  "external_id" text GENERATED ALWAYS AS ((resource ->> 'externalId'::text)) STORED,
  "active" boolean GENERATED ALWAYS AS (COALESCE(((resource ->> 'active'::text))::boolean, true)) STORED NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
ALTER TABLE "auth"."scim_users" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."sessions" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "factor_id" uuid,
  "aal" auth.aal_level,
  "not_after" timestamp with time zone,
  "refreshed_at" timestamp without time zone,
  "user_agent" text,
  "ip" inet,
  "tag" text,
  "oauth_client_id" uuid,
  "refresh_token_hmac_key" text,
  "refresh_token_counter" bigint,
  "scopes" text
);
ALTER TABLE "auth"."sessions" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."sso_domains" (
  "id" uuid NOT NULL,
  "sso_provider_id" uuid NOT NULL,
  "domain" text NOT NULL,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone
);
ALTER TABLE "auth"."sso_domains" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."sso_providers" (
  "id" uuid NOT NULL,
  "resource_id" text,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "disabled" boolean
);
ALTER TABLE "auth"."sso_providers" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."webauthn_challenges" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "challenge_type" text NOT NULL,
  "session_data" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
ALTER TABLE "auth"."webauthn_challenges" OWNER TO "supabase_auth_admin";
CREATE TABLE "auth"."webauthn_credentials" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "credential_id" bytea NOT NULL,
  "public_key" bytea NOT NULL,
  "attestation_type" text DEFAULT ''::text NOT NULL,
  "aaguid" uuid,
  "sign_count" bigint DEFAULT 0 NOT NULL,
  "transports" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "backup_eligible" boolean DEFAULT false NOT NULL,
  "backed_up" boolean DEFAULT false NOT NULL,
  "friendly_name" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone
);
ALTER TABLE "auth"."webauthn_credentials" OWNER TO "supabase_auth_admin";
CREATE TABLE "private"."v3_confirmation_operations" (
  "idempotency_key" uuid NOT NULL,
  "request_hash" text NOT NULL,
  "round_id" uuid NOT NULL,
  "browser_session_id" text NOT NULL,
  "result" jsonb NOT NULL,
  "receipt_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."admin_audit_log" (
  "id" bigint DEFAULT nextval('admin_audit_log_id_seq'::regclass) NOT NULL,
  "actor_id" uuid,
  "action" text NOT NULL,
  "table_name" text NOT NULL,
  "record_id" text,
  "edition_id" uuid,
  "country_id" uuid,
  "before_data" jsonb,
  "after_data" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."integrity_case_access" (
  "case_id" uuid NOT NULL,
  "recovery_secret_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."integrity_case_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "detail" text,
  "visible_to_reporter" boolean DEFAULT true NOT NULL,
  "actor_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."integrity_case_evidence" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "source_role" text NOT NULL,
  "evidence_type" text DEFAULT 'file'::text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "storage_path" text,
  "original_name" text,
  "mime_type" text,
  "size_bytes" bigint,
  "external_url" text,
  "provenance" text,
  "redacted_from_id" uuid,
  "disclosure_copy_of_id" uuid,
  "visible_to_reporter" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "retention_until" timestamp with time zone,
  "lifecycle_status" text DEFAULT 'active'::text NOT NULL,
  "deletion_reason" text,
  "deleted_at" timestamp with time zone,
  "deleted_by" uuid
);
CREATE TABLE "public"."integrity_case_findings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "outcome" text NOT NULL,
  "summary" text NOT NULL,
  "rationale" text NOT NULL,
  "rule_ids" text[] DEFAULT '{}'::text[] NOT NULL,
  "visible_to_reporter" boolean DEFAULT true NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."integrity_case_internal_notes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "body" text NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."integrity_case_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "author_role" text NOT NULL,
  "body" text NOT NULL,
  "visible_to_reporter" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."integrity_case_relations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "related_case_id" uuid NOT NULL,
  "relation_type" text NOT NULL,
  "note" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."integrity_case_requests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "request_kind" text DEFAULT 'clarification'::text NOT NULL,
  "prompt" text NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "visible_to_reporter" boolean DEFAULT true NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "responded_at" timestamp with time zone
);
CREATE TABLE "public"."integrity_case_reviewers" (
  "case_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "review_role" text NOT NULL,
  "assigned_by" uuid NOT NULL,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "recused_at" timestamp with time zone,
  "recusal_reason" text
);
CREATE TABLE "public"."integrity_case_rule_links" (
  "case_id" uuid NOT NULL,
  "rule_id" text NOT NULL,
  "relevance" text DEFAULT 'reviewed'::text NOT NULL,
  "note" text,
  "added_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."integrity_case_sanctions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "finding_id" uuid NOT NULL,
  "typical_level" integer,
  "final_level" integer NOT NULL,
  "sanction_label" text NOT NULL,
  "target_type" text NOT NULL,
  "target_reference" text,
  "aggravating_factors" text[] DEFAULT '{}'::text[] NOT NULL,
  "mitigating_factors" text[] DEFAULT '{}'::text[] NOT NULL,
  "rationale" text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "supersedes_sanction_id" uuid,
  "visible_to_reporter" boolean DEFAULT true NOT NULL,
  "effective_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."integrity_cases" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "public_code" text NOT NULL,
  "case_kind" text DEFAULT 'report'::text NOT NULL,
  "category" text NOT NULL,
  "identity_mode" text DEFAULT 'anonymous'::text NOT NULL,
  "reporter_user_id" uuid,
  "summary" text NOT NULL,
  "details" text NOT NULL,
  "observed_facts" text,
  "uncertainties" text,
  "related_countries" text[] DEFAULT '{}'::text[] NOT NULL,
  "edition_reference" text,
  "status" text DEFAULT 'received'::text NOT NULL,
  "priority" text DEFAULT 'standard'::text NOT NULL,
  "assigned_to" uuid,
  "retention_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone
);
CREATE TABLE "public"."integrity_evidence_access_log" (
  "id" uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
  "evidence_id" uuid,
  "case_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "actor_role" text NOT NULL,
  "action" text NOT NULL,
  "detail" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."integrity_evidence_upload_tokens" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "object_path" text NOT NULL,
  "original_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "expected_size" bigint NOT NULL,
  "created_by" uuid,
  "expires_at" timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "derivative_source_evidence_id" uuid,
  "derivative_kind" text
);
CREATE TABLE "public"."integrity_preclearance_rulings" (
  "id" uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "outcome" text NOT NULL,
  "summary" text NOT NULL,
  "rationale" text NOT NULL,
  "rule_ids" text[] DEFAULT '{}'::text[] NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."integrity_public_decisions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "summary" text NOT NULL,
  "rationale" text NOT NULL,
  "rule_ids" text[] DEFAULT '{}'::text[] NOT NULL,
  "published_by" uuid NOT NULL,
  "published_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."permission_evaluation_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id" uuid,
  "edition_id" uuid,
  "capability" text NOT NULL,
  "legacy_allowed" boolean NOT NULL,
  "capability_allowed" boolean NOT NULL,
  "action" text NOT NULL,
  "route" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."round_stats" (
  "round_id" uuid NOT NULL,
  "submitted_count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."ssc_rule_interpretation_sources" (
  "interpretation_id" uuid NOT NULL,
  "case_id" uuid NOT NULL,
  "ruling_id" uuid NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."studio2_access_roles" (
  "key" text NOT NULL,
  "label" text NOT NULL,
  "description" text NOT NULL,
  "is_system" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."studio2_permission_change_approval_requests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "operation_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "target_user_id" uuid,
  "change_kind" text NOT NULL,
  "permission_key" text NOT NULL,
  "edition_id" uuid,
  "access_expires_at" timestamp with time zone,
  "expected_version" bigint NOT NULL,
  "requested_by" uuid,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approval_expires_at" timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL,
  "request_auth_freshness" jsonb NOT NULL,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "approval_auth_freshness" jsonb,
  "consumed_at" timestamp with time zone
);
CREATE TABLE "public"."studio2_result_operation_executions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "execution_id" uuid NOT NULL,
  "edition_id" uuid NOT NULL,
  "show_id" uuid NOT NULL,
  "action" text NOT NULL,
  "calculation_version" bigint NOT NULL,
  "reason" text NOT NULL,
  "actor_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE "public"."studio2_role_capabilities" (
  "role_key" text NOT NULL,
  "capability" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."submission_versions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "change_source" text DEFAULT 'delegate_edit'::text NOT NULL,
  "change_reason" text,
  "actor_user_id" uuid,
  "restored_from_version_id" uuid
);
CREATE TABLE "televoting"."anti_abuse_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "round_id" uuid,
  "username" text,
  "username_normalized" text,
  "country_code" text,
  "ip_hash" text,
  "fingerprint_hash" text,
  "device_token_hash" text,
  "reason" text NOT NULL,
  "risk_score" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "televoting"."external_score_entry_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "source_id" uuid,
  "aggregation_id" uuid,
  "country_code" text,
  "previous_value" numeric,
  "new_value" numeric,
  "delta" numeric,
  "entry_type" text,
  "reason" text,
  "actor_username" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_authorization_url_https" CHECK (authorization_url IS NULL OR authorization_url ~~ 'https://%'::text);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_authorization_url_length" CHECK (authorization_url IS NULL OR char_length(authorization_url) <= 2048);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_client_id_length" CHECK (char_length(client_id) >= 1 AND char_length(client_id) <= 512);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_discovery_url_length" CHECK (discovery_url IS NULL OR char_length(discovery_url) <= 2048);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_identifier_format" CHECK (identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_identifier_key" UNIQUE (identifier);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_issuer_length" CHECK (issuer IS NULL OR char_length(issuer) >= 1 AND char_length(issuer) <= 2048);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_jwks_uri_https" CHECK (jwks_uri IS NULL OR jwks_uri ~~ 'https://%'::text);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_jwks_uri_length" CHECK (jwks_uri IS NULL OR char_length(jwks_uri) <= 2048);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_name_length" CHECK (char_length(name) >= 1 AND char_length(name) <= 100);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_oauth2_requires_endpoints" CHECK (provider_type <> 'oauth2'::text OR authorization_url IS NOT NULL AND token_url IS NOT NULL AND userinfo_url IS NOT NULL);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_oidc_discovery_url_https" CHECK (provider_type <> 'oidc'::text OR discovery_url IS NULL OR discovery_url ~~ 'https://%'::text);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_oidc_issuer_https" CHECK (provider_type <> 'oidc'::text OR issuer IS NULL OR issuer ~~ 'https://%'::text);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_oidc_requires_issuer" CHECK (provider_type <> 'oidc'::text OR issuer IS NOT NULL);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_provider_type_check" CHECK (provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]));
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_token_url_https" CHECK (token_url IS NULL OR token_url ~~ 'https://%'::text);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_token_url_length" CHECK (token_url IS NULL OR char_length(token_url) <= 2048);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_userinfo_url_https" CHECK (userinfo_url IS NULL OR userinfo_url ~~ 'https://%'::text);
ALTER TABLE "auth"."custom_oauth_providers" ADD CONSTRAINT "custom_oauth_providers_userinfo_url_length" CHECK (userinfo_url IS NULL OR char_length(userinfo_url) <= 2048);
ALTER TABLE "auth"."flow_state" ADD CONSTRAINT "flow_state_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."identities" ADD CONSTRAINT "identities_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."identities" ADD CONSTRAINT "identities_provider_id_provider_unique" UNIQUE (provider_id, provider);
ALTER TABLE "auth"."mfa_amr_claims" ADD CONSTRAINT "amr_id_pk" PRIMARY KEY (id);
ALTER TABLE "auth"."mfa_amr_claims" ADD CONSTRAINT "mfa_amr_claims_session_id_authentication_method_pkey" UNIQUE (session_id, authentication_method);
ALTER TABLE "auth"."mfa_challenges" ADD CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."mfa_factors" ADD CONSTRAINT "mfa_factors_last_challenged_at_key" UNIQUE (last_challenged_at);
ALTER TABLE "auth"."mfa_factors" ADD CONSTRAINT "mfa_factors_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."mfa_recovery_code_sets" ADD CONSTRAINT "mfa_recovery_code_sets_failed_verification_count_check" CHECK (failed_verification_count >= 0);
ALTER TABLE "auth"."mfa_recovery_code_sets" ADD CONSTRAINT "mfa_recovery_code_sets_mfa_factor_id_key" UNIQUE (mfa_factor_id);
ALTER TABLE "auth"."mfa_recovery_code_sets" ADD CONSTRAINT "mfa_recovery_code_sets_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."mfa_recovery_code_sets" ADD CONSTRAINT "mfa_recovery_code_sets_user_id_key" UNIQUE (user_id);
ALTER TABLE "auth"."mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_authorization_code_key" UNIQUE (authorization_code);
ALTER TABLE "auth"."oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_authorization_code_length" CHECK (char_length(authorization_code) <= 255);
ALTER TABLE "auth"."oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_authorization_id_key" UNIQUE (authorization_id);
ALTER TABLE "auth"."oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_code_challenge_length" CHECK (char_length(code_challenge) <= 128);
ALTER TABLE "auth"."oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_expires_at_future" CHECK (expires_at > created_at);
ALTER TABLE "auth"."oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_nonce_length" CHECK (char_length(nonce) <= 255);
ALTER TABLE "auth"."oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_redirect_uri_length" CHECK (char_length(redirect_uri) <= 2048);
ALTER TABLE "auth"."oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_resource_length" CHECK (char_length(resource) <= 2048);
ALTER TABLE "auth"."oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_scope_length" CHECK (char_length(scope) <= 4096);
ALTER TABLE "auth"."oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_state_length" CHECK (char_length(state) <= 4096);
ALTER TABLE "auth"."oauth_clients" ADD CONSTRAINT "oauth_clients_client_name_length" CHECK (char_length(client_name) <= 1024);
ALTER TABLE "auth"."oauth_clients" ADD CONSTRAINT "oauth_clients_client_uri_length" CHECK (char_length(client_uri) <= 2048);
ALTER TABLE "auth"."oauth_clients" ADD CONSTRAINT "oauth_clients_logo_uri_length" CHECK (char_length(logo_uri) <= 2048);
ALTER TABLE "auth"."oauth_clients" ADD CONSTRAINT "oauth_clients_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."oauth_clients" ADD CONSTRAINT "oauth_clients_token_endpoint_auth_method_check" CHECK (token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text]));
ALTER TABLE "auth"."oauth_consents" ADD CONSTRAINT "oauth_consents_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."oauth_consents" ADD CONSTRAINT "oauth_consents_revoked_after_granted" CHECK (revoked_at IS NULL OR revoked_at >= granted_at);
ALTER TABLE "auth"."oauth_consents" ADD CONSTRAINT "oauth_consents_scopes_length" CHECK (char_length(scopes) <= 2048);
ALTER TABLE "auth"."oauth_consents" ADD CONSTRAINT "oauth_consents_scopes_not_empty" CHECK (char_length(TRIM(BOTH FROM scopes)) > 0);
ALTER TABLE "auth"."oauth_consents" ADD CONSTRAINT "oauth_consents_user_client_unique" UNIQUE (user_id, client_id);
ALTER TABLE "auth"."one_time_tokens" ADD CONSTRAINT "one_time_tokens_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."one_time_tokens" ADD CONSTRAINT "one_time_tokens_token_hash_check" CHECK (char_length(token_hash) > 0);
ALTER TABLE "auth"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_token_unique" UNIQUE (token);
ALTER TABLE "auth"."saml_providers" ADD CONSTRAINT "entity_id not empty" CHECK (char_length(entity_id) > 0);
ALTER TABLE "auth"."saml_providers" ADD CONSTRAINT "metadata_url not empty" CHECK (metadata_url = NULL::text OR char_length(metadata_url) > 0);
ALTER TABLE "auth"."saml_providers" ADD CONSTRAINT "metadata_xml not empty" CHECK (char_length(metadata_xml) > 0);
ALTER TABLE "auth"."saml_providers" ADD CONSTRAINT "saml_providers_entity_id_key" UNIQUE (entity_id);
ALTER TABLE "auth"."saml_providers" ADD CONSTRAINT "saml_providers_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."saml_relay_states" ADD CONSTRAINT "request_id not empty" CHECK (char_length(request_id) > 0);
ALTER TABLE "auth"."saml_relay_states" ADD CONSTRAINT "saml_relay_states_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."scim_tokens" ADD CONSTRAINT "scim_tokens_expires_at_future" CHECK (expires_at IS NULL OR expires_at > created_at);
ALTER TABLE "auth"."scim_tokens" ADD CONSTRAINT "scim_tokens_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."scim_tokens" ADD CONSTRAINT "scim_tokens_revoked_after_created" CHECK (revoked_at IS NULL OR revoked_at >= created_at);
ALTER TABLE "auth"."scim_tokens" ADD CONSTRAINT "scim_tokens_token_hash_check" CHECK (token_hash ~ '^[0-9a-f]{64}$'::text);
ALTER TABLE "auth"."scim_users" ADD CONSTRAINT "scim_users_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_scopes_length" CHECK (char_length(scopes) <= 4096);
ALTER TABLE "auth"."sso_domains" ADD CONSTRAINT "domain not empty" CHECK (char_length(domain) > 0);
ALTER TABLE "auth"."sso_domains" ADD CONSTRAINT "sso_domains_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."sso_providers" ADD CONSTRAINT "resource_id not empty" CHECK (resource_id = NULL::text OR char_length(resource_id) > 0);
ALTER TABLE "auth"."sso_providers" ADD CONSTRAINT "sso_providers_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_challenge_type_check" CHECK (challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text]));
ALTER TABLE "auth"."webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY (id);
ALTER TABLE "private"."v3_confirmation_operations" ADD CONSTRAINT "v3_confirmation_operations_browser_session_not_blank" CHECK (length(btrim(browser_session_id)) > 0);
ALTER TABLE "private"."v3_confirmation_operations" ADD CONSTRAINT "v3_confirmation_operations_pkey" PRIMARY KEY (idempotency_key);
ALTER TABLE "private"."v3_confirmation_operations" ADD CONSTRAINT "v3_confirmation_operations_receipt_id_key" UNIQUE (receipt_id);
ALTER TABLE "private"."v3_confirmation_operations" ADD CONSTRAINT "v3_confirmation_operations_request_hash_not_blank" CHECK (length(btrim(request_hash)) > 0);
ALTER TABLE "public"."admin_audit_log" ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrity_case_access" ADD CONSTRAINT "integrity_case_access_pkey" PRIMARY KEY (case_id);
ALTER TABLE "public"."integrity_case_events" ADD CONSTRAINT "integrity_case_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrity_case_evidence" ADD CONSTRAINT "integrity_case_evidence_evidence_type_check" CHECK (evidence_type = ANY (ARRAY['file'::text, 'url'::text, 'text'::text, 'voting_analysis'::text, 'statement'::text]));
ALTER TABLE "public"."integrity_case_evidence" ADD CONSTRAINT "integrity_case_evidence_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrity_case_evidence" ADD CONSTRAINT "integrity_case_evidence_source_role_check" CHECK (source_role = ANY (ARRAY['reporter'::text, 'tsbc'::text, 'witness'::text, 'participant'::text, 'system'::text]));
ALTER TABLE "public"."integrity_case_evidence" ADD CONSTRAINT "integrity_evidence_lifecycle_consistency" CHECK (lifecycle_status = 'active'::text AND deleted_at IS NULL OR lifecycle_status = 'scheduled_for_deletion'::text AND retention_until IS NOT NULL AND deletion_reason IS NOT NULL AND deleted_at IS NULL OR lifecycle_status = 'deleted'::text AND deleted_at IS NOT NULL AND deletion_reason IS NOT NULL);
ALTER TABLE "public"."integrity_case_evidence" ADD CONSTRAINT "integrity_evidence_lifecycle_status_check" CHECK (lifecycle_status = ANY (ARRAY['active'::text, 'scheduled_for_deletion'::text, 'deleted'::text]));
ALTER TABLE "public"."integrity_case_evidence" ADD CONSTRAINT "integrity_evidence_not_own_disclosure_source" CHECK (disclosure_copy_of_id IS NULL OR disclosure_copy_of_id <> id);
ALTER TABLE "public"."integrity_case_evidence" ADD CONSTRAINT "integrity_evidence_not_own_redaction_source" CHECK (redacted_from_id IS NULL OR redacted_from_id <> id);
ALTER TABLE "public"."integrity_case_findings" ADD CONSTRAINT "integrity_case_findings_outcome_check" CHECK (outcome = ANY (ARRAY['violation'::text, 'no_violation'::text, 'insufficient_evidence'::text, 'outside_jurisdiction'::text, 'duplicate'::text, 'administrative_resolution'::text]));
ALTER TABLE "public"."integrity_case_findings" ADD CONSTRAINT "integrity_case_findings_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrity_case_internal_notes" ADD CONSTRAINT "integrity_case_internal_notes_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrity_case_messages" ADD CONSTRAINT "integrity_case_messages_author_role_check" CHECK (author_role = ANY (ARRAY['reporter'::text, 'tsbc'::text, 'witness'::text, 'participant'::text]));
ALTER TABLE "public"."integrity_case_messages" ADD CONSTRAINT "integrity_case_messages_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrity_case_relations" ADD CONSTRAINT "integrity_case_relation_not_self" CHECK (case_id <> related_case_id);
ALTER TABLE "public"."integrity_case_relations" ADD CONSTRAINT "integrity_case_relations_case_id_related_case_id_relation_t_key" UNIQUE (case_id, related_case_id, relation_type);
ALTER TABLE "public"."integrity_case_relations" ADD CONSTRAINT "integrity_case_relations_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrity_case_relations" ADD CONSTRAINT "integrity_case_relations_relation_type_check" CHECK (relation_type = ANY (ARRAY['related'::text, 'duplicate'::text, 'corroborating'::text, 'same_incident'::text, 'appeal_of'::text]));
ALTER TABLE "public"."integrity_case_requests" ADD CONSTRAINT "integrity_case_requests_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrity_case_requests" ADD CONSTRAINT "integrity_case_requests_request_kind_check" CHECK (request_kind = ANY (ARRAY['clarification'::text, 'evidence'::text, 'response'::text, 'identity_consent'::text]));
ALTER TABLE "public"."integrity_case_requests" ADD CONSTRAINT "integrity_case_requests_status_check" CHECK (status = ANY (ARRAY['open'::text, 'responded'::text, 'closed'::text]));
ALTER TABLE "public"."integrity_case_reviewers" ADD CONSTRAINT "integrity_case_reviewers_pkey" PRIMARY KEY (case_id, user_id, review_role);
ALTER TABLE "public"."integrity_case_reviewers" ADD CONSTRAINT "integrity_case_reviewers_review_role_check" CHECK (review_role = ANY (ARRAY['triage'::text, 'investigator'::text, 'decision_maker'::text, 'appeal_reviewer'::text]));
ALTER TABLE "public"."integrity_case_rule_links" ADD CONSTRAINT "integrity_case_rule_links_pkey" PRIMARY KEY (case_id, rule_id);
ALTER TABLE "public"."integrity_case_rule_links" ADD CONSTRAINT "integrity_case_rule_links_relevance_check" CHECK (relevance = ANY (ARRAY['alleged'::text, 'reviewed'::text, 'context'::text, 'supported'::text, 'not_supported'::text]));
ALTER TABLE "public"."integrity_case_rule_links" ADD CONSTRAINT "integrity_case_rule_links_rule_id_check" CHECK (rule_id ~ '^[0-9]+\.[0-9]+$'::text);
ALTER TABLE "public"."integrity_case_sanctions" ADD CONSTRAINT "integrity_case_sanctions_final_level_check" CHECK (final_level >= 1 AND final_level <= 10);
ALTER TABLE "public"."integrity_case_sanctions" ADD CONSTRAINT "integrity_case_sanctions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrity_case_sanctions" ADD CONSTRAINT "integrity_case_sanctions_status_check" CHECK (status = ANY (ARRAY['active'::text, 'modified_on_appeal'::text, 'overturned'::text]));
ALTER TABLE "public"."integrity_case_sanctions" ADD CONSTRAINT "integrity_case_sanctions_target_type_check" CHECK (target_type = ANY (ARRAY['participant'::text, 'delegation'::text, 'ballot'::text, 'entry'::text, 'account'::text, 'other'::text]));
ALTER TABLE "public"."integrity_case_sanctions" ADD CONSTRAINT "integrity_case_sanctions_typical_level_check" CHECK (typical_level >= 1 AND typical_level <= 10);
ALTER TABLE "public"."integrity_case_sanctions" ADD CONSTRAINT "sanction_label_matches_level" CHECK (sanction_label = integrity_sanction_label(final_level));
ALTER TABLE "public"."integrity_case_sanctions" ADD CONSTRAINT "sanction_not_self_superseding" CHECK (supersedes_sanction_id IS NULL OR supersedes_sanction_id <> id);
ALTER TABLE "public"."integrity_cases" ADD CONSTRAINT "fully_anonymous_has_no_reporter_identity" CHECK (identity_mode <> 'anonymous'::text OR reporter_user_id IS NULL);
ALTER TABLE "public"."integrity_cases" ADD CONSTRAINT "integrity_cases_case_kind_check" CHECK (case_kind = ANY (ARRAY['report'::text, 'self_report'::text, 'rule_question'::text, 'vulnerability'::text, 'safety'::text]));
ALTER TABLE "public"."integrity_cases" ADD CONSTRAINT "integrity_cases_category_check" CHECK (category = ANY (ARRAY['voting_integrity'::text, 'vote_coordination'::text, 'entry_eligibility'::text, 'account_abuse'::text, 'conduct'::text, 'safety'::text, 'privacy'::text, 'technical_exploit'::text, 'tsbc_conduct'::text, 'other'::text]));
ALTER TABLE "public"."integrity_cases" ADD CONSTRAINT "integrity_cases_identity_mode_check" CHECK (identity_mode = ANY (ARRAY['anonymous'::text, 'sealed'::text, 'confidential'::text]));
ALTER TABLE "public"."integrity_cases" ADD CONSTRAINT "integrity_cases_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrity_cases" ADD CONSTRAINT "integrity_cases_priority_check" CHECK (priority = ANY (ARRAY['information'::text, 'standard'::text, 'high'::text, 'urgent'::text]));
ALTER TABLE "public"."integrity_cases" ADD CONSTRAINT "integrity_cases_public_code_key" UNIQUE (public_code);
ALTER TABLE "public"."integrity_cases" ADD CONSTRAINT "integrity_cases_status_check" CHECK (status = ANY (ARRAY['received'::text, 'awaiting_review'::text, 'under_review'::text, 'waiting_for_reporter'::text, 'investigation_opened'::text, 'action_taken'::text, 'closed_no_violation'::text, 'closed_insufficient_evidence'::text, 'closed_outside_jurisdiction'::text, 'closed_duplicate'::text, 'closed'::text]));
ALTER TABLE "public"."integrity_cases" ADD CONSTRAINT "protected_reports_have_reporter_identity" CHECK (identity_mode = 'anonymous'::text OR reporter_user_id IS NOT NULL);
ALTER TABLE "public"."integrity_evidence_access_log" ADD CONSTRAINT "integrity_evidence_access_log_action_check" CHECK (action = ANY (ARRAY['access_descriptor'::text, 'download_requested'::text]));
ALTER TABLE "public"."integrity_evidence_access_log" ADD CONSTRAINT "integrity_evidence_access_log_actor_role_check" CHECK (actor_role = ANY (ARRAY['reporter'::text, 'organizer'::text, 'system'::text]));
ALTER TABLE "public"."integrity_evidence_access_log" ADD CONSTRAINT "integrity_evidence_access_log_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrity_evidence_upload_tokens" ADD CONSTRAINT "integrity_evidence_upload_derivative_kind_check" CHECK (derivative_kind IS NULL OR (derivative_kind = ANY (ARRAY['redacted'::text, 'disclosure'::text, 'redacted_disclosure'::text])));
ALTER TABLE "public"."integrity_evidence_upload_tokens" ADD CONSTRAINT "integrity_evidence_upload_tokens_expected_size_check" CHECK (expected_size > 0 AND expected_size <= 15728640);
ALTER TABLE "public"."integrity_evidence_upload_tokens" ADD CONSTRAINT "integrity_evidence_upload_tokens_object_path_key" UNIQUE (object_path);
ALTER TABLE "public"."integrity_evidence_upload_tokens" ADD CONSTRAINT "integrity_evidence_upload_tokens_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrity_preclearance_rulings" ADD CONSTRAINT "integrity_preclearance_has_rules" CHECK (cardinality(rule_ids) > 0);
ALTER TABLE "public"."integrity_preclearance_rulings" ADD CONSTRAINT "integrity_preclearance_rulings_outcome_check" CHECK (outcome = ANY (ARRAY['allowed'::text, 'not_allowed'::text, 'needs_more_information'::text, 'guidance_only'::text]));
ALTER TABLE "public"."integrity_preclearance_rulings" ADD CONSTRAINT "integrity_preclearance_rulings_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."integrity_public_decisions" ADD CONSTRAINT "integrity_public_decisions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."permission_evaluation_events" ADD CONSTRAINT "permission_evaluation_events_action_check" CHECK (length(btrim(action)) >= 1 AND length(btrim(action)) <= 160);
ALTER TABLE "public"."permission_evaluation_events" ADD CONSTRAINT "permission_evaluation_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."permission_evaluation_events" ADD CONSTRAINT "permission_evaluation_events_route_check" CHECK (route IS NULL OR length(route) <= 500);
ALTER TABLE "public"."round_stats" ADD CONSTRAINT "round_stats_pkey" PRIMARY KEY (round_id);
ALTER TABLE "public"."ssc_rule_interpretation_sources" ADD CONSTRAINT "ssc_rule_interpretation_sources_pkey" PRIMARY KEY (interpretation_id, case_id, ruling_id);
ALTER TABLE "public"."studio2_access_roles" ADD CONSTRAINT "studio2_access_roles_description_check" CHECK (length(btrim(description)) > 0);
ALTER TABLE "public"."studio2_access_roles" ADD CONSTRAINT "studio2_access_roles_label_check" CHECK (length(btrim(label)) > 0);
ALTER TABLE "public"."studio2_access_roles" ADD CONSTRAINT "studio2_access_roles_pkey" PRIMARY KEY (key);
ALTER TABLE "public"."studio2_permission_change_approval_requests" ADD CONSTRAINT "studio2_permission_change_approval_expiry_check" CHECK (approval_expires_at > requested_at);
ALTER TABLE "public"."studio2_permission_change_approval_requests" ADD CONSTRAINT "studio2_permission_change_approval_idempotency_check" CHECK (length(btrim(idempotency_key)) >= 1 AND length(btrim(idempotency_key)) <= 240);
ALTER TABLE "public"."studio2_permission_change_approval_requests" ADD CONSTRAINT "studio2_permission_change_approval_key_check" CHECK (length(btrim(permission_key)) >= 1 AND length(btrim(permission_key)) <= 160);
ALTER TABLE "public"."studio2_permission_change_approval_requests" ADD CONSTRAINT "studio2_permission_change_approval_reque_expected_version_check" CHECK (expected_version >= 0);
ALTER TABLE "public"."studio2_permission_change_approval_requests" ADD CONSTRAINT "studio2_permission_change_approval_requests_change_kind_check" CHECK (change_kind = ANY (ARRAY['assign_role'::text, 'revoke_role'::text, 'grant_capability'::text, 'revoke_capability'::text]));
ALTER TABLE "public"."studio2_permission_change_approval_requests" ADD CONSTRAINT "studio2_permission_change_approval_requests_operation_id_key" UNIQUE (operation_id);
ALTER TABLE "public"."studio2_permission_change_approval_requests" ADD CONSTRAINT "studio2_permission_change_approval_requests_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_permission_change_approval_requests" ADD CONSTRAINT "studio2_permission_change_approval_second_operator_check" CHECK (approved_by IS NULL OR requested_by IS NULL OR approved_by <> requested_by);
ALTER TABLE "public"."studio2_permission_change_approval_requests" ADD CONSTRAINT "studio2_permission_change_approval_state_check" CHECK (approved_by IS NULL AND approved_at IS NULL AND approval_auth_freshness IS NULL OR approved_by IS NOT NULL AND approved_at IS NOT NULL AND approval_auth_freshness IS NOT NULL);
ALTER TABLE "public"."studio2_result_operation_executions" ADD CONSTRAINT "studio2_result_operation_executions_action_check" CHECK (action = ANY (ARRAY['calculate'::text, 'review'::text, 'lock'::text, 'unlock'::text, 'mark_reveal_ready'::text, 'clear_reveal_ready'::text]));
ALTER TABLE "public"."studio2_result_operation_executions" ADD CONSTRAINT "studio2_result_operation_executions_calculation_version_check" CHECK (calculation_version >= 0);
ALTER TABLE "public"."studio2_result_operation_executions" ADD CONSTRAINT "studio2_result_operation_executions_execution_id_key" UNIQUE (execution_id);
ALTER TABLE "public"."studio2_result_operation_executions" ADD CONSTRAINT "studio2_result_operation_executions_payload_check" CHECK (jsonb_typeof(payload) = 'object'::text);
ALTER TABLE "public"."studio2_result_operation_executions" ADD CONSTRAINT "studio2_result_operation_executions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."studio2_result_operation_executions" ADD CONSTRAINT "studio2_result_operation_executions_reason_check" CHECK (length(btrim(reason)) >= 5);
ALTER TABLE "public"."studio2_role_capabilities" ADD CONSTRAINT "studio2_role_capabilities_pkey" PRIMARY KEY (role_key, capability);
ALTER TABLE "public"."submission_versions" ADD CONSTRAINT "submission_versions_change_source_check" CHECK (change_source = ANY (ARRAY['legacy_edit'::text, 'delegate_edit'::text, 'organizer_restore'::text]));
ALTER TABLE "public"."submission_versions" ADD CONSTRAINT "submission_versions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."submission_versions" ADD CONSTRAINT "submission_versions_submission_version_key" UNIQUE (submission_id, version);
ALTER TABLE "public"."submission_versions" ADD CONSTRAINT "submission_versions_version_positive_check" CHECK (version > 0);
ALTER TABLE "televoting"."anti_abuse_events" ADD CONSTRAINT "anti_abuse_events_pkey" PRIMARY KEY (id);
ALTER TABLE "televoting"."external_score_entry_log" ADD CONSTRAINT "external_score_entry_log_pkey" PRIMARY KEY (id);
ALTER TABLE "auth"."identities" ADD CONSTRAINT "identities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "auth"."mfa_amr_claims" ADD CONSTRAINT "mfa_amr_claims_session_id_fkey" FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;
ALTER TABLE "auth"."mfa_challenges" ADD CONSTRAINT "mfa_challenges_auth_factor_id_fkey" FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;
ALTER TABLE "auth"."mfa_factors" ADD CONSTRAINT "mfa_factors_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "auth"."mfa_recovery_code_sets" ADD CONSTRAINT "mfa_recovery_code_sets_mfa_factor_id_fkey" FOREIGN KEY (mfa_factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;
ALTER TABLE "auth"."mfa_recovery_code_sets" ADD CONSTRAINT "mfa_recovery_code_sets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "auth"."mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_mfa_recovery_code_set_id_fkey" FOREIGN KEY (mfa_recovery_code_set_id) REFERENCES auth.mfa_recovery_code_sets(id) ON DELETE CASCADE;
ALTER TABLE "auth"."oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_client_id_fkey" FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;
ALTER TABLE "auth"."oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "auth"."oauth_consents" ADD CONSTRAINT "oauth_consents_client_id_fkey" FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;
ALTER TABLE "auth"."oauth_consents" ADD CONSTRAINT "oauth_consents_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "auth"."one_time_tokens" ADD CONSTRAINT "one_time_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "auth"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;
ALTER TABLE "auth"."saml_providers" ADD CONSTRAINT "saml_providers_sso_provider_id_fkey" FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;
ALTER TABLE "auth"."saml_relay_states" ADD CONSTRAINT "saml_relay_states_flow_state_id_fkey" FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;
ALTER TABLE "auth"."saml_relay_states" ADD CONSTRAINT "saml_relay_states_sso_provider_id_fkey" FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;
ALTER TABLE "auth"."scim_tokens" ADD CONSTRAINT "scim_tokens_sso_provider_id_fkey" FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;
ALTER TABLE "auth"."scim_users" ADD CONSTRAINT "scim_users_sso_provider_id_fkey" FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;
ALTER TABLE "auth"."scim_users" ADD CONSTRAINT "scim_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_oauth_client_id_fkey" FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "auth"."sso_domains" ADD CONSTRAINT "sso_domains_sso_provider_id_fkey" FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;
ALTER TABLE "auth"."webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "auth"."webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "private"."v3_confirmation_operations" ADD CONSTRAINT "v3_confirmation_operations_round_id_fkey" FOREIGN KEY (round_id) REFERENCES submission_rounds(id) ON DELETE CASCADE;
ALTER TABLE "public"."admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."admin_audit_log" ADD CONSTRAINT "admin_audit_log_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL;
ALTER TABLE "public"."admin_audit_log" ADD CONSTRAINT "admin_audit_log_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_case_access" ADD CONSTRAINT "integrity_case_access_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_case_events" ADD CONSTRAINT "integrity_case_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_case_events" ADD CONSTRAINT "integrity_case_events_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_case_evidence" ADD CONSTRAINT "integrity_case_evidence_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_case_evidence" ADD CONSTRAINT "integrity_case_evidence_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_case_evidence" ADD CONSTRAINT "integrity_case_evidence_deleted_by_fkey" FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_case_evidence" ADD CONSTRAINT "integrity_case_evidence_disclosure_copy_of_id_fkey" FOREIGN KEY (disclosure_copy_of_id) REFERENCES integrity_case_evidence(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_case_evidence" ADD CONSTRAINT "integrity_case_evidence_redacted_from_id_fkey" FOREIGN KEY (redacted_from_id) REFERENCES integrity_case_evidence(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_case_findings" ADD CONSTRAINT "integrity_case_findings_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_case_findings" ADD CONSTRAINT "integrity_case_findings_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."integrity_case_internal_notes" ADD CONSTRAINT "integrity_case_internal_notes_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_case_internal_notes" ADD CONSTRAINT "integrity_case_internal_notes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."integrity_case_messages" ADD CONSTRAINT "integrity_case_messages_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_case_messages" ADD CONSTRAINT "integrity_case_messages_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_case_relations" ADD CONSTRAINT "integrity_case_relations_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_case_relations" ADD CONSTRAINT "integrity_case_relations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."integrity_case_relations" ADD CONSTRAINT "integrity_case_relations_related_case_id_fkey" FOREIGN KEY (related_case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_case_requests" ADD CONSTRAINT "integrity_case_requests_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_case_requests" ADD CONSTRAINT "integrity_case_requests_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."integrity_case_reviewers" ADD CONSTRAINT "integrity_case_reviewers_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."integrity_case_reviewers" ADD CONSTRAINT "integrity_case_reviewers_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_case_reviewers" ADD CONSTRAINT "integrity_case_reviewers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_case_rule_links" ADD CONSTRAINT "integrity_case_rule_links_added_by_fkey" FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."integrity_case_rule_links" ADD CONSTRAINT "integrity_case_rule_links_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_case_sanctions" ADD CONSTRAINT "integrity_case_sanctions_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_case_sanctions" ADD CONSTRAINT "integrity_case_sanctions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."integrity_case_sanctions" ADD CONSTRAINT "integrity_case_sanctions_finding_id_fkey" FOREIGN KEY (finding_id) REFERENCES integrity_case_findings(id) ON DELETE RESTRICT;
ALTER TABLE "public"."integrity_case_sanctions" ADD CONSTRAINT "integrity_case_sanctions_supersedes_sanction_id_fkey" FOREIGN KEY (supersedes_sanction_id) REFERENCES integrity_case_sanctions(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_cases" ADD CONSTRAINT "integrity_cases_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_cases" ADD CONSTRAINT "integrity_cases_reporter_user_id_fkey" FOREIGN KEY (reporter_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_evidence_access_log" ADD CONSTRAINT "integrity_evidence_access_log_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_evidence_access_log" ADD CONSTRAINT "integrity_evidence_access_log_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_evidence_access_log" ADD CONSTRAINT "integrity_evidence_access_log_evidence_id_fkey" FOREIGN KEY (evidence_id) REFERENCES integrity_case_evidence(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_evidence_upload_tokens" ADD CONSTRAINT "integrity_evidence_upload_tok_derivative_source_evidence_i_fkey" FOREIGN KEY (derivative_source_evidence_id) REFERENCES integrity_case_evidence(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_evidence_upload_tokens" ADD CONSTRAINT "integrity_evidence_upload_tokens_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_evidence_upload_tokens" ADD CONSTRAINT "integrity_evidence_upload_tokens_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_preclearance_rulings" ADD CONSTRAINT "integrity_preclearance_rulings_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."integrity_preclearance_rulings" ADD CONSTRAINT "integrity_preclearance_rulings_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."integrity_public_decisions" ADD CONSTRAINT "integrity_public_decisions_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE SET NULL;
ALTER TABLE "public"."integrity_public_decisions" ADD CONSTRAINT "integrity_public_decisions_published_by_fkey" FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."permission_evaluation_events" ADD CONSTRAINT "permission_evaluation_events_capability_fkey" FOREIGN KEY (capability) REFERENCES studio2_capabilities(key) ON DELETE RESTRICT;
ALTER TABLE "public"."permission_evaluation_events" ADD CONSTRAINT "permission_evaluation_events_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE SET NULL;
ALTER TABLE "public"."permission_evaluation_events" ADD CONSTRAINT "permission_evaluation_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."round_stats" ADD CONSTRAINT "round_stats_round_id_fkey" FOREIGN KEY (round_id) REFERENCES submission_rounds(id) ON DELETE CASCADE;
ALTER TABLE "public"."ssc_rule_interpretation_sources" ADD CONSTRAINT "ssc_rule_interpretation_sources_case_id_fkey" FOREIGN KEY (case_id) REFERENCES integrity_cases(id) ON DELETE CASCADE;
ALTER TABLE "public"."ssc_rule_interpretation_sources" ADD CONSTRAINT "ssc_rule_interpretation_sources_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."ssc_rule_interpretation_sources" ADD CONSTRAINT "ssc_rule_interpretation_sources_interpretation_id_fkey" FOREIGN KEY (interpretation_id) REFERENCES ssc_rule_interpretations(id) ON DELETE CASCADE;
ALTER TABLE "public"."ssc_rule_interpretation_sources" ADD CONSTRAINT "ssc_rule_interpretation_sources_ruling_id_fkey" FOREIGN KEY (ruling_id) REFERENCES integrity_preclearance_rulings(id) ON DELETE RESTRICT;
ALTER TABLE "public"."studio2_permission_change_approval_requests" ADD CONSTRAINT "studio2_permission_change_approval_requests_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_permission_change_approval_requests" ADD CONSTRAINT "studio2_permission_change_approval_requests_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_permission_change_approval_requests" ADD CONSTRAINT "studio2_permission_change_approval_requests_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_permission_change_approval_requests" ADD CONSTRAINT "studio2_permission_change_approval_requests_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_result_operation_executions" ADD CONSTRAINT "studio2_result_operation_executions_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."studio2_result_operation_executions" ADD CONSTRAINT "studio2_result_operation_executions_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_result_operation_executions" ADD CONSTRAINT "studio2_result_operation_executions_show_edition_v3_fk" FOREIGN KEY (show_id, edition_id) REFERENCES shows(id, edition_id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_result_operation_executions" ADD CONSTRAINT "studio2_result_operation_executions_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_result_operation_executions" ADD CONSTRAINT "studio2_result_operation_executions_snapshot_v3_fk" FOREIGN KEY (show_id, calculation_version) REFERENCES private.v3_result_versions(show_id, version) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "public"."studio2_role_capabilities" ADD CONSTRAINT "studio2_role_capabilities_capability_fkey" FOREIGN KEY (capability) REFERENCES studio2_capabilities(key) ON DELETE CASCADE;
ALTER TABLE "public"."studio2_role_capabilities" ADD CONSTRAINT "studio2_role_capabilities_role_key_fkey" FOREIGN KEY (role_key) REFERENCES studio2_access_roles(key) ON DELETE CASCADE;
ALTER TABLE "public"."submission_versions" ADD CONSTRAINT "submission_versions_restored_from_version_id_fkey" FOREIGN KEY (restored_from_version_id) REFERENCES submission_versions(id) ON DELETE SET NULL;
ALTER TABLE "public"."submission_versions" ADD CONSTRAINT "submission_versions_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE;
ALTER TABLE "televoting"."anti_abuse_events" ADD CONSTRAINT "anti_abuse_events_round_id_fkey" FOREIGN KEY (round_id) REFERENCES televoting.rounds(id) ON DELETE SET NULL;
CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);
CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);
CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);
CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);
CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);
CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);
CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);
CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);
CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);
CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);
CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);
CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);
CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);
CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);
CREATE INDEX mfa_recovery_codes_set_id_idx ON auth.mfa_recovery_codes USING btree (mfa_recovery_code_set_id);
CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);
CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);
CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);
CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);
CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);
CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);
CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);
CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);
CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);
CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);
CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);
CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);
CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);
CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);
CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);
CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);
CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);
CREATE INDEX scim_tokens_expires_at_idx ON auth.scim_tokens USING btree (expires_at);
CREATE INDEX scim_tokens_revoked_at_idx ON auth.scim_tokens USING btree (revoked_at);
CREATE INDEX scim_tokens_sso_provider_id_idx ON auth.scim_tokens USING btree (sso_provider_id);
CREATE UNIQUE INDEX scim_tokens_token_hash_key ON auth.scim_tokens USING btree (token_hash);
CREATE INDEX scim_users_created_at_idx ON auth.scim_users USING btree (sso_provider_id, created_at, id) WHERE (deleted_at IS NULL);
CREATE INDEX scim_users_deleted_at_idx ON auth.scim_users USING btree (deleted_at);
CREATE UNIQUE INDEX scim_users_external_id_key ON auth.scim_users USING btree (sso_provider_id, external_id) WHERE ((external_id IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX scim_users_id_idx ON auth.scim_users USING btree (sso_provider_id, id) WHERE (deleted_at IS NULL);
CREATE INDEX scim_users_sso_provider_id_idx ON auth.scim_users USING btree (sso_provider_id);
CREATE INDEX scim_users_updated_at_idx ON auth.scim_users USING btree (sso_provider_id, updated_at, id) WHERE (deleted_at IS NULL);
CREATE INDEX scim_users_user_id_idx ON auth.scim_users USING btree (user_id);
CREATE INDEX scim_users_user_name_idx ON auth.scim_users USING btree (sso_provider_id, user_name COLLATE "C", id) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX scim_users_user_name_key ON auth.scim_users USING btree (sso_provider_id, user_name) WHERE (deleted_at IS NULL);
CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);
CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);
CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);
CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);
CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));
CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);
CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));
CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);
CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);
CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);
CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);
CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);
CREATE INDEX v3_confirmation_operations_session_round_idx ON private.v3_confirmation_operations USING btree (browser_session_id, round_id, accepted_at DESC);
CREATE INDEX v3_confirmation_operations_submission_scope_idx ON private.v3_confirmation_operations USING btree (round_id, ((result ->> 'submission_id'::text)));
CREATE INDEX admin_audit_country_idx ON public.admin_audit_log USING btree (country_id, created_at DESC);
CREATE INDEX admin_audit_edition_idx ON public.admin_audit_log USING btree (edition_id, created_at DESC);
CREATE INDEX admin_audit_log_actor_idx ON public.admin_audit_log USING btree (actor_id, created_at DESC);
CREATE INDEX admin_audit_log_country_idx ON public.admin_audit_log USING btree (country_id, created_at DESC) WHERE (country_id IS NOT NULL);
CREATE INDEX admin_audit_log_created_at_idx ON public.admin_audit_log USING btree (created_at DESC);
CREATE INDEX admin_audit_log_edition_idx ON public.admin_audit_log USING btree (edition_id, created_at DESC) WHERE (edition_id IS NOT NULL);
CREATE INDEX integrity_case_events_case_created_idx ON public.integrity_case_events USING btree (case_id, created_at);
CREATE INDEX integrity_case_evidence_case_created_idx ON public.integrity_case_evidence USING btree (case_id, created_at);
CREATE INDEX integrity_case_evidence_disclosure_copy_idx ON public.integrity_case_evidence USING btree (disclosure_copy_of_id) WHERE (disclosure_copy_of_id IS NOT NULL);
CREATE INDEX integrity_case_evidence_redacted_from_idx ON public.integrity_case_evidence USING btree (redacted_from_id) WHERE (redacted_from_id IS NOT NULL);
CREATE INDEX integrity_case_evidence_retention_idx ON public.integrity_case_evidence USING btree (retention_until, lifecycle_status) WHERE (retention_until IS NOT NULL);
CREATE INDEX integrity_case_findings_case_created_idx ON public.integrity_case_findings USING btree (case_id, created_at DESC);
CREATE INDEX integrity_case_messages_case_created_idx ON public.integrity_case_messages USING btree (case_id, created_at);
CREATE INDEX integrity_case_sanctions_case_created_idx ON public.integrity_case_sanctions USING btree (case_id, created_at DESC);
CREATE INDEX integrity_case_sanctions_finding_idx ON public.integrity_case_sanctions USING btree (finding_id);
CREATE INDEX integrity_cases_category_created_idx ON public.integrity_cases USING btree (category, created_at DESC);
CREATE INDEX integrity_cases_reporter_idx ON public.integrity_cases USING btree (reporter_user_id, updated_at DESC) WHERE (reporter_user_id IS NOT NULL);
CREATE INDEX integrity_cases_status_created_idx ON public.integrity_cases USING btree (status, created_at DESC);
CREATE INDEX integrity_evidence_access_case_created_idx ON public.integrity_evidence_access_log USING btree (case_id, created_at DESC);
CREATE INDEX integrity_evidence_access_evidence_created_idx ON public.integrity_evidence_access_log USING btree (evidence_id, created_at DESC) WHERE (evidence_id IS NOT NULL);
CREATE INDEX integrity_preclearance_case_created_idx ON public.integrity_preclearance_rulings USING btree (case_id, created_at DESC);
CREATE INDEX integrity_preclearance_rules_idx ON public.integrity_preclearance_rulings USING gin (rule_ids);
CREATE INDEX permission_evaluation_events_capability_idx ON public.permission_evaluation_events USING btree (capability);
CREATE INDEX permission_evaluation_events_edition_id_idx ON public.permission_evaluation_events USING btree (edition_id);
CREATE INDEX permission_evaluation_events_mismatch_idx ON public.permission_evaluation_events USING btree (created_at DESC, capability) WHERE (legacy_allowed IS DISTINCT FROM capability_allowed);
CREATE INDEX permission_evaluation_events_time_idx ON public.permission_evaluation_events USING btree (created_at DESC);
CREATE INDEX permission_evaluation_events_user_idx ON public.permission_evaluation_events USING btree (user_id, created_at DESC);
CREATE INDEX ssc_rule_interpretation_sources_case_idx ON public.ssc_rule_interpretation_sources USING btree (case_id, created_at DESC);
CREATE INDEX studio2_permission_change_approval_active_idx ON public.studio2_permission_change_approval_requests USING btree (requested_at DESC, approval_expires_at) WHERE (consumed_at IS NULL);
CREATE INDEX studio2_permission_change_approval_target_idx ON public.studio2_permission_change_approval_requests USING btree (target_user_id, requested_at DESC);
CREATE INDEX studio2_result_operation_executions_actor_idx ON public.studio2_result_operation_executions USING btree (actor_user_id);
CREATE INDEX studio2_result_operation_executions_edition_idx ON public.studio2_result_operation_executions USING btree (edition_id, created_at DESC);
CREATE INDEX studio2_result_operation_executions_show_idx ON public.studio2_result_operation_executions USING btree (show_id, created_at DESC);
CREATE INDEX studio2_role_capabilities_capability_idx ON public.studio2_role_capabilities USING btree (capability);
CREATE INDEX submission_versions_restored_from_idx ON public.submission_versions USING btree (restored_from_version_id) WHERE (restored_from_version_id IS NOT NULL);
ALTER TABLE "auth"."flow_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth"."identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth"."mfa_amr_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth"."mfa_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth"."mfa_factors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth"."one_time_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth"."refresh_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth"."saml_providers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth"."saml_relay_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth"."sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth"."sso_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth"."sso_providers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_case_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_case_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_case_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_case_findings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_case_internal_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_case_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_case_relations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_case_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_case_reviewers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_case_rule_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_case_sanctions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_evidence_access_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_evidence_upload_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_preclearance_rulings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrity_public_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."permission_evaluation_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."round_stats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ssc_rule_interpretation_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."studio2_access_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."studio2_permission_change_approval_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."studio2_result_operation_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."studio2_role_capabilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."submission_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "televoting"."anti_abuse_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "televoting"."external_score_entry_log" ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER v3_bridge_confirmation_submission_operation AFTER INSERT ON private.v3_confirmation_operations FOR EACH ROW EXECUTE FUNCTION private.v3_bridge_confirmation_submission_operation();
CREATE POLICY "capability auditors read audit log" ON "public"."admin_audit_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING (studio2_access_allowed('permissions.audit'::text, NULL::uuid, false));
CREATE TRIGGER integrity_evidence_inherit_case_retention BEFORE INSERT ON integrity_case_evidence FOR EACH ROW EXECUTE FUNCTION integrity_apply_case_retention_to_evidence();
CREATE TRIGGER integrity_evidence_validate_lineage BEFORE INSERT OR UPDATE OF case_id, redacted_from_id, disclosure_copy_of_id ON integrity_case_evidence FOR EACH ROW EXECUTE FUNCTION integrity_validate_evidence_lineage();
CREATE TRIGGER organizer_inbox_case_state AFTER UPDATE OF status ON integrity_cases FOR EACH ROW EXECUTE FUNCTION private.reconcile_organizer_notification_state();
CREATE TRIGGER organizer_inbox_integrity_case_insert AFTER INSERT ON integrity_cases FOR EACH ROW EXECUTE FUNCTION private.route_organizer_inbox_event();
CREATE TRIGGER organizer_inbox_integrity_case_resolution AFTER UPDATE OF status ON integrity_cases FOR EACH ROW EXECUTE FUNCTION private.sync_organizer_inbox_integrity_case_resolution();
CREATE POLICY "permission_evaluation_events_access_read" ON "public"."permission_evaluation_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.studio2_can_manage_permissions(( SELECT auth.uid() AS uid)));
CREATE POLICY "round_stats_public_read" ON "public"."round_stats" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);
CREATE TRIGGER studio2_platform_direct_write_guard BEFORE INSERT OR DELETE OR UPDATE ON round_stats FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_guard_direct_client_write();
CREATE POLICY "studio2_access_roles_authenticated_read" ON "public"."studio2_access_roles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE TRIGGER studio2_permission_approval_task_reconcile AFTER INSERT OR UPDATE ON studio2_permission_change_approval_requests FOR EACH STATEMENT EXECUTE FUNCTION private.studio2_permission_approval_task_trigger();
CREATE TRIGGER v3_emit_result_execution_event AFTER INSERT ON studio2_result_operation_executions FOR EACH ROW EXECUTE FUNCTION private.v3_emit_result_execution_event();
CREATE POLICY "studio2_role_capabilities_authenticated_read" ON "public"."studio2_role_capabilities" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "submission versions capability manage" ON "public"."submission_versions" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM submissions s
  WHERE ((s.id = submission_versions.submission_id) AND studio2_access_allowed('confirmation.manage'::text, s.edition_id, true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM submissions s
  WHERE ((s.id = submission_versions.submission_id) AND studio2_access_allowed('confirmation.manage'::text, s.edition_id, true)))));
CREATE POLICY "submission_versions_organizer_select" ON "public"."submission_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.solaris_confirmation_admin_allowed());
CREATE POLICY "televoting organizer full access" ON "televoting"."anti_abuse_events" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('televote.ballots.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('televote.ballots.manage'::text, NULL::uuid, false));
CREATE POLICY "televoting organizer full access" ON "televoting"."external_score_entry_log" AS PERMISSIVE FOR ALL TO "authenticated" USING (studio2_access_allowed('voting.manage'::text, NULL::uuid, false)) WITH CHECK (studio2_access_allowed('voting.manage'::text, NULL::uuid, false));
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."custom_oauth_providers" FROM "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."custom_oauth_providers" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."custom_oauth_providers" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."custom_oauth_providers" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."flow_state" FROM "supabase_auth_admin";
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."flow_state" TO "postgres";
GRANT SELECT ON TABLE "auth"."flow_state" TO "postgres" WITH GRANT OPTION;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."flow_state" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."flow_state" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."identities" FROM "supabase_auth_admin";
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."identities" TO "postgres";
GRANT SELECT ON TABLE "auth"."identities" TO "postgres" WITH GRANT OPTION;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."identities" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."identities" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."mfa_amr_claims" FROM "supabase_auth_admin";
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."mfa_amr_claims" TO "postgres";
GRANT SELECT ON TABLE "auth"."mfa_amr_claims" TO "postgres" WITH GRANT OPTION;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."mfa_amr_claims" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."mfa_amr_claims" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."mfa_challenges" FROM "supabase_auth_admin";
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."mfa_challenges" TO "postgres";
GRANT SELECT ON TABLE "auth"."mfa_challenges" TO "postgres" WITH GRANT OPTION;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."mfa_challenges" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."mfa_challenges" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."mfa_factors" FROM "supabase_auth_admin";
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."mfa_factors" TO "postgres";
GRANT SELECT ON TABLE "auth"."mfa_factors" TO "postgres" WITH GRANT OPTION;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."mfa_factors" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."mfa_factors" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."mfa_recovery_code_sets" FROM "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."mfa_recovery_code_sets" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."mfa_recovery_code_sets" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."mfa_recovery_code_sets" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."mfa_recovery_codes" FROM "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."mfa_recovery_codes" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."mfa_recovery_codes" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."mfa_recovery_codes" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."oauth_authorizations" FROM "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."oauth_authorizations" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."oauth_authorizations" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."oauth_authorizations" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."oauth_clients" FROM "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."oauth_clients" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."oauth_clients" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."oauth_clients" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."oauth_consents" FROM "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."oauth_consents" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."oauth_consents" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."oauth_consents" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."one_time_tokens" FROM "supabase_auth_admin";
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."one_time_tokens" TO "postgres";
GRANT SELECT ON TABLE "auth"."one_time_tokens" TO "postgres" WITH GRANT OPTION;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."one_time_tokens" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."one_time_tokens" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."refresh_tokens" FROM "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."refresh_tokens" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."refresh_tokens" TO "dashboard_user";
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."refresh_tokens" TO "postgres";
GRANT SELECT ON TABLE "auth"."refresh_tokens" TO "postgres" WITH GRANT OPTION;
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."saml_providers" FROM "supabase_auth_admin";
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."saml_providers" TO "postgres";
GRANT SELECT ON TABLE "auth"."saml_providers" TO "postgres" WITH GRANT OPTION;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."saml_providers" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."saml_providers" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."saml_relay_states" FROM "supabase_auth_admin";
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."saml_relay_states" TO "postgres";
GRANT SELECT ON TABLE "auth"."saml_relay_states" TO "postgres" WITH GRANT OPTION;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."saml_relay_states" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."saml_relay_states" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."scim_tokens" FROM "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."scim_tokens" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."scim_tokens" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."scim_tokens" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."scim_users" FROM "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."scim_users" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."scim_users" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."scim_users" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."sessions" FROM "supabase_auth_admin";
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."sessions" TO "postgres";
GRANT SELECT ON TABLE "auth"."sessions" TO "postgres" WITH GRANT OPTION;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."sessions" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."sessions" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."sso_domains" FROM "supabase_auth_admin";
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."sso_domains" TO "postgres";
GRANT SELECT ON TABLE "auth"."sso_domains" TO "postgres" WITH GRANT OPTION;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."sso_domains" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."sso_domains" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."sso_providers" FROM "supabase_auth_admin";
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."sso_providers" TO "postgres";
GRANT SELECT ON TABLE "auth"."sso_providers" TO "postgres" WITH GRANT OPTION;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."sso_providers" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."sso_providers" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."webauthn_challenges" FROM "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."webauthn_challenges" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."webauthn_challenges" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."webauthn_challenges" TO "dashboard_user";
RESET ROLE;
SET ROLE "supabase_auth_admin";
REVOKE ALL ON TABLE "auth"."webauthn_credentials" FROM "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."webauthn_credentials" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."webauthn_credentials" TO "supabase_auth_admin";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "auth"."webauthn_credentials" TO "dashboard_user";
RESET ROLE;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "private"."v3_confirmation_operations" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "private"."v3_confirmation_operations" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."admin_audit_log" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."admin_audit_log" TO "service_role";
GRANT SELECT ON TABLE "public"."admin_audit_log" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_case_access" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_case_access" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_case_events" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_case_events" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_case_evidence" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_case_evidence" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_case_findings" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_case_findings" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_case_internal_notes" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_case_internal_notes" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_case_messages" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_case_messages" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_case_relations" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_case_relations" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_case_requests" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_case_requests" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_case_reviewers" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_case_reviewers" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_case_rule_links" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_case_rule_links" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_case_sanctions" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_case_sanctions" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_cases" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_cases" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_evidence_access_log" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_evidence_access_log" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_evidence_upload_tokens" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_evidence_upload_tokens" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_preclearance_rulings" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_preclearance_rulings" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."integrity_public_decisions" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."integrity_public_decisions" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."permission_evaluation_events" TO "postgres";
GRANT SELECT ON TABLE "public"."permission_evaluation_events" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."permission_evaluation_events" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."round_stats" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."round_stats" TO "anon";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."round_stats" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."round_stats" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."ssc_rule_interpretation_sources" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."ssc_rule_interpretation_sources" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_access_roles" TO "postgres";
GRANT SELECT ON TABLE "public"."studio2_access_roles" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_access_roles" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_permission_change_approval_requests" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_permission_change_approval_requests" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_result_operation_executions" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_result_operation_executions" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."studio2_role_capabilities" TO "postgres";
GRANT SELECT ON TABLE "public"."studio2_role_capabilities" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."studio2_role_capabilities" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."submission_versions" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "public"."submission_versions" TO "service_role";
GRANT SELECT ON TABLE "public"."submission_versions" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "televoting"."anti_abuse_events" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE "televoting"."anti_abuse_events" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "televoting"."anti_abuse_events" TO "service_role";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "televoting"."external_score_entry_log" TO "postgres";
GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE "televoting"."external_score_entry_log" TO "authenticated";
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "televoting"."external_score_entry_log" TO "service_role";
COMMIT;
