-- All financial values are integer cents, bounded to JavaScript's exact range.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create function private.business_today() returns date language sql stable set search_path='' as $$select timezone('America/Sao_Paulo',now())::date$$;
revoke all on function private.business_today() from public,anon,authenticated;
create table public.families(id uuid primary key default gen_random_uuid(),name text not null);
create table public.profiles(id uuid primary key references auth.users(id),family_id uuid not null references public.families,name text not null check(length(name) between 1 and 80),role text not null default 'member' check(role in ('admin','member')),active boolean not null default true);
create function private.family() returns uuid language sql stable security definer set search_path='' as $$ select family_id from public.profiles where id=auth.uid() and active $$;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select role='admin' and active from public.profiles where id=auth.uid()),false) $$;
create table public.accounts(id uuid primary key,owner_id uuid not null references public.profiles,name text not null check(length(name) between 1 and 160),kind text not null check(kind in ('bank','cash','VA','VR')),opening bigint not null check(opening between 0 and 100000000000),cutoff date not null,created_at timestamptz not null default now());
create table public.cards(id uuid primary key,owner_id uuid not null references public.profiles,name text not null,closing integer not null check(closing between 1 and 31),due integer not null check(due between 1 and 31),authorized uuid[] not null default '{}');
create function private.card_owner(card uuid) returns uuid language sql stable security definer set search_path='' as $$select owner_id from public.cards where id=card$$;
create function private.card_allowed(card uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.cards c join public.profiles p on p.id=c.owner_id where c.id=card and p.family_id=private.family() and (c.owner_id=auth.uid() or auth.uid()=any(c.authorized)))$$;
create table public.plans(id uuid primary key,owner_id uuid not null references public.profiles,description text not null,first_due date not null,count integer not null check(count between 1 and 600),amount bigint not null check(amount between 1 and 100000000000),last_paid integer not null default 0,last_paid_on date,history_confirmed boolean not null default false,payoff bigint check(payoff>=0),kind text not null check(kind in ('loan','purchase','refinance')),check(last_paid between 0 and count),check(last_paid=0 or last_paid_on is not null));
create table public.entries(id uuid primary key,owner_id uuid not null references public.profiles,family_id uuid not null references public.families,description text not null check(length(description) between 1 and 120),kind text not null check(kind in ('expense','income','benefit','transfer','loan_received')),amount bigint not null check(amount between 1 and 100000000000),occurred_on date not null,category text not null,house boolean not null default false,consumer_id uuid not null references public.profiles,responsible_id uuid references public.profiles,card_id uuid references public.cards,splits jsonb not null default '[]' check(jsonb_typeof(splits)='array'),version integer not null default 1,voided boolean not null default false,created_at timestamptz not null default now(),check(not house or kind='expense'),check(card_id is null or (kind='expense' and splits='[]'::jsonb)));
create table public.obligations(id text primary key,owner_id uuid not null references public.profiles,family_id uuid not null references public.families,description text not null,amount bigint not null check(amount between 1 and 100000000000),due_on date not null,house boolean not null default false,confirmed bigint not null default 0 check(confirmed>=0),unknown boolean not null default false,plan_id uuid references public.plans,number integer,card_id uuid references public.cards,replaced_by text references public.obligations,version integer not null default 1,check(confirmed<=amount),unique(plan_id,number));
create table public.payments(id uuid primary key,obligation_id text not null references public.obligations,account_id uuid not null references public.accounts,amount bigint not null check(amount between 1 and 100000000000),paid_on date not null,payer_id uuid not null references public.profiles,key uuid not null unique,created_at timestamptz not null default now());
create table public.settlements(id uuid primary key,debtor_id uuid not null references public.profiles,creditor_id uuid not null references public.profiles,description text not null,amount bigint not null check(amount>0),sent bigint not null default 0,confirmed bigint not null default 0,sent_on date,version integer not null default 1,check(debtor_id<>creditor_id),check(sent>=0 and confirmed>=0 and sent+confirmed<=amount));
create table public.goals(owner_id uuid not null references public.profiles,month text not null check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),amount bigint not null check(amount between 0 and 100000000000),primary key(owner_id,month));
create table public.audit_logs(id bigint generated always as identity primary key,actor_id uuid not null references public.profiles,request_key uuid not null,action text not null,record_id text,occurred_at timestamptz not null default now(),before_data jsonb,after_data jsonb);
create table private.commands(actor_id uuid not null,key uuid not null,body jsonb not null,primary key(actor_id,key));
create index on public.entries(owner_id,occurred_on);
create index on public.entries(family_id,house,occurred_on);
create index on public.obligations(owner_id,due_on);
create index on public.payments(obligation_id);
create index on public.cards using gin(authorized);
-- SELECT only for browser roles. INSERT/UPDATE/DELETE are denied without a policy
-- and denied by GRANT; validated commands below own all writes.
alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.cards enable row level security;
alter table public.plans enable row level security;
alter table public.entries enable row level security;
alter table public.obligations enable row level security;
alter table public.payments enable row level security;
alter table public.settlements enable row level security;
alter table public.goals enable row level security;
alter table public.audit_logs enable row level security;
create policy family_read on public.families for select to authenticated using(id=private.family());
create policy profile_read on public.profiles for select to authenticated using(family_id=private.family());
create policy account_read on public.accounts for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
create policy card_read on public.cards for select to authenticated using(private.card_allowed(id));
create policy plan_read on public.plans for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
create policy entry_read on public.entries for select to authenticated using(private.family()=family_id and (owner_id=auth.uid() or consumer_id=auth.uid() or house or private.card_owner(card_id)=auth.uid()));
create policy obligation_read on public.obligations for select to authenticated using(private.family()=family_id and (owner_id=auth.uid() or house or (private.card_allowed(card_id) and exists(select 1 from public.entries e where obligations.id like e.id::text||':%' and (e.consumer_id=auth.uid() or e.responsible_id=auth.uid())))));
create policy payment_read on public.payments for select to authenticated using(private.family() is not null and (payer_id=auth.uid() or exists(select 1 from public.obligations o where o.id=obligation_id and o.family_id=private.family() and (o.house or (private.card_allowed(o.card_id) and exists(select 1 from public.entries e where o.id like e.id::text||':%' and (e.consumer_id=auth.uid() or e.responsible_id=auth.uid())))))));
create policy settlement_read on public.settlements for select to authenticated using((debtor_id=auth.uid() or creditor_id=auth.uid()) and private.family() is not null);
create policy goal_read on public.goals for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
create policy audit_read on public.audit_logs for select to authenticated using(actor_id=auth.uid() and private.family() is not null);
revoke all on all tables in schema public from anon,authenticated;
grant select on public.families,public.profiles,public.accounts,public.cards,public.plans,public.entries,public.obligations,public.payments,public.settlements,public.goals,public.audit_logs to authenticated;
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public;
grant execute on function private.family(),private.card_owner(uuid),private.card_allowed(uuid) to authenticated;
create function private.month_date(first_date date,offset_months integer) returns date language sql immutable set search_path='' as $$select (date_trunc('month',first_date)+make_interval(months=>offset_months)+make_interval(days=>least(extract(day from first_date)::integer,extract(day from date_trunc('month',first_date)+make_interval(months=>offset_months+1)-interval '1 day')::integer)-1))::date$$;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); fam uuid:=private.family(); p jsonb:=command->'payload'; action text:=command->>'type'; req uuid:=(command->>'key')::uuid;
 pending_transfer record;obj uuid; amount_value bigint; split jsonb; total bigint:=0; acct public.accounts; oblig public.obligations; item public.entries; card public.cards; plan public.plans; settlement public.settlements; paid bigint; part_amount bigint;part_count integer;first_date date; due_date date; cycle date; i integer; prev jsonb; result jsonb; sig jsonb; balance_value bigint;
