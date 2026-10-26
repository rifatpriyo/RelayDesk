create or replace function public.commit_business_state(p_business uuid,p_user text,p_service boolean,p_revision bigint,p_state jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare current_state jsonb; current_revision bigint; member_role text; collection text; item jsonb;
begin
 if not p_service then
   member_role:=private.member_role(p_business,p_user::uuid);
   if member_role is null then raise exception 'Access denied'; end if;
 end if;
 select state,revision into current_state,current_revision from public.business_states where business_id=p_business for update;
 if current_state is null or current_state->'business'->>'deletedAt' is not null then raise exception 'Business unavailable'; end if;
 if current_revision<>p_revision then return false; end if;
 if p_state->'business'->>'id'<>p_business::text then raise exception 'Tenant mismatch'; end if;
 foreach collection in array array['catalog','knowledge','rules','conversations','channels','sources','audit'] loop
   for item in select value from jsonb_array_elements(coalesce(p_state->collection,'[]'::jsonb)) loop
     if item->>'businessId' is distinct from p_business::text then raise exception 'Tenant-qualified record required'; end if;
   end loop;
 end loop;
 if member_role='agent' and (
   current_state->'settings' is distinct from p_state->'settings' or
   current_state->'members' is distinct from p_state->'members' or
   current_state->'business' is distinct from p_state->'business' or
   current_state->'catalog' is distinct from p_state->'catalog' or
   current_state->'knowledge' is distinct from p_state->'knowledge' or
   current_state->'rules' is distinct from p_state->'rules' or
   current_state->'channels' is distinct from p_state->'channels' or
   current_state->'billing'->'subscription' is distinct from p_state->'billing'->'subscription' or
   current_state->'billing'->'checkouts' is distinct from p_state->'billing'->'checkouts'
 ) then raise exception 'Agent cannot change protected settings'; end if;
 if current_state->'members' is distinct from p_state->'members' then
   if not p_service and member_role<>'owner' then raise exception 'Owner required'; end if;
   if (select count(*) from jsonb_array_elements(p_state->'members') m where m->>'role'='owner')<>1
      or (select m->>'userId' from jsonb_array_elements(current_state->'members') m where m->>'role'='owner')
         is distinct from (select m->>'userId' from jsonb_array_elements(p_state->'members') m where m->>'role'='owner') then
     raise exception 'Owner transfer is not supported';
   end if;
   for item in select value from jsonb_array_elements(p_state->'members') loop
     if item->>'role' not in ('owner','admin','agent') then raise exception 'Invalid role'; end if;
     if not exists(select 1 from auth.users where id=(item->>'userId')::uuid and email_confirmed_at is not null) then raise exception 'Confirmed account required'; end if;
     insert into public.memberships(business_id,user_id,role) values(p_business,(item->>'userId')::uuid,item->>'role')
       on conflict(business_id,user_id) do update set role=excluded.role;
   end loop;
   delete from public.memberships m where m.business_id=p_business
     and not exists(select 1 from jsonb_array_elements(p_state->'members') v where v->>'userId'=m.user_id::text);
 end if;
 update public.business_states set state=p_state,revision=p_revision+1,updated_at=now() where business_id=p_business;
 update public.businesses set name=p_state->'business'->>'name',deleted_at=(p_state->'business'->>'deletedAt')::timestamptz where id=p_business;
 perform private.project_content(p_business,p_state);
 return true;
end $$;

create function public.resolve_enrolled_member(p_email text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('userId',id::text,'email',email,'name',coalesce(nullif(raw_user_meta_data->>'name',''),split_part(email,'@',1)))
 from auth.users where lower(email)=lower(p_email) and email_confirmed_at is not null limit 1;
$$;
revoke all on function public.resolve_enrolled_member(text) from public,anon,authenticated;
grant execute on function public.resolve_enrolled_member(text) to service_role;

-- Browser writes use narrowly scoped signed capabilities from the authenticated
-- quota-reserving server endpoint. General storage writes would bypass quotas.
drop policy if exists business_files_insert on storage.objects;
drop policy if exists business_files_update on storage.objects;
drop policy if exists business_files_delete on storage.objects;
-- Reads go through the server so unverified and logically deleted objects cannot
-- be downloaded directly with an ordinary Auth JWT.
drop policy if exists business_files_read on storage.objects;
update storage.buckets set public=false,file_size_limit=20971520,
 allowed_mime_types=array['text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/json','text/plain','text/markdown','application/pdf','image/png','image/jpeg','image/webp']
 where id='business-files';
