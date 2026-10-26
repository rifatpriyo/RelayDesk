-- RelayDesk initial schema. Apply manually to a new/staged Supabase project.
-- No resets, no production seed users, and no public access to private state.
create extension if not exists pgcrypto;
create schema if not exists private;

create table public.businesses (
  id uuid primary key default gen_random_uuid(), name text not null,
  created_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.memberships (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','admin','agent')),
  created_at timestamptz not null default now(), primary key(business_id,user_id)
);
create function private.member_role(p_business uuid,p_user uuid) returns text
language sql stable security definer set search_path='' as $$
 select role from public.memberships where business_id=p_business and user_id=p_user;
$$;
revoke all on function private.member_role(uuid,uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.member_role(uuid,uuid) to authenticated;
alter table public.businesses enable row level security;
alter table public.memberships enable row level security;
create policy member_business_read on public.businesses for select to authenticated using(private.member_role(id,(select auth.uid())) is not null);
create policy member_membership_read on public.memberships for select to authenticated using(private.member_role(business_id,(select auth.uid())) is not null);
-- Membership writes happen only in audited server commands. No self-promotion policy.

-- A versioned aggregate deliberately consolidates domain records for an atomic
-- catalog/rules/conversations/billing transaction. Private provider metadata is
-- encrypted inside its integrations namespace and never returned by public APIs.
create table public.business_states (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  revision bigint not null default 0,
  state jsonb not null check(jsonb_typeof(state)='object'),
  updated_at timestamptz not null default now(),
  check(state->'business'->>'id'=business_id::text)
);
alter table public.business_states enable row level security;
revoke all on public.business_states from anon,authenticated;

create table public.channel_assets (
  channel text not null check(channel in ('messenger','instagram','whatsapp','website')),
  asset_id text not null, business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(channel,asset_id), unique(business_id,channel,asset_id)
);
alter table public.channel_assets enable row level security;
revoke all on public.channel_assets from anon,authenticated;

-- Approved public knowledge projection supports language-neutral lexical search.
-- Bangla/Banglish tokens are preserved by the simple dictionary (no English stemmer).
create table public.public_content (
  business_id uuid not null references public.businesses(id) on delete cascade,
  record_id text not null, kind text not null check(kind in ('catalog','knowledge')),
  title text not null, body text not null, source text not null, version integer not null,
  updated_at timestamptz not null, facts jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as(to_tsvector('simple',title||' '||body)) stored,
  primary key(business_id,record_id)
);
create index public_content_fts on public.public_content using gin(search_vector);
alter table public.public_content enable row level security;
create policy content_tenant_read on public.public_content for select to authenticated using(private.member_role(business_id,(select auth.uid())) is not null);

create function private.project_content(p_business uuid,p_state jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from public.public_content where business_id=p_business;
 insert into public.public_content(business_id,record_id,kind,title,body,source,version,updated_at,facts)
 select p_business,r->>'id','catalog',r->>'name',coalesce(r->>'description','')||' '||coalesce(r->>'sku',''),coalesce(r->>'sourceId','manual'),1,(r->>'updatedAt')::timestamptz,r
 from jsonb_array_elements(coalesce(p_state->'catalog','[]'::jsonb)) r where coalesce((r->>'archived')::boolean,false)=false;
 insert into public.public_content(business_id,record_id,kind,title,body,source,version,updated_at,facts)
 select p_business,r->>'id','knowledge',r->>'title',r->>'content',r->>'source',(r->>'version')::integer,(r->>'updatedAt')::timestamptz,r
 from jsonb_array_elements(coalesce(p_state->'knowledge','[]'::jsonb)) r where r->>'status'='published';
end $$;
revoke all on function private.project_content(uuid,jsonb) from public;

create function public.bootstrap_business(p_user uuid,p_business uuid,p_state jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select business_id into existing from public.memberships where user_id=p_user limit 1;
 if existing is not null then return existing; end if;
 if p_state->'business'->>'id'<>p_business::text then raise exception 'Tenant mismatch'; end if;
 insert into public.businesses(id,name) values(p_business,p_state->'business'->>'name');
 insert into public.memberships(business_id,user_id,role) values(p_business,p_user,'owner');
 insert into public.business_states(business_id,state) values(p_business,p_state);
 perform private.project_content(p_business,p_state);
 return p_business;
end $$;

create function public.read_business_state(p_business uuid,p_user text,p_service boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not p_service and private.member_role(p_business,p_user::uuid) is null then raise exception 'Access denied'; end if;
 return (select state from public.business_states where business_id=p_business);
end $$;

create function public.commit_business_state(p_business uuid,p_user text,p_service boolean,p_revision bigint,p_state jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare current_state jsonb; current_revision bigint; member_role text; collection text; item jsonb;
begin
 if not p_service then
   member_role:=private.member_role(p_business,p_user::uuid);
   if member_role is null then raise exception 'Access denied'; end if;
 end if;
 select state,revision into current_state,current_revision from public.business_states where business_id=p_business for update;
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
   for item in select value from jsonb_array_elements(p_state->'members') loop
     if item->>'role' not in ('owner','admin','agent') then raise exception 'Invalid role'; end if;
     update public.memberships set role=item->>'role' where business_id=p_business and user_id=(item->>'userId')::uuid;
   end loop;
 end if;
 update public.business_states set state=p_state,revision=p_revision+1,updated_at=now() where business_id=p_business;
 update public.businesses set name=p_state->'business'->>'name',deleted_at=(p_state->'business'->>'deletedAt')::timestamptz where id=p_business;
 perform private.project_content(p_business,p_state);
 return true;
end $$;

create function public.search_public_content(p_business uuid,p_query text,p_limit integer default 12)
returns setof public.public_content language sql stable security invoker set search_path='' as $$
 select * from public.public_content
 where business_id=p_business and (search_vector @@ websearch_to_tsquery('simple',left(p_query,500)) or lower(title)=lower(left(p_query,500)))
 order by ts_rank(search_vector,websearch_to_tsquery('simple',left(p_query,500))) desc
 limit least(greatest(p_limit,1),30);
$$;

-- Server-owned cost records are separate from editable simulated plan allowances.
create table public.operator_spend (
 id text primary key,business_id uuid not null references public.businesses(id),day date not null,
 reserved_micros bigint not null check(reserved_micros>=0),actual_micros bigint check(actual_micros>=0),created_at timestamptz not null default now()
);
alter table public.operator_spend enable row level security;
revoke all on public.operator_spend from anon,authenticated;
create function public.reserve_global_spend(p_id text,p_business uuid,p_day date,p_amount bigint,p_limit bigint) returns void
language plpgsql security definer set search_path='' as $$
declare used bigint; existing public.operator_spend;
begin
 if p_amount<0 or p_limit<0 then raise exception 'Invalid cost limit'; end if;
 perform pg_advisory_xact_lock(hashtextextended('operator-spend-'||p_day::text,0));
 select * into existing from public.operator_spend where id=p_id;
 if found then if existing.business_id<>p_business then raise exception 'Tenant mismatch'; end if; return; end if;
 select coalesce(sum(coalesce(actual_micros,reserved_micros)),0) into used from public.operator_spend where day=p_day;
 if used+p_amount>p_limit then raise exception 'Operator cost limit exceeded'; end if;
 insert into public.operator_spend(id,business_id,day,reserved_micros) values(p_id,p_business,p_day,p_amount);
end $$;
create function public.settle_global_spend(p_id text,p_actual bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_actual<0 then raise exception 'Invalid cost'; end if;
 update public.operator_spend set actual_micros=p_actual where id=p_id and actual_micros is null;
end $$;

-- Only the trusted Next.js server can call privileged RPCs, including p_service.
revoke all on function public.bootstrap_business(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.read_business_state(uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.commit_business_state(uuid,text,boolean,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.reserve_global_spend(text,uuid,date,bigint,bigint) from public,anon,authenticated;
revoke all on function public.settle_global_spend(text,bigint) from public,anon,authenticated;
grant execute on function public.bootstrap_business(uuid,uuid,jsonb) to service_role;
grant execute on function public.read_business_state(uuid,text,boolean) to service_role;
grant execute on function public.commit_business_state(uuid,text,boolean,bigint,jsonb) to service_role;
grant execute on function public.reserve_global_spend(text,uuid,date,bigint,bigint) to service_role;
grant execute on function public.settle_global_spend(text,bigint) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('business-files','business-files',false,10485760,array['text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/json','text/plain','image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
create policy business_files_read on storage.objects for select to authenticated using(bucket_id='business-files' and private.member_role(((storage.foldername(name))[1])::uuid,(select auth.uid())) is not null);
create policy business_files_insert on storage.objects for insert to authenticated with check(bucket_id='business-files' and private.member_role(((storage.foldername(name))[1])::uuid,(select auth.uid())) in ('owner','admin'));
create policy business_files_update on storage.objects for update to authenticated using(bucket_id='business-files' and private.member_role(((storage.foldername(name))[1])::uuid,(select auth.uid())) in ('owner','admin')) with check(bucket_id='business-files' and private.member_role(((storage.foldername(name))[1])::uuid,(select auth.uid())) in ('owner','admin'));
create policy business_files_delete on storage.objects for delete to authenticated using(bucket_id='business-files' and private.member_role(((storage.foldername(name))[1])::uuid,(select auth.uid())) in ('owner','admin'));
