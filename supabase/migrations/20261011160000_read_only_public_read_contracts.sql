begin;

-- Read-only mode must keep genuine public read RPCs available.
--
-- PostgREST invokes RPCs with POST even when the PostgreSQL function is a pure
-- read. The platform pre-request gate deliberately permits those RPCs only when
-- every public overload is declared STABLE/IMMUTABLE. These functions are
-- read-only context/list projections, but legacy definitions left them VOLATILE
-- by default, causing maintenance Read-only mode to reject them with HTTP 405.
--
-- Do not add mutation RPCs here. Volatile write operations must continue to
-- fail closed while the platform is Read-only or in Maintenance.

alter function public.country_jury_voting_context() stable;
alter function public.public_country_account_confirmation_access() stable;
alter function public.public_country_account_confirmation_requirements() stable;
alter function public.public_next_in_line_countries() stable;

-- Fail the migration if a future overload silently reintroduces ambiguous
-- volatility. The operational gate checks the whole overload set by name.
do $verify$
declare
  v_bad text;
begin
  select string_agg(format('%I(%s)', proc.proname, pg_get_function_identity_arguments(proc.oid)), ', ' order by proc.proname)
  into v_bad
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname in (
      'country_jury_voting_context',
      'public_country_account_confirmation_access',
      'public_country_account_confirmation_requirements',
      'public_next_in_line_countries'
    )
    and proc.provolatile not in ('s', 'i');

  if v_bad is not null then
    raise exception 'Read-only public RPC contract contains VOLATILE overloads: %', v_bad;
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;
