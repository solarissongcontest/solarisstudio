-- S06: 8 FK-closed hosted-observed table definitions; no application data.
-- LOCAL-ONLY disposable PG17.11 fixture. DO NOT run on production.
-- Source: bounded read-only pg_catalog SELECT on authorized Solaris Studio PG17.11,
-- compared exclusively to frozen 215-relation hosted catalog digests.
-- Requires preceding S02 56 + S06 seven + five local fixtures (68 total).
-- NO production DDL, data, function bodies, role membership or release authority.
BEGIN;
SET LOCAL search_path=public,private,televoting,pg_catalog;
SET LOCAL lock_timeout='5s';

CREATE TABLE private.v3_confirmation_account_drafts (
 round_id uuid NOT NULL,
 country_id uuid NOT NULL,
 payload jsonb DEFAULT '{}'::jsonb NOT NULL,
 revision bigint DEFAULT 1 NOT NULL,
 created_at timestamp with time zone DEFAULT now() NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE private.v3_confirmation_account_drafts
 ADD CONSTRAINT v3_confirmation_account_drafts_pkey PRIMARY KEY (round_id,country_id);
ALTER TABLE private.v3_confirmation_account_drafts
 ADD CONSTRAINT v3_confirmation_account_drafts_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.submission_rounds(id) ON DELETE CASCADE;
ALTER TABLE private.v3_confirmation_account_drafts
 ADD CONSTRAINT v3_confirmation_account_drafts_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id) ON DELETE CASCADE;
ALTER TABLE private.v3_confirmation_account_drafts
 ADD CONSTRAINT v3_confirmation_account_drafts_revision_positive CHECK (revision >= 1);
GRANT ALL ON TABLE private.v3_confirmation_account_drafts TO postgres,service_role;

CREATE TABLE private.v3_televote_recovery_handles (
 operation_id uuid NOT NULL,
 preflight_id uuid NOT NULL,
 recovery_secret_hash text NOT NULL,
 created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE private.v3_televote_recovery_handles
 ADD CONSTRAINT v3_televote_recovery_handles_pkey PRIMARY KEY (operation_id);
ALTER TABLE private.v3_televote_recovery_handles
 ADD CONSTRAINT v3_televote_recovery_handles_preflight_id_key UNIQUE (preflight_id);
ALTER TABLE private.v3_televote_recovery_handles
 ADD CONSTRAINT v3_televote_recovery_handles_preflight_id_fkey FOREIGN KEY (preflight_id) REFERENCES televoting.vote_preflight_checks(id) ON DELETE CASCADE;
ALTER TABLE private.v3_televote_recovery_handles
 ADD CONSTRAINT v3_televote_recovery_secret_hash_shape CHECK (recovery_secret_hash ~ '^[0-9a-f]{64}$'::text);
GRANT ALL ON TABLE private.v3_televote_recovery_handles TO postgres;

CREATE TABLE public.studio2_voting_declaration_policy (
 singleton boolean DEFAULT true NOT NULL,
 current_statement_version integer NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL,
 updated_by uuid
);
ALTER TABLE public.studio2_voting_declaration_policy
 ADD CONSTRAINT studio2_voting_declaration_policy_pkey PRIMARY KEY (singleton);
ALTER TABLE public.studio2_voting_declaration_policy
 ADD CONSTRAINT studio2_voting_declaration_policy_singleton_check CHECK (singleton);
ALTER TABLE public.studio2_voting_declaration_policy
 ADD CONSTRAINT studio2_voting_declaration_poli_current_statement_version_check CHECK (current_statement_version > 0);
ALTER TABLE public.studio2_voting_declaration_policy
 ADD CONSTRAINT studio2_voting_declaration_policy_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.studio2_voting_declaration_policy ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.studio2_voting_declaration_policy TO postgres,service_role;

CREATE TABLE public.studio2_eligibility_override_versions (
 edition_id uuid NOT NULL,
 country_id uuid NOT NULL,
 affected_rule text NOT NULL,
 version bigint DEFAULT 0 NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.studio2_eligibility_override_versions
 ADD CONSTRAINT studio2_eligibility_override_versions_pkey PRIMARY KEY (edition_id,country_id,affected_rule);
ALTER TABLE public.studio2_eligibility_override_versions
 ADD CONSTRAINT studio2_eligibility_override_versions_edition_id_fkey FOREIGN KEY (edition_id) REFERENCES public.editions(id) ON DELETE CASCADE;
ALTER TABLE public.studio2_eligibility_override_versions
 ADD CONSTRAINT studio2_eligibility_override_versions_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id) ON DELETE CASCADE;
ALTER TABLE public.studio2_eligibility_override_versions
 ADD CONSTRAINT studio2_eligibility_override_versions_version_check CHECK (version >= 0);
ALTER TABLE public.studio2_eligibility_override_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.studio2_eligibility_override_versions TO postgres,service_role;

CREATE TABLE public.ssc_rulebook_releases (
 id uuid DEFAULT gen_random_uuid() NOT NULL,
 version text NOT NULL,
 status text DEFAULT 'draft'::text NOT NULL,
 is_current boolean DEFAULT false NOT NULL,
 title text NOT NULL,
 summary text NOT NULL,
 base_version text,
 effective_from timestamp with time zone,
 created_by uuid,
 created_at timestamp with time zone DEFAULT now() NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL,
 published_at timestamp with time zone
);
ALTER TABLE public.ssc_rulebook_releases
 ADD CONSTRAINT ssc_rulebook_releases_pkey PRIMARY KEY (id);
ALTER TABLE public.ssc_rulebook_releases
 ADD CONSTRAINT ssc_rulebook_releases_version_key UNIQUE (version);
ALTER TABLE public.ssc_rulebook_releases
 ADD CONSTRAINT ssc_rulebook_releases_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.ssc_rulebook_releases
 ADD CONSTRAINT ssc_rulebook_current_requires_published CHECK (NOT is_current OR status = 'published'::text);
ALTER TABLE public.ssc_rulebook_releases
 ADD CONSTRAINT ssc_rulebook_release_version_format CHECK (version ~ '^[0-9]+\.[0-9]+(\.[0-9]+)?$'::text);
ALTER TABLE public.ssc_rulebook_releases
 ADD CONSTRAINT ssc_rulebook_releases_status_check CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]));
