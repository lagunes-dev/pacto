begin;

grant select, insert, update, delete on public.private_notes to authenticated;

commit;
