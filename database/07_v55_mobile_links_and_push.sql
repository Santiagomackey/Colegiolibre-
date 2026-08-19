-- ColegioLibre V55 · Push de mensajes
-- Ejecutar una vez en Supabase > SQL Editor.
-- La función crea una notificación nueva por mensaje para que el webhook INSERT
-- se ejecute siempre, incluso si el destinatario ya tiene mensajes sin leer.

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_row public.conversations%rowtype;
  recipient_uuid uuid;
  actor_name text;
begin
  select * into conversation_row
  from public.conversations
  where id = new.conversation_id;

  if not found then return new; end if;

  recipient_uuid := case
    when new.sender_id = conversation_row.buyer_id then conversation_row.seller_id
    else conversation_row.buyer_id
  end;

  if recipient_uuid is null or recipient_uuid = new.sender_id then return new; end if;

  actor_name := coalesce(
    public.notification_actor_name(new.sender_id),
    'Alguien de ColegioLibre'
  );

  insert into public.notifications (
    user_id, actor_id, type, title, body, product_id,
    conversation_id, action_url, metadata
  ) values (
    recipient_uuid,
    new.sender_id,
    'message',
    'Nuevo mensaje de ' || actor_name,
    left(new.body, 140),
    conversation_row.product_id,
    new.conversation_id,
    'mensajes.html?id=' || new.conversation_id::text,
    jsonb_build_object('message_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists notifications_after_message_insert on public.messages;
create trigger notifications_after_message_insert
after insert on public.messages
for each row execute function public.notify_new_message();
