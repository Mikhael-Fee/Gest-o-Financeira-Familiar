-- Imported bank statements are confirmed only after user review. The source identity
-- stays immutable when display metadata is corrected, preventing reimport duplicates.
create table public.import_records(
 id uuid primary key, owner_id uuid not null references public.profiles,
 account_id uuid not null references public.accounts, source_key text not null check(length(source_key) between 1 and 500),
 occurred_on date not null, description text not null check(length(description) between 1 and 120),
 amount bigint not null check(amount<>0 and abs(amount)<=100000000000),
 classification text not null check(classification in ('expense','income','transfer','payment','match')),
 entry_id uuid references public.entries, movement_id uuid references public.account_movements,
 payment_id uuid references public.payments, version integer not null default 1,
 created_at timestamptz not null default now(), unique(owner_id,account_id,source_key)
);
create table public.tags_catalog(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles,
 name text not null check(length(trim(name)) between 1 and 40), active boolean not null default true,
 version integer not null default 1, unique(owner_id,name)
);
insert into public.tags_catalog(owner_id,name) select distinct e.owner_id,tag from public.entries e cross join unnest(e.tags) tag where length(trim(tag)) between 1 and 40 on conflict do nothing;
alter table public.import_records enable row level security;
alter table public.tags_catalog enable row level security;
create policy import_records_read on public.import_records for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
create policy tags_catalog_read on public.tags_catalog for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
revoke all on public.import_records,public.tags_catalog from public,anon,authenticated;
grant select on public.import_records,public.tags_catalog to authenticated;
alter function public.execute_command(jsonb) rename to execute_before_imports;
revoke all on function public.execute_before_imports(jsonb) from public,anon,authenticated;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); fam uuid:=private.family(); p jsonb:=command->'payload'; req uuid:=(command->>'key')::uuid; action text:=command->>'type'; sig jsonb;
 acct public.accounts; prior public.import_records; row jsonb; source text; row_id uuid; row_amount bigint; row_date date; row_description text; row_kind text;
 entry_ref uuid; movement_ref uuid; payment_ref uuid; source_row jsonb; source_date date; source_amount bigint; source_description text; existing public.entries; before_value jsonb; after_value jsonb; oldtag public.tags_catalog; entryrow public.entries;
