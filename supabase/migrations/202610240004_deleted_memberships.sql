-- Deleted businesses disappear from ordinary RLS reads and account selection.
-- Their server-only audit and cost tombstone remains for operator accounting.
create or replace function private.member_role(p_business uuid,p_user uuid) returns text
language sql stable security definer set search_path='' as $$
 select m.role from public.memberships m join public.businesses b on b.id=m.business_id
 where m.business_id=p_business and m.user_id=p_user and b.deleted_at is null;
$$;

create or replace function public.bootstrap_business(p_user uuid,p_business uuid,p_state jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select m.business_id into existing from public.memberships m join public.businesses b on b.id=m.business_id
   where m.user_id=p_user and b.deleted_at is null order by m.created_at limit 1;
 if existing is not null then return existing; end if;
 if p_state->'business'->>'id'<>p_business::text then raise exception 'Tenant mismatch'; end if;
 insert into public.businesses(id,name) values(p_business,p_state->'business'->>'name');
 insert into public.memberships(business_id,user_id,role) values(p_business,p_user,'owner');
 insert into public.business_states(business_id,state) values(p_business,p_state);
 perform private.project_content(p_business,p_state);
 return p_business;
end $$;
