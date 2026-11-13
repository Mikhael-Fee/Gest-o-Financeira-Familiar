create table public.categories(id uuid primary key,owner_id uuid not null references public.profiles,name text not null check(length(trim(name)) between 1 and 60),parent_id uuid references public.categories,active boolean not null default true,version integer not null default 1,unique(owner_id,name),check(id<>parent_id));
alter table public.categories enable row level security;
create policy categories_read on public.categories for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
revoke all on public.categories from public,anon,authenticated;
grant select on public.categories to authenticated;
alter table public.entries add column tags text[] not null default '{}' check(cardinality(tags)<=20);
alter table public.entries add column beneficiary_id uuid references public.profiles;
alter function public.execute_command(jsonb) rename to execute_financial;
revoke all on function public.execute_financial(jsonb) from public,anon,authenticated;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();p jsonb:=command->'payload';req uuid:=(command->>'key')::uuid;sig jsonb;old public.categories;after_value jsonb;
begin
 if actor is null or private.family() is null then raise exception 'Unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict';end if;return;end if;
 if command->>'type'<>'category' then perform public.execute_financial(command);return;end if;
 if nullif(p->>'parent_id','') is not null and not exists(select 1 from public.categories where id=(p->>'parent_id')::uuid and owner_id=actor and parent_id is null and active) then raise exception 'Invalid parent category';end if;
 select * into old from public.categories where id=(p->>'id')::uuid for update;
 if found then
   if old.owner_id<>actor or old.version<>(p->>'version')::integer then raise exception 'Category conflict';end if;
   update public.categories set name=p->>'name',active=(p->>'active')::boolean,parent_id=nullif(p->>'parent_id','')::uuid,version=version+1 where id=old.id returning to_jsonb(categories.*) into after_value;
 else
   insert into public.categories(id,owner_id,name,parent_id,active) values((p->>'id')::uuid,actor,p->>'name',nullif(p->>'parent_id','')::uuid,(p->>'active')::boolean) returning to_jsonb(categories.*) into after_value;
 end if;
 insert into private.commands values(actor,req,command);
 insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,'category',p->>'id',case when old.id is not null then to_jsonb(old) end,after_value);
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;
alter function public.load_finances() rename to load_core;
create function public.load_finances() returns jsonb language sql stable security invoker set search_path='' as $$ select public.load_core()||jsonb_build_object('categories',coalesce((select jsonb_agg(to_jsonb(c.*)) from public.categories c),'[]'::jsonb)) $$;
revoke all on function public.load_finances() from public,anon;
grant execute on function public.load_finances() to authenticated;
