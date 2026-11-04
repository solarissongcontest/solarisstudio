begin;

-- System V3 / Jury Share Cards (JSC-1 + JSC-2), rebuilt on current main.
--
-- Share cards are a read projection over canonical Jury + published Results.
-- They must never become a second ballot store. The extra evidence below binds
-- each newly calculated immutable Result Version to the exact Jury inputs that
-- existed when that version was created. Existing historical Result Versions
-- are deliberately NOT backfilled: if exact input provenance was not captured,
-- Solaris fails closed rather than inventing an official historical ballot.
select public.v3_register_migration_contract(
  'v3.results.jury-share-projection-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Add immutable Jury-input provenance and a publication-safe Jury Share projection without backfilling unprovable historical Result Versions.'
);

create table private.v3_result_jury_inputs (
  show_id uuid not null,
  result_version bigint not null check (result_version > 0),
  edition_id uuid not null,
  jury_input_fingerprint text not null
    check (jury_input_fingerprint ~ '^[0-9a-f]{64}$'),
  ballot_count integer not null check (ballot_count >= 0),
  vote_count integer not null check (vote_count >= 0),
  dnv_count integer not null check (dnv_count >= 0),
  captured_at timestamptz not null default now(),
  primary key (show_id, result_version),
  constraint v3_result_jury_inputs_result_version_fk
    foreign key (show_id, result_version)
    references private.v3_result_versions (show_id, version)
    deferrable initially deferred,
  constraint v3_result_jury_inputs_show_edition_fk
    foreign key (show_id, edition_id)
    references public.shows (id, edition_id)
    on delete cascade
);

alter table private.v3_result_jury_inputs enable row level security;
revoke all on table private.v3_result_jury_inputs from public, anon, authenticated;
grant select, insert on table private.v3_result_jury_inputs to service_role;

comment on table private.v3_result_jury_inputs is
  'Immutable Jury-input fingerprint captured for each new canonical Result Version. No raw ballot payload is duplicated here.';

create or replace function private.v3_jury_result_input_evidence(p_show_id uuid)
returns table (
  jury_input_fingerprint text,
  ballot_count integer,
  vote_count integer,
  dnv_count integer
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $evidence$
  with ballot_evidence as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', ballot.id,
            'voterCountryId', ballot.voter_country_id,
            'voterEntityId', ballot.voter_entity_id,
            'voterId', ballot.voter_id,
            'status', ballot.status,
            'reviewVersion', ballot.review_version
          )
          order by ballot.voter_country_id, ballot.id
        ),
        '[]'::jsonb
      ) as rows,
      count(*)::integer as row_count
    from public.jury_ballot_submissions ballot
    where ballot.show_id = p_show_id
  ),
  vote_evidence as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'ballotSubmissionId', vote.ballot_submission_id,
            'voterCountryId', vote.voter_country_id,
            'voterEntityId', vote.voter_entity_id,
            'voterId', vote.voter_id,
            'receivingCountryId', vote.receiving_country_id,
            'receivingEntityId', vote.receiving_entity_id,
            'points', vote.points
          )
          order by
            coalesce(vote.voter_country_id::text, vote.voter_entity_id::text, vote.voter_id::text, ''),
            coalesce(vote.receiving_country_id::text, vote.receiving_entity_id::text, ''),
            vote.points desc,
            coalesce(vote.ballot_submission_id::text, '')
        ),
        '[]'::jsonb
      ) as rows,
      count(*)::integer as row_count
    from public.jury_votes vote
    where vote.show_id = p_show_id
  ),
  dnv_evidence as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', status_row.id,
            'voterCountryId', status_row.voter_country_id,
            'voterEntityId', status_row.voter_entity_id,
            'voterId', status_row.voter_id,
            'status', status_row.status,
            'version', status_row.version
          )
          order by
            coalesce(status_row.voter_country_id::text, status_row.voter_entity_id::text, status_row.voter_id::text, ''),
            status_row.id
        ),
        '[]'::jsonb
      ) as rows,
      count(*)::integer as row_count
    from public.jury_ballot_statuses status_row
    where status_row.show_id = p_show_id
  ),
  normalized as (
    select jsonb_build_object(
      'ballots', ballot_evidence.rows,
      'votes', vote_evidence.rows,
      'dnv', dnv_evidence.rows
    ) as payload,
    ballot_evidence.row_count as ballot_count,
    vote_evidence.row_count as vote_count,
    dnv_evidence.row_count as dnv_count
    from ballot_evidence, vote_evidence, dnv_evidence
  )
  select
    encode(
      extensions.digest(convert_to(normalized.payload::text, 'UTF8'), 'sha256'),
      'hex'
    ),
    normalized.ballot_count,
    normalized.vote_count,
    normalized.dnv_count
  from normalized;
