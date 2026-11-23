alter table public.institution_requests
  drop constraint institution_requests_status_check,
  add constraint institution_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'withdrawn'));

create function public.withdraw_unpaid_school_registration()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.institution_requests set status = 'withdrawn'
  where id = new.request_id and status = 'pending';
  return new;
end;
$$;
revoke all on function public.withdraw_unpaid_school_registration() from public, anon, authenticated;
create trigger withdraw_unpaid_school_registration
after update of status on public.institution_subscriptions
for each row when (old.status = 'pending' and new.status = 'cancelled' and new.paid_through is null)
execute function public.withdraw_unpaid_school_registration();

-- Release pending registrations whose unpaid checkout was cancelled before this migration.
update public.institution_requests r set status = 'withdrawn'
from public.institution_subscriptions s
where s.request_id = r.id and r.status = 'pending'
  and s.status = 'cancelled' and s.paid_through is null;
