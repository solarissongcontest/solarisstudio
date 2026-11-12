-- S06 read-only-hosted-catalog-derived version-ledger extension.
-- ONLY for networkless/disposable PostgreSQL 17.11. NEVER deploy to production.
-- Requires S02 hosted-observed 56-table fixture parents; zero application rows.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE TABLE public.studio2_confirmation_review_versions (
 submission_id uuid NOT NULL,
 version bigint DEFAULT 1 NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.studio2_confirmation_review_versions
 ADD CONSTRAINT studio2_confirmation_review_versions_pkey PRIMARY KEY (submission_id);
ALTER TABLE public.studio2_confirmation_review_versions
 ADD CONSTRAINT studio2_confirmation_review_versions_submission_id_fkey FOREIGN KEY (submission_id)
 REFERENCES public.submissions(id) ON DELETE CASCADE;
ALTER TABLE public.studio2_confirmation_review_versions
 ADD CONSTRAINT studio2_confirmation_review_versions_version_check CHECK (version > 0);
ALTER TABLE public.studio2_confirmation_review_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.studio2_confirmation_review_versions TO postgres, service_role;

CREATE TABLE public.studio2_confirmation_round_versions (
 round_id uuid NOT NULL,
 version bigint DEFAULT 0 NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.studio2_confirmation_round_versions
 ADD CONSTRAINT studio2_confirmation_round_versions_pkey PRIMARY KEY (round_id);
ALTER TABLE public.studio2_confirmation_round_versions
 ADD CONSTRAINT studio2_confirmation_round_versions_round_id_fkey FOREIGN KEY (round_id)
 REFERENCES public.submission_rounds(id) ON DELETE CASCADE;
ALTER TABLE public.studio2_confirmation_round_versions
 ADD CONSTRAINT studio2_confirmation_round_versions_version_check CHECK (version >= 0);
ALTER TABLE public.studio2_confirmation_round_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.studio2_confirmation_round_versions TO postgres, service_role;

CREATE TABLE public.studio2_jury_window_versions (
 edition_id uuid NOT NULL,
 version bigint DEFAULT 0 NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.studio2_jury_window_versions
 ADD CONSTRAINT studio2_jury_window_versions_pkey PRIMARY KEY (edition_id);
ALTER TABLE public.studio2_jury_window_versions
 ADD CONSTRAINT studio2_jury_window_versions_edition_id_fkey FOREIGN KEY (edition_id)
 REFERENCES public.editions(id) ON DELETE CASCADE;
ALTER TABLE public.studio2_jury_window_versions
 ADD CONSTRAINT studio2_jury_window_versions_version_check CHECK (version >= 0);
ALTER TABLE public.studio2_jury_window_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.studio2_jury_window_versions TO postgres, service_role;

CREATE TABLE public.studio2_permission_subject_versions (
 user_id uuid NOT NULL,
 version bigint DEFAULT 0 NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.studio2_permission_subject_versions
 ADD CONSTRAINT studio2_permission_subject_versions_pkey PRIMARY KEY (user_id);
ALTER TABLE public.studio2_permission_subject_versions
 ADD CONSTRAINT studio2_permission_subject_versions_user_id_fkey FOREIGN KEY (user_id)
 REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.studio2_permission_subject_versions
 ADD CONSTRAINT studio2_permission_subject_versions_version_check CHECK (version >= 0);
ALTER TABLE public.studio2_permission_subject_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.studio2_permission_subject_versions TO postgres, service_role;

CREATE TABLE public.studio2_participation_status_versions (
 edition_id uuid NOT NULL,
 subject_key text NOT NULL,
 version bigint DEFAULT 0 NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.studio2_participation_status_versions
 ADD CONSTRAINT studio2_participation_status_versions_pkey PRIMARY KEY (edition_id,subject_key);
ALTER TABLE public.studio2_participation_status_versions
 ADD CONSTRAINT studio2_participation_status_versions_edition_id_fkey FOREIGN KEY (edition_id)
 REFERENCES public.editions(id) ON DELETE CASCADE;
ALTER TABLE public.studio2_participation_status_versions
 ADD CONSTRAINT studio2_participation_status_versions_version_check CHECK (version >= 0);
ALTER TABLE public.studio2_participation_status_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.studio2_participation_status_versions TO postgres, service_role;
COMMIT;