$evidence$;

revoke all on function private.v3_jury_result_input_evidence(uuid)
  from public, anon, authenticated;
grant execute on function private.v3_jury_result_input_evidence(uuid)
  to service_role;

create or replace function private.v3_capture_result_jury_input()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $capture$
declare
  v_fingerprint text;
  v_ballot_count integer;
  v_vote_count integer;
  v_dnv_count integer;
begin
  if new.calculation_version < 1
     or (tg_op = 'UPDATE' and new.calculation_version = old.calculation_version) then
    return new;
  end if;

  select evidence.jury_input_fingerprint,
         evidence.ballot_count,
         evidence.vote_count,
         evidence.dnv_count
  into v_fingerprint, v_ballot_count, v_vote_count, v_dnv_count
  from private.v3_jury_result_input_evidence(new.show_id) evidence;

  insert into private.v3_result_jury_inputs (
    show_id,
    result_version,
    edition_id,
    jury_input_fingerprint,
    ballot_count,
    vote_count,
    dnv_count,
    captured_at
  ) values (
    new.show_id,
    new.calculation_version,
    new.edition_id,
    v_fingerprint,
    v_ballot_count,
    v_vote_count,
    v_dnv_count,
    coalesce(new.last_calculated_at, now())
  );

  return new;
end
$capture$;

revoke all on function private.v3_capture_result_jury_input()
  from public, anon, authenticated;

drop trigger if exists v3_capture_result_jury_input
  on public.studio2_result_operations;
create trigger v3_capture_result_jury_input
after insert or update of calculation_version
on public.studio2_result_operations
for each row execute function private.v3_capture_result_jury_input();

-- The existing immutable-evidence guard is intentionally reused. Result Jury
-- provenance cannot be rewritten after a Result Version has been created.
create trigger v3_reject_result_jury_input_mutation
before update or delete on private.v3_result_jury_inputs
for each row execute function private.v3_reject_result_version_mutation();

