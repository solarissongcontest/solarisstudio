begin;

-- Participant-facing V3 state must distinguish a completed participation
-- confirmation from an explicit non-participation response. The canonical
-- country-account read model already owns the response projection, so expose
-- the existing submissions.participating truth there instead of inferring it
-- from receipt metadata or presentation state.
--
-- Preserve the read-only runtime contract added on 2026-10-11: this RPC must
-- remain STABLE so platform Read-only mode can permit it, and execution remains
-- restricted to authenticated callers plus service-role server tooling after
-- the canonical Confirmations grant hardening.

create or replace function public.public_country_account_confirmation_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  caller_user_id uuid := auth.uid();
  account_country_id uuid;
  country_row public.countries;
  responses jsonb;
begin
  if caller_user_id is null then
    return jsonb_build_object(
      'authenticated', false,
      'country', null,
      'responses', '[]'::jsonb
    );
  end if;

  select ca.country_id
  into account_country_id
  from public.country_accounts ca
  where ca.user_id = caller_user_id
    and ca.status = 'active'
  limit 1;

  if account_country_id is null then
    return jsonb_build_object(
      'authenticated', false,
      'country', null,
      'responses', '[]'::jsonb
    );
  end if;

  select c.*
  into country_row
  from public.countries c
  where c.id = account_country_id;

  if country_row.id is null then
    return jsonb_build_object(
      'authenticated', false,
      'country', null,
      'responses', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'submission_id', s.id,
        'round_id', r.id,
        'round_name', r.name,
        'edition_id', e.id,
        'edition_name', e.name,
        'edition_number', e.edition_number,
        'country', s.country,
        'participating', s.participating,
        'submitted_at', s.submitted_at,
        'updated_at', s.updated_at,
        'selection_method', s.selection_method,
        'entry_unknown', s.entry_unknown,
        'reveal_date_type', s.reveal_date_type,
        'reveal_exact_date', s.reveal_exact_date,
        'reveal_approximate_text', s.reveal_approximate_text,
        'nf_date_type', s.nf_date_type,
        'nf_exact_date', s.nf_exact_date,
        'nf_result_date_type', s.nf_result_date_type,
        'nf_result_exact_date', s.nf_result_exact_date,
        'internal_entry', (
          select jsonb_build_object(
            'id', i.id,
            'artist', i.artist,
            'song_title', i.song_title,
            'review_status', coalesce(i.review_status, 'pending'),
            'review_reason', i.review_reason,
            'reviewed_at', i.reviewed_at
          )
          from public.internal_entries i
          where i.submission_id = s.id
          limit 1
        ),
        'national_final', (
          select jsonb_build_object(
            'id', nf.id,
            'nf_name', nf.nf_name,
            'winning_entry_id', nf.winning_entry_id,
            'entries', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', nfe.id,
                  'artist', nfe.artist,
                  'song_title', nfe.song_title,
                  'position', nfe.position,
                  'review_status', coalesce(nfe.review_status, 'pending'),
                  'review_reason', nfe.review_reason,
                  'reviewed_at', nfe.reviewed_at,
                  'removed', coalesce(nfe.removed, false)
                )
                order by nfe.position, nfe.id
              )
              from public.national_final_entries nfe
              where nfe.national_final_id = nf.id
            ), '[]'::jsonb)
          )
          from public.national_finals nf
          where nf.submission_id = s.id
          limit 1
        ),
        'can_edit',
          not coalesce(s.locked, false)
          and coalesce(s.editing_allowed, false)
          and coalesce(r.editing_enabled, false)
          and coalesce(e.editing_enabled, false),
        'reason',
          case
            when coalesce(s.locked, false) then 'locked'
            when not coalesce(s.editing_allowed, false)
              or not coalesce(r.editing_enabled, false)
              or not coalesce(e.editing_enabled, false) then 'editing_closed'
            else 'open'
          end
      )
      order by e.edition_number desc, s.submitted_at desc
    ),
    '[]'::jsonb
  )
  into responses
  from public.submissions s
  join public.submission_rounds r on r.id = s.round_id
  join public.editions e on e.id = r.edition_id
  where lower(trim(s.country)) in (
    lower(trim(country_row.name)),
    lower(trim(country_row.short_code))
  );

  return jsonb_build_object(
    'authenticated', true,
    'country', jsonb_build_object(
      'country_id', country_row.id,
      'name', country_row.name,
      'short_code', country_row.short_code
    ),
    'responses', responses
  );
end;
$$;

revoke all on function public.public_country_account_confirmation_access() from public;
revoke execute on function public.public_country_account_confirmation_access() from anon;
grant execute on function public.public_country_account_confirmation_access() to authenticated, service_role;

do $verify$
declare
  v_volatility "char";
begin
  select proc.provolatile
  into v_volatility
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'public_country_account_confirmation_access'
    and pg_get_function_identity_arguments(proc.oid) = '';

  if v_volatility is distinct from 's' then
    raise exception 'public_country_account_confirmation_access must remain STABLE';
  end if;

  if has_function_privilege('anon', 'public.public_country_account_confirmation_access()', 'EXECUTE') then
    raise exception 'anon must not execute public_country_account_confirmation_access';
  end if;

  if not has_function_privilege('authenticated', 'public.public_country_account_confirmation_access()', 'EXECUTE') then
    raise exception 'authenticated must execute public_country_account_confirmation_access';
  end if;

  if not has_function_privilege('service_role', 'public.public_country_account_confirmation_access()', 'EXECUTE') then
    raise exception 'service_role must execute public_country_account_confirmation_access';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;
