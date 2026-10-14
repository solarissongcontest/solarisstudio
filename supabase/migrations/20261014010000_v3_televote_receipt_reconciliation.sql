begin;

-- The unguessable server-issued preflight token is a bearer capability for
-- this exact ballot only. No table grants, caller-selected submission lookup,
-- identity hashes, moderation notes or ballot contents are returned.
create or replace function public.v3_reconcile_televote(
  p_preflight_token uuid, p_round_id uuid, p_username text,
  p_country_code text, p_entries jsonb
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, televoting
as $$
declare
  v_check televoting.vote_preflight_checks%rowtype;
  v_submission televoting.vote_submissions%rowtype;
  v_map jsonb := '{}'::jsonb;
  v_actual jsonb;
  v_entry jsonb;
  v_key text;
  v_points integer;
  v_total integer := 0;
begin
  if p_preflight_token is null or p_round_id is null or p_username is null
     or length(trim(p_username)) not between 2 and 40
     or p_country_code is null or length(p_country_code) > 80
     or p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    return jsonb_build_object('found', false);
  end if;
  if jsonb_array_length(p_entries) not between 5 and 20 then
    return jsonb_build_object('found', false);
  end if;
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_key := v_entry ->> 'target_country_code';
    if v_key is null or length(v_key) not between 1 and 80
       or jsonb_typeof(v_entry -> 'points') is distinct from 'number'
       or (v_entry ->> 'points') !~ '^(10|[1-9])$'
       or v_map ? v_key then
      return jsonb_build_object('found', false);
    end if;
    v_points := (v_entry ->> 'points')::integer;
    v_total := v_total + v_points;
    v_map := v_map || jsonb_build_object(v_key, v_points);
  end loop;
  if v_total <> 20 then return jsonb_build_object('found', false); end if;

  select * into v_check from televoting.vote_preflight_checks
  where id = p_preflight_token;
  if not found or v_check.submission_id is null or v_check.submitted_at is null
     or v_check.round_id is distinct from p_round_id
     or v_check.username_normalized is distinct from lower(trim(p_username))
     or upper(v_check.country_code) is distinct from upper(p_country_code)
     or v_check.ballot_map is distinct from v_map then
    return jsonb_build_object('found', false);
  end if;

  select * into v_submission from televoting.vote_submissions
  where id = v_check.submission_id;
  if not found or v_submission.status not in ('active', 'suspicious', 'verified')
     or v_submission.round_id is distinct from p_round_id
     or v_submission.username_normalized is distinct from v_check.username_normalized
     or upper(v_submission.country_code) is distinct from upper(v_check.country_code) then
    return jsonb_build_object('found', false);
  end if;
  select jsonb_object_agg(target_country_code, points) into v_actual
  from televoting.vote_entries where submission_id = v_submission.id;
  if v_actual is distinct from v_map then
    return jsonb_build_object('found', false);
  end if;

  -- A committed receipt survives round closure and preflight expiry. Those
  -- boundaries still apply to every new write through submit_vote_checked.
  return jsonb_build_object(
    'found', true, 'id', v_submission.id, 'round_id', p_round_id,
    'preflight_id', v_check.id, 'status', v_submission.status,
    'accepted_at', v_check.submitted_at, 'authority', 'authoritative_server'
  );
end;
$$;
revoke all on function public.v3_reconcile_televote(uuid,uuid,text,text,jsonb) from public;
grant execute on function public.v3_reconcile_televote(uuid,uuid,text,text,jsonb) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
