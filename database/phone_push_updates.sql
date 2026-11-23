-- Reuse the existing sender for bundled notifications whose content changes.
do $$
begin
  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.notifications'::regclass
      and tgname = 'push_notifications_webhook' and (tgtype::int & 16) = 0
  ) and not exists (
    select 1 from pg_trigger where tgrelid = 'public.notifications'::regclass
      and tgname = 'push_notification_content_updates'
  ) then
    create trigger push_notification_content_updates
    after update on public.notifications for each row
    when (new.read is false and (
      old.title is distinct from new.title or old.body is distinct from new.body
      or old.metadata is distinct from new.metadata or old.action_url is distinct from new.action_url
      or (old.read is true and old.updated_at is distinct from new.updated_at)
    ))
    execute function public.send_push_notification_webhook();
  end if;
end;
$$;
