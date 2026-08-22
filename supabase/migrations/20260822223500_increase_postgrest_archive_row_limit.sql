-- Public analytics read several thousand archived jury rows. PostgREST's
-- default 1,000-row cap silently truncated those datasets and produced partial
-- relationship/support statistics. Keep the API limit above the current
-- archive size; the frontend's live archive hooks still page explicitly.
alter role authenticator set pgrst.db_max_rows = '10000';
notify pgrst, 'reload config';
