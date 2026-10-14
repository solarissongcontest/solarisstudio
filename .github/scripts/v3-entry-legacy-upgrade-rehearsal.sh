#!/usr/bin/env bash
set -euo pipefail
eval "$(supabase status -o env)"
case "${API_URL:?}" in http://127.0.0.1:*|http://localhost:*) ;; *) exit 1 ;; esac
case "${DB_URL:?}" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) exit 1 ;; esac
if [[ "${1-}" == "--seed" ]]; then
psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
insert into public.editions(id,name,slug,edition_number,status,published) values ('00000000-0000-4000-8000-00000000f601','Legacy Entry rehearsal','legacy-entry-rehearsal',9601,'draft',false);
insert into public.submission_rounds(id,edition_id,name,status) values ('00000000-0000-4000-8000-00000000f602','00000000-0000-4000-8000-00000000f601','Legacy entry','closed');
insert into public.submissions(id,edition_id,round_id,instagram_username,country) values ('00000000-0000-4000-8000-00000000f603','00000000-0000-4000-8000-00000000f601','00000000-0000-4000-8000-00000000f602','legacy_entry','Legacy delegation');
insert into public.internal_entries(id,submission_id,artist,song_title,review_status,reviewed_at) values ('00000000-0000-4000-8000-00000000f604','00000000-0000-4000-8000-00000000f603','Legacy artist','Legacy song','accepted',now()-interval '1 day');
SQL
else
psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if not exists(select 1 from public.internal_entries i join private.v3_entry_versions v on v.id=i.current_version_id
   where i.id='00000000-0000-4000-8000-00000000f604' and i.review_status='accepted' and i.reviewed_at is not null
   and i.reviewed_version_id is null and i.content_revision=1 and v.source='legacy_observation'
   and v.content->>'song_title'='Legacy song' and v.actor_id is null
   and not exists(select 1 from private.v3_entry_reviews r where r.version_id=v.id)) then
   raise exception 'Legacy backfill fabricated exact-version review evidence or changed the legacy decision';
 end if;
end $$;
SQL
fi