begin
 if actor is null or fam is null then raise exception 'Unauthorized';end if;
 if action='entry' then
   perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
   if exists(select 1 from private.commands where actor_id=actor and key=req) then perform public.execute_before_imports(command);return;end if;
   if exists(select 1 from jsonb_array_elements_text(coalesce(p->'tags','[]'::jsonb)) tag join public.tags_catalog t on t.owner_id=actor and t.name=tag where not t.active) then raise exception 'Inactive tag';end if;
   perform public.execute_before_imports(command);
   insert into public.tags_catalog(owner_id,name) select distinct actor,trim(tag) from jsonb_array_elements_text(coalesce(p->'tags','[]'::jsonb)) tag where length(trim(tag)) between 1 and 40 on conflict(owner_id,name) do nothing;
   return;
 end if;
 if action not in ('import_statement','import_correct','tag') then perform public.execute_before_imports(command);return;end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict';end if;return;end if;
 if action='tag' then
   if p->>'name' is null or length(trim(p->>'name')) not between 1 and 40 or p->>'active' is null then raise exception 'Invalid tag';end if;
   select * into oldtag from public.tags_catalog where id=(p->>'id')::uuid for update;
   if found then
     if oldtag.owner_id<>actor or oldtag.version is distinct from (p->>'version')::integer then raise exception 'Tag conflict';end if;
     before_value:=to_jsonb(oldtag);
   elsif coalesce((p->>'version')::integer,-1)<>0 then raise exception 'Tag conflict';end if;
   if exists(select 1 from public.tags_catalog where owner_id=actor and lower(trim(name))=lower(trim(p->>'name')) and id<>(p->>'id')::uuid) then raise exception 'Tag exists';end if;
   if oldtag.id is not null and oldtag.name<>trim(p->>'name') then
     for entryrow in select * from public.entries where owner_id=actor and oldtag.name=any(tags) for update loop
       update public.entries set tags=array(select distinct case when t=oldtag.name then trim(p->>'name') else t end from unnest(entryrow.tags) t),version=version+1 where id=entryrow.id returning to_jsonb(entries.*) into after_value;
       insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,'tag_entry_rename',entryrow.id::text,to_jsonb(entryrow),after_value);
     end loop;
   end if;
   insert into public.tags_catalog(id,owner_id,name,active) values((p->>'id')::uuid,actor,trim(p->>'name'),(p->>'active')::boolean) on conflict(id) do update set name=excluded.name,active=excluded.active,version=tags_catalog.version+1 returning to_jsonb(tags_catalog.*) into after_value;
 elsif action='import_correct' then
   select * into prior from public.import_records where id=(p->>'id')::uuid and owner_id=actor for update;
   if not found or prior.version is distinct from (p->>'version')::integer or prior.entry_id is null or length(trim(coalesce(p->>'reason','')))<5 then raise exception 'Import correction conflict';end if;
   select * into existing from public.entries where id=prior.entry_id and owner_id=actor and not voided for update;
   if not found or existing.version is distinct from (p->>'entry_version')::integer or length(trim(coalesce(p->>'description',''))) not between 1 and 120 or length(trim(coalesce(p->>'category',''))) not between 1 and 60 then raise exception 'Entry correction conflict';end if;
   before_value:=to_jsonb(existing);
   update public.entries set description=trim(p->>'description'),category=trim(p->>'category'),version=version+1 where id=existing.id returning to_jsonb(entries.*) into after_value;
   update public.import_records set version=version+1 where id=prior.id;
 else
   select * into acct from public.accounts where id=(p->>'account_id')::uuid and owner_id=actor and kind in ('bank','cash') for update;
   if not found then raise exception 'Unauthorized bank account';end if;
   if jsonb_typeof(p->'rows') is distinct from 'array' or jsonb_array_length(p->'rows') not between 1 and 2000 then raise exception 'Invalid statement';end if;
   for row in select * from jsonb_array_elements(p->'rows') loop
     row_id:=(row->>'id')::uuid;row_amount:=(row->>'amount')::bigint;row_date:=(row->>'date')::date;row_description:=trim(row->>'description');row_kind:=row->>'classification';
     if row_amount is null or row_amount=0 or abs(row_amount)>100000000000 or row_date is null or row_date<acct.cutoff or row_date>private.business_today() or row_description is null or length(row_description) not between 1 and 120 or length(coalesce(row->>'externalId',''))>200 or coalesce((row->>'occurrence')::integer,0) not between 1 and 2000 or row_kind is null then raise exception 'Invalid statement row';end if;
     if row_kind='ignore' then continue;end if;
     source_row:=coalesce(row->'source',row);source_date:=(source_row->>'date')::date;source_amount:=(source_row->>'amount')::bigint;source_description:=trim(source_row->>'description');
     if source_date is null or source_amount is null or source_amount=0 or abs(source_amount)>100000000000 or source_description is null or length(source_description) not between 1 and 120 or length(coalesce(source_row->>'externalId',''))>200 or coalesce((source_row->>'occurrence')::integer,0) not between 1 and 2000 then raise exception 'Invalid statement source';end if;
     source:=case when trim(coalesce(source_row->>'externalId',''))<>'' then 'id:'||trim(source_row->>'externalId') else 'row:'||source_date::text||'|'||source_amount::text||'|'||lower(regexp_replace(source_description,'\s+',' ','g'))||'|'||(source_row->>'occurrence') end;
     select * into prior from public.import_records where owner_id=actor and account_id=acct.id and source_key=source;
     if found then if prior.amount<>source_amount or prior.occurred_on<>source_date then raise exception 'Source identity conflict';end if;continue;end if;
     entry_ref:=null;movement_ref:=null;payment_ref:=null;
     if row_kind in ('expense','income') then
       if (row_kind='expense')<>(row_amount<0) then raise exception 'Statement sign mismatch';end if;
       if exists(select 1 from public.entries e where e.owner_id=actor and not e.voided and e.occurred_on=row_date and e.amount=abs(row_amount) and ((row_amount<0 and e.kind='expense') or (row_amount>0 and e.kind not in ('expense','transfer'))) and exists(select 1 from jsonb_array_elements(e.splits) s where s->>'account_id'=acct.id::text and (s->>'amount')::bigint=abs(row_amount))) and not exists(select 1 from public.import_records r where r.owner_id=actor and r.account_id=acct.id and r.occurred_on=row_date and r.amount=row_amount and lower(regexp_replace(trim(r.description),'\s+',' ','g'))=lower(regexp_replace(row_description,'\s+',' ','g'))) then raise exception 'Possible duplicate: match existing entry';end if;
       if length(trim(coalesce(row->>'category','')))=0 or length(row->>'category')>60 then raise exception 'Invalid category';end if;
       perform public.execute_before_imports(jsonb_build_object('key',row_id,'type','entry','payload',jsonb_build_object('id',row_id,'description',row_description,'kind',row_kind,'amount',abs(row_amount),'occurred_on',row_date,'category',row->>'category','house',false,'consumer_id',actor,'responsible_id',null,'card_id',null,'splits',jsonb_build_array(jsonb_build_object('account_id',acct.id,'amount',abs(row_amount))),'income_type',coalesce(row->>'income_type','extra'),'salary_month',to_char(row_date,'YYYY-MM'))));
       entry_ref:=row_id;
     elsif row_kind='transfer' then
       insert into public.account_movements(id,owner_id,account_id,amount,occurred_on,kind,reference_id,reason) values(row_id,actor,acct.id,row_amount,row_date,'transfer',row_id::text,row_description);
       movement_ref:=row_id;
     elsif row_kind='payment' then
       if row_amount>=0 then raise exception 'Payment must be debit';end if;
       perform public.execute_before_imports(jsonb_build_object('key',row_id,'type','pay','payload',jsonb_build_object('obligation_id',row->>'obligation_id','account_id',acct.id,'amount',-row_amount,'paid_on',row_date,'version',(row->>'version')::integer)));
       payment_ref:=row_id;
     elsif row_kind='match' then
       select * into existing from public.entries e where e.id=(row->>'match_id')::uuid and e.owner_id=actor and not e.voided and e.occurred_on=row_date and e.amount=abs(row_amount) and ((row_amount<0 and e.kind='expense') or (row_amount>0 and e.kind not in ('expense','transfer'))) and exists(select 1 from jsonb_array_elements(e.splits) s where s->>'account_id'=acct.id::text and (s->>'amount')::bigint=abs(row_amount));
       if not found then raise exception 'Existing entry mismatch';end if;entry_ref:=existing.id;
     else raise exception 'Invalid statement classification';end if;
     insert into public.import_records(id,owner_id,account_id,source_key,occurred_on,description,amount,classification,entry_id,movement_id,payment_id) values(row_id,actor,acct.id,source,source_date,source_description,source_amount,row_kind,entry_ref,movement_ref,payment_ref) returning to_jsonb(import_records.*) into after_value;
     insert into public.audit_logs(actor_id,request_key,action,record_id,after_data) values(actor,req,'import_row',row_id::text,after_value);
   end loop;
 end if;
 insert into private.commands values(actor,req,command);
 insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,action,coalesce(p->>'id',p->>'account_id'),before_value,after_value);
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;
alter function public.load_finances() rename to load_before_imports;
revoke all on function public.load_before_imports() from public,anon;
grant execute on function public.load_before_imports() to authenticated;
create function public.load_finances() returns jsonb language sql stable security invoker set search_path='' as $$select public.load_before_imports()||jsonb_build_object('import_records',coalesce((select jsonb_agg(to_jsonb(t.*)) from public.import_records t),'[]'::jsonb),'tags_catalog',coalesce((select jsonb_agg(to_jsonb(t.*)) from public.tags_catalog t),'[]'::jsonb))$$;
revoke all on function public.load_finances() from public,anon;
grant execute on function public.load_finances() to authenticated;
