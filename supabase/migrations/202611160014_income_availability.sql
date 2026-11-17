-- Forecasts and earmarks are planning records; only explicit receipt confirmation moves money.
alter table public.income_months add column expected_on date;
alter table public.income_months add column scenario text not null default 'manual' check(scenario in ('conservative','history','manual'));
create table public.future_receipts(
 id uuid primary key,owner_id uuid not null references public.profiles,description text not null check(length(trim(description)) between 1 and 200),
 amount bigint not null check(amount between 1 and 100000000000),expected_on date not null,month text not null check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 kind text not null check(kind in ('salary','extra','benefit')),certainty text not null check(certainty in ('expected','committed')),
 status text not null default 'planned' check(status in ('planned','received','cancelled')),account_id uuid references public.accounts,entry_id uuid references public.entries,
 version integer not null default 1,created_at timestamptz not null default now()
);
create table public.account_checks(account_id uuid primary key references public.accounts,owner_id uuid not null references public.profiles,checked_on date not null,confirmed_balance bigint not null check(confirmed_balance between -100000000000 and 100000000000),version integer not null default 1);
create table public.obligation_reservations(obligation_id text primary key references public.obligations,account_id uuid not null references public.accounts,owner_id uuid not null references public.profiles,amount bigint not null check(amount between 0 and 100000000000),version integer not null default 1);
alter table public.future_receipts enable row level security;
alter table public.account_checks enable row level security;
alter table public.obligation_reservations enable row level security;
create policy future_receipts_read on public.future_receipts for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
create policy account_checks_read on public.account_checks for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
create policy obligation_reservations_read on public.obligation_reservations for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
revoke all on public.future_receipts,public.account_checks,public.obligation_reservations from public,anon,authenticated;
grant select on public.future_receipts,public.account_checks,public.obligation_reservations to authenticated;
alter function public.execute_command(jsonb) rename to execute_before_availability;
revoke all on function public.execute_before_availability(jsonb) from public,anon,authenticated;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();fam uuid:=private.family();action text:=command->>'type';p jsonb:=command->'payload';req uuid:=(command->>'key')::uuid;sig jsonb;
 f public.future_receipts;a public.accounts;ob public.obligations;ch public.account_checks;r public.obligation_reservations;
 before_data jsonb;after_data jsonb;receipt_on date;child jsonb;delegated boolean:=false;balance_value bigint;