CREATE UNIQUE INDEX ssc_rulebook_one_current_idx ON public.ssc_rulebook_releases USING btree (is_current) WHERE (is_current = true);
CREATE INDEX ssc_rulebook_release_status_idx ON public.ssc_rulebook_releases USING btree (status,created_at DESC);
ALTER TABLE public.ssc_rulebook_releases ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.ssc_rulebook_releases TO postgres;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.ssc_rulebook_releases TO service_role;

CREATE TABLE public.ssc_rulebook_events (
 id uuid DEFAULT gen_random_uuid() NOT NULL,
 release_id uuid NOT NULL,
 event_type text NOT NULL,
 detail text,
 actor_user_id uuid,
 created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.ssc_rulebook_events
 ADD CONSTRAINT ssc_rulebook_events_pkey PRIMARY KEY (id);
ALTER TABLE public.ssc_rulebook_events
 ADD CONSTRAINT ssc_rulebook_events_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.ssc_rulebook_releases(id) ON DELETE CASCADE;
ALTER TABLE public.ssc_rulebook_events
 ADD CONSTRAINT ssc_rulebook_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX ssc_rulebook_events_release_created_idx ON public.ssc_rulebook_events USING btree (release_id,created_at DESC);
ALTER TABLE public.ssc_rulebook_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.ssc_rulebook_events TO postgres;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.ssc_rulebook_events TO service_role;

CREATE TABLE public.studio2_next_in_line_submission_revisions (
 id uuid DEFAULT gen_random_uuid() NOT NULL,
 submission_id uuid NOT NULL,
 revision bigint NOT NULL,
 operation_id uuid,
 snapshot jsonb NOT NULL,
 created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.studio2_next_in_line_submission_revisions
 ADD CONSTRAINT studio2_next_in_line_submission_revisions_pkey PRIMARY KEY (id);
ALTER TABLE public.studio2_next_in_line_submission_revisions
 ADD CONSTRAINT studio2_next_in_line_submission_revi_submission_id_revision_key UNIQUE (submission_id,revision);
ALTER TABLE public.studio2_next_in_line_submission_revisions
 ADD CONSTRAINT studio2_next_in_line_submission_revisions_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.next_in_line_submissions(id) ON DELETE CASCADE;
ALTER TABLE public.studio2_next_in_line_submission_revisions
 ADD CONSTRAINT studio2_next_in_line_submission_revisions_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.studio2_operation_receipts(operation_id) ON DELETE SET NULL;
ALTER TABLE public.studio2_next_in_line_submission_revisions
 ADD CONSTRAINT studio2_next_in_line_submission_revisions_revision_check CHECK (revision > 0);
ALTER TABLE public.studio2_next_in_line_submission_revisions
 ADD CONSTRAINT studio2_next_in_line_revision_snapshot_v3_check CHECK (jsonb_typeof(snapshot) = 'object'::text AND pg_column_size(snapshot) <= 32768);
CREATE INDEX studio2_next_in_line_revisions_submission_time_idx ON public.studio2_next_in_line_submission_revisions USING btree (submission_id,revision DESC,created_at DESC);
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
 ADD CONSTRAINT studio2_platform_operational_state_pkey PRIMARY KEY (singleton);
ALTER TABLE public.studio2_platform_operational_state
 ADD CONSTRAINT studio2_platform_operational_state_singleton_check CHECK (singleton);
ALTER TABLE public.studio2_platform_operational_state
 ADD CONSTRAINT studio2_platform_operational_state_version_check CHECK (version > 0);
ALTER TABLE public.studio2_platform_operational_state
 ADD CONSTRAINT studio2_platform_operational_state_mode_check CHECK (mode = ANY (ARRAY['normal'::text,'degraded'::text,'read_only'::text,'maintenance'::text]));
ALTER TABLE public.studio2_platform_operational_state
 ADD CONSTRAINT studio2_platform_operational_state_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.studio2_platform_operational_state ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.studio2_platform_operational_state TO postgres,service_role;
COMMIT;
