begin;

do $$
begin
  if has_table_privilege('authenticated', 'public.partnerships', 'insert,update,delete') then
    raise exception 'partnership writes must remain RPC-only';
  end if;
  if not pg_get_functiondef('public.request_partnership_resume()'::regprocedure) like '%status = ''paused''%' then
    raise exception 'resume request must keep the partnership paused';
  end if;
  if not pg_get_functiondef('public.confirm_partnership_resume()'::regprocedure) like '%resume_requested_by <> actor_id%' then
    raise exception 'resume confirmation must come from the other member';
  end if;
  if not pg_get_functiondef('public.confirm_partnership_resume()'::regprocedure) like '%resume_requested_by = null%' then
    raise exception 'resume confirmation must consume pending consent';
  end if;
  if not pg_get_functiondef('public.complete_onboarding(text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text)'::regprocedure) like '%pg_timezone_names%' then
    raise exception 'onboarding must validate an IANA timezone';
  end if;
  if pg_get_functiondef('public.complete_onboarding(text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text)'::regprocedure) like '%partnerships%' then
    raise exception 'onboarding must never create or accept a partnership implicitly';
  end if;
end
$$;

rollback;