begin
 if actor is null or fam is null then raise exception 'Unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict';end if;return;end if;
 if action='income_month' then
   if p ? 'scenario' and p->>'scenario' not in ('conservative','history','manual') then raise exception 'Invalid scenario';end if;
   perform public.execute_before_availability(command);delegated:=true;
   update public.income_months set expected_on=coalesce(nullif(p->>'expected_on','')::date,expected_on),scenario=coalesce(p->>'scenario',scenario) where owner_id=actor and month=p->>'month' returning to_jsonb(income_months.*) into after_data;
 elsif action='future_receipt' then
   select * into f from public.future_receipts where id=(p->>'id')::uuid for update;
   if f.id is not null and (f.owner_id<>actor or f.status<>'planned') then raise exception 'Receipt not editable';end if;
   if coalesce(f.version,0) is distinct from (p->>'version')::integer then raise exception 'Receipt conflict';end if;
   if nullif(p->>'account_id','') is not null then
     select * into a from public.accounts where id=(p->>'account_id')::uuid and owner_id=actor for update;
     if not found or (p->>'kind'='benefit' and a.kind not in ('VA','VR')) or (p->>'kind'<>'benefit' and a.kind not in ('bank','cash')) then raise exception 'Invalid receipt account';end if;
   end if;
   before_data:=case when f.id is not null then to_jsonb(f) end;
   insert into public.future_receipts(id,owner_id,description,amount,expected_on,month,kind,certainty,account_id)
   values((p->>'id')::uuid,actor,p->>'description',(p->>'amount')::bigint,(p->>'expected_on')::date,p->>'month',p->>'kind',p->>'certainty',nullif(p->>'account_id','')::uuid)
   on conflict(id) do update set description=excluded.description,amount=excluded.amount,expected_on=excluded.expected_on,month=excluded.month,kind=excluded.kind,certainty=excluded.certainty,account_id=excluded.account_id,version=future_receipts.version+1 returning to_jsonb(future_receipts.*) into after_data;
 elsif action in ('confirm_future_receipt','cancel_future_receipt') then
   select * into f from public.future_receipts where id=(p->>'id')::uuid and owner_id=actor for update;
   if not found or f.status<>'planned' or f.version is distinct from (p->>'version')::integer then raise exception 'Receipt conflict';end if;
   before_data:=to_jsonb(f);
   if action='confirm_future_receipt' then
     receipt_on:=(p->>'date')::date;
     if receipt_on is null or receipt_on>private.business_today() then raise exception 'Future effective date';end if;
     select * into a from public.accounts where id=(p->>'account_id')::uuid and owner_id=actor for update;
     if not found or (f.kind='benefit' and a.kind not in ('VA','VR')) or (f.kind<>'benefit' and a.kind not in ('bank','cash')) then raise exception 'Invalid receipt account';end if;
     child:=jsonb_build_object('key',req,'type','entry','payload',jsonb_build_object('id',req,'description',f.description,'kind',case when f.kind='benefit' then 'benefit' else 'income' end,'income_type',case when f.kind='salary' then 'salary' else 'extra' end,'salary_month',f.month,'amount',coalesce((p->>'amount')::bigint,f.amount),'occurred_on',receipt_on,'category',case when f.kind='benefit' then 'Alimentação' when f.kind='salary' then 'Salário' else 'Extras' end,'house',false,'consumer_id',actor,'responsible_id',null,'card_id',null,'splits',jsonb_build_array(jsonb_build_object('account_id',a.id,'amount',coalesce((p->>'amount')::bigint,f.amount)))));
     perform public.execute_before_availability(child);
     -- The outer command is the idempotency identity, never a second receipt.
     update private.commands set body=command where actor_id=actor and key=req;delegated:=true;
     update public.future_receipts set status='received',entry_id=req,account_id=a.id,version=version+1 where id=f.id returning to_jsonb(future_receipts.*) into after_data;
   else
     update public.future_receipts set status='cancelled',version=version+1 where id=f.id returning to_jsonb(future_receipts.*) into after_data;
   end if;
 elsif action='account_check' then
   select * into a from public.accounts where id=(p->>'account_id')::uuid and owner_id=actor for update;
   if not found then raise exception 'Invalid account';end if;
   receipt_on:=(p->>'date')::date;
   if receipt_on is null or receipt_on>private.business_today() or receipt_on<a.cutoff then raise exception 'Invalid check date';end if;
   select * into ch from public.account_checks where account_id=a.id for update;
   if coalesce(ch.version,0) is distinct from (p->>'version')::integer then raise exception 'Account check conflict';end if;
   -- Current confirmation is distinct from reconciliation: this command cannot manufacture a balance.
   if receipt_on<>private.business_today() then raise exception 'Check the current balance';end if;
   balance_value:=private.account_balance(a.id);
   if balance_value is distinct from (p->>'confirmed_balance')::bigint then raise exception 'Reconcile the recorded balance first';end if;
   before_data:=case when ch.account_id is not null then to_jsonb(ch) end;
   insert into public.account_checks(account_id,owner_id,checked_on,confirmed_balance) values(a.id,actor,receipt_on,balance_value)
   on conflict(account_id) do update set checked_on=excluded.checked_on,confirmed_balance=excluded.confirmed_balance,version=account_checks.version+1 returning to_jsonb(account_checks.*) into after_data;
 elsif action='reserve_obligation' then
   select * into ob from public.obligations where id=p->>'obligation_id' and owner_id=actor for update;
   if not found or ob.replaced_by is not null then raise exception 'Invalid obligation';end if;
   select * into a from public.accounts where id=(p->>'account_id')::uuid and owner_id=actor and kind in ('bank','cash') for update;
   if not found then raise exception 'Invalid reservation account';end if;
   select * into r from public.obligation_reservations where obligation_id=ob.id for update;
   if coalesce(r.version,0) is distinct from (p->>'version')::integer then raise exception 'Reservation conflict';end if;
   if (p->>'amount')::bigint>greatest(0,ob.amount-ob.confirmed-coalesce((select sum(amount) from public.payments where obligation_id=ob.id and reversed_on is null),0)) then raise exception 'Reservation exceeds obligation';end if;
   if (p->>'amount')::bigint>greatest(0,private.account_balance(a.id)) then raise exception 'Reservation exceeds recorded balance';end if;
   before_data:=case when r.obligation_id is not null then to_jsonb(r) end;
   insert into public.obligation_reservations(obligation_id,account_id,owner_id,amount) values(ob.id,a.id,actor,(p->>'amount')::bigint)
   on conflict(obligation_id) do update set account_id=excluded.account_id,amount=excluded.amount,version=obligation_reservations.version+1 returning to_jsonb(obligation_reservations.*) into after_data;
 else perform public.execute_before_availability(command);return;
 end if;
 if not delegated then insert into private.commands values(actor,req,command);end if;
 insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,action,coalesce(p->>'id',p->>'account_id',p->>'obligation_id',p->>'month'),before_data,after_data);
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;
alter function public.load_finances() rename to load_before_availability;
create function public.load_finances() returns jsonb language sql stable security invoker set search_path='' as $$
select public.load_before_availability() || jsonb_build_object('future_receipts',coalesce((select jsonb_agg(to_jsonb(r.*)) from public.future_receipts r),'[]'::jsonb),'account_checks',coalesce((select jsonb_agg(to_jsonb(c.*)) from public.account_checks c),'[]'::jsonb),'obligation_reservations',coalesce((select jsonb_agg(to_jsonb(r.*)) from public.obligation_reservations r),'[]'::jsonb))
$$;
revoke all on function public.load_finances() from public,anon;
grant execute on function public.load_finances() to authenticated;
