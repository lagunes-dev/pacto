-- Forward compatibility for environments that recorded the Realtime migration
-- before the partnerships freshness column was added to the base schema.
alter table public.partnerships
  add column if not exists updated_at timestamptz;

update public.partnerships
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.partnerships
  alter column updated_at set default now(),
  alter column updated_at set not null;

create or replace function public.touch_partnership_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

revoke all on function public.touch_partnership_updated_at() from public, anon, authenticated;
drop trigger if exists partnerships_updated_at on public.partnerships;
create trigger partnerships_updated_at before update on public.partnerships
  for each row execute function public.touch_partnership_updated_at();
