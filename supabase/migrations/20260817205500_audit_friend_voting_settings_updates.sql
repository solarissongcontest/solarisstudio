create or replace function public.update_friend_voting_settings_with_audit(
  p_actor_id uuid,
  p_values jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.friend_voting_settings%rowtype;
  v_after public.friend_voting_settings%rowtype;
begin
  select * into v_before
  from public.friend_voting_settings
  where id = 'default'
  for update;

  if not found then
    insert into public.friend_voting_settings (id) values ('default')
    returning * into v_before;
  end if;

  update public.friend_voting_settings
  set
    min_independent_editions = coalesce((p_values->>'min_independent_editions')::integer, min_independent_editions),
    full_confidence_editions = coalesce((p_values->>'full_confidence_editions')::integer, full_confidence_editions),
    support_edition_threshold = coalesce((p_values->>'support_edition_threshold')::numeric, support_edition_threshold),
    maximum_edition_threshold = coalesce((p_values->>'maximum_edition_threshold')::numeric, maximum_edition_threshold),
    reciprocal_edition_threshold = coalesce((p_values->>'reciprocal_edition_threshold')::numeric, reciprocal_edition_threshold),
    intensity_threshold = coalesce((p_values->>'intensity_threshold')::numeric, intensity_threshold),
    cross_channel_min_editions = coalesce((p_values->>'cross_channel_min_editions')::integer, cross_channel_min_editions),
    base_confidence_weight = coalesce((p_values->>'base_confidence_weight')::numeric, base_confidence_weight),
    support_weight = coalesce((p_values->>'support_weight')::numeric, support_weight),
    maximum_weight = coalesce((p_values->>'maximum_weight')::numeric, maximum_weight),
    reciprocity_weight = coalesce((p_values->>'reciprocity_weight')::numeric, reciprocity_weight),
    intensity_weight = coalesce((p_values->>'intensity_weight')::numeric, intensity_weight),
    cross_channel_weight = coalesce((p_values->>'cross_channel_weight')::numeric, cross_channel_weight),
    cross_channel_per_edition_weight = coalesce((p_values->>'cross_channel_per_edition_weight')::numeric, cross_channel_per_edition_weight),
    one_edition_cap = coalesce((p_values->>'one_edition_cap')::integer, one_edition_cap),
    two_edition_cap = coalesce((p_values->>'two_edition_cap')::integer, two_edition_cap),
    clique_min_edge_risk = coalesce((p_values->>'clique_min_edge_risk')::integer, clique_min_edge_risk),
    clique_internal_share_threshold = coalesce((p_values->>'clique_internal_share_threshold')::numeric, clique_internal_share_threshold),
    clique_min_members = coalesce((p_values->>'clique_min_members')::integer, clique_min_members),
    clique_min_density = coalesce((p_values->>'clique_min_density')::numeric, clique_min_density),
    risk_notable = coalesce((p_values->>'risk_notable')::integer, risk_notable),
    risk_review = coalesce((p_values->>'risk_review')::integer, risk_review),
    risk_strong = coalesce((p_values->>'risk_strong')::integer, risk_strong),
    risk_high = coalesce((p_values->>'risk_high')::integer, risk_high),
    risk_critical = coalesce((p_values->>'risk_critical')::integer, risk_critical)
  where id = 'default'
  returning * into v_after;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  ) values (
    p_actor_id,
    'update_friend_voting_settings',
    'friend_voting_settings',
    'default',
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.update_friend_voting_settings_with_audit(uuid, jsonb) from public;
grant execute on function public.update_friend_voting_settings_with_audit(uuid, jsonb) to service_role;

comment on function public.update_friend_voting_settings_with_audit(uuid, jsonb) is
  'Atomically updates the singleton HOD-aware friend-voting model and records before/after values in admin_audit_log.';