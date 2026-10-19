begin;

-- System V3 / S6: bounded Media review-projection verification.
--
-- Canonical media ownership is intentionally split: URLs/metadata remain in the
-- existing edition/country/entry owners while object bytes live in storage or
-- an external provider. Organizer review rows are immutable decision evidence,
-- not an asset store. This verifier proves only the relational review projection
-- and explicitly refuses to claim that external bytes were reconstructed or
-- even reachable from PostgreSQL.
select public.v3_register_migration_contract(
  'v3.s6.media-review-verification',
  1,
  'forward_fix_only',
  false,
  null,
  'Add bounded read-only verification for the active Media review projection without fabricating external object recovery.'
);

create or replace function public.studio2_verify_media_review_projection(
  p_edition_id uuid,
  p_review_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $verify$
declare
  v_active_count integer := 0;
  v_approved_count integer := 0;
  v_review public.studio2_media_asset_reviews%rowtype;
  v_current_source text;
  v_resolve_failed boolean;
  v_issues jsonb := '[]'::jsonb;
begin
  if p_edition_id is null
     or not exists (select 1 from public.editions edition where edition.id = p_edition_id) then
    raise exception 'Media verification edition not found' using errcode = 'P0002';
  end if;
  if p_review_limit is null or p_review_limit < 1 or p_review_limit > 1000 then
    raise exception 'Media review verification limit must be between 1 and 1000'
      using errcode = '22023';
  end if;

  select count(*)::integer
  into v_active_count
  from (
    select 1
    from public.studio2_media_asset_reviews review
    where review.edition_id = p_edition_id
      and review.superseded_at is null
    limit p_review_limit + 1
  ) bounded_active;

  if v_active_count > p_review_limit then
    return jsonb_build_object(
      'state', 'unknown',
      'reason', 'verification_bound_exceeded',
      'editionId', p_edition_id,
      'reviewLimit', p_review_limit,
      'observedActiveReviewsAtLeast', v_active_count,
      'coverage', 'relational_review_projection',
      'externalObjectState', 'not_verified'
    );
  end if;

  for v_review in
    select review.*
    from public.studio2_media_asset_reviews review
    where review.edition_id = p_edition_id
      and review.superseded_at is null
    order by review.asset_key, review.reviewed_at desc, review.id
    limit p_review_limit
  loop
    v_current_source := null;
    v_resolve_failed := false;

    begin
      v_current_source := private.studio2_resolve_media_asset_source(
        v_review.edition_id,
        v_review.asset_key,
        v_review.asset_type,
        v_review.country_id,
        v_review.entry_id
      );
    exception when others then
      v_resolve_failed := true;
    end;

    if v_resolve_failed then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'canonical_source_unresolvable',
        'reviewId', v_review.id,
        'assetKey', v_review.asset_key
      ));
      continue;
    end if;

    if v_current_source is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'canonical_source_missing',
        'reviewId', v_review.id,
        'assetKey', v_review.asset_key
      ));
    elsif btrim(v_current_source) is distinct from btrim(v_review.source_fingerprint) then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'source_fingerprint_drift',
        'reviewId', v_review.id,
        'assetKey', v_review.asset_key
      ));
    end if;

    if v_review.decision = 'approved' then
      v_approved_count := v_approved_count + 1;
      if btrim(v_review.source_fingerprint) !~* '^https?://' then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'approved_source_not_http',
          'reviewId', v_review.id,
          'assetKey', v_review.asset_key
        ));
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'state', case when jsonb_array_length(v_issues) = 0 then 'consistent' else 'drift' end,
    'reason', case
      when jsonb_array_length(v_issues) = 0 then 'verified_relational_projection'
      else 'canonical_media_projection_mismatch'
    end,
    'editionId', p_edition_id,
    'reviewLimit', p_review_limit,
    'activeReviewCount', v_active_count,
    'approvedReviewCount', v_approved_count,
    'issueCount', jsonb_array_length(v_issues),
    'issues', v_issues,
    'coverage', 'relational_review_projection',
    'externalObjectState', case
      when v_approved_count > 0 then 'requires_external_object_verification'
      else 'not_applicable'
    end,
    'rebuildAvailable', false,
    'rebuildBlockedBy', case
      when v_approved_count > 0 then 'external_object_bytes_are_not_reconstructible_from_review_metadata'
      else 'media_review_history_is_canonical_evidence_not_a_disposable_writer_target'
    end,
    'verifiedAt', now()
  );
end
$verify$;

revoke all on function public.studio2_verify_media_review_projection(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.studio2_verify_media_review_projection(uuid, integer)
  to service_role;

comment on function public.studio2_verify_media_review_projection(uuid, integer) is
  'S6 bounded service-only verifier for active Media review metadata. External/storage object existence remains outside PostgreSQL verification and is never inferred from metadata.';

notify pgrst, 'reload schema';

commit;
