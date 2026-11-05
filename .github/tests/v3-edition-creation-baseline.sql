-- Disposable upgrade baseline only; every probe rolls back.
\set ON_ERROR_STOP on
begin;
select exists(select 1 from pg_trigger where tgrelid='public.editions'::regclass and tgname='v3_guard_edition_creation') as hardened \gset
set local role service_role;
\if :hardened
do $$begin begin
 insert into public.editions(name,slug,edition_number,status,published) values('Worker authority baseline','s16-worker-baseline',272710,'draft',false);
 raise exception 'Hardened baseline allowed raw worker Edition creation';
 exception when insufficient_privilege then null;end;end$$;
\echo 'BASELINE: governed insertion boundary already installed; raw worker denied'
\else
insert into public.editions(name,slug,edition_number,status,published) values('Worker authority baseline','s16-worker-baseline',272710,'draft',false);
\echo 'BASELINE: legacy raw worker Edition insertion authority reproduced'
\endif
reset role;
rollback;
