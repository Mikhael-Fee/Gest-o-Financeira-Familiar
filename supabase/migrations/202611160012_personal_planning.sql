-- Personal budgets and allocated savings are private planning records, never cash movements.
create table public.personal_budgets (
 owner_id uuid not null references public.profiles,
 month text not null check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 category text not null check(length(trim(category)) between 1 and 100),
 amount bigint not null check(amount between 0 and 100000000000),
 warning integer not null default 80 check(warning between 1 and 100),
 version integer not null default 1 check(version>0),
 primary key(owner_id,month,category)
);
create table public.savings_goals (
 id uuid primary key,
 owner_id uuid not null references public.profiles,
 name text not null check(length(trim(name)) between 1 and 100),
 kind text not null check(kind in ('emergency','savings','purchase','travel','debt','custom')),
 target bigint not null check(target between 1 and 100000000000),
 initial bigint not null default 0 check(initial between 0 and 100000000000),
 account_id uuid references public.accounts,
 due_on date,
 created_on date not null,
 active boolean not null default true,
 version integer not null default 1 check(version>0)
);
create table public.savings_movements (
 id uuid primary key,
 goal_id uuid not null references public.savings_goals,
 owner_id uuid not null references public.profiles,
 amount bigint not null check(amount<>0 and abs(amount)<=100000000000),
 occurred_on date not null,
 reason text not null check(length(trim(reason)) between 3 and 500),
 reverse_of uuid unique references public.savings_movements
);
create index savings_goal_owner on public.savings_goals(owner_id);
create index savings_movement_goal on public.savings_movements(goal_id,occurred_on);
alter table public.personal_budgets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.savings_movements enable row level security;
create policy personal_budget_read on public.personal_budgets for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
create policy savings_goal_read on public.savings_goals for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
create policy savings_movement_read on public.savings_movements for select to authenticated using(owner_id=auth.uid() and private.family() is not null);
revoke all on public.personal_budgets,public.savings_goals,public.savings_movements from public,anon,authenticated;
grant select on public.personal_budgets,public.savings_goals,public.savings_movements to authenticated;

alter function public.execute_command(jsonb) rename to execute_before_personal;
revoke all on function public.execute_before_personal(jsonb) from public,anon,authenticated;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); p jsonb:=command->'payload'; action text:=command->>'type'; req uuid:=(command->>'key')::uuid; sig jsonb;
 b public.personal_budgets; g public.savings_goals; original public.savings_movements; acct public.accounts;
 m text; category_value text; count_value integer; i integer; amount_value bigint; initial_value bigint; account_value uuid; movement_date date; reserved bigint;
 before_value jsonb; after_value jsonb; expected_version integer; record_value text;
