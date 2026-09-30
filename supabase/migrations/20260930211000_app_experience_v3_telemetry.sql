begin;

alter table public.public_ux_events
  drop constraint if exists public_ux_events_event_name_check;

alter table public.public_ux_events
  add constraint public_ux_events_event_name_check check (
    event_name in (
      'public_nav_clicked',
      'section_nav_clicked',
      'search_opened',
      'search_submitted',
      'search_result_clicked',
      'search_no_results',
      'breadcrumb_clicked',
      'advanced_section_opened',
      'task_started',
      'task_completed',
      'hub_primary_clicked',
      'app_tab_restored',
      'app_cold_launch_restored',
      'app_resumed',
      'app_offline_recovered',
      'app_push_opened',
      'app_show_mode_state',
      'app_task_resumed'
    )
  );

alter table public.public_ux_events
  drop constraint if exists public_ux_events_metadata_keys_check;

alter table public.public_ux_events
  add constraint public_ux_events_metadata_keys_check check (
    metadata - array[
      'device',
      'area',
      'group',
      'query_length',
      'result_count',
      'source',
      'visibility',
      'task_status',
      'interaction',
      'beta_task',
      'task_run',
      'elapsed_ms',
      'start_route',
      'search_used'
    ] = '{}'::jsonb
  );

alter table public.public_ux_events
  drop constraint if exists public_ux_events_metadata_text_lengths_check;

alter table public.public_ux_events
  add constraint public_ux_events_metadata_text_lengths_check check (
    coalesce(length(metadata ->> 'area'), 0) <= 120
    and coalesce(length(metadata ->> 'group'), 0) <= 120
    and coalesce(length(metadata ->> 'source'), 0) <= 120
    and coalesce(length(metadata ->> 'visibility'), 0) <= 120
    and coalesce(length(metadata ->> 'task_status'), 0) <= 120
    and coalesce(length(metadata ->> 'interaction'), 0) <= 120
    and coalesce(length(metadata ->> 'beta_task'), 0) <= 120
    and coalesce(length(metadata ->> 'task_run'), 0) <= 120
  );

commit;
