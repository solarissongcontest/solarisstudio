-- S06 seven-hosted-catalog Jury, Televoting Integrity and account-session tables.
-- ZERO-ROW LOCAL FIXTURE ONLY. DO NOT USE AGAINST PRODUCTION SUPABASE.
-- Validated only with a disposable PG17.11 --network none instance and en-US ICU.
BEGIN;
SET LOCAL search_path=public,private,televoting,pg_catalog;
SET LOCAL lock_timeout='5s';

CREATE TABLE private.v3_jury_drafts (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "show_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "voter_country_id" uuid NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "revision" bigint DEFAULT 1 NOT NULL,
  "device_id" text,
  "session_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE private.v3_jury_operations (
  "operation_id" uuid NOT NULL,
  "request_hash" text NOT NULL,
  "show_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "voter_country_id" uuid NOT NULL,
  "ballot_submission_id" uuid NOT NULL,
  "receipt_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "state_version" bigint DEFAULT 1 NOT NULL,
  "result" jsonb NOT NULL,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.studio2_account_session_revocations (
  "auth_session_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "session_handle" text NOT NULL,
  "operation_id" uuid,
  "revoked_by_session_id" uuid,
  "revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reason" text DEFAULT 'user_revoked'::text NOT NULL
);

CREATE TABLE televoting.historical_vote_observations (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "source_key" text NOT NULL,
  "solaris_edition_id" uuid NOT NULL,
  "edition_number" integer,
  "round_key" text NOT NULL,
  "round_name" text NOT NULL,
  "voter_country_code" text NOT NULL,
  "target_country_code" text NOT NULL,
  "score" integer NOT NULL,
  "source_label" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE televoting.integrity_action_audit (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "preflight_id" uuid,
  "decision_id" uuid,
  "sanction_id" uuid,
  "submission_id" uuid,
  "action" text NOT NULL,
  "organizer_id" uuid,
  "reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE televoting.vote_integrity_decisions (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "preflight_id" uuid NOT NULL,
  "submission_id" uuid,
  "decision" text NOT NULL,
  "reason" text NOT NULL,
  "evidence_notes" text,
  "organizer_id" uuid,
  "ballot_excluded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE televoting.voter_sanctions (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "preflight_id" uuid,
  "source_decision_id" uuid,
  "scope_type" text NOT NULL,
  "hod_person_id" uuid,
  "country_code" text,
  "username_normalized" text,
  "sanction_type" text NOT NULL,
  "active_from" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  "reason" text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid,
  "revocation_reason" text
);

ALTER TABLE private.v3_jury_drafts ADD CONSTRAINT "v3_jury_drafts_device_id_bounded" CHECK (device_id IS NULL OR length(device_id) <= 120);
ALTER TABLE private.v3_jury_drafts ADD CONSTRAINT "v3_jury_drafts_payload_bounded" CHECK (octet_length(payload::text) <= 32768);
ALTER TABLE private.v3_jury_drafts ADD CONSTRAINT "v3_jury_drafts_payload_object" CHECK (jsonb_typeof(payload) = 'object'::text);
ALTER TABLE private.v3_jury_drafts ADD CONSTRAINT "v3_jury_drafts_pkey" PRIMARY KEY (id);
ALTER TABLE private.v3_jury_drafts ADD CONSTRAINT "v3_jury_drafts_revision_check" CHECK (revision > 0);
ALTER TABLE private.v3_jury_drafts ADD CONSTRAINT "v3_jury_drafts_session_id_bounded" CHECK (session_id IS NULL OR length(session_id) <= 120);
ALTER TABLE private.v3_jury_drafts ADD CONSTRAINT "v3_jury_drafts_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;
ALTER TABLE private.v3_jury_drafts ADD CONSTRAINT "v3_jury_drafts_show_id_user_id_key" UNIQUE (show_id, user_id);
ALTER TABLE private.v3_jury_drafts ADD CONSTRAINT "v3_jury_drafts_voter_country_id_fkey" FOREIGN KEY (voter_country_id) REFERENCES countries(id) ON DELETE CASCADE;
CREATE INDEX v3_jury_drafts_user_updated_idx ON private.v3_jury_drafts USING btree (user_id, updated_at DESC);
GRANT ALL ON TABLE private.v3_jury_drafts TO postgres;
GRANT ALL ON TABLE private.v3_jury_drafts TO service_role;

ALTER TABLE private.v3_jury_operations ADD CONSTRAINT "v3_jury_operations_ballot_submission_id_fkey" FOREIGN KEY (ballot_submission_id) REFERENCES jury_ballot_submissions(id) ON DELETE RESTRICT;
ALTER TABLE private.v3_jury_operations ADD CONSTRAINT "v3_jury_operations_ballot_submission_id_key" UNIQUE (ballot_submission_id);
ALTER TABLE private.v3_jury_operations ADD CONSTRAINT "v3_jury_operations_pkey" PRIMARY KEY (operation_id);
ALTER TABLE private.v3_jury_operations ADD CONSTRAINT "v3_jury_operations_receipt_id_key" UNIQUE (receipt_id);
ALTER TABLE private.v3_jury_operations ADD CONSTRAINT "v3_jury_operations_request_hash_not_blank" CHECK (length(btrim(request_hash)) > 0);
ALTER TABLE private.v3_jury_operations ADD CONSTRAINT "v3_jury_operations_show_id_fkey" FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;
ALTER TABLE private.v3_jury_operations ADD CONSTRAINT "v3_jury_operations_state_version_check" CHECK (state_version > 0);
ALTER TABLE private.v3_jury_operations ADD CONSTRAINT "v3_jury_operations_voter_country_id_fkey" FOREIGN KEY (voter_country_id) REFERENCES countries(id) ON DELETE RESTRICT;
CREATE INDEX v3_jury_operations_owner_show_idx ON private.v3_jury_operations USING btree (user_id, show_id, accepted_at DESC);
GRANT ALL ON TABLE private.v3_jury_operations TO postgres;
GRANT ALL ON TABLE private.v3_jury_operations TO service_role;

ALTER TABLE public.studio2_account_session_revocations ADD CONSTRAINT "studio2_account_session_revocations_handle_check" CHECK (session_handle ~ '^[0-9a-f]{64}$'::text);
ALTER TABLE public.studio2_account_session_revocations ADD CONSTRAINT "studio2_account_session_revocations_operation_id_fkey" FOREIGN KEY (operation_id) REFERENCES studio2_operation_receipts(operation_id) ON DELETE SET NULL;
ALTER TABLE public.studio2_account_session_revocations ADD CONSTRAINT "studio2_account_session_revocations_pkey" PRIMARY KEY (auth_session_id);
ALTER TABLE public.studio2_account_session_revocations ADD CONSTRAINT "studio2_account_session_revocations_reason_check" CHECK (reason = ANY (ARRAY['user_revoked'::text, 'reconciled'::text]));
ALTER TABLE public.studio2_account_session_revocations ADD CONSTRAINT "studio2_account_session_revocations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.studio2_account_session_revocations ADD CONSTRAINT "studio2_account_session_revocations_user_id_session_handle_key" UNIQUE (user_id, session_handle);
CREATE INDEX studio2_account_session_revocations_user_time_idx ON public.studio2_account_session_revocations USING btree (user_id, revoked_at DESC);
ALTER TABLE public.studio2_account_session_revocations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.studio2_account_session_revocations TO postgres;
GRANT ALL ON TABLE public.studio2_account_session_revocations TO service_role;

ALTER TABLE televoting.historical_vote_observations ADD CONSTRAINT "historical_vote_observations_pkey" PRIMARY KEY (id);
ALTER TABLE televoting.historical_vote_observations ADD CONSTRAINT "historical_vote_observations_score_check" CHECK (score >= 0);
ALTER TABLE televoting.historical_vote_observations ADD CONSTRAINT "historical_vote_observations_solaris_edition_id_fkey" FOREIGN KEY (solaris_edition_id) REFERENCES editions(id) ON DELETE CASCADE;
ALTER TABLE televoting.historical_vote_observations ADD CONSTRAINT "historical_vote_observations_source_key_voter_country_code__key" UNIQUE (source_key, voter_country_code, target_country_code);
CREATE INDEX historical_vote_observations_edition_idx ON televoting.historical_vote_observations USING btree (solaris_edition_id, round_key);
CREATE INDEX historical_vote_observations_target_idx ON televoting.historical_vote_observations USING btree (target_country_code, edition_number);
CREATE INDEX historical_vote_observations_voter_idx ON televoting.historical_vote_observations USING btree (voter_country_code, edition_number);
ALTER TABLE televoting.historical_vote_observations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE televoting.historical_vote_observations TO postgres;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE televoting.historical_vote_observations TO service_role;

ALTER TABLE televoting.integrity_action_audit ADD CONSTRAINT "integrity_action_audit_decision_id_fkey" FOREIGN KEY (decision_id) REFERENCES televoting.vote_integrity_decisions(id) ON DELETE SET NULL;
ALTER TABLE televoting.integrity_action_audit ADD CONSTRAINT "integrity_action_audit_pkey" PRIMARY KEY (id);
ALTER TABLE televoting.integrity_action_audit ADD CONSTRAINT "integrity_action_audit_preflight_id_fkey" FOREIGN KEY (preflight_id) REFERENCES televoting.vote_preflight_checks(id) ON DELETE SET NULL;
ALTER TABLE televoting.integrity_action_audit ADD CONSTRAINT "integrity_action_audit_sanction_id_fkey" FOREIGN KEY (sanction_id) REFERENCES televoting.voter_sanctions(id) ON DELETE SET NULL;
ALTER TABLE televoting.integrity_action_audit ADD CONSTRAINT "integrity_action_audit_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES televoting.vote_submissions(id) ON DELETE SET NULL;
CREATE INDEX integrity_action_audit_created_idx ON televoting.integrity_action_audit USING btree (created_at DESC);
ALTER TABLE televoting.integrity_action_audit ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE televoting.integrity_action_audit TO postgres;

ALTER TABLE televoting.vote_integrity_decisions ADD CONSTRAINT "vote_integrity_decisions_decision_check" CHECK (decision = ANY (ARRAY['cleared'::text, 'monitor'::text, 'false_declaration_confirmed'::text, 'ballot_excluded'::text]));
ALTER TABLE televoting.vote_integrity_decisions ADD CONSTRAINT "vote_integrity_decisions_pkey" PRIMARY KEY (id);
ALTER TABLE televoting.vote_integrity_decisions ADD CONSTRAINT "vote_integrity_decisions_preflight_id_fkey" FOREIGN KEY (preflight_id) REFERENCES televoting.vote_preflight_checks(id) ON DELETE CASCADE;
ALTER TABLE televoting.vote_integrity_decisions ADD CONSTRAINT "vote_integrity_decisions_preflight_id_key" UNIQUE (preflight_id);
ALTER TABLE televoting.vote_integrity_decisions ADD CONSTRAINT "vote_integrity_decisions_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES televoting.vote_submissions(id) ON DELETE SET NULL;
CREATE INDEX vote_integrity_decisions_decision_idx ON televoting.vote_integrity_decisions USING btree (decision, updated_at DESC);
ALTER TABLE televoting.vote_integrity_decisions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE televoting.vote_integrity_decisions TO postgres;

ALTER TABLE televoting.voter_sanctions ADD CONSTRAINT "voter_sanctions_check" CHECK (scope_type = 'hod'::text AND hod_person_id IS NOT NULL OR scope_type = 'country'::text AND country_code IS NOT NULL OR scope_type = 'username'::text AND username_normalized IS NOT NULL);
ALTER TABLE televoting.voter_sanctions ADD CONSTRAINT "voter_sanctions_check1" CHECK (sanction_type = 'permanent'::text AND expires_at IS NULL OR sanction_type = 'temporary'::text AND expires_at IS NOT NULL);
ALTER TABLE televoting.voter_sanctions ADD CONSTRAINT "voter_sanctions_pkey" PRIMARY KEY (id);
ALTER TABLE televoting.voter_sanctions ADD CONSTRAINT "voter_sanctions_preflight_id_fkey" FOREIGN KEY (preflight_id) REFERENCES televoting.vote_preflight_checks(id) ON DELETE SET NULL;
ALTER TABLE televoting.voter_sanctions ADD CONSTRAINT "voter_sanctions_sanction_type_check" CHECK (sanction_type = ANY (ARRAY['temporary'::text, 'permanent'::text]));
ALTER TABLE televoting.voter_sanctions ADD CONSTRAINT "voter_sanctions_scope_type_check" CHECK (scope_type = ANY (ARRAY['hod'::text, 'country'::text, 'username'::text]));
ALTER TABLE televoting.voter_sanctions ADD CONSTRAINT "voter_sanctions_source_decision_id_fkey" FOREIGN KEY (source_decision_id) REFERENCES televoting.vote_integrity_decisions(id) ON DELETE SET NULL;
CREATE INDEX voter_sanctions_active_idx ON televoting.voter_sanctions USING btree (active_from, expires_at, revoked_at);
CREATE INDEX voter_sanctions_country_idx ON televoting.voter_sanctions USING btree (upper(country_code)) WHERE (country_code IS NOT NULL);
CREATE INDEX voter_sanctions_hod_idx ON televoting.voter_sanctions USING btree (hod_person_id) WHERE (hod_person_id IS NOT NULL);
CREATE INDEX voter_sanctions_username_idx ON televoting.voter_sanctions USING btree (lower(username_normalized)) WHERE (username_normalized IS NOT NULL);
ALTER TABLE televoting.voter_sanctions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE televoting.voter_sanctions TO postgres;

COMMIT;
