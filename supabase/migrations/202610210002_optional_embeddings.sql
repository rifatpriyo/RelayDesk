-- Optional capability only. No provider, vector values, or retrieval claims are
-- fabricated. Set dimensions to the real provider's output before enabling.
create extension if not exists vector with schema extensions;
create table public.content_embeddings (
 business_id uuid not null,
 record_id text not null,
 provider text not null, model text not null, source_version integer not null,
 embedding extensions.vector not null,
 primary key(business_id,record_id,provider,model),
 foreign key(business_id,record_id) references public.public_content(business_id,record_id) on delete cascade
);
alter table public.content_embeddings enable row level security;
create policy embeddings_tenant_read on public.content_embeddings for select to authenticated using(private.member_role(business_id,(select auth.uid())) is not null);
revoke insert,update,delete on public.content_embeddings from anon,authenticated;
