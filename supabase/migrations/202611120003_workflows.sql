create table public.purchase_groups(id uuid primary key,owner_id uuid not null references public.profiles,amount bigint not null check(amount between 1 and 100000000000));
alter table public.purchase_groups enable row level security;
create policy purchase_group_read on public.purchase_groups for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
revoke all on public.purchase_groups from public,anon,authenticated;
grant select on public.purchase_groups to authenticated;
alter table public.entries add column group_id uuid references public.purchase_groups;
create table public.income_settings(owner_id uuid primary key references public.profiles,base bigint not null check(base between 0 and 100000000000),payday integer not null check(payday between 1 and 31));
alter table public.income_settings enable row level security;
create policy income_settings_read on public.income_settings for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
revoke all on public.income_settings from public,anon,authenticated;
grant select on public.income_settings to authenticated;
alter table public.entries add column income_type text check(income_type in ('salary','extra'));
create table public.settlement_transfers(id uuid primary key,settlement_id uuid not null references public.settlements,sender_id uuid not null references public.profiles,source_id uuid not null references public.accounts,amount bigint not null check(amount>0),sent_on date not null,confirmed_on date,destination_id uuid references public.accounts);
alter table public.settlement_transfers enable row level security;
create policy settlement_transfer_read on public.settlement_transfers for select to authenticated using(exists(select 1 from public.settlements s where s.id=settlement_id and (s.debtor_id=auth.uid() or s.creditor_id=auth.uid())));
revoke all on public.settlement_transfers from public,anon,authenticated;
grant select on public.settlement_transfers to authenticated;
create table public.account_movements(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles,account_id uuid not null references public.accounts,amount bigint not null check(amount<>0 and abs(amount)<=100000000000),occurred_on date not null,kind text not null check(kind in ('transfer','settlement','reconciliation')),reference_id text not null,reason text,unique(reference_id,account_id));
create table public.recurrences(id uuid primary key,owner_id uuid not null references public.profiles,family_id uuid not null references public.families,description text not null,amount bigint not null check(amount between 1 and 100000000000),first_due date not null,house boolean not null,variable boolean not null default false,active boolean not null default true);
alter table public.entries add column obligation_id text unique references public.obligations;
alter table public.obligations add column recurrence_id uuid references public.recurrences;
create unique index recurrence_month on public.obligations(recurrence_id,due_on) where recurrence_id is not null;
alter table public.account_movements enable row level security;
alter table public.recurrences enable row level security;
create policy movement_read on public.account_movements for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
create policy recurrence_read on public.recurrences for select to authenticated using(family_id=private.family() and (owner_id=auth.uid() or house));
revoke all on public.account_movements,public.recurrences from public,anon,authenticated;
grant select on public.account_movements,public.recurrences to authenticated;
-- Compose command handling without exposing the lower-level writer.
alter function public.execute_command(jsonb) rename to execute_base;
revoke all on function public.execute_base(jsonb) from public,anon,authenticated;
create function private.account_balance(account uuid) returns bigint language sql stable security definer set search_path='' as $$
select a.opening+coalesce((select sum((s->>'amount')::bigint*case when e.kind='expense' then -1 else 1 end) from public.entries e cross join lateral jsonb_array_elements(e.splits) s where not e.voided and e.occurred_on>=a.cutoff and e.occurred_on<=private.business_today() and (s->>'account_id')::uuid=a.id),0)-coalesce((select sum(amount) from public.payments where account_id=a.id and paid_on>=a.cutoff and paid_on<=private.business_today()),0)+coalesce((select sum(amount) from public.account_movements where account_id=a.id and occurred_on>=a.cutoff and occurred_on<=private.business_today()),0) from public.accounts a where a.id=account
$$;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();fam uuid:=private.family();p jsonb:=command->'payload';action text:=command->>'type';req uuid:=(command->>'key')::uuid;sig jsonb;acct public.accounts;dest public.accounts;rec public.recurrences;old public.obligations;balance_value bigint;amount_value bigint;total bigint:=0;fee bigint;cnt integer;i integer;obj uuid;first_id text;result jsonb;before_value jsonb;part jsonb;consumption_before jsonb;consumption_after jsonb;
begin
 if actor is null or fam is null then raise exception 'Unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict';end if;return;end if;
 if action not in ('transfer','reconcile','recurrence','generate','replace','adjust_due','permission','salary','purchase_split') then perform public.execute_base(command);return;end if;
 if action='purchase_split' then
   obj:=(p->>'id')::uuid;
   if jsonb_typeof(p->'parts')<>'array' or jsonb_array_length(p->'parts') not between 2 and 10 then raise exception 'Invalid purchase parts';end if;
   insert into public.purchase_groups values(obj,actor,(p->>'amount')::bigint);
   for part in select * from jsonb_array_elements(p->'parts') loop
     if part->>'kind'<>'expense' or exists(select 1 from public.entries where id=(part->>'id')::uuid) then raise exception 'Invalid purchase part';end if;
     total:=total+(part->>'amount')::bigint;
     perform public.execute_base(jsonb_build_object('key',part->>'id','type','entry','payload',part));
     update public.entries set group_id=obj where id=(part->>'id')::uuid;
   end loop;
   if total<>(p->>'amount')::bigint then raise exception 'Purchase total mismatch';end if;
   result:=jsonb_build_object('group',obj,'amount',total);
 elsif action='salary' then
   insert into public.income_settings(owner_id,base,payday) values(actor,(p->>'base')::bigint,(p->>'payday')::integer) on conflict(owner_id) do update set base=excluded.base,payday=excluded.payday returning to_jsonb(income_settings.*) into result;
 elsif action='permission' then
   perform public.set_card_permission((p->>'id')::uuid,(p->>'member_id')::uuid,(p->>'allowed')::boolean);
 elsif action in ('transfer','reconcile') then
   select * into acct from public.accounts where id=(p->>'account_id')::uuid and owner_id=actor for update;
   if not found then raise exception 'Unauthorized account';end if;
   balance_value:=private.account_balance(acct.id);
   if (p->>'date')::date<acct.cutoff then raise exception 'Pre-cutoff movement';end if;
   if action='transfer' then
     select * into dest from public.accounts where id=(p->>'destination_id')::uuid and owner_id=actor for update;
     amount_value:=(p->>'amount')::bigint;
     if not found or dest.id=acct.id or acct.kind in ('VA','VR') or dest.kind in ('VA','VR') or amount_value<=0 or amount_value>balance_value then raise exception 'Invalid transfer';end if;
     if (p->>'date')::date<dest.cutoff then raise exception 'Pre-cutoff movement';end if;
     insert into public.account_movements(owner_id,account_id,amount,occurred_on,kind,reference_id) values(actor,acct.id,-amount_value,(p->>'date')::date,'transfer',req::text),(actor,dest.id,amount_value,(p->>'date')::date,'transfer',req::text);
   else
     amount_value:=(p->>'amount')::bigint-balance_value;
     if length(trim(p->>'reason'))<5 or (p->>'amount')::bigint<0 then raise exception 'Reconciliation requires reason';end if;
     if amount_value<>0 then insert into public.account_movements(owner_id,account_id,amount,occurred_on,kind,reference_id,reason) values(actor,acct.id,amount_value,(p->>'date')::date,'reconciliation',req::text,p->>'reason');end if;
   end if;
 elsif action='recurrence' then
   obj:=(p->>'id')::uuid;
   insert into public.recurrences(id,owner_id,family_id,description,amount,first_due,house,variable) values(obj,actor,fam,p->>'description',(p->>'amount')::bigint,(p->>'date')::date,coalesce((p->>'house')::boolean,false),coalesce((p->>'variable')::boolean,false)) returning * into rec;
   for i in 0..11 loop insert into public.obligations(id,owner_id,family_id,description,amount,due_on,house,unknown,recurrence_id) values(obj::text||':'||i,actor,fam,rec.description,rec.amount,private.month_date(rec.first_due,i),rec.house,rec.variable,obj);end loop;
   result:=to_jsonb(rec);
 elsif action='generate' then
   select * into rec from public.recurrences where id=(p->>'id')::uuid and owner_id=actor and active for update;
   if not found then raise exception 'Unauthorized recurrence';end if;
   for i in 0..11 loop insert into public.obligations(id,owner_id,family_id,description,amount,due_on,house,unknown,recurrence_id) values(rec.id::text||':'||i,actor,fam,rec.description,rec.amount,private.month_date(rec.first_due,i),rec.house,rec.variable,rec.id) on conflict do nothing;end loop;
 elsif action='replace' then
   -- Explicit bank-confirmed balance transfer/refinance. The source remains history.
   if jsonb_typeof(p->'sources')<>'array' or jsonb_array_length(p->'sources') not between 1 and 600 then raise exception 'Invalid sources';end if;
   fee:=(p->>'fee')::bigint;cnt:=(p->>'count')::integer;obj:=(p->>'id')::uuid;first_id:=obj::text||':1';
   if fee<0 or cnt not between 1 and 600 then raise exception 'Invalid refinance';end if;
   -- Lock in deterministic order, refusing duplicate sources.
   if (select count(distinct v) from jsonb_array_elements_text(p->'sources') v)<>jsonb_array_length(p->'sources') then raise exception 'Duplicate source';end if;
   for old in select * from public.obligations where id in(select jsonb_array_elements_text(p->'sources')) order by id for update loop
     if old.owner_id<>actor or old.replaced_by is not null then raise exception 'Unauthorized or already replaced';end if;
     total:=total+old.amount-old.confirmed-coalesce((select sum(amount) from public.payments where obligation_id=old.id and reversed_on is null),0);
   end loop;
   if (select count(*) from public.obligations where id in(select jsonb_array_elements_text(p->'sources')))<>jsonb_array_length(p->'sources') or total<=0 then raise exception 'Missing source';end if;
   if p->>'quote' is not null and ((p->>'quote')::bigint<=0 or (p->>'quote')::bigint>total+fee) then raise exception 'Invalid payoff quote';end if;
   total:=coalesce((p->>'quote')::bigint,total+fee);
   if total<cnt then raise exception 'Invalid installments';end if;
   for i in 1..cnt loop insert into public.obligations(id,owner_id,family_id,description,amount,due_on) values(obj::text||':'||i,actor,fam,p->>'description',total/cnt+case when i<=total%cnt then 1 else 0 end,private.month_date((p->>'date')::date,i-1));end loop;
   select jsonb_agg(to_jsonb(o.*)) into before_value from public.obligations o where id in(select jsonb_array_elements_text(p->'sources'));
   update public.obligations set replaced_by=first_id,version=version+1 where id in(select jsonb_array_elements_text(p->'sources'));
   if fee>0 then insert into public.entries(id,owner_id,family_id,description,kind,amount,occurred_on,category,consumer_id) values(obj,actor,fam,'Encargos confirmados · '||(p->>'description'),'expense',fee,coalesce((p->>'occurred_on')::date,private.business_today()),'Financeiro',actor);end if;
   result:=jsonb_build_object('new_obligation',first_id,'total',total,'fee',fee);
 elsif action='adjust_due' then
   select * into old from public.obligations where id=p->>'id' and owner_id=actor for update;
   if not found or old.version<>(p->>'version')::integer or old.replaced_by is not null then raise exception 'Conflict';end if;
   if length(trim(p->>'reason'))<5 then raise exception 'Reason required';end if;
   before_value:=to_jsonb(old);
   update public.obligations set due_on=(p->>'date')::date,amount=(p->>'amount')::bigint,unknown=false,version=version+1 where id=old.id returning to_jsonb(obligations.*) into result;
   select to_jsonb(e.*) into consumption_before from public.entries e where obligation_id=old.id for update;
   if found then
     update public.entries set amount=(p->>'amount')::bigint,version=version+1 where obligation_id=old.id returning to_jsonb(entries.*) into consumption_after;
     insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,'consumption_correction',consumption_after->>'id',consumption_before,consumption_after);
   end if;
   if (p->>'amount')::bigint<old.confirmed+coalesce((select sum(amount) from public.payments where obligation_id=old.id and reversed_on is null),0) then raise exception 'Amount below paid';end if;
 end if;
 insert into private.commands values(actor,req,command);
 insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,action,coalesce(obj::text,p->>'id'),before_value,result);
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;
revoke all on function private.account_balance(uuid),private.month_date(date,integer) from public,anon,authenticated;
revoke create on schema public from public,anon,authenticated;