begin
 if action not in ('budget','budget_copy','savings_goal','savings_move','savings_reverse') then perform public.execute_before_personal(command);return;end if;
 if actor is null or private.family() is null or req is null then raise exception 'Unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict';end if;return;end if;
 if action='budget' then
   m:=p->>'month';category_value:=trim(p->>'category');count_value:=coalesce((p->>'months')::integer,1);
   if m is null or m !~ '^\d{4}-(0[1-9]|1[0-2])$' or count_value not between 1 and 24 then raise exception 'Invalid budget period';end if;
   for i in 0..count_value-1 loop
     m:=to_char((p->>'month'||'-01')::date+make_interval(months=>i),'YYYY-MM');
     select * into b from public.personal_budgets where owner_id=actor and month=m and category=category_value for update;
     expected_version:=case when i=0 then (p->>'version')::integer else coalesce((p->'versions'->>m)::integer,0) end;
     if coalesce(b.version,0) is distinct from expected_version then raise exception 'Budget conflict';end if;
     before_value:=case when b.owner_id is not null then to_jsonb(b) end;
     insert into public.personal_budgets(owner_id,month,category,amount,warning) values(actor,m,category_value,(p->>'amount')::bigint,(p->>'warning')::integer)
     on conflict(owner_id,month,category) do update set amount=excluded.amount,warning=excluded.warning,version=personal_budgets.version+1 returning to_jsonb(personal_budgets.*) into after_value;
     insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,action,m||':'||category_value,before_value,after_value);
   end loop;
 elsif action='budget_copy' then
   m:=p->>'month';
   if m is null or m !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid budget period';end if;
   for b in select * from public.personal_budgets where owner_id=actor and month=to_char((m||'-01')::date-interval '1 month','YYYY-MM') loop
     after_value:=null;
     insert into public.personal_budgets(owner_id,month,category,amount,warning) values(actor,m,b.category,b.amount,b.warning) on conflict do nothing returning to_jsonb(personal_budgets.*) into after_value;
     if after_value is not null then insert into public.audit_logs(actor_id,request_key,action,record_id,after_data) values(actor,req,action,m||':'||b.category,after_value);end if;
   end loop;
 elsif action='savings_goal' then
   select * into g from public.savings_goals where id=(p->>'id')::uuid for update;
   if g.id is not null and g.owner_id<>actor then raise exception 'Unauthorized goal';end if;
   if coalesce(g.version,0) is distinct from (p->>'version')::integer then raise exception 'Savings goal conflict';end if;
   account_value:=nullif(p->>'account_id','')::uuid;
   if account_value is not null then
     select * into acct from public.accounts where id=account_value and owner_id=actor and kind in ('bank','cash') for update;
     if not found then raise exception 'Invalid savings account';end if;
   end if;
   initial_value:=coalesce(g.initial,(p->>'initial')::bigint,0);
   if g.id is not null and p ? 'initial' and (p->>'initial')::bigint is distinct from g.initial then raise exception 'Use audited savings movements to correct allocation';end if;
   movement_date:=coalesce(g.created_on,nullif(p->>'created_on','')::date,private.business_today());
   if movement_date>private.business_today() then raise exception 'Future savings date';end if;
   before_value:=case when g.id is not null then to_jsonb(g) end;
   insert into public.savings_goals(id,owner_id,name,kind,target,initial,account_id,due_on,created_on,active)
   values((p->>'id')::uuid,actor,trim(p->>'name'),p->>'kind',(p->>'target')::bigint,initial_value,account_value,nullif(p->>'due_on','')::date,movement_date,coalesce((p->>'active')::boolean,true))
   on conflict(id) do update set name=excluded.name,kind=excluded.kind,target=excluded.target,account_id=excluded.account_id,due_on=excluded.due_on,active=excluded.active,version=savings_goals.version+1
   returning to_jsonb(savings_goals.*) into after_value;
   record_value:=p->>'id';
 else
   select * into g from public.savings_goals where id=(p->>'goal_id')::uuid and owner_id=actor and active for update;
   if not found or g.version is distinct from (p->>'version')::integer then raise exception 'Savings goal conflict';end if;
   movement_date:=(p->>'occurred_on')::date;
   if movement_date is null or movement_date>private.business_today() or movement_date<g.created_on then raise exception 'Invalid savings date';end if;
   if action='savings_reverse' then
     select * into original from public.savings_movements where id=(p->>'movement_id')::uuid and goal_id=g.id and owner_id=actor and reverse_of is null for update;
     if not found or movement_date<original.occurred_on or exists(select 1 from public.savings_movements where reverse_of=original.id) then raise exception 'Invalid savings reversal';end if;
     amount_value:=-original.amount;
   else
     if p->>'direction' not in ('deposit','withdrawal') or p->>'direction' is null or (p->>'amount')::bigint<=0 then raise exception 'Invalid savings movement';end if;
     amount_value:=(p->>'amount')::bigint*case when p->>'direction'='withdrawal' then -1 else 1 end;
   end if;
   before_value:=to_jsonb(g);
   insert into public.savings_movements(id,goal_id,owner_id,amount,occurred_on,reason,reverse_of)
   values((p->>'id')::uuid,g.id,actor,amount_value,movement_date,trim(p->>'reason'),case when action='savings_reverse' then original.id end) returning to_jsonb(savings_movements.*) into after_value;
   if exists(select 1 from (select g.initial+sum(sum(amount)) over(order by occurred_on) value from public.savings_movements where goal_id=g.id group by occurred_on) timeline where value<0 or value>100000000000) then raise exception 'Savings withdrawal exceeds reserved allocation';end if;
   update public.savings_goals set version=version+1 where id=g.id;
   record_value:=p->>'id';
 end if;
 -- Lock/check actual accounts without creating transactions or treating the whole balance as reserved.
 if action in ('savings_goal','savings_move','savings_reverse') then
   for acct in select a.* from public.accounts a where a.owner_id=actor and a.kind in ('bank','cash') and exists(select 1 from public.savings_goals sg where sg.account_id=a.id and sg.active) order by a.id for update loop
     select coalesce(sum(sg.initial+coalesce((select sum(sm.amount) from public.savings_movements sm where sm.goal_id=sg.id and sm.occurred_on<=private.business_today()),0)),0) into reserved from public.savings_goals sg where sg.owner_id=actor and sg.account_id=acct.id and sg.active;
     if reserved>private.account_balance(acct.id) then raise exception 'Savings allocation exceeds recorded account balance';end if;
   end loop;
   insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,action,record_value,before_value,after_value);
 end if;
 insert into private.commands values(actor,req,command);
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;

alter function public.load_finances() rename to load_before_personal;
revoke all on function public.load_before_personal() from public,anon;
grant execute on function public.load_before_personal() to authenticated;
create function public.load_finances() returns jsonb language sql stable security invoker set search_path='' as $$
 select public.load_before_personal()||jsonb_build_object(
 'personal_budgets',coalesce((select jsonb_agg(to_jsonb(b.*)) from public.personal_budgets b),'[]'::jsonb),
 'savings_goals',coalesce((select jsonb_agg(to_jsonb(g.*)) from public.savings_goals g),'[]'::jsonb),
 'savings_movements',coalesce((select jsonb_agg(to_jsonb(m.*)) from public.savings_movements m),'[]'::jsonb))
$$;
revoke all on function public.load_finances() from public,anon;
grant execute on function public.load_finances() to authenticated;
