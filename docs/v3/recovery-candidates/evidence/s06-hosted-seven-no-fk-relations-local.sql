-- S06 PG17.11, connector-observed, zero-row, SEVEN additional relation fixture.
-- LOCAL / NETWORKLESS TEST ONLY. NEVER deploy or run on hosted Supabase.
-- Reproduced from read-only pg_catalog metadata, 2026-11-10.
-- Exact column, constraint, index, RLS, ownership and table ACL parity is tested
-- against the frozen independently collected hosted digest in the same repository.
-- NOT a function, role-membership, extension, auth, application, or S13/S14 recovery.
BEGIN;
SET LOCAL search_path = public, private, televoting, pg_catalog;
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS televoting;
DO $local_roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$local_roles$;

CREATE TABLE private.country_auth_rate_limits (
  scope text NOT NULL,
  key_hash text NOT NULL,
  window_started_at timestamp with time zone DEFAULT now() NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE private.country_auth_rate_limits
  ADD CONSTRAINT country_auth_rate_limits_attempts_check CHECK (attempts >= 0);
ALTER TABLE private.country_auth_rate_limits
  ADD CONSTRAINT country_auth_rate_limits_pkey PRIMARY KEY (scope, key_hash);
CREATE INDEX country_auth_rate_limits_updated_idx
  ON private.country_auth_rate_limits USING btree (updated_at);
GRANT ALL ON TABLE private.country_auth_rate_limits TO postgres;

CREATE TABLE private.studio2_platform_exit_write_probe (
  id uuid NOT NULL,
  actor_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE private.studio2_platform_exit_write_probe
  ADD CONSTRAINT studio2_platform_exit_write_probe_pkey PRIMARY KEY (id);
-- Hosted relacl is NULL for this relation; do NOT add explicit grants.

CREATE TABLE public.ssc_rule_registry (
  rule_id text NOT NULL,
  chapter_number integer NOT NULL,
  rule_number integer NOT NULL
);
ALTER TABLE public.ssc_rule_registry
  ADD CONSTRAINT ssc_rule_registry_chapter_number_rule_number_key UNIQUE (chapter_number, rule_number);
ALTER TABLE public.ssc_rule_registry
  ADD CONSTRAINT ssc_rule_registry_pkey PRIMARY KEY (rule_id);
ALTER TABLE public.ssc_rule_registry ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.ssc_rule_registry TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.ssc_rule_registry TO service_role;

CREATE TABLE public.studio2_televote_global_versions (
  singleton boolean DEFAULT true NOT NULL,
  version bigint DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.studio2_televote_global_versions
  ADD CONSTRAINT studio2_televote_global_versions_pkey PRIMARY KEY (singleton);
ALTER TABLE public.studio2_televote_global_versions
  ADD CONSTRAINT studio2_televote_global_versions_singleton_check CHECK (singleton);
ALTER TABLE public.studio2_televote_global_versions
  ADD CONSTRAINT studio2_televote_global_versions_version_check CHECK (version >= 0);
ALTER TABLE public.studio2_televote_global_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.studio2_televote_global_versions TO postgres;
GRANT ALL ON TABLE public.studio2_televote_global_versions TO service_role;

CREATE TABLE public.studio2_televote_round_versions (
  round_id uuid NOT NULL,
  version bigint DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.studio2_televote_round_versions
  ADD CONSTRAINT studio2_televote_round_versions_pkey PRIMARY KEY (round_id);
ALTER TABLE public.studio2_televote_round_versions
  ADD CONSTRAINT studio2_televote_round_versions_version_check CHECK (version >= 0);
ALTER TABLE public.studio2_televote_round_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.studio2_televote_round_versions TO postgres;
GRANT ALL ON TABLE public.studio2_televote_round_versions TO service_role;

CREATE TABLE televoting.legacy_friend_voting_relationships (
  id uuid NOT NULL,
  voting_country_code text NOT NULL,
  target_country_code text NOT NULL,
  snapshot jsonb NOT NULL,
  calculated_at timestamp with time zone,
  review_status text,
  reviewed_by text,
  reviewed_at timestamp with time zone,
  moderator_note text,
  imported_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE televoting.legacy_friend_voting_relationships
  ADD CONSTRAINT legacy_friend_voting_relationships_pkey PRIMARY KEY (id);
CREATE INDEX legacy_friend_voting_pair_idx
  ON televoting.legacy_friend_voting_relationships USING btree (voting_country_code, target_country_code);
ALTER TABLE televoting.legacy_friend_voting_relationships ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE televoting.legacy_friend_voting_relationships TO postgres;

CREATE TABLE televoting.legacy_import_metadata (
  import_key text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  imported_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE televoting.legacy_import_metadata
  ADD CONSTRAINT legacy_import_metadata_pkey PRIMARY KEY (import_key);
ALTER TABLE televoting.legacy_import_metadata ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE televoting.legacy_import_metadata TO postgres;

-- Deliberately NO application rows, account roles with LOGIN, or task side effects.
COMMIT;
