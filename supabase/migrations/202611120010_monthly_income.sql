-- Monthly expectations never create money. Actual receipts remain audited entries.
create table public.income_months(owner_id uuid not null references public.profiles,month text not null check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),expected bigint not null check(expected between 0 and 100000000000),version integer not null default 1,primary key(owner_id,month));
create table public.income_references(owner_id uuid not null references public.profiles,effective_month text not null check(effective_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),base bigint not null check(base between 0 and 100000000000),version integer not null default 1,primary key(owner_id,effective_month));
alter table public.income_months enable row level security;
alter table public.income_references enable row level security;
create policy income_months_read on public.income_months for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
create policy income_references_read on public.income_references for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
revoke all on public.income_months,public.income_references from public,anon,authenticated;
grant select on public.income_months,public.income_references to authenticated;
alter table public.entries add column salary_month text check(salary_month ~ '^\d{4}-(0[1-9]|1[0-2])$');
update public.entries set salary_month=to_char(occurred_on,'YYYY-MM') where kind='income';
alter function public.execute_command(jsonb) rename to execute_before_monthly;
revoke all on function public.execute_before_monthly(jsonb) from public,anon,authenticated;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();p jsonb:=command->'payload';action text:=command->>'type';req uuid:=(command->>'key')::uuid;sig jsonb;m text;old public.income_months;ref public.income_references;receipt public.entries;acct public.accounts;before_value jsonb;after_value jsonb;
begin
 if actor is null or private.family() is null then raise exception 'Unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict';end if;return;end if;
 if action='entry' then
   if p->>'kind' in ('income','loan_received') and exists(select 1 from jsonb_array_elements(p->'splits') s left join public.accounts a on a.id=(s->>'account_id')::uuid where a.kind not in ('bank','cash')) then raise exception 'Cash income requires bank or cash account';end if;
   if p->>'kind'='income' then
     m:=coalesce(p->>'salary_month',left(p->>'occurred_on',7));
     if m !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid salary month';end if;
   end if;
   perform public.execute_before_monthly(command);
   if p->>'kind'='income' then
     update public.entries set salary_month=m where id=(p->>'id')::uuid and owner_id=actor returning to_jsonb(entries.*) into after_value;
     insert into public.audit_logs(actor_id,request_key,action,record_id,after_data) values(actor,req,'income_month_link',p->>'id',after_value);
   end if;
   return;
 elsif action='income_month' then
   m:=p->>'month';
   if m is null or m !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid salary month';end if;
   select * into old from public.income_months where owner_id=actor and month=m for update;
   if coalesce(old.version,0)<>coalesce((p->>'version')::integer,-1) then raise exception 'Monthly income conflict';end if;
   before_value:=case when old.owner_id is not null then to_jsonb(old) end;
   insert into public.income_months(owner_id,month,expected) values(actor,m,(p->>'expected')::bigint) on conflict(owner_id,month) do update set expected=excluded.expected,version=income_months.version+1 returning to_jsonb(income_months.*) into after_value;
   if coalesce((p->>'future')::boolean,false) then
     -- Capture the previous baseline before introducing a dated future reference.
     insert into public.income_references(owner_id,effective_month,base) select actor,'0001-01',coalesce((select base from public.income_settings where owner_id=actor),0) where not exists(select 1 from public.income_references where owner_id=actor);
     select * into ref from public.income_references where owner_id=actor and effective_month=m for update;
     if coalesce(ref.version,0)<>coalesce((p->>'reference_version')::integer,-1) then raise exception 'Income reference conflict';end if;
     insert into public.income_references(owner_id,effective_month,base) values(actor,m,(p->>'expected')::bigint) on conflict(owner_id,effective_month) do update set base=excluded.base,version=income_references.version+1;
   end if;
 elsif action='income_edit' then
   select * into receipt from public.entries where id=(p->>'id')::uuid and owner_id=actor and kind='income' and not voided for update;
   if not found or receipt.version<>(p->>'version')::integer or jsonb_array_length(receipt.splits)<>1 then raise exception 'Receipt conflict';end if;
   if (p->>'occurred_on')::date>private.business_today() then raise exception 'Future effective date';end if;
   select * into acct from public.accounts where id=(p->>'account_id')::uuid and owner_id=actor and kind in ('bank','cash') for update;
   if not found then raise exception 'Invalid income account';end if;
   before_value:=to_jsonb(receipt);
   update public.entries set amount=(p->>'amount')::bigint,occurred_on=(p->>'occurred_on')::date,salary_month=coalesce(nullif(p->>'salary_month',''),receipt.salary_month,left(p->>'occurred_on',7)),splits=jsonb_build_array(jsonb_build_object('account_id',acct.id,'amount',(p->>'amount')::bigint)),version=version+1 where id=receipt.id returning to_jsonb(entries.*) into after_value;
 else perform public.execute_before_monthly(command);return;
 end if;
 insert into private.commands values(actor,req,command);
 insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,action,coalesce(p->>'id',m),before_value,after_value);
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;
create or replace function public.load_finances() returns jsonb language sql stable security invoker set search_path='' as $$select public.load_core()||jsonb_build_object('categories',coalesce((select jsonb_agg(to_jsonb(c.*)) from public.categories c),'[]'::jsonb),'income_months',coalesce((select jsonb_agg(to_jsonb(m.*)) from public.income_months m),'[]'::jsonb),'income_references',coalesce((select jsonb_agg(to_jsonb(r.*)) from public.income_references r),'[]'::jsonb))$$;
