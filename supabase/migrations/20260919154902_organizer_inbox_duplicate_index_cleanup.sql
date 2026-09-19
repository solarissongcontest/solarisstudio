create unique index if not exists admin_notifications_source_unique_idx
  on public.admin_notifications (recipient_id, source_key)
  where source_key is not null;

drop index if exists public.admin_notifications_recipient_source_uidx;