begin
 if actor is null or fam is null then raise exception 'Unauthorized'; end if;
 -- Serializes retries for this user. Row locks additionally serialize shared targets.
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict'; end if; return; end if;
 if action='account' then
   obj:=(p->>'id')::uuid;
   insert into public.accounts(id,owner_id,name,kind,opening,cutoff) values(obj,actor,p->>'name',p->>'kind',(p->>'opening')::bigint,(p->>'cutoff')::date) returning to_jsonb(accounts.*) into result;
 elsif action='card' then
   obj:=(p->>'id')::uuid;
   if jsonb_array_length(coalesce(p->'authorized','[]'))<>0 then raise exception 'Use explicit card permission command'; end if;
   insert into public.cards(id,owner_id,name,closing,due) values(obj,actor,p->>'name',(p->>'closing')::integer,(p->>'due')::integer) returning to_jsonb(cards.*) into result;
 elsif action='entry' then
   obj:=(p->>'id')::uuid; amount_value:=(p->>'amount')::bigint;
   if (p->>'occurred_on')::date>private.business_today() then raise exception 'Future effective date';end if;
   if p->'tags' is not null and (jsonb_typeof(p->'tags')<>'array' or exists(select 1 from jsonb_array_elements(p->'tags') tag where jsonb_typeof(tag)<>'string' or length(tag#>>'{}')>40)) then raise exception 'Invalid tags';end if;
   if p->>'kind'='loan_received' and not exists(select 1 from public.plans where id=nullif(p->>'loan_id','')::uuid and owner_id=actor) then raise exception 'Loan receipt requires owned contract';end if;
   if p->>'kind' not in ('expense','income','benefit','loan_received') then raise exception 'Use explicit transfer workflow'; end if;
   if nullif(p->>'beneficiary_id','') is not null and not exists(select 1 from public.profiles where id=(p->>'beneficiary_id')::uuid and family_id=fam and active) then raise exception 'Invalid beneficiary';end if;
   if nullif(p->>'responsible_id','') is not null and not exists(select 1 from public.profiles where id=(p->>'responsible_id')::uuid and family_id=fam and active) then raise exception 'Invalid responsible member';end if;
   if (p->>'consumer_id')::uuid<>actor and not exists(select 1 from public.cards c join public.profiles pr on pr.id=(p->>'consumer_id')::uuid where c.id=nullif(p->>'card_id','')::uuid and c.owner_id=actor and pr.family_id=fam and pr.active and pr.id=any(c.authorized)) then raise exception 'Consumer must be actor or authorized card user';end if;
   if nullif(p->>'card_id','') is not null then
     if not private.card_allowed((p->>'card_id')::uuid) or p->>'kind'<>'expense' or p->'splits'<>'[]'::jsonb then raise exception 'Unauthorized card'; end if;
   else
     if jsonb_typeof(p->'splits')<>'array' or jsonb_array_length(p->'splits') not between 1 and 10 then raise exception 'Invalid splits'; end if;
     for split in select * from jsonb_array_elements(p->'splits') loop
       select * into acct from public.accounts where id=(split->>'account_id')::uuid and owner_id=actor for update;
       if not found or (split->>'amount')::bigint<0 then raise exception 'Invalid account or split'; end if;
       if p->>'kind'='benefit' and acct.kind not in ('VA','VR') then raise exception 'Benefit requires wallet'; end if;
       if p->>'kind'='expense' and acct.kind in ('VA','VR') and p->>'category'<>'Alimentação' then raise exception 'Benefit purpose'; end if;
       total:=total+(split->>'amount')::bigint;
     end loop;
     if total<>amount_value then raise exception 'Split sum mismatch'; end if;
   end if;
   insert into public.entries(id,owner_id,family_id,description,kind,amount,occurred_on,category,house,consumer_id,responsible_id,card_id,splits,income_type,tags,beneficiary_id,loan_id)
   values(obj,actor,fam,p->>'description',p->>'kind',amount_value,(p->>'occurred_on')::date,p->>'category',coalesce((p->>'house')::boolean,false),(p->>'consumer_id')::uuid,nullif(p->>'responsible_id','')::uuid,nullif(p->>'card_id','')::uuid,p->'splits',case when p->>'kind'='income' then coalesce(p->>'income_type','salary') else null end,array(select jsonb_array_elements_text(coalesce(p->'tags','[]'::jsonb))),nullif(p->>'beneficiary_id','')::uuid,nullif(p->>'loan_id','')::uuid) returning to_jsonb(entries.*) into result;
   if nullif(p->>'card_id','') is not null then
     select * into card from public.cards where id=(p->>'card_id')::uuid;
     first_date:=(p->>'occurred_on')::date;cycle:=date_trunc('month',first_date)::date;
     if first_date>private.month_date((cycle+least(card.closing-1,extract(day from cycle+interval '1 month'-interval '1 day')::integer-1))::date,0) then cycle:=private.month_date(cycle,1);end if;
     if card.due<=card.closing then cycle:=private.month_date(cycle,1);end if;
     due_date:=cycle+least(card.due-1,extract(day from cycle+interval '1 month'-interval '1 day')::integer-1);
     -- Individual obligation lines preserve attribution; total statement is their sum.
     part_count:=coalesce((p->>'installments')::integer,1);
     if part_count not between 1 and 600 or amount_value<part_count then raise exception 'Invalid installment count';end if;
     for i in 1..part_count loop
       part_amount:=amount_value/part_count+case when i<=amount_value%part_count then 1 else 0 end;
       insert into public.obligations(id,owner_id,family_id,description,amount,due_on,card_id,number,house) values(obj::text||':'||i,card.owner_id,fam,(p->>'description')||' · '||i||'/'||part_count,part_amount,private.month_date(due_date,i-1),card.id,i,coalesce((p->>'house')::boolean,false));
     end loop;
     if coalesce(nullif(p->>'responsible_id','')::uuid,(p->>'consumer_id')::uuid)<>card.owner_id then insert into public.settlements(id,debtor_id,creditor_id,description,amount) values(obj,coalesce(nullif(p->>'responsible_id','')::uuid,(p->>'consumer_id')::uuid),card.owner_id,p->>'description',amount_value);end if;
   end if;
 elsif action='plan' then
   obj:=(p->>'id')::uuid;
   if p->>'kind'<>'loan' then raise exception 'Unsupported plan type';end if;
   insert into public.plans(id,owner_id,description,first_due,count,amount,last_paid,last_paid_on,history_confirmed,kind) values(obj,actor,p->>'description',(p->>'first_due')::date,(p->>'count')::integer,(p->>'amount')::bigint,(p->>'last_paid')::integer,nullif(p->>'last_paid_on','')::date,coalesce((p->>'history_confirmed')::boolean,false),'loan') returning * into plan;
   for i in 1..plan.count loop
     insert into public.obligations(id,owner_id,family_id,description,amount,due_on,confirmed,unknown,plan_id,number) values(obj::text||':'||i,actor,fam,plan.description||' · '||i||'/'||plan.count,plan.amount,private.month_date(plan.first_due,i-1),case when i=plan.last_paid or (plan.history_confirmed and i<=plan.last_paid) then plan.amount else 0 end,i<plan.last_paid and not plan.history_confirmed,obj,i);
   end loop;
   result:=to_jsonb(plan);
 elsif action='pay' then
   select * into oblig from public.obligations where id=p->>'obligation_id' and (owner_id=actor or (house and family_id=fam)) for update;
   if not found or oblig.replaced_by is not null or oblig.version<>(p->>'version')::integer then raise exception 'Conflict or unauthorized';end if;
   if oblig.unknown and oblig.recurrence_id is not null then raise exception 'Confirm estimated amount first';end if;
   select * into acct from public.accounts where id=(p->>'account_id')::uuid and owner_id=actor and kind in ('bank','cash') for update;
   if not found then raise exception 'Account unauthorized';end if;
   amount_value:=(p->>'amount')::bigint;
   select coalesce(sum(amount),0) into paid from public.payments where obligation_id=oblig.id and reversed_on is null;
   if amount_value<=0 or amount_value>oblig.amount-oblig.confirmed-paid then raise exception 'Overpayment';end if;
   balance_value:=private.account_balance(acct.id);
   if balance_value<amount_value then raise exception 'Insufficient recorded balance';end if;
   if (p->>'paid_on')::date<acct.cutoff then raise exception 'Use opening history for pre-cutoff payment';end if;
   prev:=to_jsonb(oblig);
   insert into public.payments(id,obligation_id,account_id,amount,paid_on,payer_id,key) values(req,oblig.id,acct.id,amount_value,(p->>'paid_on')::date,actor,req) returning to_jsonb(payments.*) into result;
   update public.obligations set version=version+1,unknown=false where id=oblig.id;
   if oblig.recurrence_id is not null and not exists(select 1 from public.entries where obligation_id=oblig.id) then
     insert into public.entries(id,owner_id,family_id,description,kind,amount,occurred_on,category,house,consumer_id,obligation_id) values(req,oblig.owner_id,fam,oblig.description,'expense',oblig.amount,oblig.due_on,'Contas da Casa',oblig.house,oblig.owner_id,oblig.id);
   end if;
 elsif action='goal' then
   insert into public.goals(owner_id,month,amount) values(actor,p->>'month',(p->>'amount')::bigint) on conflict(owner_id,month) do update set amount=excluded.amount returning to_jsonb(goals.*) into result;
 elsif action in ('send','confirm') then
   select * into settlement from public.settlements where id=(p->>'id')::uuid for update;
   if not found then raise exception 'Unknown settlement';end if;
   prev:=to_jsonb(settlement);
   if action='send' then
     if settlement.debtor_id<>actor then raise exception 'Unauthorized';end if;
     amount_value:=(p->>'amount')::bigint;if amount_value<=0 then raise exception 'Invalid amount';end if;
     select * into acct from public.accounts where id=(p->>'account_id')::uuid and owner_id=actor and kind in ('bank','cash') for update;
     if not found or (p->>'sent_on')::date<acct.cutoff or private.account_balance(acct.id)<amount_value then raise exception 'Invalid sending account';end if;
     insert into public.settlement_transfers(id,settlement_id,sender_id,source_id,amount,sent_on) values(req,settlement.id,actor,acct.id,amount_value,(p->>'sent_on')::date);
     update public.settlements set sent=sent+amount_value,sent_on=(p->>'sent_on')::date,version=version+1 where id=settlement.id returning to_jsonb(settlements.*) into result;
   else
     if settlement.creditor_id<>actor or settlement.sent=0 or settlement.version<>(p->>'version')::integer then raise exception 'Unauthorized or conflict';end if;
     select * into acct from public.accounts where id=(p->>'account_id')::uuid and owner_id=actor and kind in ('bank','cash') for update;
     if not found or (p->>'date')::date<acct.cutoff then raise exception 'Invalid receiving account';end if;
     for pending_transfer in select * from public.settlement_transfers where settlement_id=settlement.id and confirmed_on is null and rejected_on is null order by id for update loop
       if (p->>'date')::date<pending_transfer.sent_on then raise exception 'Receipt precedes sending';end if;
       perform 1 from public.accounts where id=pending_transfer.source_id for update;
       if private.account_balance(pending_transfer.source_id)<pending_transfer.amount then raise exception 'Sending account requires reconciliation';end if;
       insert into public.account_movements(owner_id,account_id,amount,occurred_on,kind,reference_id) values(pending_transfer.sender_id,pending_transfer.source_id,-pending_transfer.amount,pending_transfer.sent_on,'settlement',pending_transfer.id::text),(actor,acct.id,pending_transfer.amount,(p->>'date')::date,'settlement',pending_transfer.id::text);
       update public.settlement_transfers set confirmed_on=(p->>'date')::date,destination_id=acct.id where id=pending_transfer.id;
     end loop;
     update public.settlements set confirmed=confirmed+sent,sent=0,version=version+1 where id=settlement.id returning to_jsonb(settlements.*) into result;

   end if;
 elsif action='void' then
   select * into item from public.entries where id=(p->>'id')::uuid and owner_id=actor for update;
   if not found or item.version<>(p->>'version')::integer or item.card_id is not null or item.obligation_id is not null then raise exception 'Conflict or linked obligation';end if;
   prev:=to_jsonb(item);
   update public.entries set voided=true,version=version+1 where id=item.id returning to_jsonb(entries.*) into result;
 else raise exception 'Unknown command';
 end if;
 insert into private.commands values(actor,req,command);
 insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,action,coalesce(obj::text,p->>'id',p->>'obligation_id'),prev,result);
end $$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;
