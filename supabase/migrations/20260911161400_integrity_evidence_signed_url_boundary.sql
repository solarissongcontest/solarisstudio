begin;

-- Evidence downloads are now signed by the authenticated Edge Function after a
-- reporter/organizer descriptor RPC has authorized and audit-logged the request.
-- Browser roles therefore no longer need SELECT on private evidence objects.
drop policy if exists "integrity evidence protected read" on storage.objects;

revoke all on function public.integrity_can_read_evidence_object(text) from authenticated;
revoke all on function public.integrity_can_read_evidence_object(text) from public;

commit;
