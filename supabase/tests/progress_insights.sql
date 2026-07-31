begin;

do $$
declare
  definition text := pg_get_functiondef('public.get_progress_cooperation()'::regprocedure);
begin
  if definition not like '%status = ''active''%' then
    raise exception 'cooperation requires an active partnership';
  end if;
  if definition not like '%share_checkin_completed%' or definition not like '%share_general_status%' then
    raise exception 'shared cooperation must honor owner permissions';
  end if;
  if definition like '%private_notes%' or definition like '%percentage%' then
    raise exception 'cooperation must exclude notes and personal percentages';
  end if;
  if has_function_privilege('anon', 'public.get_progress_cooperation()', 'execute') then
    raise exception 'anonymous cooperation access must be denied';
  end if;
end
$$;

rollback;
