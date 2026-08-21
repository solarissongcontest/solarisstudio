-- Confirmations project hardening.
-- An edit token must stop working as soon as submission, round or edition
-- editing is disabled. Token issuance already checks these flags; resolution
-- now enforces the same rule so an old token cannot outlive editing access.

create or replace function public.public_resolve_edit_token(_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  tok public.edit_tokens;
  s public.submissions;
  r public.submission_rounds;
  e public.editions;
  internal_data jsonb;
  nf_data jsonb;
begin
  select *
  into tok
  from public.edit_tokens
  where token_hash = _token_hash
    and active = true
    and (expires_at is null or expires_at > now())
  limit 1;

  if tok.id is null then
    return jsonb_build_object('valid', false, 'reason', 'invalid');
  end if;

  select * into s from public.submissions where id = tok.submission_id;
  if s.id is null then
    return jsonb_build_object('valid', false, 'reason', 'invalid');
  end if;

  if coalesce(s.locked, false) then
    update public.edit_tokens set active = false where id = tok.id;
    return jsonb_build_object('valid', false, 'reason', 'locked');
  end if;

  select * into r from public.submission_rounds where id = s.round_id;
  select * into e from public.editions where id = r.edition_id;

  if not coalesce(s.editing_allowed, false)
     or not coalesce(r.editing_enabled, false)
     or not coalesce(e.editing_enabled, false) then
    update public.edit_tokens set active = false where id = tok.id;
    return jsonb_build_object('valid', false, 'reason', 'editing_closed');
  end if;

  select to_jsonb(i)
  into internal_data
  from public.internal_entries i
  where i.submission_id = s.id
  limit 1;

  select
    case
      when nf.id is null then null
      else
        to_jsonb(nf) ||
        jsonb_build_object(
          'national_final_entries',
          coalesce(
            (
              select jsonb_agg(to_jsonb(nfe) order by nfe.position)
              from public.national_final_entries nfe
              where nfe.national_final_id = nf.id
            ),
            '[]'::jsonb
          )
        )
    end
  into nf_data
  from public.national_finals nf
  where nf.submission_id = s.id
  limit 1;

  return jsonb_build_object(
    'valid', true,
    'reason', 'ok',
    'submission',
      to_jsonb(s) ||
      jsonb_build_object(
        'internal_entries', internal_data,
        'national_finals', nf_data
      ),
    'round',
      jsonb_build_object(
        'id', r.id,
        'name', r.name,
        'status', r.status,
        'opens_at', r.opens_at,
        'closes_at', r.closes_at,
        'response_limit', r.response_limit,
        'edition_id', e.id,
        'edition_name', e.name,
        'edition_number', e.edition_number
      )
  );
end;
$function$;
