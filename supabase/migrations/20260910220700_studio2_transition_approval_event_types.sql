begin;

alter table public.studio2_contest_events
  drop constraint studio2_contest_events_type_check;

alter table public.studio2_contest_events
  add constraint studio2_contest_events_type_check check (
    type in (
      'edition.created', 'edition.state_changed', 'edition.archived',
      'edition.transition_approval_requested', 'edition.transition_approval_granted',
      'confirmation.opened', 'confirmation.closed', 'country.confirmed',
      'entry.submitted', 'entry.changed', 'entry.locked',
      'jury.opened', 'jury.closed', 'jury.ballot_submitted',
      'televote.opened', 'televote.closed', 'televote.ballot_submitted',
      'vote.flagged', 'integrity.case_created', 'integrity.case_closed',
      'results.calculated', 'results.verified', 'results.published',
      'broadcast.segment_started', 'broadcast.segment_completed',
      'incident.created', 'incident.updated', 'incident.resolved',
      'notice.sent', 'notice.acknowledged', 'rule.changed'
    )
  );

notify pgrst, 'reload schema';

commit;
