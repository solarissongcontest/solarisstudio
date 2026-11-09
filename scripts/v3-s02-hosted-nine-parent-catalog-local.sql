-- S02 nine-parent exact hosted catalog metadata, Pg17.11 local disposable only.
-- S02: bounded LOCAL-only NINE-PARENT catalog probe. Same pg_catalog fields used in the
-- owner-approved read-only snapshot of eight S14 relations on 2026-11-09.
-- NEVER execute this file against hosted Supabase from CI/Playwright.
WITH targets(s,t) AS (
  VALUES ('auth','users'),
    ('public','contest_entities'),
    ('public','countries'),
    ('public','country_accounts'),
    ('public','studio2_capabilities'),
    ('public','themes'),
    ('televoting','countries'),
    ('televoting','editions'),
    ('televoting','vote_preflight_checks')
), objects AS (
 SELECT jsonb_build_object(
  'schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),
  'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
  'columns',(SELECT jsonb_agg(jsonb_build_object(
    'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
    'notnull',a.attnotnull,'identity',a.attidentity::text,
    'generated',a.attgenerated::text,'default',pg_get_expr(d.adbin,d.adrelid)
    ) ORDER BY a.attnum) FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name',k.conname,'type',k.contype::text,
    'definition',pg_get_constraintdef(k.oid,true),'validated',k.convalidated
    ) ORDER BY k.conname),'[]'::jsonb) FROM pg_constraint k WHERE k.conrelid=c.oid),
  'indexes',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name',x.relname,'definition',pg_get_indexdef(x.oid),'primary',ix.indisprimary,
    'unique',ix.indisunique,'valid',ix.indisvalid
    ) ORDER BY x.relname),'[]'::jsonb) FROM pg_index ix
    JOIN pg_class x ON x.oid=ix.indexrelid WHERE ix.indrelid=c.oid),
  'triggers',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name',tr.tgname,'definition',pg_get_triggerdef(tr.oid,true),
    'enabled',tr.tgenabled::text,'func',tr.tgfoid::regprocedure::text
    ) ORDER BY tr.tgname),'[]'::jsonb) FROM pg_trigger tr
    WHERE tr.tgrelid=c.oid AND NOT tr.tgisinternal),
  'policies',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name',p.polname,'command',p.polcmd::text,
    'permissive',p.polpermissive,
    'roles',(SELECT COALESCE(jsonb_agg(
      CASE WHEN rid=0 THEN 'PUBLIC' ELSE pg_get_userbyid(rid) END
      ORDER BY CASE WHEN rid=0 THEN 'PUBLIC' ELSE pg_get_userbyid(rid) END
    ),'[]'::jsonb) FROM unnest(p.polroles) rid),
    'using',pg_get_expr(p.polqual,p.polrelid),
    'check',pg_get_expr(p.polwithcheck,p.polrelid)
    ) ORDER BY p.polname),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid=c.oid)
 ) AS meta
 FROM targets x JOIN pg_namespace n ON n.nspname=x.s
 JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=x.t AND c.relkind IN ('r','p')
)
SELECT COALESCE(jsonb_agg(meta ORDER BY meta->>'schema',meta->>'name'),'[]'::jsonb)::text
FROM objects;