create or replace function public.v3_jury_share_projection(
  p_show_id uuid,
  p_voter_country_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $projection$
declare
  v_actor uuid := auth.uid();
  v_service boolean := private.studio2_request_is_service_role();
  v_show public.shows%rowtype;
  v_edition public.editions%rowtype;
  v_control public.studio2_show_publication_controls%rowtype;
  v_ballot public.jury_ballot_submissions%rowtype;
  v_version private.v3_result_versions%rowtype;
  v_saved_evidence private.v3_result_jury_inputs%rowtype;
  v_current_fingerprint text;
  v_current_ballot_count integer;
  v_current_vote_count integer;
  v_current_dnv_count integer;
  v_owner boolean := false;
  v_public_detail boolean := false;
  v_results_public boolean := false;
  v_vote_count integer := 0;
  v_recipient_count integer := 0;
  v_points integer[];
  v_source_name text;
  v_source_flag text;
  v_source_identity_version text;
  v_edition_identity_version text;
  v_votes jsonb := '[]'::jsonb;
  v_published_at timestamptz;
  v_state_version text;
begin
  if p_show_id is null or p_voter_country_id is null then
    raise exception 'Jury share projection requires show and voter country identity'
      using errcode = '22023';
  end if;

  select show_row.* into v_show
  from public.shows show_row
  where show_row.id = p_show_id;
  if not found then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  select edition.* into v_edition
  from public.editions edition
  where edition.id = v_show.edition_id;
  if not found then
    raise exception 'Edition not found' using errcode = 'P0002';
  end if;

  select ballot.* into v_ballot
  from public.jury_ballot_submissions ballot
  where ballot.show_id = p_show_id
    and ballot.voter_country_id = p_voter_country_id;

  if v_ballot.id is not null and v_actor is not null then
    v_owner := v_ballot.user_id = v_actor;
  end if;
  if v_actor is not null and not v_owner then
    v_owner := exists (
      select 1
      from public.country_accounts account
      where account.user_id = v_actor
        and account.country_id = p_voter_country_id
        and coalesce(account.status, 'active') = 'active'
    );
  end if;

  v_public_detail := public.show_publication_enabled(p_show_id, 'detailed_voting');

  if not v_service and not v_owner and not v_public_detail then
    raise exception 'Jury share ballot is not authorized'
      using errcode = '42501';
  end if;

  if v_ballot.id is null then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_BALLOT_NOT_FOUND',
      'serverTime', now()
    );
  end if;

  select control.* into v_control
  from public.studio2_show_publication_controls control
  where control.show_id = p_show_id;

  v_results_public := v_control.show_id is not null
    and v_control.state = 'public'
    and v_control.source_result_version is not null
    and public.show_publication_enabled(p_show_id, 'results')
    and public.show_publication_enabled(p_show_id, 'jury_results');

  if not v_results_public then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_NOT_PUBLISHED',
      'publication', jsonb_build_object(
        'shareable', false,
        'reason', 'RESULTS_NOT_PUBLISHED'
      ),
      'serverTime', now()
    );
  end if;

  if v_ballot.status <> 'valid' then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_BALLOT_NOT_FOUND',
      'publication', jsonb_build_object(
        'shareable', false,
        'reason', 'BALLOT_NOT_FINAL'
      ),
      'serverTime', now()
    );
  end if;

  select version_row.* into v_version
  from private.v3_result_versions version_row
  where version_row.show_id = p_show_id
    and version_row.version = v_control.source_result_version;

  select evidence_row.* into v_saved_evidence
  from private.v3_result_jury_inputs evidence_row
  where evidence_row.show_id = p_show_id
    and evidence_row.result_version = v_control.source_result_version;

  if v_version.show_id is null or v_saved_evidence.show_id is null then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_RESULT_CHANGED',
      'reason', 'published_result_lacks_exact_jury_input_evidence',
      'serverTime', now()
    );
  end if;

  select evidence.jury_input_fingerprint,
         evidence.ballot_count,
         evidence.vote_count,
         evidence.dnv_count
  into v_current_fingerprint,
       v_current_ballot_count,
       v_current_vote_count,
       v_current_dnv_count
  from private.v3_jury_result_input_evidence(p_show_id) evidence;

  if v_current_fingerprint is distinct from v_saved_evidence.jury_input_fingerprint
     or v_current_ballot_count is distinct from v_saved_evidence.ballot_count
     or v_current_vote_count is distinct from v_saved_evidence.vote_count
     or v_current_dnv_count is distinct from v_saved_evidence.dnv_count then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_RESULT_CHANGED',
      'reason', 'jury_inputs_changed_after_published_result_version',
      'serverTime', now()
    );
  end if;

  select
    count(*)::integer,
    count(distinct vote.receiving_country_id)::integer,
    array_agg(vote.points order by vote.points desc)
  into v_vote_count, v_recipient_count, v_points
  from public.jury_votes vote
  where vote.show_id = p_show_id
    and vote.ballot_submission_id = v_ballot.id;

  if v_vote_count <> 10
     or v_recipient_count <> 10
     or v_points is distinct from array[12,10,8,7,6,5,4,3,2,1]::integer[] then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_RENDER_FAILED',
      'reason', 'unsupported_or_incomplete_jury_point_set',
      'serverTime', now()
    );
  end if;

  select
    coalesce(identity.display_name, country.name),
    coalesce(identity.flag_image, country.flag_image),
    encode(
      extensions.digest(
        convert_to(concat_ws('|',
          v_show.edition_id::text,
          country.id::text,
          coalesce(identity.display_name, country.name),
          coalesce(identity.flag_image, country.flag_image, ''),
          coalesce(identity.updated_at, country.updated_at)::text
        ), 'UTF8'),
        'sha256'
      ),
      'hex'
    )
  into v_source_name, v_source_flag, v_source_identity_version
  from public.countries country
  left join public.country_edition_identities identity
    on identity.country_id = country.id
   and identity.edition_id = v_show.edition_id
  where country.id = p_voter_country_id;

  if v_source_name is null or v_source_flag is null then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_ASSET_FAILED',
      'reason', 'source_country_identity_incomplete',
      'serverTime', now()
    );
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'recipientCountryId', ranked.receiving_country_id,
      'displayName', ranked.display_name,
      'flagAsset', jsonb_build_object(
        'id', 'country:' || ranked.receiving_country_id::text || ':edition:' || v_show.edition_id::text || ':flag',
        'url', ranked.flag_image,
        'alt', ranked.display_name || ' flag'
      ),
      'identityVersion', ranked.identity_version,
      'points', ranked.points,
      'rank', ranked.rank
    ) order by ranked.rank
  ), '[]'::jsonb)
  into v_votes
  from (
    select
      vote.receiving_country_id,
      coalesce(identity.display_name, country.name) as display_name,
      coalesce(identity.flag_image, country.flag_image) as flag_image,
      encode(
        extensions.digest(
          convert_to(concat_ws('|',
            v_show.edition_id::text,
            country.id::text,
            coalesce(identity.display_name, country.name),
            coalesce(identity.flag_image, country.flag_image, ''),
            coalesce(identity.updated_at, country.updated_at)::text
          ), 'UTF8'),
          'sha256'
        ),
        'hex'
      ) as identity_version,
      vote.points,
      row_number() over (order by vote.points desc)::integer as rank
    from public.jury_votes vote
    join public.countries country on country.id = vote.receiving_country_id
    left join public.country_edition_identities identity
      on identity.country_id = country.id
     and identity.edition_id = v_show.edition_id
    where vote.show_id = p_show_id
      and vote.ballot_submission_id = v_ballot.id
  ) ranked;

  if jsonb_array_length(v_votes) <> 10
     or exists (
       select 1
       from jsonb_array_elements(v_votes) item
       where nullif(item #>> '{flagAsset,url}', '') is null
    ) then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_ASSET_FAILED',
      'reason', 'recipient_country_identity_incomplete',
      'serverTime', now()
    );
  end if;

  v_edition_identity_version := encode(
    extensions.digest(
      convert_to(concat_ws('|',
        v_edition.id::text,
        v_edition.slug,
        v_edition.name,
        coalesce(v_edition.edition_number::text, ''),
        v_edition.data_revision::text
      ), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  select execution.executed_at
  into v_published_at
  from public.studio2_show_publication_executions execution
  where execution.show_id = p_show_id
    and execution.edition_id = v_show.edition_id
    and execution.status = 'succeeded'
    and execution.source_result_version = v_control.source_result_version
  order by execution.executed_at desc
  limit 1;
  v_published_at := coalesce(v_published_at, v_control.updated_at);

  v_state_version := encode(
    extensions.digest(
      convert_to(concat_ws('|',
        v_ballot.id::text,
        v_ballot.review_version::text,
        v_control.version::text,
        v_control.source_result_version::text,
        v_saved_evidence.jury_input_fingerprint,
        v_source_identity_version,
        v_edition_identity_version,
        v_votes::text
      ), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  return jsonb_build_object(
    'ok', true,
    'visibility', case when v_public_detail then 'public' else 'private' end,
    'projection', jsonb_build_object(
      'schemaVersion', 1,
      'ballotId', v_ballot.id,
      'edition', jsonb_build_object(
        'id', v_edition.id,
        'slug', v_edition.slug,
        'number', v_edition.edition_number,
        'name', v_edition.name,
        'historicalIdentityVersion', v_edition_identity_version
      ),
      'show', jsonb_build_object(
        'id', v_show.id,
        'name', v_show.name,
        'type', case
          when v_show.kind in ('grand-final', 'final') then 'final'
          when v_show.kind ilike '%semi%' then 'semi_final'
          else 'other'
        end
      ),
      'source', jsonb_build_object(
        'delegationId', v_show.edition_id::text || ':' || p_voter_country_id::text,
        'countryId', p_voter_country_id,
        'displayName', v_source_name,
        'flagAsset', jsonb_build_object(
          'id', 'country:' || p_voter_country_id::text || ':edition:' || v_show.edition_id::text || ':flag',
          'url', v_source_flag,
          'alt', v_source_name || ' flag'
        ),
        'identityVersion', v_source_identity_version
      ),
      'votes', v_votes,
      'result', jsonb_build_object(
        'resultVersionId', v_show.id::text || ':' || v_control.source_result_version::text,
        'publishedAt', v_published_at
      ),
      'themes', jsonb_build_array(
        jsonb_build_object('id', 'default', 'state', 'available'),
        jsonb_build_object('id', 'edition', 'state', 'unconfigured'),
        jsonb_build_object('id', 'liquid_glass', 'state', 'unsupported')
      ),
      'publication', jsonb_build_object('shareable', true, 'reason', null),
      'stateVersion', v_state_version,
      'serverTime', now()
    )
  );
end
$projection$;

revoke all on function public.v3_jury_share_projection(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.v3_jury_share_projection(uuid, uuid)
  to anon, authenticated, service_role;

comment on function public.v3_jury_share_projection(uuid, uuid) is
  'Read-only JSC projection. Public country ballots require detailed_voting publication; owners may read their own ballot only after canonical Results/Jury publication. Exact Jury input evidence must match the published Result Version.';

notify pgrst, 'reload schema';

commit;
