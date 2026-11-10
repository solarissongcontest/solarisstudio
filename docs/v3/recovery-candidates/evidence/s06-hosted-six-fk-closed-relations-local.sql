-- S06 connector-observed exact definitions for six additional hosted physical tables.
-- ONLY a disposable networkless PostgreSQL 17.11 fixture, NOT production DDL.
-- Requires the preexisting S02 56 hosted-observed parent relations. NO rows.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE private.v3_confirmation_account_drafts (
 round_id uuid NOT NULL,
 country_id uuid NOT NULL,
 payload jsonb DEFAULT '{}'::jsonb NOT NULL,
 revision bigint DEFAULT 1 NOT NULL,
 created_at timestamp with time zone DEFAULT now() NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE private.v3_confirmation_account_drafts
 ADD CONSTRAINT v3_confirmation_account_drafts_pkey PRIMARY KEY (round_id,country_id),
 ADD CONSTRAINT v3_confirmation_account_drafts_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id) ON DELETE CASCADE,
 ADD CONSTRAINT v3_confirmation_account_drafts_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.submission_rounds(id) ON DELETE CASCADE,
 ADD CONSTRAINT v3_confirmation_account_drafts_revision_positive CHECK (revision >= 1);
GRANT ALL ON TABLE private.v3_confirmation_account_drafts TO postgres,service_role;

CREATE TABLE private.v3_televote_recovery_handles (
 operation_id uuid NOT NULL,
 preflight_id uuid NOT NULL,
 recovery_secret_hash text NOT NULL,
 created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE private.v3_televote_recovery_handles
 ADD CONSTRAINT v3_televote_recovery_handles_pkey PRIMARY KEY (operation_id),
 ADD CONSTRAINT v3_televote_recovery_handles_preflight_id_key UNIQUE (preflight_id),
 ADD CONSTRAINT v3_televote_recovery_handles_preflight_id_fkey FOREIGN KEY (preflight_id) REFERENCES televoting.vote_preflight_checks(id) ON DELETE CASCADE,
 ADD CONSTRAINT v3_televote_recovery_secret_hash_shape CHECK (recovery_secret_hash ~ '^[0-9a-f]{64}$'::text);
GRANT ALL ON TABLE private.v3_televote_recovery_handles TO postgres;

CREATE TABLE public.studio2_eligibility_override_versions (
 edition_id uuid NOT NULL,
 country_id uuid NOT NULL,
 affected_rule text NOT NULL,
 version bigint DEFAULT 0 NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.studio2_eligibility_override_versions
 ADD CONSTRAINT studio2_eligibility_override_versions_pkey PRIMARY KEY (edition_id,country_id,affected_rule),
 ADD CONSTRAINT studio2_eligibility_override_versions_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id) ON DELETE CASCADE,
 ADD CONSTRAINT studio2_eligibility_override_versions_edition_id_fkey FOREIGN KEY (edition_id) REFERENCES public.editions(id) ON DELETE CASCADE,
 ADD CONSTRAINT studio2_eligibility_override_versions_version_check CHECK (version >= 0);
ALTER TABLE public.studio2_eligibility_override_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.studio2_eligibility_override_versions TO postgres,service_role;

CREATE TABLE public.studio2_next_in_line_submission_revisions (
 id uuid DEFAULT gen_random_uuid() NOT NULL,
 submission_id uuid NOT NULL,
 revision bigint NOT NULL,
 operation_id uuid,
 snapshot jsonb NOT NULL,
 created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.studio2_next_in_line_submission_revisions
 ADD CONSTRAINT studio2_next_in_line_submission_revisions_pkey PRIMARY KEY (id),
 ADD CONSTRAINT studio2_next_in_line_submission_revi_submission_id_revision_key UNIQUE (submission_id,revision),
 ADD CONSTRAINT studio2_next_in_line_submission_revisions_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.studio2_operation_receipts(operation_id) ON DELETE SET NULL,
 ADD CONSTRAINT studio2_next_in_line_submission_revisions_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.next_in_line_submissions(id) ON DELETE CASCADE,
 ADD CONSTRAINT studio2_next_in_line_submission_revisions_revision_check CHECK (revision > 0),
 ADD CONSTRAINT studio2_next_in_line_revision_snapshot_v3_check CHECK (jsonb_typeof(snapshot) = 'object'::text AND pg_column_size(snapshot) <= 32768);
CREATE INDEX studio2_next_in_line_revisions_submission_time_idx
 ON public.studio2_next_in_line_submission_revisions USING btree (submission_id,revision DESC,created_at DESC);
ALTER TABLE public.studio2_next_in_line_submission_revisions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.studio2_next_in_line_submission_revisions TO postgres,service_role;

CREATE TABLE public.studio2_platform_operational_state (
 singleton boolean DEFAULT true NOT NULL,
 mode text DEFAULT 'normal'::text NOT NULL,
 version bigint DEFAULT 1 NOT NULL,
 affected_services text[] DEFAULT '{}'::text[] NOT NULL,
 message text,
 incident_reference text,
 reason text DEFAULT 'Initial platform state'::text NOT NULL,
 changed_by uuid,
 changed_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.studio2_platform_operational_state
 ADD CONSTRAINT studio2_platform_operational_state_pkey PRIMARY KEY (singleton),
 ADD CONSTRAINT studio2_platform_operational_state_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
 ADD CONSTRAINT studio2_platform_operational_state_mode_check CHECK (mode = ANY (ARRAY['normal'::text, 'degraded'::text, 'read_only'::text, 'maintenance'::text])),
 ADD CONSTRAINT studio2_platform_operational_state_singleton_check CHECK (singleton),
 ADD CONSTRAINT studio2_platform_operational_state_version_check CHECK (version > 0);
ALTER TABLE public.studio2_platform_operational_state ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.studio2_platform_operational_state TO postgres,service_role;

CREATE TABLE public.studio2_voting_declaration_policy (
 singleton boolean DEFAULT true NOT NULL,
 current_statement_version integer NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL,
 updated_by uuid
);
ALTER TABLE public.studio2_voting_declaration_policy
 ADD CONSTRAINT studio2_voting_declaration_policy_pkey PRIMARY KEY (singleton),
 ADD CONSTRAINT studio2_voting_declaration_poli_current_statement_version_check CHECK (current_statement_version > 0),
 ADD CONSTRAINT studio2_voting_declaration_policy_singleton_check CHECK (singleton),
 ADD CONSTRAINT studio2_voting_declaration_policy_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.studio2_voting_declaration_policy ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.studio2_voting_declaration_policy TO postgres,service_role;

COMMIT;
